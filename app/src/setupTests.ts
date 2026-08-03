// Extend Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, toBeDisabled, etc.).
// Imported here via vitest.config.ts → test.setupFiles so every test file
// gets these matchers automatically without a per-file import.
import "@testing-library/jest-dom";
