import { useCallback, useRef, useState } from "react";
import { useApiClient } from "./useApiClient";
import { FileData } from "../types/media";

/**
 * Cover thumbnails for the Years and Months views.
 *
 * A cover is just the newest item in a date range, so one `limit=1` request per tile is
 * enough — and tiles only ask once they scroll into view. Results are kept for the life
 * of the page, so switching zoom levels back and forth is free.
 */
export function useCovers() {
  const { listMedia } = useApiClient();
  const [covers, setCovers] = useState<Record<string, FileData | null>>({});
  const requested = useRef(new Set<string>());

  const ensureCover = useCallback(
    async (key: string, userId: string, from: string, to: string) => {
      if (requested.current.has(key)) return;
      requested.current.add(key);
      try {
        const { files } = await listMedia({ userId, from, to, limit: 1 });
        setCovers((prev) => ({ ...prev, [key]: files[0] ?? null }));
      } catch {
        // A missing cover is a blank tile, not an error worth interrupting anyone over.
        requested.current.delete(key);
      }
    },
    [listMedia]
  );

  /** Reuse an item we already have rather than spending a request on it. */
  const seedCover = useCallback((key: string, file: FileData | undefined) => {
    if (!file || requested.current.has(key)) return;
    requested.current.add(key);
    setCovers((prev) => ({ ...prev, [key]: file }));
  }, []);

  return { covers, ensureCover, seedCover };
}
