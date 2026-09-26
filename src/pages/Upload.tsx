/** @jsxImportSource @emotion/react */
import React, { ChangeEvent, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useRecoilState } from "recoil";
import { isLoadingState } from "../recoil/mediaAtoms";
import { useGenerateUrls } from "../hooks/useGenerateUrls";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { UploadFileInput } from "../types/media";
import { readMetadata } from "../utils/mediaMetadata";
import { formatTakenAt, monthKeyOf } from "../utils/dates";

const MAX_FILES = 100;

interface PreparedFile {
  file: File;
  input: UploadFileInput;
}

const containerStyle = css`
  max-width: 640px;
  margin: 0 auto;
  padding: 16px;
  background-color: var(--background-color);
  border-radius: 8px;
`;

const headerStyle = css`
  color: var(--text-color);
  text-align: center;
  margin-bottom: 16px;
`;

const warningStyle = css`
  text-align: center;
  color: var(--warning-text-color, orange);
  font-size: 14px;
  margin-bottom: 10px;
`;

const inputStyle = css`
  display: block;
  margin: 8px auto;
  padding: 8px;
  font-size: 16px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background-color: var(--background-color);
  color: var(--text-color);
  width: 100%;

  &:hover {
    border-color: var(--hover-color);
  }

  &:focus {
    outline: none;
    border-color: var(--hover-color);
    box-shadow: 0 0 4px var(--hover-color);
  }
`;

const messageStyle = (isSuccess: boolean) => css`
  text-align: center;
  margin: 16px 0;
  color: ${isSuccess ? "var(--success-text-color)" : "var(--error-text-color)"};
  font-size: 16px;
`;

const loadingStyle = css`
  text-align: center;
  font-size: 16px;
  color: var(--text-color);
`;

const listStyle = css`
  margin: 12px 0;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;

  div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 10px;
    font-size: 13px;
    color: var(--text-color);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  div:last-of-type {
    border-bottom: none;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    flex-shrink: 0;
    opacity: 0.65;
  }

  .guessed {
    font-style: italic;
    opacity: 0.45;
  }
`;

const buttonStyle = css`
  display: block;
  margin: 20px auto;
  padding: 12px 24px;
  background-color: var(--secondary-color);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  text-decoration: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease-in-out;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  &:hover:not(:disabled) {
    background-color: var(--tertiary-color);
    color: var(--secondary-color);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    background-color: var(--tertiary-color);
    color: var(--secondary-color-dark);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transform: translateY(0);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 150, 255, 0.5);
  }
`;

/** Newest capture date in the batch — where the library should land afterwards. */
const newestMonth = (prepared: PreparedFile[]) =>
  prepared
    .map((p) => monthKeyOf(p.input.takenAt))
    .filter((key): key is string => !!key)
    .sort()
    .pop();

const Upload: React.FC = () => {
  const [isLoading, setIsLoading] = useRecoilState<boolean>(isLoadingState);
  const [isReading, setIsReading] = useState(false);
  const [prepared, setPrepared] = useState<PreparedFile[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();
  const generateUrls = useGenerateUrls();

  const reset = () => {
    setPrepared([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!event.target.files) return;

    const selected = Array.from(event.target.files).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (selected.length === 0) {
      setErrorMessage("Only image and video files are allowed.");
      reset();
      return;
    }
    if (selected.length > MAX_FILES) {
      setErrorMessage(`You can only upload up to ${MAX_FILES} files at a time.`);
      reset();
      return;
    }

    // Read the capture date out of each file before anything is sent, so the row the
    // backend writes already knows where the photo belongs in the timeline.
    setIsReading(true);
    try {
      const read = await Promise.all(
        selected.map(async (file) => {
          const extension = file.name.split(".").pop();
          const fileName = `${uuidv4()}${extension ? `.${extension}` : ""}`;
          return { file, input: await readMetadata(file, fileName) };
        })
      );
      setPrepared(read);
    } catch (error) {
      console.error("Error reading file metadata:", error);
      setErrorMessage("Could not read those files. Please try again.");
      reset();
    } finally {
      setIsReading(false);
    }
  };

  const handleUpload = useCallback(async () => {
    if (!prepared.length) return;
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const { urls } = await generateUrls(prepared.map((p) => p.input));

      await Promise.all(
        prepared.map(async ({ file, input }, index) => {
          const response = await fetch(urls[index].uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": input.fileType },
          });
          if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
        })
      );

      const month = newestMonth(prepared);
      setSuccessMessage(
        `Successfully uploaded ${prepared.length} file${prepared.length === 1 ? "" : "s"}.`
      );
      reset();
      navigate(month ? `/?m=${month}` : "/");
    } catch (error) {
      console.error("Error uploading files:", error);
      setErrorMessage("Failed to upload one or more files. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [prepared, generateUrls, navigate, setIsLoading]);

  return (
    <div style={{ padding: "0 20px" }}>
      <div css={containerStyle}>
        <h1 css={headerStyle}>Upload Files or Folders</h1>

        <p css={warningStyle}>⚠️ You can upload up to {MAX_FILES} files at a time.</p>

        <input
          css={inputStyle}
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleSelect}
          disabled={isLoading || isReading}
          {...({ webkitdirectory: 'true', directory: 'true' } as React.InputHTMLAttributes<HTMLInputElement>)}
        />

        {isReading && <p css={loadingStyle}>Reading dates…</p>}

        {prepared.length > 0 && !isLoading && (
          <>
            <div css={listStyle}>
              {prepared.map(({ file, input }) => (
                <div key={input.fileName}>
                  <span className="name">{file.name}</span>
                  <span className={`date${input.dateSource === "exif" ? "" : " guessed"}`}>
                    {formatTakenAt(input.takenAt) ?? "no date"}
                  </span>
                </div>
              ))}
            </div>
            <button css={buttonStyle} onClick={handleUpload}>
              Upload {prepared.length} file{prepared.length === 1 ? "" : "s"}
            </button>
          </>
        )}

        {isLoading && <p css={loadingStyle}>Uploading…</p>}
        {successMessage && <p css={messageStyle(true)}>{successMessage}</p>}
        {errorMessage && <p css={messageStyle(false)}>{errorMessage}</p>}
      </div>
    </div>
  );
};

export default Upload;
