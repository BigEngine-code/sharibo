// Copies the (gitignored, locally-built) circuit artifacts into
// app/public/circuits so Vite can serve them for browser-side proving.
// Run circuits/scripts/{compile,setup}.sh first if these are missing.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(appDir, "..");
const buildDir = path.join(repoRoot, "circuits", "build");
const outDir = path.join(appDir, "public", "circuits");

const files = [
  { from: path.join(buildDir, "membership_js", "membership.wasm"), to: "membership.wasm" },
  { from: path.join(buildDir, "membership_final.zkey"), to: "membership_final.zkey" },
  { from: path.join(repoRoot, "circuits", "verification_key.json"), to: "verification_key.json" },
];

mkdirSync(outDir, { recursive: true });

let missing = false;
for (const f of files) {
  if (!existsSync(f.from)) {
    console.error(`missing: ${f.from}`);
    missing = true;
    continue;
  }
  copyFileSync(f.from, path.join(outDir, f.to));
}

if (missing) {
  console.error(
    "\nRun circuits/scripts/compile.sh and circuits/scripts/setup.sh first (see README).",
  );
  process.exit(1);
}

console.log("circuit artifacts synced to app/public/circuits/");
