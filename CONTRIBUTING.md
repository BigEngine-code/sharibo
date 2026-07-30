# Contributing to Sharibo

Thank you for taking the time to contribute. Sharibo is a hackathon-grade ZK
proof-of-concept on Stellar testnet; production safety standards are aspirational
rather than enforced, but we take them seriously wherever we can.

## Code of Conduct

All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security vulnerabilities

Do **not** open a public issue for security bugs. Follow the process in
[SECURITY.md](SECURITY.md).

---

## Dependency audit runbook

There is no CI enforcing dependency hygiene on this repo, so the runbook is the
control. Run both audits whenever you:

- add or update a dependency,
- cut a release or deploy to testnet, or
- return to the repo after an extended absence.

### Node (npm) — run from repo root

```bash
# Summary view
npm audit

# JSON output (useful for scripting or detailed inspection)
npm audit --json
```

`npm audit` covers all workspaces (`circuits/`, `packages/client/`, `scripts/`,
`app/`) because they are declared in the root `package.json` workspaces field.
Running from the repo root is sufficient.

**Interpreting results:**

- "fix available" without `--force` → safe semver bump; do it.
- "fix available via `npm audit fix --force`" → breaking change required; evaluate
  manually before applying.
- No fix available → upstream has not released a patch yet; record it in the Known
  findings table below and re-check on the next audit cycle.

### Rust (cargo) — run from `contracts/`

Rust is not available in this dev-container, so the command must be run locally
or in a CI environment with the Rust toolchain installed.

```bash
# Install cargo-audit (one-time)
cargo install cargo-audit

# Run from the contracts workspace
cd contracts
cargo audit
```

