/** @jsxImportSource @emotion/react */
import React, { useEffect } from "react";
import styled from "@emotion/styled";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { formatTakenAt } from "../utils/dates";

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #111;
  border-radius: 10px;
  max-width: min(1400px, 94vw);
  max-height: 94vh;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const ScrollableContainer = styled.div`
  max-width: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;

  img,
  video {
    max-width: min(1400px, 94vw);
    max-height: 80vh;
    border-radius: 10px 10px 0 0;
    display: block;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 8px;
  right: 10px;
  background: rgba(0, 0, 0, 0.45);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 22px;
  line-height: 1;
  color: #fff;
  cursor: pointer;

  &:hover {
    color: var(--tertiary-color);
  }
`;

const NavButton = styled.button<{ side: "left" | "right" }>`
  position: absolute;
  ${({ side }) => side}: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
    color: var(--tertiary-color);
  }
`;

export interface MediaMeta {
  takenAt?: string;
  dateSource?: string;
  tzSource?: string;
  latitude?: number;
  longitude?: number;
  cameraModel?: string;
  originalName?: string;
  album?: string;
}

interface MediaModalProps {
  url: string;
  type: "image" | "video";
  onClose: () => void;
  meta?: MediaMeta;
  onPrev?: () => void;
  onNext?: () => void;
}

const Caption = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  padding: 10px 46px 12px 12px;
  font-size: 13px;
  color: #ddd;

  a {
    color: var(--tertiary-color);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  .hint {
    opacity: 0.55;
    font-style: italic;
  }
`;

const MediaModal: React.FC<MediaModalProps> = ({
  url,
  type,
  onClose,
  meta,
  onPrev,
  onNext,
}) => {
  // The taken date is shown exactly as recorded — reading it through `new Date()` would
  // re-express it in this browser's timezone and could show the wrong day.
  const taken = formatTakenAt(meta?.takenAt);
  const hasLocation = meta?.latitude !== undefined && meta?.longitude !== undefined;
  const dateIsGuessed = meta?.dateSource === "upload" || meta?.dateSource === "mtime";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ScrollableContainer>
          {type === "image" ? (
            <img src={url} alt="Preview" />
          ) : (
            <video src={url} controls autoPlay />
          )}
        </ScrollableContainer>
        {(taken || hasLocation || meta?.album) && (
          <Caption>
            {taken && (
              <span>
                📅 {taken}
                {dateIsGuessed && <span className="hint"> · date unknown, showing upload time</span>}
              </span>
            )}
            {hasLocation && (
              <a
                href={`https://www.google.com/maps?q=${meta!.latitude},${meta!.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 {meta!.latitude!.toFixed(4)}, {meta!.longitude!.toFixed(4)}
              </a>
            )}
            {meta?.cameraModel && <span>📷 {meta.cameraModel}</span>}
            {meta?.album && <span>🗂 {meta.album}</span>}
          </Caption>
        )}
        {onPrev && (
          <NavButton side="left" onClick={onPrev} aria-label="Previous">
            <FaChevronLeft />
          </NavButton>
        )}
        {onNext && (
          <NavButton side="right" onClick={onNext} aria-label="Next">
            <FaChevronRight />
          </NavButton>
        )}
        <CloseButton onClick={onClose} aria-label="Close">
          &times;
        </CloseButton>
      </ModalContent>
    </ModalOverlay>
  );
};

export default MediaModal;
