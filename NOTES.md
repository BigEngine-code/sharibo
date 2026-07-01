# Build notes / decision log

Running log of decisions, deviations from the build spec, and `// DEMO MOCK:` items. Updated as phases land.

## Environment

- Toolchain versions at build time: `rustc 1.92.0`, `cargo 1.92.0`, `stellar` CLI `23.4.1` (the modern CLI; `soroban` CLI is not installed since it's superseded by `stellar`), Node `v24.11.1`, `circom` `2.2.3` (built from source — no prebuilt macOS arm64 binary in the v2.2.3 release, only amd64/linux/windows), `snarkjs` `0.7.6` (via `npx`, not a global install).
- `wasm32-unknown-unknown` Rust target was already installed.

## Deviations from spec

- (none yet)

## Phase 0 results

- Testnet identities: `admin` = `GANW3YMB6U6VFBRXORYDE7NGW7L7PU7V7WYMD3DDPL4BHBKOWILGOLSJ`, `member` = `GDMP33PV33CFRXYUQH2FIDEP3HQ5UTOHMNZHTWTW6HWRIHF4I4SUSLFO` (both funded via friendbot, secrets in local `.env`, also registered as CLI aliases `admin`/`member` in `~/.config/stellar/identity/`).
- Hello-world Soroban contract deployed to testnet: `CB73HTMKCFGDMCUNNVGFPVCPWJH4EVVWMAMUCRXSQJJ4GORG7ASWIU6R`, invoked successfully (`hello("Sharibo")` -> `["Hello","Sharibo"]`). This placeholder `contracts/sharibo/src/lib.rs` will be replaced by the real Circle logic in Phase 2.
- Trivial Groth16 pipeline smoke-tested end to end outside the repo (scratch dir, not committed): `a*b` circuit, bn128 Powers-of-Tau (2^8), groth16 setup, witness gen, proof gen, `snarkjs groth16 verify` -> `OK!`. Confirms circom 2.2.3 + snarkjs 0.7.6 interop before building the real circuit in Phase 1.
- Soroban wasm target is `wasm32v1-none` (not `wasm32-unknown-unknown`) per current `stellar contract build` tooling — both targets are installed.

## Flags to verify in Phase 3

- `cargo test` for the Phase 0 placeholder contract pulled in `ark-bls12-381` transitively via `soroban-sdk` v23.5.3. The build spec (§7) assumes BN254/bn128 host support to match snarkjs's default curve. Need to confirm at Phase 3 time whether Stellar's current host functions (crypto EC ops) target BLS12-381, BN254, or both — this determines whether the on-chain verifier can use accelerated host pairing ops or must do the pairing check in pure Rust (much more expensive, but our circuit is tiny so may still fit the CPU budget). Whatever is real wins over the spec's assumption; document the actual choice here when Phase 3 starts.
