import React from "react";
import styled from "@emotion/styled";
import { formatMonth } from "../../utils/dates";
import { MONTH_HEADER_HEIGHT } from "./layout";

/**
 * Plain block, not sticky: TimelineGrid pins a copy of the header for the month under
 * the top of the viewport, because rows here are absolutely positioned and a `sticky`
 * child of a 44px-tall box has nowhere to stick to.
 */
const Header = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  /* Fixed height: the section geometry in layout.ts is computed from this number, and
     the scroll height of the whole library has to be right before anything loads. */
  height: ${MONTH_HEADER_HEIGHT}px;
  box-sizing: border-box;
  padding: 12px 2px 8px;
  background-color: var(--background-color);

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--text-color);
  }

  span {
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.55;
  }

  button {
    margin-left: auto;
    border: none;
    background: none;
    padding: 2px 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--tertiary-color);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
`;

interface SectionHeaderProps {
  monthKey: string;
  count: number;
  /** Undefined until the month has loaded — there is nothing to select yet. */
  onSelectAll?: () => void;
  allSelected: boolean;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  monthKey,
  count,
  onSelectAll,
  allSelected,
}) => (
  <Header>
    <h2>{formatMonth(monthKey)}</h2>
    <span>{count.toLocaleString()}</span>
    {onSelectAll && (
      <button type="button" onClick={onSelectAll}>
        {allSelected ? "Deselect" : "Select"}
      </button>
    )}
  </Header>
);

export default SectionHeader;
