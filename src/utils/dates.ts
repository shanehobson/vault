/**
 * Wall-clock date handling for the timeline.
 *
 * Every `takenAt` we get back has the local wall clock in its naive part and the camera's
 * UTC offset (or a `Z` placeholder) as a suffix. Feeding that to `new Date()` would
 * re-express it in the *browser's* timezone and slide photos across day boundaries — a
 * photo taken at 23:30 in Kyiv would show up on the next day in New York. So we parse the
 * string, never the instant.
 */

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;

/** Parse the wall-clock parts out of an ISO string, ignoring any offset suffix. */
export function localDateParts(takenAt?: string): DateParts | null {
  if (!takenAt) return null;
  const m = ISO_RE.exec(takenAt);
  if (!m) return null;
  return {
    year: +m[1],
    month: +m[2],
    day: +m[3],
    hour: +m[4],
    minute: +m[5],
    second: +m[6],
  };
}

/** `"2026-08"` — the bucket a photo belongs to in the timeline. */
export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const monthKeyOf = (takenAt?: string) => {
  const p = localDateParts(takenAt);
  return p ? monthKey(p.year, p.month) : null;
};

/** `"2026-08-23"` */
export const dayKeyOf = (takenAt?: string) => {
  const p = localDateParts(takenAt);
  return p ? `${monthKey(p.year, p.month)}-${String(p.day).padStart(2, '0')}` : null;
};

export const parseMonthKey = (key: string): { year: number; month: number } => {
  const [y, m] = key.split('-');
  return { year: +y, month: +m };
};

/** Last day of a month, so a month range covers everything in it. */
export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** `from`/`to` query params (YYYYMMDD) covering a whole month. */
export const monthRange = (key: string) => {
  const { year, month } = parseMonthKey(key);
  const mm = String(month).padStart(2, '0');
  return { from: `${year}${mm}01`, to: `${year}${mm}${daysInMonth(year, month)}` };
};

/** Step a month key by `delta` months. */
export const shiftMonth = (key: string, delta: number) => {
  const { year, month } = parseMonthKey(key);
  const total = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(total / 12), (total % 12) + 1);
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `"August 2026"` */
export const formatMonth = (key: string) => {
  const { year, month } = parseMonthKey(key);
  return `${MONTHS[month - 1]} ${year}`;
};

/** `"Aug 2026"` — for the scrubber bubble, where space is tight. */
export const formatMonthShort = (key: string) => {
  const { year, month } = parseMonthKey(key);
  return `${MONTHS_SHORT[month - 1]} ${year}`;
};

const todayParts = (): DateParts => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
};

const dayNumber = (p: { year: number; month: number; day: number }) =>
  Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);

/** `"Today"` / `"Yesterday"` / `"Sat 23 August 2026"` for a `YYYY-MM-DD` day key. */
export function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const today = todayParts();
  const delta = dayNumber(today) - dayNumber({ year: y, month: m, day: d });
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sameYear = y === today.year;
  return sameYear ? `${weekday} ${d} ${MONTHS[m - 1]}` : `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** `"23 August 2026 at 16:08"` — the viewer caption. Never shifts the clock. */
export function formatTakenAt(takenAt?: string): string | null {
  const p = localDateParts(takenAt);
  if (!p) return takenAt ?? null;
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year} at ${time}`;
}

/** `"1:05"` / `"12:03:07"` for a video badge. */
export function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
