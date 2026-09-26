/**
 * Timeline geometry.
 *
 * The whole library is flattened into a single list of fixed-height *rows* — a month
 * header, then one row per line of tiles, then the next month — and that list is what
 * gets virtualised. Sections are far too tall to be the unit of virtualisation: one busy
 * month can hold a couple of thousand photos, and rendering even one of those in full
 * would put more images in the DOM than the browser can cope with.
 *
 * Every row height comes from the summary counts, so the page has its true scroll height,
 * and the scrubber lands on the right month, before a single photo has been fetched.
 */

export const MONTH_HEADER_HEIGHT = 44;
export const DAY_HEADER_HEIGHT = 30;
export const SECTION_GAP = 14;

export interface DayGroup {
  /** `YYYY-MM-DD` */
  key: string;
  count: number;
  /** Index of this day's first file within the month's (newest-first) file array. */
  start: number;
}

export type Row =
  | { kind: "month"; monthKey: string; height: number; offset: number }
  | { kind: "day"; monthKey: string; dayKey: string; height: number; offset: number }
  | {
      kind: "tiles";
      monthKey: string;
      height: number;
      offset: number;
      /** Half-open slice of the month's file array this row shows. */
      from: number;
      to: number;
    };

export interface Section {
  monthKey: string;
  count: number;
  offset: number;
  height: number;
  /** Index into `rows` of this month's header. */
  rowIndex: number;
}

export interface Layout {
  columns: number;
  gap: number;
  rowHeight: number;
  rows: Row[];
  sections: Section[];
  totalHeight: number;
}

/** Tile edge in px we aim for; the real one is whatever divides the width evenly. */
const TARGET_TILE = 150;
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 10;

export const clampColumns = (n: number) => Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, n));

/** Columns that suit the available width, before any manual zoom the user applied. */
export function naturalColumns(width: number) {
  if (width <= 0) return 3;
  if (width < 480) return 3;
  if (width < 700) return 4;
  return clampColumns(Math.round(width / TARGET_TILE));
}

export function buildLayout(
  monthKeys: string[],
  monthCounts: Record<string, number>,
  width: number,
  columns: number,
  dayGroupsFor?: (monthKey: string) => DayGroup[] | undefined
): Layout {
  const gap = width < 700 ? 3 : 6;
  // Round the tile up: the browser rounds each 1fr track to whole pixels, so a row height
  // built from the fractional width would come out short and rows would overlap.
  const tile = Math.ceil((width - gap * (columns - 1)) / columns);
  const rowHeight = tile + gap;

  const rows: Row[] = [];
  const sections: Section[] = [];
  let offset = 0;

  const pushTileRows = (monthKey: string, from: number, count: number) => {
    for (let i = 0; i < count; i += columns) {
      rows.push({
        kind: "tiles",
        monthKey,
        height: rowHeight,
        offset,
        from: from + i,
        to: from + Math.min(i + columns, count),
      });
      offset += rowHeight;
    }
  };

  for (const monthKey of monthKeys) {
    const count = monthCounts[monthKey] ?? 0;
    const sectionOffset = offset;
    const rowIndex = rows.length;

    rows.push({ kind: "month", monthKey, height: MONTH_HEADER_HEIGHT, offset });
    offset += MONTH_HEADER_HEIGHT;

    const days = dayGroupsFor?.(monthKey);
    if (days) {
      for (const day of days) {
        rows.push({ kind: "day", monthKey, dayKey: day.key, height: DAY_HEADER_HEIGHT, offset });
        offset += DAY_HEADER_HEIGHT;
        pushTileRows(monthKey, day.start, day.count);
      }
    } else {
      pushTileRows(monthKey, 0, count);
    }

    offset += SECTION_GAP;
    sections.push({ monthKey, count, offset: sectionOffset, height: offset - sectionOffset, rowIndex });
  }

  return { columns, gap, rowHeight, rows, sections, totalHeight: offset };
}

/** Group a month's newest-first files into consecutive runs of the same wall-clock day. */
export function dayGroups(files: { takenAt?: string }[], dayKeyOf: (t?: string) => string | null): DayGroup[] {
  const groups: DayGroup[] = [];
  files.forEach((file, index) => {
    const key = dayKeyOf(file.takenAt) ?? "unknown";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.count += 1;
    else groups.push({ key, count: 1, start: index });
  });
  return groups;
}

/** Index of the last section that starts at or before `y`. */
export function sectionAtOffset(sections: Section[], y: number): number {
  if (!sections.length) return 0;
  let lo = 0;
  let hi = sections.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sections[mid].offset <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
