// Proof-generation benchmark (Issue #64).
//
// Usage (from packages/client, after building the circuits per
// circuits/README.md — `npm run bench:prove`):
//
//   npm run bench:prove
//   npm run bench:prove -- --n 10
//
// Generates N proofs against the built circuit artifacts
// (circuits/build/membership_js/membership.wasm,
// circuits/build/membership_final.zkey) using the same input for every run
// (circuits/input.example.json), and reports min/median/max wall time plus
// peak RSS, alongside the Node version and CPU model.
//
// Baseline (fill in after running on your machine — see README section at
// the bottom of this file for the template):
//   Not yet recorded. Run `npm run bench:prove` after building the circuits
//   (see circuits/scripts/compile.sh + circuits/scripts/setup.sh) and paste
//   the output into the "Recorded baselines" section below.

import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateProof, type CircuitInput } from "../src/prove.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = path.resolve(__dirname, "../../../circuits");
const WASM_PATH = path.join(CIRCUITS_DIR, "build/membership_js/membership.wasm");
const ZKEY_PATH = path.join(CIRCUITS_DIR, "build/membership_final.zkey");
const INPUT_PATH = path.join(CIRCUITS_DIR, "input.example.json");

function parseArgN(): number {
  const idx = process.argv.indexOf("--n");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 5;
}

function loadInput(): CircuitInput {
  const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
  return {
    identityNullifier: BigInt(raw.identityNullifier),
    identitySecret: BigInt(raw.identitySecret),
    pathElements: raw.pathElements.map((e: string) => BigInt(e)),
    pathIndices: raw.pathIndices,
    root: BigInt(raw.root),
    externalNullifier: BigInt(raw.externalNullifier),
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function main() {
  const n = parseArgN();
  const input = loadInput();

  console.log(`Node: ${process.version}`);
  console.log(`CPU: ${cpus()[0]?.model ?? "unknown"} (${cpus().length} cores)`);
  console.log(`Generating ${n} proof(s)...`);

  const durationsMs: number[] = [];
  let peakRssBytes = 0;

  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await generateProof(input, WASM_PATH, ZKEY_PATH);
    const elapsed = performance.now() - start;
    durationsMs.push(elapsed);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    console.log(`  run ${i + 1}/${n}: ${elapsed.toFixed(1)} ms`);
  }

  const sorted = [...durationsMs].sort((a, b) => a - b);
  console.log("\n--- Proof-generation benchmark ---");
  console.log(`n: ${n}`);
  console.log(`min:    ${sorted[0].toFixed(1)} ms`);
  console.log(`median: ${median(sorted).toFixed(1)} ms`);
  console.log(`max:    ${sorted[sorted.length - 1].toFixed(1)} ms`);
  console.log(`peak RSS: ${(peakRssBytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// ─── README ─────────────────────────────────────────────────────────────────
//
// ## Recorded baselines
//
// | Date | Node | CPU | n | min (ms) | median (ms) | max (ms) | peak RSS (MB) |
// | --- | --- | --- | --- | --- | --- | --- | --- |
// | (none yet — run `npm run bench:prove` after building the circuits and
//   record your machine's numbers here) | | | | | | | |
