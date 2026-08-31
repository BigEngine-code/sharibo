import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Shares the same plugin-react config as vite.config.ts so JSX transform and
// Fast Refresh are applied identically in tests and in the dev server.
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  test: {
    // jsdom provides a browser-like DOM environment without a real browser.
    environment: "jsdom",
    // Import @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
    // globally before every test file.
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
  },
});
