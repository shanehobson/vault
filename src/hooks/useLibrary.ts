import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useApiClient } from "./useApiClient";
import { FileData, LibrarySummary } from "../types/media";
import { monthKey, monthRange, shiftMonth } from "../utils/dates";

/** One month's worth of the library. `files` is newest-first, like the API returns it. */
export interface MonthBucket {
  files: FileData[];
  /** Set while more pages of this month are still to come. */
  cursor?: string;
  done: boolean;
  error?: string;
}

/** Months are fetched whole; 200 keeps even a busy holiday month to a couple of pages. */
const PAGE_SIZE = 200;

/**
 * The timeline's data layer.
 *
 * The summary (counts per year/month) arrives first and is enough to lay out every
 * section at its true height, so the scrollbar and the scrubber are correct before a
 * single photo has loaded. Months are then fetched on demand as sections approach the
 * viewport, and cached for the life of the page.
 */
export function useLibrary() {
  const { getSummary, listMedia } = useApiClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [months, setMonths] = useState<Record<string, MonthBucket>>({});

  /** Months with a fetch in flight. A ref, so `ensureMonth` stays a stable callback. */
  const inFlight = useRef(new Set<string>());
  const monthsRef = useRef(months);
  monthsRef.current = months;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = (await fetchAuthSession()).userSub;
        if (!cancelled) setUserId(sub ?? null);
      } catch {
        if (!cancelled) setSummaryError("Could not read your session. Try signing in again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!userId) return;
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      setSummary(await getSummary(userId));
    } catch (err) {
      setSummaryError((err instanceof Error && err.message) || "Could not load your library.");
    } finally {
      setIsLoadingSummary(false);
    }
  }, [userId, getSummary]);

  useEffect(() => {
    if (userId) loadSummary();
  }, [userId, loadSummary]);

  /** Every month that has photos, newest first — the section order of the timeline. */
  const monthKeys = useMemo(() => {
    if (!summary) return [];
    return summary.years.flatMap((y) => y.months.map((m) => monthKey(y.year, m.month)));
  }, [summary]);

  /** How many photos each month holds, from the summary (known before any fetch). */
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    summary?.years.forEach((y) =>
      y.months.forEach((m) => {
        counts[monthKey(y.year, m.month)] = m.count;
      })
    );
    return counts;
  }, [summary]);

  /**
   * Fetch a month if we don't already have it. Follows the cursor until the month is
   * complete, so a section never renders half-populated for long.
   */
  const ensureMonth = useCallback(
    async (key: string) => {
      if (!userId || inFlight.current.has(key)) return;
      const existing = monthsRef.current[key];
      if (existing?.done) return;

      inFlight.current.add(key);
      const { from, to } = monthRange(key);
      // Resume from the last cursor if a previous attempt stopped part-way; without one
      // we are starting the month over, so drop whatever it held to avoid duplicates.
      let cursor = existing?.cursor;
      let files = cursor ? existing!.files : [];
      try {
        do {
          const page = await listMedia({ userId, from, to, cursor, limit: PAGE_SIZE });
          files = [...files, ...page.files];
          cursor = page.cursor;
          setMonths((prev) => ({ ...prev, [key]: { files, cursor, done: !cursor } }));
        } while (cursor);
      } catch (err) {
        const error = (err instanceof Error && err.message) || "Could not load this month.";
        setMonths((prev) => ({
          ...prev,
          [key]: { files, cursor, done: false, error },
        }));
      } finally {
        inFlight.current.delete(key);
      }
    },
    [userId, listMedia]
  );

  /** Prefetch the neighbours of the month in view so scrolling doesn't stutter. */
  const ensureMonthsAround = useCallback(
    (key: string, radius = 1) => {
      ensureMonth(key);
      for (let d = 1; d <= radius; d++) {
        [shiftMonth(key, -d), shiftMonth(key, d)].forEach((neighbour) => {
          if (monthCounts[neighbour]) ensureMonth(neighbour);
        });
      }
    },
    [ensureMonth, monthCounts]
  );

  /** Clear a section's error and pick the fetch back up from wherever it stopped. */
  const retryMonth = useCallback(
    (key: string) => {
      setMonths((prev) => {
        const bucket = prev[key];
        if (!bucket?.error) return prev;
        return { ...prev, [key]: { files: bucket.files, cursor: bucket.cursor, done: bucket.done } };
      });
      ensureMonth(key);
    },
    [ensureMonth]
  );

  /** Drop deleted items from their buckets and decrement the summary counts. */
  const removeFiles = useCallback((mediaIds: string[]) => {
    const ids = new Set(mediaIds);
    const removedPerMonth: Record<string, number> = {};

    setMonths((prev) => {
      const next: Record<string, MonthBucket> = {};
      for (const [key, bucket] of Object.entries(prev)) {
        const files = bucket.files.filter((f) => !ids.has(f.mediaId));
        const removed = bucket.files.length - files.length;
        if (removed) removedPerMonth[key] = removed;
        next[key] = removed ? { ...bucket, files } : bucket;
      }
      return next;
    });

    setSummary((prev) => {
      if (!prev) return prev;
      let total = prev.total;
      const years = prev.years
        .map((y) => {
          const monthsLeft = y.months
            .map((m) => {
              const removed = removedPerMonth[monthKey(y.year, m.month)] ?? 0;
              total -= removed;
              return { ...m, count: m.count - removed };
            })
            .filter((m) => m.count > 0);
          return { ...y, months: monthsLeft, count: monthsLeft.reduce((n, m) => n + m.count, 0) };
        })
        .filter((y) => y.count > 0);
      return { total, years };
    });
  }, []);

  /** Everything loaded so far, in timeline order — what the viewer arrows step through. */
  const loadedFiles = useMemo(
    () => monthKeys.flatMap((key) => months[key]?.files ?? []),
    [monthKeys, months]
  );

  return {
    userId,
    summary,
    summaryError,
    isLoadingSummary,
    reloadSummary: loadSummary,
    monthKeys,
    monthCounts,
    months,
    ensureMonth,
    ensureMonthsAround,
    retryMonth,
    removeFiles,
    loadedFiles,
  };
}
