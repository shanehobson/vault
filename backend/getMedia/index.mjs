import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const dynamoDb = new DynamoDBClient({});
const s3 = new S3({});

// Set as Lambda environment variables (see backend/README.md)
const BUCKET = requireEnv('MEDIA_BUCKET');
const TABLE = requireEnv('MEDIA_TABLE');
const TAKEN_INDEX = process.env.TAKEN_AT_INDEX || 'TakenAtIndex';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/**
 * `takenAtKey` is "YYYYMMDDTHHMMSS#<sha1(mediaId)[:8]>" built from the *local wall clock*
 * the shutter fired at (see backfill_taken_at.py). Range queries bracket a day with
 * "#" (0x23, below every hex digit) and "~" (0x7e, above every hex digit).
 */
const keyFrom = (yyyymmdd) => `${yyyymmdd}T000000#`;
const keyTo = (yyyymmdd) => `${yyyymmdd}T235959#~`;

const isDate = (v) => typeof v === 'string' && /^\d{8}$/.test(v);

const bad = (message) => ({ statusCode: 400, body: { message } });

/** The verified Cognito `sub`, injected by the API Gateway mapping template. */
const callerSub = (event) =>
  typeof event.callerSub === 'string' && /^[0-9a-f-]{36}$/.test(event.callerSub) ? event.callerSub : null;

/** Attach pre-signed URLs and the optional capture metadata to a raw DynamoDB item. */
const toFile = async (item, userId) => {
  const fileName = item.fileName.S;
  const mediaId = `uploads/${userId}/${fileName}`;

  const sign = (Key) =>
    getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key }), {
      expiresIn: 86400,
      ResponseCacheControl: 'public, max-age=86400',
    });

  const [signedUrl, thumbUrl] = await Promise.all([
    sign(mediaId),
    // Thumbnails live at thumbnails/<userId>/<fileName>.jpg (may not exist for older
    // uploads; the frontend falls back to signedUrl on load error)
    sign(`thumbnails/${userId}/${fileName}.jpg`),
  ]);

  const str = (k) => item[k]?.S;
  const num = (k) => (item[k]?.N !== undefined ? Number(item[k].N) : undefined);
  const meta = {
    takenAt: str('takenAt'),
    takenAtKey: str('takenAtKey'),
    dateSource: str('dateSource'),
    tzSource: str('tzSource'),
    latitude: num('latitude'),
    longitude: num('longitude'),
    altitude: num('altitude'),
    cameraMake: str('cameraMake'),
    cameraModel: str('cameraModel'),
    originalName: str('originalName'),
    album: str('album'),
    width: num('width'),
    height: num('height'),
    durationSec: num('durationSec'),
    originalKey: str('originalKey'),
  };
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);

  return {
    mediaId,
    fileName,
    fileType: item.fileType.S,
    createdAt: item.createdAt.S,
    signedUrl,
    thumbUrl,
    ...meta,
  };
};

/**
 * Counts per year/month for the whole library, newest first. Drives the Years/Months
 * zoom levels and lets the timeline size every month section (and therefore the
 * scrubber) before a single thumbnail has been fetched.
 *
 * Reads only `takenAtKey` off the index and fans the years out in parallel, so the
 * ~18k-item library costs one round trip per ~1 MB page of the biggest single year
 * rather than of the whole table.
 */
const summary = async (userId) => {
  const edge = async (forward) => {
    const r = await dynamoDb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: TAKEN_INDEX,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': { S: userId } },
      ProjectionExpression: 'takenAtKey',
      ScanIndexForward: forward,
      Limit: 1,
    }));
    return r.Items?.[0]?.takenAtKey?.S;
  };

  const [oldest, newest] = await Promise.all([edge(true), edge(false)]);
  if (!oldest || !newest) return { total: 0, years: [] };

  const firstYear = Number(oldest.slice(0, 4));
  const lastYear = Number(newest.slice(0, 4));

  const countYear = async (year) => {
    const months = new Map(); // month -> { count, first, last }
    let cursor;
    do {
      const r = await dynamoDb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: TAKEN_INDEX,
        KeyConditionExpression: 'userId = :u AND takenAtKey BETWEEN :a AND :b',
        ExpressionAttributeValues: {
          ':u': { S: userId },
          ':a': { S: `${year}0101T000000#` },
          ':b': { S: `${year}1231T235959#~` },
        },
        ProjectionExpression: 'takenAtKey',
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
      }));
      for (const it of r.Items || []) {
        const key = it.takenAtKey.S;
        const month = Number(key.slice(4, 6));
        const m = months.get(month);
        if (m) {
          m.count += 1;
          m.last = key;
        } else {
          months.set(month, { count: 1, first: key, last: key });
        }
      }
      cursor = r.LastEvaluatedKey;
    } while (cursor);

    const list = [...months.entries()]
      .map(([month, m]) => ({ month, ...m }))
      .sort((a, b) => b.month - a.month); // newest first
    return { year, count: list.reduce((n, m) => n + m.count, 0), months: list };
  };

  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);

  const filled = (await Promise.all(years.map(countYear)))
    .filter((y) => y.count > 0)
    .sort((a, b) => b.year - a.year); // newest first

  return { total: filled.reduce((n, y) => n + y.count, 0), years: filled };
};

export const handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const { limit = 10, cursor, order, from, to, mode } = qs;

    // The caller's identity comes from the Cognito authorizer via the API Gateway
    // mapping template ($context.authorizer.claims.sub), never from the client.
    const userId = callerSub(event);
    if (!userId) return { statusCode: 401, body: { message: 'Unauthorized' } };

    if (mode === 'summary') {
      return { statusCode: 200, body: await summary(userId) };
    }

    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return bad('Invalid limit (1–1000)');
    }

    let exclusiveStartKey;
    if (cursor) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
      } catch {
        return bad('Invalid cursor');
      }
    }

    // `order=taken` pages the TakenAtIndex (capture date). Without it we keep the old
    // base-table behaviour so a frontend deployed before this Lambda keeps working.
    const byTakenDate = order === 'taken' || from !== undefined || to !== undefined;

    let queryParams;
    if (byTakenDate) {
      if ((from !== undefined && !isDate(from)) || (to !== undefined && !isDate(to))) {
        return bad('from/to must be YYYYMMDD');
      }
      const values = { ':userId': { S: userId } };
      let condition = 'userId = :userId';
      if (from && to) {
        condition += ' AND takenAtKey BETWEEN :from AND :to';
        values[':from'] = { S: keyFrom(from) };
        values[':to'] = { S: keyTo(to) };
      } else if (from) {
        condition += ' AND takenAtKey >= :from';
        values[':from'] = { S: keyFrom(from) };
      } else if (to) {
        condition += ' AND takenAtKey <= :to';
        values[':to'] = { S: keyTo(to) };
      }
      queryParams = {
        TableName: TABLE,
        IndexName: TAKEN_INDEX,
        KeyConditionExpression: condition,
        ExpressionAttributeValues: values,
        Limit: parsedLimit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false, // newest first
      };
    } else {
      queryParams = {
        TableName: TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } },
        Limit: parsedLimit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false, // newest first (mediaId is date-prefixed for migrated files)
      };
    }

    const result = await dynamoDb.send(new QueryCommand(queryParams));
    const files = await Promise.all((result.Items || []).map((item) => toFile(item, userId)));

    return {
      statusCode: 200,
      body: {
        files,
        cursor: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
          : null,
      },
    };
  } catch (error) {
    console.error('❌ Error in Lambda function:', error);
    return { statusCode: 500, body: { message: 'Internal Server Error' } };
  }
};
