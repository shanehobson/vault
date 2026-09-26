/** One item in the library, as returned by `GET /media`. */
export interface FileData {
  mediaId: string;
  fileName: string;
  fileType: string;
  createdAt: string;
  signedUrl: string;
  /** Small JPEG preview (thumbnails/<user>/<fileName>.jpg). May be missing for older uploads. */
  thumbUrl?: string;
  /**
   * ISO 8601 capture time. The naive part is always the *local wall clock* the shutter
   * fired at — never re-interpret it with `new Date()`, use `src/utils/dates.ts`.
   */
  takenAt?: string;
  /** `YYYYMMDDTHHMMSS#<hash>` of that wall clock; sort key of the TakenAtIndex GSI. */
  takenAtKey?: string;
  /** Where the date came from: takeout | exif | video-tag | mtime | upload. */
  dateSource?: string;
  /** How the timezone was established: exif | inferred | none. */
  tzSource?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  cameraMake?: string;
  cameraModel?: string;
  originalName?: string;
  album?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  originalKey?: string;
}

export interface MonthSummary {
  /** 1–12 */
  month: number;
  count: number;
  first: string;
  last: string;
}

export interface YearSummary {
  year: number;
  count: number;
  /** Newest month first. */
  months: MonthSummary[];
}

export interface LibrarySummary {
  total: number;
  /** Newest year first. */
  years: YearSummary[];
}

export const isVideo = (file: FileData) => file.fileType.startsWith('video');
export const isImage = (file: FileData) => file.fileType.startsWith('image');

/** What the client sends to `POST /media` for each file it wants to upload. */
export interface UploadFileInput {
  fileName: string;
  fileType: string;
  /** Local wall clock the shutter fired at, with the camera's offset when EXIF has one. */
  takenAt?: string;
  tzOffset?: string;
  dateSource?: "exif" | "video-tag" | "mtime";
  latitude?: number;
  longitude?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  cameraMake?: string;
  cameraModel?: string;
  originalName?: string;
}
