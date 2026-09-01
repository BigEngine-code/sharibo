/**
 * API surface snapshot test.
 *
 * Verifies that the public exports from @sharibo/client match the committed
 * snapshot. This catches accidental name changes, removals, or additions to
 * the public API.
 *
 * When intentional API changes occur, update `api-surface.json` alongside
 * the code change and commit both files together. See CONTRIBUTING.md for
 * guidance.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pkg from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(__dirname, "..", "api-surface.json");
const snapshotJson = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

describe("API surface snapshot", () => {
  it("matches committed snapshot", () => {
    // Collect all exported names and their types
    const exported: Record<string, string> = {};

    for (const [name, value] of Object.entries(pkg)) {
      if (typeof value === "function") {
        exported[name] = "function";
      } else if (typeof value === "object" && value !== null) {
        // For classes and constructors
        if ((value as any).constructor?.name === name || typeof value === "object") {
          exported[name] = typeof value;
        } else {
          exported[name] = typeof value;
        }
      } else {
        exported[name] = typeof value;
      }
    }

    // Group by category for better readability
    const constants: Record<string, string> = {};
    const functions: Record<string, string> = {};
    const types: Record<string, string> = {};
    const errors: Record<string, string> = {};

    for (const [name, typeOf] of Object.entries(exported)) {
      if (
        name === "ZERO_VALUE" ||
        name === "TREE_LEVELS" ||
        name === "MAX_CIRCLE_SIZE"
      ) {
        constants[name] = typeOf;
      } else if (
        name === "ShariboError" ||
        name === "InvalidInputError" ||
        name === "ProvingError" ||
        name === "RpcError" ||
        name === "ContractError"
      ) {
        errors[name] = typeOf;
      } else if (name === "MerkleTree") {
        types[name] = typeOf;
      } else if (typeOf === "function") {
        functions[name] = typeOf;
      } else if (typeOf !== "undefined") {
        // Catch any remaining runtime constants (e.g. numbers) that are not
        // in the explicit constants list — treat as constants for snapshot
        // purposes so we don't silently drop them.
        constants[name] = typeOf;
      }
    }

    // Sort each category for consistent comparison
    const sortedSnapshot = {
      constants: Object.fromEntries(Object.entries(snapshotJson.constants).sort()),
      functions: Object.fromEntries(Object.entries(snapshotJson.functions).sort()),
      types: Object.fromEntries(Object.entries(snapshotJson.types).sort()),
      errors: Object.fromEntries(Object.entries(snapshotJson.errors).sort()),
    };

    const sortedActual = {
      constants: Object.fromEntries(Object.entries(constants).sort()),
      functions: Object.fromEntries(Object.entries(functions).sort()),
      types: Object.fromEntries(Object.entries(types).sort()),
      errors: Object.fromEntries(Object.entries(errors).sort()),
    };

    // Compare
    try {
      expect(sortedActual).toEqual(sortedSnapshot);
    } catch (error) {
      // Provide a helpful diff message
      console.error("\n❌ API surface mismatch!");
      console.error("\nExpected snapshot:");
      console.error(JSON.stringify(sortedSnapshot, null, 2));
      console.error("\nActual exports:");
      console.error(JSON.stringify(sortedActual, null, 2));
      throw error;
    }
  });
});
