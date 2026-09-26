import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLibrary } from "../hooks/useLibrary";
import { useLibrarySelection } from "../hooks/useLibrarySelection";
import { useCovers } from "../hooks/useCovers";
import DeleteButton from "../components/DeleteButton";
import FileLoader from "../components/FileLoader";
import MediaModal from "../components/MediaModal";
import TimelineGrid from "../components/library/TimelineGrid";
import Scrubber from "../components/library/Scrubber";
import ZoomControl, { ZoomLevel } from "../components/library/ZoomControl";
import YearsView from "../components/library/YearsView";
import MonthsView from "../components/library/MonthsView";
import ConfirmDeleteDialog from "../components/library/ConfirmDeleteDialog";
import { buildLayout, clampColumns, dayGroups, naturalColumns } from "../components/library/layout";
import { UploadButton } from "../components/styledComponents";
import { FileData, isImage } from "../types/media";
import { dayKeyOf, monthKey } from "../utils/dates";

const Page = styled.div`
  padding: 8px 12px 0;
  max-width: 1600px;
  margin: 0 auto;

  @media (max-width: 700px) {
    padding: 4px 6px 0;
  }
`;

const Empty = styled.div`
  padding: 80px 20px;
  text-align: center;
  color: var(--text-color);

  h2 {
    font-weight: 600;
  }
  p {
    opacity: 0.7;
  }
`;

const ErrorBox = styled.div`
  margin: 24px auto;
  max-width: 480px;
  text-align: center;
  color: var(--error-text-color);

  button {
    margin-top: 12px;
    border: 1px solid currentColor;
    background: none;
    color: inherit;
    border-radius: 6px;
    padding: 6px 16px;
    cursor: pointer;
  }
`;

const DayToggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 2px 10px;
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.7;
  cursor: pointer;
  user-select: none;

  input {
    accent-color: var(--tertiary-color);
  }
