import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Section, sectionAtOffset } from "./layout";
import { formatMonthShort, parseMonthKey } from "../../utils/dates";

const Rail = styled.div<{ top: number; active: boolean }>`
  position: fixed;
  right: 0;
  top: ${({ top }) => top}px;
  bottom: 0;
  width: 34px;
  z-index: 40;
  touch-action: none;
  cursor: ns-resize;
  opacity: ${({ active }) => (active ? 1 : 0.35)};
  transition: opacity 0.25s ease-out;

  &:hover {
    opacity: 1;
  }
`;

const Tick = styled.div<{ y: number }>`
  position: absolute;
  right: 4px;
  top: ${({ y }) => y}px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-color);
  opacity: 0.5;
  pointer-events: none;
  transform: translateY(-50%);

  &::after {
    content: "";
    display: block;
    width: 8px;
    height: 1px;
    background: currentColor;
  }
`;

const Thumb = styled.div<{ y: number }>`
  position: absolute;
  right: 6px;
  top: ${({ y }) => y}px;
  width: 22px;
  height: 22px;
  margin-top: -11px;
  border-radius: 11px;
  background: var(--tertiary-color);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  pointer-events: none;
`;

const Bubble = styled.div<{ y: number }>`
  position: absolute;
  right: 36px;
  top: ${({ y }) => y}px;
  transform: translateY(-50%);
  padding: 6px 12px;
  border-radius: 16px;
  background: var(--tertiary-color);
  color: #1b1b1b;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  pointer-events: none;
`;

interface ScrubberProps {
  sections: Section[];
  /** Distance from the top of the document to the top of the timeline. */
  scrollMargin: number;
  /** Where the pinned month header sits — the line the scrubber reads the month from. */
  stickyTop: number;
}

/** How far the document can scroll; the scrubber maps its rail onto exactly this. */
const scrollRange = () =>
  Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

/**
 * The fast-travel rail on the right edge. Dragging it jumps straight to a month without
 * loading anything on the way: every section's offset is already known from the summary,
 * so the whole library is reachable in one gesture even at 18k photos.
 */
const Scrubber: React.FC<ScrubberProps> = ({ sections, scrollMargin, stickyTop }) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [range, setRange] = useState(1);
  const [railBox, setRailBox] = useState({ top: 0, height: 0 });
  const idleTimer = useRef<number>();
  const [active, setActive] = useState(false);

  const measure = useCallback(() => {
    setRange(scrollRange());
    const box = railRef.current?.getBoundingClientRect();
    if (box) setRailBox({ top: box.top, height: box.height });
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollY(window.scrollY);
        setRange(scrollRange());
        setActive(true);
        window.clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(() => setActive(false), 1200);
      });
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.clearTimeout(idleTimer.current);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);

  // The rail's own height changes with the viewport and with the section list growing.
  useEffect(measure, [measure, sections.length]);

  const fraction = Math.min(1, Math.max(0, scrollY / range));
  const thumbY = fraction * railBox.height;

  /** The month at the pinned-header line for the current scroll position. */
  const currentMonth = useMemo(() => {
    if (!sections.length) return null;
    const listY = scrollY - scrollMargin + stickyTop;
    return sections[sectionAtOffset(sections, Math.max(0, listY))].monthKey;
  }, [scrollY, scrollMargin, stickyTop, sections]);

  /** One label per year, placed where that year starts. */
  const ticks = useMemo(() => {
    if (!railBox.height || !sections.length) return [];
    const seen = new Set<number>();
    const out: { year: number; y: number }[] = [];
    for (const section of sections) {
      const { year } = parseMonthKey(section.monthKey);
      if (seen.has(year)) continue;
      seen.add(year);
      const y = ((section.offset + scrollMargin) / range) * railBox.height;
      // Drop labels that would collide with the previous one.
      if (out.length && y - out[out.length - 1].y < 16) continue;
      out.push({ year, y });
    }
    return out;
  }, [sections, railBox.height, range, scrollMargin]);

  // Measured live rather than read off state: the document keeps growing as months
  // load, and a drag that used the range captured at the last render would land short.
  const scrollToPointer = useCallback((clientY: number) => {
    const box = railRef.current?.getBoundingClientRect();
    if (!box?.height) return;
    const f = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
    window.scrollTo({ top: f * scrollRange(), behavior: "auto" });
  }, []);

  if (sections.length < 2) return null;

  return (
    <Rail
      ref={railRef}
      top={stickyTop}
      active={active || dragging}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        measure();
        scrollToPointer(e.clientY);
      }}
      onPointerMove={(e) => dragging && scrollToPointer(e.clientY)}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
      role="slider"
      aria-label="Scroll through your library by date"
      aria-valuetext={currentMonth ? formatMonthShort(currentMonth) : undefined}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
    >
      {ticks.map((tick) => (
        <Tick key={tick.year} y={tick.y}>
          {tick.year}
        </Tick>
      ))}
      <Thumb y={thumbY} />
      {dragging && currentMonth && <Bubble y={thumbY}>{formatMonthShort(currentMonth)}</Bubble>}
    </Rail>
  );
};

export default Scrubber;
