import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"), // or 'production'
    "process.version": '"v18.0.0"',
  },
});
