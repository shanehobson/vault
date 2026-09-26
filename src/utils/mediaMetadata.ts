import exifr from "exifr";
import { UploadFileInput } from "../types/media";

/**
 * Reads capture metadata out of a file in the browser, so `POST /media` can write a real
 * `takenAt` the moment the row is created and the photo lands in the right month.
 *
 * The contract with the backend is that the naive part of `takenAt` is the *local wall
 * clock* the shutter fired at — which is exactly what EXIF `DateTimeOriginal` already is.
 * So the date is read as a raw string (`reviveValues: false`) and never passed through
 * `Date`, which would drag it into the browser's timezone.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** `"+02:00"` for a minutes-east-of-UTC offset. */
const formatOffset = (minutesEast: number) => {
  const sign = minutesEast >= 0 ? "+" : "-";
  const abs = Math.abs(minutesEast);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** An absolute instant expressed as this browser's local wall clock plus its offset. */
export function localIso(date: Date) {
  const offset = formatOffset(-date.getTimezoneOffset());
  const clock =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return { takenAt: `${clock}${offset}`, tzOffset: offset };
}

/** EXIF stores dates as `2026:08:24 13:45:00`. */
const exifDateToIso = (value: unknown) => {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
};

const validOffset = (value: unknown) =>
  typeof value === "string" && /^[+-]\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : null;

const EXIF_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "OffsetTimeOriginal",
  "OffsetTime",
  "Make",
  "Model",
  "ExifImageWidth",
  "ExifImageHeight",
] as const;

/** Duration and dimensions from a video, via the browser's own demuxer. */
function probeVideo(file: File): Promise<{ durationSec?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (result: { durationSec?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({}), 4000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish({
        durationSec: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish({});
    };
    video.src = url;
  });
}

export async function readMetadata(file: File, fileName: string): Promise<UploadFileInput> {
  const input: UploadFileInput = {
    fileName,
    fileType: file.type,
    originalName: file.name,
  };

  if (file.type.startsWith("image")) {
    // exifr reads HEIC EXIF too, which is most of what an iPhone produces.
    const [tags, gps] = await Promise.all([
      exifr.parse(file, { pick: [...EXIF_TAGS], reviveValues: false }).catch(() => null),
      exifr.gps(file).catch(() => null),
    ]);

    const clock = exifDateToIso(tags?.DateTimeOriginal) ?? exifDateToIso(tags?.CreateDate);
    const offset = validOffset(tags?.OffsetTimeOriginal) ?? validOffset(tags?.OffsetTime);
    if (clock) {
      input.takenAt = `${clock}${offset ?? "Z"}`;
      input.dateSource = "exif";
      if (offset) input.tzOffset = offset;
    }
    if (typeof gps?.latitude === "number" && typeof gps?.longitude === "number") {
      input.latitude = Number(gps.latitude.toFixed(6));
      input.longitude = Number(gps.longitude.toFixed(6));
    }
    if (typeof tags?.Make === "string") input.cameraMake = tags.Make.trim();
    if (typeof tags?.Model === "string") input.cameraModel = tags.Model.trim();
    if (tags?.ExifImageWidth) input.width = Number(tags.ExifImageWidth);
    if (tags?.ExifImageHeight) input.height = Number(tags.ExifImageHeight);
  } else if (file.type.startsWith("video")) {
    Object.assign(input, await probeVideo(file));
  }

  if (!input.takenAt && file.lastModified) {
    // No EXIF: the file's own timestamp is the best guess. iPhone MOVs usually carry a
    // correct one; anything else is at least in the right ballpark.
    const fallback = localIso(new Date(file.lastModified));
    input.takenAt = fallback.takenAt;
    input.tzOffset = fallback.tzOffset;
    input.dateSource = "mtime";
  }

  return input;
}
