import React, { useEffect, useMemo } from "react";
import styled from "@emotion/styled";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import MediaTile, { Skeleton } from "./MediaTile";
import SectionHeader from "./SectionHeader";
import { Layout, Row, sectionAtOffset } from "./layout";
import { MonthBucket } from "../../hooks/useLibrary";
import { FileData } from "../../types/media";
import { formatDay } from "../../utils/dates";

const List = styled.div`
  position: relative;
  width: 100%;
`;

const TileRow = styled.div<{ columns: number; gap: number }>`
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, 1fr);
  gap: ${({ gap }) => gap}px;
`;

const DayHeading = styled.h3`
  display: flex;
  align-items: center;
  height: 100%;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  opacity: 0.7;
`;

const SectionError = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  font-size: 13px;
  color: var(--error-text-color, #c0392b);

  button {
    border: 1px solid currentColor;
    background: none;
    color: inherit;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 13px;
    cursor: pointer;
  }
`;

interface TimelineGridProps {
  layout: Layout;
  months: Record<string, MonthBucket>;
  selected: Set<string>;
  selectionMode: boolean;
  /** Distance from the top of the document to the top of the timeline. */
  scrollMargin: number;
  /** Where the sticky month header parks (below the navbar). */
  stickyTop: number;
  onEnsureMonth: (monthKey: string) => void;
  onRetryMonth: (monthKey: string) => void;
  onOpen: (file: FileData) => void;
  onToggleSelect: (mediaId: string) => void;
  onToggleMany: (mediaIds: string[]) => void;
}

const TimelineGrid: React.FC<TimelineGridProps> = ({
  layout,
  months,
  selected,
  selectionMode,
  scrollMargin,
  stickyTop,
  onEnsureMonth,
  onRetryMonth,
  onOpen,
  onToggleSelect,
  onToggleMany,
}) => {
  const { rows, sections, columns, gap } = layout;

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => rows[index].height,
    overscan: 8,
    scrollMargin,
  });

  // A resize, a zoom, or day headers appearing changes every row below the change.
  const geometry = `${columns}:${gap}:${rows.length}:${layout.totalHeight}`;
  useEffect(() => {
    virtualizer.measure();
  }, [geometry, virtualizer]);

  const items = virtualizer.getVirtualItems();

  // Fetch what is on screen or about to be. Overscan covers "about to be", and asking
  // for a month that is already loaded or in flight is free.
  useEffect(() => {
    const wanted = new Set(items.map((item) => rows[item.index].monthKey));
    wanted.forEach(onEnsureMonth);
  }, [items, rows, onEnsureMonth]);

  /**
   * The month header pinned under the navbar: whichever section covers the top of the
   * viewport. It is rendered in flow rather than at its row offset, so it stays put
   * while its own month scrolls past — the rest of the rows are absolutely positioned
   * and unaffected by it.
   */
  const stickyIndex = useMemo(() => {
    // Probe at the line the pinned header sits on, so the hand-off to the next month
    // happens exactly as its own header slides up under the navbar.
    const y = (virtualizer.scrollOffset ?? 0) - scrollMargin + stickyTop;
    return sectionAtOffset(sections, Math.max(0, y));
  }, [virtualizer.scrollOffset, sections, scrollMargin, stickyTop]);
  const stickySection = sections[stickyIndex];

  const sectionByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    sections.forEach((section) => (map[section.monthKey] = section.count));
    return map;
  }, [sections]);

  const headerProps = (monthKey: string) => {
    const files = months[monthKey]?.files;
    if (!files?.length) return { onSelectAll: undefined, allSelected: false };
    const ids = files.map((f) => f.mediaId);
    return {
      onSelectAll: () => onToggleMany(ids),
      allSelected: ids.every((id) => selected.has(id)),
    };
  };

  const renderRow = (row: Row) => {
    const bucket = months[row.monthKey];

    if (row.kind === "month") {
      return (
        <SectionHeader
          monthKey={row.monthKey}
          count={sectionByMonth[row.monthKey] ?? 0}
          {...headerProps(row.monthKey)}
        />
      );
    }

    if (row.kind === "day") {
      return <DayHeading>{formatDay(row.dayKey)}</DayHeading>;
    }

    if (bucket?.error && bucket.files.length <= row.from) {
      return (
        <SectionError>
          <span>{bucket.error}</span>
          <button type="button" onClick={() => onRetryMonth(row.monthKey)}>
            Retry
          </button>
        </SectionError>
      );
    }

    const files = bucket?.files ?? [];
    const cells = [];
    for (let i = row.from; i < row.to; i++) {
      const file = files[i];
      cells.push(
        file ? (
          <MediaTile
            key={file.mediaId}
            file={file}
            selected={selected.has(file.mediaId)}
            selectionMode={selectionMode}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ) : (
          <Skeleton key={`skeleton-${i}`} />
        )
      );
    }
    return (
      <TileRow columns={columns} gap={gap}>
        {cells}
      </TileRow>
    );
  };

  return (
    <List style={{ height: virtualizer.getTotalSize() }}>
      {stickySection && (
        <div
          style={{
            position: "sticky",
            top: stickyTop,
            zIndex: 6,
            height: layout.rows[stickySection.rowIndex].height,
          }}
        >
          <SectionHeader
            monthKey={stickySection.monthKey}
            count={stickySection.count}
            {...headerProps(stickySection.monthKey)}
          />
        </div>
      )}
      {items.map((item) => {
        const row = rows[item.index];
        // The pinned copy above stands in for this one.
        if (row.kind === "month" && row.monthKey === stickySection?.monthKey) return null;
        return (
          <div
            key={item.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: row.height,
              transform: `translateY(${item.start - scrollMargin}px)`,
            }}
          >
            {renderRow(row)}
          </div>
        );
      })}
    </List>
  );
};

export default TimelineGrid;
