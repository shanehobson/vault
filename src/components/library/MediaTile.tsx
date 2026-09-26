import React, { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { FaPlay } from "react-icons/fa";
import { FileData, isImage, isVideo } from "../../types/media";
import { formatDuration } from "../../utils/dates";

const Frame = styled.div`
  position: relative;

  /* Plain class rather than an Emotion component selector: those need
     @emotion/babel-plugin, which this Vite setup doesn't run. */
  &:hover .tile-check {
    opacity: 1;
  }
`;

const Tile = styled.button<{ selected: boolean }>`
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 3px;
  overflow: hidden;
  background-color: #3a3a3a;
  cursor: pointer;
  display: block;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.15s ease-out;
    transform: ${({ selected }) => (selected ? "scale(0.88)" : "none")};
  }

  &:focus-visible {
    outline: 3px solid var(--tertiary-color);
    outline-offset: -3px;
  }
`;

const Badge = styled.span`
  position: absolute;
  bottom: 4px;
  left: 5px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  pointer-events: none;
`;

/**
 * Hidden until it's wanted: a permanent circle on every one of ~18,000 tiles reads as
 * clutter. It appears on hover, once anything is selected, or after a long press —
 * which is how selection starts on a touch screen.
 */
const Check = styled.button<{ checked: boolean; shown: boolean }>`
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background-color: ${({ checked }) => (checked ? "rgba(255, 215, 51, 0.95)" : "rgba(0, 0, 0, 0.3)")};
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
  opacity: ${({ shown }) => (shown ? 1 : 0)};
  transition: opacity 0.15s ease-in-out, background-color 0.15s ease-in-out;

  &:focus-visible {
    opacity: 1;
    outline: 2px solid var(--tertiary-color);
  }

  &:hover {
    background-color: ${({ checked }) => (checked ? "rgba(255, 215, 51, 1)" : "rgba(255, 255, 255, 0.4)")};
  }
`;

export const Skeleton = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  background: linear-gradient(100deg, #333 30%, #414141 50%, #333 70%);
  background-size: 300% 100%;
  animation: tile-shimmer 1.4s ease-in-out infinite;

  @keyframes tile-shimmer {
    from {
      background-position: 150% 0;
    }
    to {
      background-position: -50% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** The cheap thumbnail when there is one, falling back to the full-size asset. */
const Preview: React.FC<{ file: FileData }> = ({ file }) => {
  const [thumbFailed, setThumbFailed] = useState(false);

  if (file.thumbUrl && !thumbFailed) {
    return (
      <img
        src={file.thumbUrl}
        alt={file.originalName || file.fileName}
        loading="lazy"
        decoding="async"
        onError={() => setThumbFailed(true)}
      />
    );
  }
  if (isImage(file)) {
    return <img src={file.signedUrl} alt={file.originalName || file.fileName} loading="lazy" decoding="async" />;
  }
  if (isVideo(file)) {
    return <video src={file.signedUrl} muted preload="metadata" />;
  }
  return null;
};

interface MediaTileProps {
  file: FileData;
  selected: boolean;
  /** True once anything is selected: tapping a tile then extends the selection. */
  selectionMode: boolean;
  onOpen: (file: FileData) => void;
  onToggleSelect: (mediaId: string) => void;
}

const LONG_PRESS_MS = 450;

const MediaTile: React.FC<MediaTileProps> = ({
  file,
  selected,
  selectionMode,
  onOpen,
  onToggleSelect,
}) => {
  const duration = formatDuration(file.durationSec);
  const timer = useRef<number>();
  const longPressed = useRef(false);

  const cancelPress = useCallback(() => {
    window.clearTimeout(timer.current);
  }, []);

  const startPress = useCallback(() => {
    longPressed.current = false;
    cancelPress();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onToggleSelect(file.mediaId);
    }, LONG_PRESS_MS);
  }, [cancelPress, onToggleSelect, file.mediaId]);

  const handleClick = () => {
    if (longPressed.current) {
      // The long press already toggled this tile; don't also open it.
      longPressed.current = false;
      return;
    }
    if (selectionMode) onToggleSelect(file.mediaId);
    else onOpen(file);
  };

  return (
    <Frame>
      <Tile
        type="button"
        selected={selected}
        aria-pressed={selectionMode ? selected : undefined}
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => selectionMode && e.preventDefault()}
      >
        <Preview file={file} />
        {isVideo(file) && (
          <Badge>
            <FaPlay size={9} />
            {duration}
          </Badge>
        )}
      </Tile>
      <Check
        className="tile-check"
        type="button"
        aria-pressed={selected}
        aria-label={selected ? "Deselect" : "Select"}
        checked={selected}
        shown={selected || selectionMode}
        onClick={() => onToggleSelect(file.mediaId)}
      >
        {selected ? "✓" : ""}
      </Check>
    </Frame>
  );
};

export default MediaTile;
