import React from "react";
import styled from "@emotion/styled";

export type ZoomLevel = "years" | "months" | "all";

export const ZOOM_LEVELS: { id: ZoomLevel; label: string }[] = [
  { id: "years", label: "Years" },
  { id: "months", label: "Months" },
  { id: "all", label: "All" },
];

const Pill = styled.div`
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(20, 20, 20, 0.88);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);

  @media (min-width: 900px) {
    bottom: auto;
    top: 62px;
    left: auto;
    right: 46px;
    transform: none;
  }
`;

const Option = styled.button<{ selected: boolean }>`
  border: none;
  border-radius: 999px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.18s ease-out, color 0.18s ease-out;
  background: ${({ selected }) => (selected ? "var(--tertiary-color)" : "transparent")};
  color: ${({ selected }) => (selected ? "#1b1b1b" : "rgba(255, 255, 255, 0.75)")};

  &:hover {
    color: ${({ selected }) => (selected ? "#1b1b1b" : "#fff")};
  }
`;

interface ZoomControlProps {
  value: ZoomLevel;
  onChange: (level: ZoomLevel) => void;
}

const ZoomControl: React.FC<ZoomControlProps> = ({ value, onChange }) => (
  <Pill role="tablist" aria-label="Zoom level">
    {ZOOM_LEVELS.map((level) => (
      <Option
        key={level.id}
        type="button"
        role="tab"
        aria-selected={value === level.id}
        selected={value === level.id}
        onClick={() => onChange(level.id)}
      >
        {level.label}
      </Option>
    ))}
  </Pill>
);

export default ZoomControl;
