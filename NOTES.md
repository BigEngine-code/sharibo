# Build notes / decision log

Running log of decisions, deviations from the build spec, and `// DEMO MOCK:` items. Updated as phases land.

## Environment

- Toolchain versions at build time: `rustc 1.92.0`, `cargo 1.92.0`, `stellar` CLI `23.4.1` (the modern CLI; `soroban` CLI is not installed since it's superseded by `stellar`), Node `v24.11.1`, `circom` `2.2.3` (built from source — no prebuilt macOS arm64 binary in the v2.2.3 release, only amd64/linux/windows), `snarkjs` `0.7.6` (via `npx`, not a global install).
- `wasm32-unknown-unknown` Rust target was already installed.

## Deviations from spec

- (none yet)
