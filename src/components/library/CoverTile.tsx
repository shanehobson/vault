import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { FileData } from "../../types/media";

const Tile = styled.button`
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  background-color: #3a3a3a;
  cursor: pointer;
  display: block;
  scroll-margin-top: 90px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.35s ease-out;
  }

  &:hover img {
    transform: scale(1.04);
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 45%);
  }

  &:focus-visible {
    outline: 3px solid var(--tertiary-color);
    outline-offset: 2px;
  }
`;

const Label = styled.span`
  position: absolute;
  left: 12px;
  bottom: 10px;
  z-index: 1;
  color: #fff;
  font-size: 19px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
`;

const Count = styled.span`
  position: absolute;
  right: 10px;
  top: 9px;
  z-index: 1;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
`;

interface CoverTileProps {
  label: string;
  count: number;
  cover?: FileData | null;
  /** Called once, when the tile first scrolls into view. */
  onRequestCover: () => void;
  onClick: () => void;
}

const CoverTile: React.FC<CoverTileProps> = ({ label, count, cover, onRequestCover, onClick }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          onRequestCover();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [seen, onRequestCover]);

  return (
    <Tile ref={ref} type="button" onClick={onClick} aria-label={`${label}, ${count} items`}>
      {cover && (
        <img
          src={cover.thumbUrl || cover.signedUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      <Count>{count.toLocaleString()}</Count>
      <Label>{label}</Label>
    </Tile>
  );
};

export default CoverTile;
