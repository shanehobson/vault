import React, { useEffect, useRef } from "react";
import styled from "@emotion/styled";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.7);
`;

const Panel = styled.div`
  width: 100%;
  max-width: 400px;
  padding: 22px 22px 18px;
  border-radius: 12px;
  background: #262626;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  color: var(--text-color);

  h2 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    opacity: 0.75;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;

  button {
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: 2px solid var(--tertiary-color);
      outline-offset: 2px;
    }
  }
`;

const Cancel = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: none;
  color: var(--text-color);

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }
`;

const Destroy = styled.button`
  border: none;
  background: #c0392b;
  color: #fff;

  &:hover:not(:disabled) {
    background: #d84a3b;
  }
`;

interface ConfirmDeleteDialogProps {
  count: number;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Deletes here are permanent — `deleteMedia` removes the S3 object and the DynamoDB row,
 * and the bucket has no versioning to fall back on. Since a month header can select
 * several hundred items at once, the count goes in the heading: "delete 413 items" is a
 * very different decision from "delete 1", and it's the number people check.
 */
const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  count,
  isDeleting,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel, not Delete: a stray Enter or Space right after the dialog
  // opens must not be what destroys the photos.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, isDeleting]);

  const noun = count === 1 ? "item" : "items";

  return (
    <Overlay onClick={() => !isDeleting && onCancel()}>
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-delete-title">
          Delete {count.toLocaleString()} {noun}?
        </h2>
        <p>
          This permanently removes {count === 1 ? "it" : "them"} from your vault. There is no
          undo and nothing to restore from.
        </p>
        <Actions>
          <Cancel ref={cancelRef} type="button" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Cancel>
          <Destroy type="button" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : `Delete ${count.toLocaleString()}`}
          </Destroy>
        </Actions>
      </Panel>
    </Overlay>
  );
};

export default ConfirmDeleteDialog;
