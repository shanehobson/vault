/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { MouseEventHandler } from 'react';

interface ButtonProps {
  children: React.ReactNode; // Type for children
  onClick: MouseEventHandler<HTMLButtonElement>;
  isSelected?: boolean; // Optional prop to indicate if the button is selected
}

const buttonStyle = (isSelected: boolean) => css`
  background-color: ${isSelected ? 'var(--hover-color)' : 'var(--secondary-color)'};
  color: ${isSelected ? 'var(--text-color)' : 'var(--accent-color)'};
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: background-color 0.3s, color 0.3s;

  &:hover {
    background-color: 'var(--text-color)'};
    color: ${isSelected ? 'var(--accent-color)' : 'var(--text-color)'};
  }

  &:active {
    background-color: ${isSelected ? 'var(--hover-color)' : 'var(--text-color)'};
    color: var(--text-color);
  }
`;

const Button: React.FC<ButtonProps> = ({ children, onClick, isSelected = false }) => (
  <button css={buttonStyle(isSelected)} onClick={onClick}>
    {children}
  </button>
);

export default Button;
