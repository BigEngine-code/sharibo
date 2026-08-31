import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Build outputs / generated artifacts — never lint these.
    ignores: ["**/dist/", "circuits/build/", "app/public/circuits/"],
    rules: {
      "no-unused-vars": "error",
      "@typescript-eslint/no-unused-vars": "error"
    },
  },

  // packages/client + scripts: plain TypeScript, runs under Node.
  {
    files: ["packages/client/**/*.ts", "scripts/**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },

  // app: TypeScript + React, runs in the browser.
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
    languageOptions: {
      globals: globals.browser,
    },
  },

  // app/scripts/sync-circuit.mjs: plain Node ESM, not TypeScript.
  {
    files: ["app/scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
);