`cargo audit` checks `contracts/Cargo.lock` against the
[RustSec Advisory Database](https://rustsec.org/). The contract's runtime
dependencies are minimal (`soroban-sdk`); dev-dependencies include `ark-bls12-381`,
`ark-serialize`, `ark-ff`, and `ark-ec` (all used only in the test suite, never
compiled into the deployed WASM).

**Interpreting results:**

- Any advisory in a production (`[dependencies]`) crate is high priority: the code
  runs on-chain and handles real funds in principle.
- Advisories in `[dev-dependencies]` only affect local `cargo test` runs; assess
  severity and exploitability before treating them as blockers.

---

## Known findings — last audited 2026-07-30

### npm (7 findings, all dev-only)

Fixed since the previous snapshot (2026-07-30):

| Package | Advisory | Fix applied |
|---|---|---|
| `axios` ≤1.17.0 (via `@stellar/stellar-sdk`) | GHSA-42h9, GHSA-xj6q, GHSA-pmv8, GHSA-jqh4, GHSA-mmx7, GHSA-f4gw, GHSA-gcfj, GHSA-hcpx, GHSA-7q8q, GHSA-mwf2 (10 advisories, moderate–high) | Bumped `@stellar/stellar-sdk` to `16.2.0` in `app/`, `packages/client/`, `scripts/` — ships `axios@1.18.0` |
| `postcss` ≤8.5.17 (via `vite`) | GHSA-r28c: path traversal in source-map auto-loading (high) | Bumped `vite` to `8.1.5` in `app/` — requires `postcss@^8.5.17` |

Remaining open findings (all in `devDependencies`, not shipped to production):

| # | Package | Advisory | Severity | Location | Upstream status | Justification for deferral |
|---|---|---|---|---|---|---|
| 1 | `bfj@7.1.0` | No direct advisory; flagged because `jsonpath` (which depends on it) is flagged. bfj itself has no GHSA. | high (inherited) | `circuits/` dev — `snarkjs@0.7.6 → bfj` | `snarkjs` latest (`0.7.6`) still pins `bfj@^7.0.2`; no upstream fix | Dev-only tooling used during circuit compile and setup, not at runtime or in any deployed artifact. Never processes untrusted input in this repo. |
| 2 | `jsonpath@*` (all versions) | GHSA-qpx9: `underscore` DoS via unbounded recursion (high) | high | `circuits/` dev — `snarkjs → jsonpath → underscore` | `jsonpath` is effectively unmaintained; no release since 2021 | Same as above — snarkjs dev tooling only. |
| 3 | `underscore@<=1.13.7` | GHSA-qpx9-hpmf-5gmw: unlimited recursion in `_.flatten`/`_.isEqual`, DoS (high, CVSS 5.9) | high | `circuits/` dev — `snarkjs → jsonpath → underscore` | No fix in `underscore` itself; `jsonpath` would need to drop it | Dev-only. The underscore functions in question are not called on untrusted data in this workflow. |
| 4 | `mocha@11.7.6` | Flagged as affected by `diff` and `serialize-javascript` advisories (moderate aggregate) | moderate | `circuits/` dev — direct dep | npm suggests downgrading to `11.3.0`, which uses `diff@^5.x` (below the advisory range); that is an odd "fix". `diff >= 8.0.3` would actually fix it, but mocha `11.7.6` resolves `diff@^7.0.0` which is in the advisory range `6.0.0–8.0.2`. | Dev-only test runner; never processes untrusted patch/diff input. Accept until mocha releases with `diff >= 8.0.3`. |
| 5 | `diff@7.0.0` | GHSA-73rr-hh4g-fpgx: ReDoS in `parsePatch`/`applyPatch` (low) | low | `circuits/` dev — `mocha → diff` | Fix is `diff >= 8.0.3`; blocked on mocha upgrading its pin | Dev test runner only. |
| 6 | `serialize-javascript@<=7.0.4` | GHSA-5c6j-r48x-rmvq: RCE via `RegExp.flags` (high, CVSS 8.1); GHSA-qj8w-gfj5-8c6v: CPU DoS (moderate) | high / moderate | `circuits/` dev — `mocha → serialize-javascript` | npm suggests `mocha@11.3.0` as fix (uses older `serialize-javascript`). Actual fix is a newer `serialize-javascript` release. | Dev test runner only. `serialize-javascript` is used by mocha's reporter, not by any code path that processes untrusted input in this repo. |
| 7 | `brace-expansion@2.1.1` | GHSA-mh99-v99m-4gvg: OOM via unbounded expansion (high, CVSS 7.5). Advisory states range `<=5.0.7`. | high | `circuits/` dev — `mocha → minimatch@9 → brace-expansion@2.1.1` and `snarkjs → ejs → jake → filelist → minimatch@5` | **Likely false positive.** The advisory targets the `v5` release track (`5.0.2–5.0.7`; fixed in `5.0.8`). Installed version is `2.1.1`, which is a different major-version lineage. The npm advisory database's range `<=5.0.7` inadvertently captures all v1/v2/v3/v4 versions, but the vulnerability was introduced and fixed within v5 only. The `2.x` code path does not contain the OOM-inducing code. | False positive; no action needed. Re-evaluate if npm advisory is corrected to narrow the range. |

**Next review:** re-run `npm audit` when `snarkjs` or `mocha` releases an update,
or on the next dependency touch, whichever comes first.

### Rust / cargo — not yet run

`cargo-audit` has not been run in this session because Rust is not installed in
the current environment. The Cargo dependency surface is small:

- **Production (`[dependencies]`):** `soroban-sdk = "23"` — actively maintained by
  Stellar Development Foundation; check [rustsec.org](https://rustsec.org/) manually
  or run `cargo audit` locally.
- **Dev-only (`[dev-dependencies]`):** `ark-bls12-381`, `ark-serialize`, `ark-ff`,
  `ark-ec` (all `0.6`) — arkworks crates used only in the contract test suite. These
  are never compiled into the deployed WASM.

Run `cargo audit` from `contracts/` the next time a Rust toolchain is available
and record findings here.

---

## Development workflow

### Prerequisites

See [README.md § Prerequisites](README.md#0-prerequisites) for the full list
(Node 20+, Rust + `wasm32v1-none`, `stellar` CLI, `circom` 2.x).

### Running the test suites

```bash
# Circuit tests (requires circom on PATH)
cd circuits && npm test

# Contract tests (requires Rust + wasm32v1-none)
cd contracts && cargo test

# Client unit tests
npm test --workspace=packages/client

# End-to-end (live Stellar testnet — requires .env configured)
npm run e2e
```

### Architecture decisions

Non-trivial technical decisions are recorded in `docs/adr/`. Create a new ADR in
`docs/adr/NNN-short-title.md` before making a significant irreversible change
(dependency on a new cryptographic primitive, contract interface changes, etc.).
ADR 001 (`docs/adr/001-upgradeability.md`) is a good template to follow.
