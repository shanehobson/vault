import { S3, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';

const s3 = new S3({});
const dynamoDb = new DynamoDBClient({});

// Set as Lambda environment variables (see backend/README.md)
const BUCKET = requireEnv('MEDIA_BUCKET');
const TABLE = requireEnv('MEDIA_TABLE');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** The verified Cognito `sub`, injected by the API Gateway mapping template. */
const callerSub = (event) =>
  typeof event.callerSub === 'string' && /^[0-9a-f-]{36}$/.test(event.callerSub) ? event.callerSub : null;

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  flv: 'video/x-flv',
  '3gp': 'video/3gpp',
};

const CLIENT_MIME_RE = /^(image|video)\/[a-z0-9.+-]{1,64}$/;

/**
 * The pre-signed PUT signs Content-Type, so whatever we pick here is exactly what the
 * browser must send. Trust the browser's own `file.type` when it looks sane — that is
 * what it will PUT with — and only fall back to the extension when it doesn't
 * (e.g. HEIC, which the extension table used to miss entirely, yielding a 403 on upload).
 */
const getMimeType = (fileName, clientType) =>
  (CLIENT_MIME_RE.test(clientType || '') ? clientType : null) ||
  MIME_TYPES[fileName.split('.').pop()?.toLowerCase()] ||
  'application/octet-stream';

/**
 * The client sends the *local wall clock* the shutter fired at, optionally suffixed with
 * the camera's UTC offset — e.g. "2026-08-24T13:45:00-04:00". That naive-part-is-local
 * invariant is what the whole timeline sorts and groups on, so keep it here too
 * (see backfill_taken_at.py for how the migrated library was normalised to match).
 */
const TAKEN_AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})?$/;

const parseTakenAt = (value) => {
  if (typeof value !== 'string') return null;
  const m = TAKEN_AT_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  return { iso: value.trim(), wallClock: `${y}${mo}${d}T${h}${mi}${s}` };
};

/** takenAtKey must match what backfill_taken_at.py writes, or paging breaks at the seam. */
const takenAtKey = (wallClock, mediaId) =>
  `${wallClock}#${createHash('sha1').update(mediaId, 'utf8').digest('hex').slice(0, 8)}`;

const clampedString = (v, max = 256) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const boundedNumber = (v, min, max) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export const handler = async (event) => {
  try {
    const { files } = event;
    const userId = callerSub(event);
    if (!userId) return { statusCode: 401, body: { message: 'Unauthorized' } };

    if (!Array.isArray(files) || files.length === 0) {
      return { statusCode: 400, body: { message: 'A non-empty files array is required.' } };
    }
    if (files.length > 100) {
      return { statusCode: 400, body: { message: 'You can upload a maximum of 100 files at a time.' } };
    }

    const response = [];

    for (const file of files) {
      const { fileName } = file;
      if (typeof fileName !== 'string' || !fileName || fileName.includes('/')) {
        return { statusCode: 400, body: { message: `Invalid fileName: ${fileName}` } };
      }

      const fileType = getMimeType(fileName, file.fileType);
      const mediaId = `uploads/${userId}/${fileName}`;

      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: BUCKET, Key: mediaId, ContentType: fileType }),
        { expiresIn: 3600 }
      );

      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const taken = parseTakenAt(file.takenAt);
      const takenAt = taken ? taken.iso : now;
      const wallClock = taken ? taken.wallClock : now.slice(0, 19).replace(/[-:]/g, '');
      const dateSource = taken ? clampedString(file.dateSource, 32) || 'exif' : 'upload';

      const item = {
        userId: { S: userId },
        mediaId: { S: mediaId },
        fileName: { S: fileName },
        fileType: { S: fileType },
        createdAt: { S: now },
        uploadTimestamp: { S: now },
        takenAt: { S: takenAt },
        takenAtKey: { S: takenAtKey(wallClock, mediaId) },
        dateSource: { S: dateSource },
        tzSource: { S: taken && /[+-]\d{2}:\d{2}$/.test(taken.iso) ? 'exif' : 'none' },
        source: { S: 'app' },
      };

      const strings = {
        tzOffset: /^[+-]\d{2}:\d{2}$/.test(file.tzOffset || '') ? file.tzOffset : undefined,
        cameraMake: clampedString(file.cameraMake),
        cameraModel: clampedString(file.cameraModel),
        originalName: clampedString(file.originalName),
        album: clampedString(file.album),
      };
      for (const [k, v] of Object.entries(strings)) if (v) item[k] = { S: v };

      const numbers = {
        latitude: boundedNumber(file.latitude, -90, 90),
        longitude: boundedNumber(file.longitude, -180, 180),
        width: boundedNumber(file.width, 1, 100000),
        height: boundedNumber(file.height, 1, 100000),
        durationSec: boundedNumber(file.durationSec, 0, 86400),
      };
      for (const [k, v] of Object.entries(numbers)) if (v !== undefined) item[k] = { N: String(v) };

      await dynamoDb.send(new PutItemCommand({ TableName: TABLE, Item: item }));

      response.push({ mediaId, uploadUrl });
    }

    return { statusCode: 200, body: { urls: response } };
  } catch (error) {
    console.error('Error in Lambda function:', error);
    return { statusCode: 500, body: { message: 'Internal Server Error' } };
  }
};
