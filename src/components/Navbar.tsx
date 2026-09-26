/** @jsxImportSource @emotion/react */
import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Link, useLocation } from "react-router-dom";

const navbarStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--secondary-color);
  color: var(--text-color);
  padding: 5px 20px;
  position: sticky;
  top: 0; /* Makes the navbar stick to the top */
  z-index: 1000; /* Ensure the navbar stays on top of other elements */

  @media (max-width: 768px) {
    padding: 5px 10px;
    flex-direction: row;
  }
`;

const logoStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;

  /* The UA's default h1 margin made the bar ~101px tall, which put it over the
     fixed zoom pill (top: 62px) and left it unclickable on desktop. Everything
     else already assumes a short bar — Library's navHeight falls back to 48. */
  h1 {
    margin: 0;
    font-size: 24px;
  }

  .lock-icon {
    font-size: 20px;
    color: yellow;
  }
`;

const desktopMenuStyle = css`
  display: flex;
  align-items: center;

  @media (max-width: 768px) {
    display: none;
  }
`;

const mobileMenuContainerStyle = (isOpen: boolean) => css`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: flex-start;
  position: absolute;
  top: 85px;
  left: 0;
  background-color: var(--secondary-color);
  z-index: 1000;
  padding: 0;
  overflow: hidden;
  height: ${isOpen ? "150px" : "0"}; /* Control height for animation */
  transition: height 0.5s ease-in-out;
`;

const menuToggleStyle = css`
  display: none;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;

  span {
    width: 25px;
    height: 2px;
    background-color: var(--text-color);
    border-radius: 2px;
    transition: transform 0.3s;
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

const menuItemStyle = (isActive: boolean) => css`
  font-weight: bold;
  text-decoration: none;
  color: ${isActive ? 'var(--tertiary-color)' : 'var(--text-color)'};
  padding: 10px 20px;
  cursor: pointer;
  width: 100%;

  &:hover {
    color: var(--tertiary-color);
  }

  border: none;
  background: none;

  @media (max-width: 768px) {
    border-bottom: none;
  }
`;

const userMenuStyle = css`
  position: relative;
  display: inline-block;
  padding-left: 30px;

  .menu {
    position: absolute;
    top: 35px;
    right: 0;
    background-color: var(--secondary-color);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    border: 1px solid var(--dark-secondary-color);
    overflow: hidden;
    display: none;

    &.open {
      display: block;
      width: 200px;
    }

    button {
      padding: 10px 20px;
      width: 100%;
      border: none;
      text-align: left;
      color: var(--text-color);
      cursor: pointer;
      background-color: var(--secondary-color);
      font-weight: bold;

      &:hover {
        background-color: var(--dark-secondary-color);
      }
    }
  }

  button {
    cursor: pointer;
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

const Navbar: React.FC<{ signOut: () => void }> = ({ signOut }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const handleUserMenuToggle = () => {
    setIsUserMenuOpen((prev) => !prev);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
      setIsUserMenuOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <nav css={navbarStyle}>
      {/* Logo */}
      <div css={logoStyle}>
        <span className="lock-icon">🔒</span>
        <h1>Vault</h1>
      </div>

      {/* Desktop Menu */}
      <div css={desktopMenuStyle}>
        <Link css={menuItemStyle(location.pathname === "/")} to="/">View</Link>
        <Link css={menuItemStyle(location.pathname === "/upload")} to="/upload">Upload</Link>
        <div css={userMenuStyle} ref={userMenuRef}>
          <button onClick={handleUserMenuToggle}>👤</button>
          <div className={`menu ${isUserMenuOpen ? "open" : ""}`}>
            <button onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Hamburger Toggle */}
      <div css={menuToggleStyle} onClick={toggleMobileMenu}>
        <span style={{ transform: isMobileMenuOpen ? "rotate(45deg) translateY(5px)" : "none" }}></span>
        <span style={{ display: isMobileMenuOpen ? "none" : "block" }}></span>
        <span style={{ transform: isMobileMenuOpen ? "rotate(-45deg) translateY(-5px)" : "none" }}></span>
      </div>

      {/* Mobile Menu */}
      <div css={mobileMenuContainerStyle(isMobileMenuOpen)}>
        <Link css={menuItemStyle(location.pathname === "/")} to="/" onClick={() => setIsMobileMenuOpen(false)}>View</Link>
        <Link css={menuItemStyle(location.pathname === "/upload")} to="/upload" onClick={() => setIsMobileMenuOpen(false)}>Upload</Link>
        <Link
          css={menuItemStyle(false)}
          to="#"
          onClick={() => {
            setIsMobileMenuOpen(false);
            signOut();
          }}
        >
          Log Out
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
