// Unit tests for e2e.ts CLI flag parsing.
// These verify that parseArgs accepts valid flags and rejects invalid ones,
// without running the actual e2e flow (which requires testnet + .env).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";

// Mirror the exact parseArgs config from e2e.ts so tests stay in sync.
const argsConfig = {
  options: {
    "skip-replay": { type: "boolean" as const, default: false },
    "reuse-circle": { type: "string" as const },
    verbose: { type: "boolean" as const, default: false },
  },
  strict: true,
};

function parse(argv: string[]) {
  return parseArgs({ ...argsConfig, args: argv }).values;
}

describe("e2e CLI flag parsing", () => {
  it("defaults: no flags set", () => {
    const flags = parse([]);
    assert.equal(flags["skip-replay"], false);
    assert.equal(flags["reuse-circle"], undefined);
    assert.equal(flags.verbose, false);
  });

  it("--skip-replay sets the flag", () => {
    const flags = parse(["--skip-replay"]);
    assert.equal(flags["skip-replay"], true);
  });

  it("--reuse-circle accepts a numeric string", () => {
    const flags = parse(["--reuse-circle", "42"]);
    assert.equal(flags["reuse-circle"], "42");
    // Verify it converts to BigInt without error
    assert.equal(BigInt(flags["reuse-circle"]!), 42n);
  });

  it("--reuse-circle accepts 0", () => {
    const flags = parse(["--reuse-circle", "0"]);
    assert.equal(flags["reuse-circle"], "0");
    assert.equal(BigInt(flags["reuse-circle"]!), 0n);
  });

  it("--verbose sets the flag", () => {
    const flags = parse(["--verbose"]);
    assert.equal(flags.verbose, true);
  });

  it("all flags together", () => {
    const flags = parse(["--skip-replay", "--reuse-circle", "7", "--verbose"]);
    assert.equal(flags["skip-replay"], true);
    assert.equal(flags["reuse-circle"], "7");
    assert.equal(flags.verbose, true);
  });

  it("rejects unknown flags in strict mode", () => {
    assert.throws(() => parse(["--unknown-flag"]), {
      code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
    });
  });

  it("--reuse-circle requires a value", () => {
    // parseArgs in strict mode should throw when a string option is missing its value
    assert.throws(() => parse(["--reuse-circle"]), /argument missing/i);
  });
});
