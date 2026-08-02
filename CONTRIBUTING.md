# Contributing to Sharibo

Thank you for your interest in contributing! Sharibo is a project for private rotating savings circles on Stellar, using zero-knowledge proofs to anonymize payouts. This guide covers setup, workflow, and PR expectations.

## Project orientation

Sharibo is a full-stack application that combines a Circom/Groth16 zero-knowledge circuit, a Soroban smart contract, a TypeScript client SDK, and a browser demo. The project lives in an npm workspace at the repo root. For a high-level overview of the system, see the [README.md](README.md) and the [full product breakdown](full_product_breakdown.md).

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org/)
- **Rust** (latest stable) + **wasm32v1-none** target — [rustup](https://rustup.rs/), then `rustup target add wasm32v1-none`
- **stellar CLI** — [installation guide](https://developers.stellar.org/docs/tools/cli/install-cli)
- **circom 2.x** — [installation guide](https://docs.circom.io/getting-started/installation/)

## Setup

1. Fork and clone the repo.
2. Install dependencies at the root (this is an npm workspace):

```bash
npm install
```

This installs everything in the workspace: `circuits/`, `packages/client/`, `scripts/`, and `app/`.

## Running tests

### Circuit tests

```bash
cd circuits
npm test
```

This runs the mocha/circom_tester suite (`circuits/test/membership.test.js`) — valid proof, wrong root, tampered path, nullifier determinism, and boolean checks.

### Contract tests

```bash
cd contracts
cargo test
```

This runs the Soroban contract test suite (`contracts/sharibo/src/test.rs`) — happy path with a real proof, underfunded, replay, stale round tag, forged public input, CPU budget, and auth checks.

### End-to-end tests

```bash
npm run e2e
```

Runs the full round against Stellar testnet from the repo root. Requires a populated `.env` and the circuit build artifacts (`circuits/build/`). See the [README.md](README.md) for the full setup steps before running e2e.

## Branch and PR conventions

- Fork the repo and create a branch from `main` for each change.
- Keep PRs small and focused — one logical change per PR.
- Include a clear description of what you changed and what you tested.
- If your PR touches circuits, include the circuit test results. If it touches the contract, include `cargo test` output. If it touches the e2e script, note the testnet run result.

## Where to start

New contributors looking for a first issue should look for issues tagged [good first issue](https://github.com/crackedstudio/sharibo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). These are well-scoped tasks suitable for getting familiar with the codebase.