`;

const STORAGE_KEY = "vault.library.view";

interface StoredView {
  zoom: ZoomLevel;
  anchor?: string;
  columns?: number;
  dayHeaders?: boolean;
}

const readStoredView = (): Partial<StoredView> => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Partial<StoredView>;
  } catch {
    return {};
  }
};

const Library: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const stored = useRef(readStoredView()).current;

  const library = useLibrary();
  const {
    userId,
    summary,
    summaryError,
    isLoadingSummary,
    reloadSummary,
    monthKeys,
    monthCounts,
    months,
    ensureMonth,
    ensureMonthsAround,
    retryMonth,
    removeFiles,
    loadedFiles,
  } = library;

  const selection = useLibrarySelection(removeFiles);
  const { covers, ensureCover, seedCover } = useCovers();

  const [zoom, setZoom] = useState<ZoomLevel>(stored.zoom ?? "all");
  const [viewing, setViewing] = useState<FileData | null>(null);
  const [showDayHeaders, setShowDayHeaders] = useState(stored.dayHeaders ?? false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [columnOverride, setColumnOverride] = useState<number | undefined>(stored.columns);

  /** The month the user is looking at; every zoom change keeps this fixed. */
  const anchorRef = useRef<string | undefined>(searchParams.get("m") ?? stored.anchor);
  /** Set when a zoom change or deep link wants the timeline scrolled somewhere. */
  const pendingScroll = useRef<string | undefined>(anchorRef.current);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [navHeight, setNavHeight] = useState(48);

  // Geometry the timeline needs: how wide the grid is, how far down the page it starts,
  // and how tall the navbar is (the sticky header parks under it).
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      setWidth(element.clientWidth);
      setScrollMargin(element.getBoundingClientRect().top + window.scrollY);
      const nav = document.querySelector("nav");
      if (nav) setNavHeight(nav.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [zoom, summary]);

  const columns = clampColumns(columnOverride ?? naturalColumns(width));

  // Only day headers depend on which months have loaded; without them the row list is
  // a pure function of the summary and the viewport, and must not churn on every fetch.
  const dayHeaderSource = showDayHeaders ? months : null;
  const layout = useMemo(
    () =>
      buildLayout(monthKeys, monthCounts, width || 1, columns, (key) => {
        const files = dayHeaderSource?.[key]?.files;
        return files?.length ? dayGroups(files, dayKeyOf) : undefined;
      }),
    [monthKeys, monthCounts, width, columns, dayHeaderSource]
  );

  /** Ctrl/⌘ + wheel zooms the grid, like a desktop photo app. */
  useEffect(() => {
    if (zoom !== "all") return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setColumnOverride((prev) => clampColumns((prev ?? naturalColumns(width)) + (e.deltaY > 0 ? 1 : -1)));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [zoom, width]);

  /** Where the page has to be for `key` to sit under the pinned header. */
  const offsetOfMonth = useCallback(
    (key: string) => {
      const section = layout.sections.find((s) => s.monthKey === key);
      return section ? Math.max(0, section.offset + scrollMargin - navHeight) : null;
    },
    [layout.sections, scrollMargin, navHeight]
  );

  /**
   * Land on the requested month once the layout is real (summary loaded, width
   * measured).
   *
   * Setting the scroll once isn't enough. Arriving from Years/Months, the
   * timeline's full height only exists after the virtualiser's first measure,
   * and for a frame in between the document is short again — which makes the
   * browser clamp the scroll we just set right back to the top. So the position
   * is re-asserted every frame until it has held for a few, which is what makes
   * `?m=` deep links, "pick a month", and the post-upload redirect land at all.
   */
  useEffect(() => {
    if (zoom !== "all" || !pendingScroll.current || !width || !layout.sections.length) return;
    const target = pendingScroll.current;

    let frame = 0;
    let held = 0;
    let tries = 0;
    const attempt = () => {
      frame = 0;
      const top = offsetOfMonth(target);
      if (top === null) return;

      if (Math.abs(window.scrollY - top) > 2) {
        window.scrollTo({ top, behavior: "auto" });
        held = 0;
      } else {
        held += 1;
      }

      // Bounded on both ends: give up holding after a few settled frames so a
      // user who starts scrolling isn't fought, and after ~1.5s regardless.
      if (held < 5 && tries++ < 90) {
        frame = requestAnimationFrame(attempt);
        return;
      }
      pendingScroll.current = undefined;
      ensureMonthsAround(target);
    };
    attempt();

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [zoom, width, layout.sections, offsetOfMonth, ensureMonthsAround]);

  /** Track which month is under the header line so a zoom change can keep the place. */
  useEffect(() => {
    if (zoom !== "all" || !layout.sections.length) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY - scrollMargin + navHeight;
        let current = layout.sections[0];
        for (const section of layout.sections) {
          if (section.offset <= y) current = section;
          else break;
        }
        anchorRef.current = current.monthKey;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [zoom, layout.sections, scrollMargin, navHeight]);

  // Remember where we were, so coming back from Upload doesn't dump us at the top.
  useEffect(() => {
    const view: StoredView = {
      zoom,
      anchor: anchorRef.current,
      columns: columnOverride,
      dayHeaders: showDayHeaders,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  }, [zoom, columnOverride, showDayHeaders, viewing]);

  const changeZoom = useCallback(
    (next: ZoomLevel) => {
      setZoom(next);
      if (next === "all" && anchorRef.current) pendingScroll.current = anchorRef.current;
      if (next !== "all") window.scrollTo({ top: 0, behavior: "auto" });
    },
    []
  );

  const pendingYear = useRef<number>();

  const pickYear = useCallback((year: number) => {
    const first = summary?.years.find((y) => y.year === year)?.months[0];
    if (first) anchorRef.current = monthKey(year, first.month);
    pendingYear.current = year;
    setZoom("months");
  }, [summary]);

  // The Months view lays out top-down; jump to the year the user tapped once it exists.
  useEffect(() => {
    if (zoom !== "months" || pendingYear.current === undefined) return;
    document.getElementById(`year-${pendingYear.current}`)?.scrollIntoView({ block: "start" });
    pendingYear.current = undefined;
  }, [zoom, summary]);

  const pickMonth = useCallback((key: string) => {
    anchorRef.current = key;
    pendingScroll.current = key;
    setSearchParams({ m: key }, { replace: true });
    setZoom("all");
  }, [setSearchParams]);

  const requestCover = useCallback(
    (key: string, from: string, to: string) => {
      if (!userId) return;
      // A month we have already loaded gives us its cover for free.
      const known = months[key]?.files[0];
      if (known) seedCover(key, known);
      else ensureCover(key, userId, from, to);
    },
    [userId, months, ensureCover, seedCover]
  );

  // Viewer navigation walks the loaded items in timeline order.
  const viewingIndex = viewing ? loadedFiles.findIndex((f) => f.mediaId === viewing.mediaId) : -1;
  const step = useCallback(
    (delta: number) => {
      if (viewingIndex < 0) return;
      const next = loadedFiles[viewingIndex + delta];
      if (next) setViewing(next);
    },
    [viewingIndex, loadedFiles]
  );

  useEffect(() => {
    // A deleted item shouldn't stay open in the viewer.
    if (viewing && viewingIndex < 0 && loadedFiles.length) setViewing(null);
  }, [viewing, viewingIndex, loadedFiles.length]);

  if (summaryError) {
    return (
      <ErrorBox>
        <p>{summaryError}</p>
        <button type="button" onClick={reloadSummary}>
          Try again
        </button>
      </ErrorBox>
    );
  }

  if (isLoadingSummary && !summary) return <FileLoader />;

  if (summary && summary.total === 0) {
    return (
      <Empty>
        <h2>Nothing here yet</h2>
        <p>Photos and videos you upload will appear here, newest first.</p>
        <UploadButton onClick={() => navigate("/upload")}>Upload files</UploadButton>
      </Empty>
    );
  }

  return (
    <Page>
      {selection.count > 0 && (
        <DeleteButton
          deleting={selection.isDeleting}
          deleteFiles={() => setConfirmingDelete(true)}
          fadeOutClass=""
        />
      )}

      {confirmingDelete && selection.count > 0 && (
        <ConfirmDeleteDialog
          count={selection.count}
          isDeleting={selection.isDeleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await selection.deleteSelected();
            setConfirmingDelete(false);
          }}
        />
      )}

      <ZoomControl value={zoom} onChange={changeZoom} />

      {zoom === "all" && (
        <DayToggle>
          <input
            type="checkbox"
            checked={showDayHeaders}
            onChange={(e) => setShowDayHeaders(e.target.checked)}
          />
          Group by day
        </DayToggle>
      )}

      <div ref={containerRef}>
        {summary && zoom === "years" && (
          <YearsView
            summary={summary}
            covers={covers}
            onRequestCover={requestCover}
            onPickYear={pickYear}
          />
        )}

        {summary && zoom === "months" && (
          <MonthsView
            summary={summary}
            covers={covers}
            onRequestCover={requestCover}
            onPickMonth={pickMonth}
          />
        )}

        {zoom === "all" && width > 0 && (
          <TimelineGrid
            layout={layout}
            months={months}
            selected={selection.selected}
            selectionMode={selection.selectionMode}
            scrollMargin={scrollMargin}
            stickyTop={navHeight}
            onEnsureMonth={ensureMonth}
            onRetryMonth={retryMonth}
            onOpen={setViewing}
            onToggleSelect={selection.toggleSelection}
            onToggleMany={selection.toggleMany}
          />
        )}
      </div>

      {zoom === "all" && (
        <Scrubber sections={layout.sections} scrollMargin={scrollMargin} stickyTop={navHeight} />
      )}

      {viewing && (
        <MediaModal
          url={viewing.signedUrl}
          type={isImage(viewing) ? "image" : "video"}
          meta={viewing}
          onClose={() => setViewing(null)}
          onPrev={viewingIndex > 0 ? () => step(-1) : undefined}
          onNext={viewingIndex >= 0 && viewingIndex < loadedFiles.length - 1 ? () => step(1) : undefined}
        />
      )}
    </Page>
  );
};

export default Library;
