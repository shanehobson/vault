import { createTheme } from "@aws-amplify/ui-react";

const customTheme = createTheme({
  name: "custom-theme",
  tokens: {
    colors: {
      brand: {
        primary: {
          10: "var(--hover-color)", // Yellow hover color (#FFDF33)
          80: "var(--secondary-color)", // Primary brand color (#0057B7)
        },
        secondary: {
          10: "var(--hover-color)", // Yellow hover color (#FFDF33)
          80: "var(--secondary-color)", // Secondary brand color (#0057B7)
        },
      },
      background: {
        primary: "var(--background-color)", // Background color (#2c2c2c)
        secondary: "var(--accent-color)", // Secondary background color (#ffffff)
      },
      font: {
        primary: "var(--tertiary-color)", // Primary text color (#ffffff)
        secondary: "var(--text-hover-color)", // Secondary text color (#dddddd)
      },
    },
    components: {
      tabs: {
        item: {
          color: { value: "var(--text-color)" }, // Tab text color (white)
          _active: {
            color: { value: "var(--tertiary-color)" }, // Active tab color (blue)
          },
          _hover: {
            color: { value: "var(--hover-color)" }, // Hover tab color (yellow)
          },
        },
      },
      button: {
        primary: {
          backgroundColor: { value: "var(--secondary-color)" }, // Button background color (blue)
          color: { value: "var(--text-color)" }, // Button text color (white)
          _hover: {
            backgroundColor: { value: "var(--dark-secondary-color)" }, // Hover background color (darker blue)
          },
        },
        link: {
          color: { value: "var(--tertiary-color)" }, // Link-style button text color (blue)
          _hover: {
            color: { value: "var(--dark-secondary-color)" }, // Hover color (darker blue)
          },
        },
      },
    },
  },
});

export { customTheme };
