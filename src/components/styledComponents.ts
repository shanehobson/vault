import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";

export const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(100px, 200px)
  ); /* Responsive column sizes */
  gap: 8px;
  padding: 8px;
  justify-content: center;
  max-width: 1200px;
  margin: 50px auto 0 auto;

  @media (max-width: 768px) {
    grid-template-columns: repeat(
      auto-fit,
      minmax(95px, 1fr)
    ); /* Smaller thumbnails on tablets */
  }
`;

export const Thumbnail = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background-color: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 3px;
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;

  @media (max-width: 768px) {
    border-radius: 2px; /* Slightly smaller border-radius on smaller screens */
  }

  @media (max-width: 480px) {
    border-radius: 1px; /* Even smaller border-radius for a more compact look */
  }
`;

export const ThumbnailImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const ThumbnailVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const Loader = styled.div`
  text-align: center;
  margin: 20px 0;
  font-size: 16px;
  color: var(--text-color);
`;

export const Spinner = styled.img`
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

export const SelectionCheckbox = styled.input`
  appearance: none;
  position: absolute;
  top: -2px;
  right: -2px;
  width: 24px; /* Larger */
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.7); /* White border for visibility */
  border-radius: 50%; /* Fully circular */
  background-color: rgba(0, 0, 0, 0.2); /* Transparent dark background */
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:checked {
    background-color: rgba(255, 215, 51, 0.9); /* Gold color */
    border: 2px solid rgba(255, 215, 51, 1);
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }

  &:checked::before {
    content: "✓";
    font-size: 16px;
    color: white;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
`;

export const UploadButton = styled.button`
  display: block;
  margin: 20px auto;
  padding: 12px 24px;
  background-color: var(--secondary-color);
  color: #fff;
  border: none;
  border-radius: 8px; /* Rounded corners for a modern look */
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase; /* Add text transformation for a sleek design */
  text-decoration: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Subtle shadow for depth */
  transition: all 0.3s ease-in-out; /* Smooth transition effect */

  &:hover {
    background-color: var(--tertiary-color); /* Darker shade on hover */
    color: var(--secondary-color);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15); /* Enhance shadow on hover */
    transform: translateY(-2px); /* Slight upward motion */
  }

  &:active {
    background-color: var(--tertiary-color); /* Darker shade on hover */
    color: var(--secondary-color-dark);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* Reduce shadow */
    transform: translateY(0); /* Reset motion */
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 150, 255, 0.5); /* Accessible focus ring */
  }
`;
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
`;

// Delete button spin animation when deleting
export const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

export const FloatingDeleteButton = styled.button<{ deleting: boolean }>`
  position: fixed;
  top: 120px;
  right: 20px;
  padding: 12px;
  font-size: 16px;
  background-color: #fff;
  color: var(--secondary-color);
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  cursor: ${({ deleting }) => (deleting ? "not-allowed" : "pointer")};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-in-out;
  z-index: 200;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);

  // Apply fade-in animation
  ${({ deleting }) =>
    deleting
      ? css`
          animation: ${fadeOut} 0.3s ease-in-out;
        `
      : css`
          animation: ${fadeIn} 0.3s ease-in-out;
        `}

  &:hover {
    background-color: var(--hover-color);
  }

  &:active {
    background-color: var(--hover-color);
    transform: scale(0.95);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(0, 87, 183, 0.5);
  }

  svg {
    width: 22px;
    height: 22px;
    ${({ deleting }) =>
      deleting &&
      css`
        animation: ${spin} 1s linear infinite;
      `}
  }
`;
