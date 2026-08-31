# Contributing to Sharibo

Thank you for your interest in contributing to Sharibo! This document provides guidelines and information to help you get started.

## Labels

We use a set of topic labels to categorize issues and pull requests. These labels help maintainers and contributors understand the scope and nature of each issue.

### Topic Labels

| Label | Description | Maps to |
|-------|-------------|---------|
| frontend | React demo app | `app/` |
| sdk | TypeScript client SDK | `packages/client` |
| contracts | Soroban smart contract | `contracts/` |
| circuits | Circom circuit & ZK tooling | `circuits/` |
| testing | Tests and test infrastructure | Various test directories |
| dx | Developer experience & tooling | Tooling, scripts, configuration |
| a11y | Accessibility | UI/UX components |
| ux | User experience & polish | UI/UX components |
| security | Security & robustness | Security-related code |
| e2e | End-to-end script | `scripts/e2e.ts` |
| refactor | Code structure improvements | Codebase-wide |
| performance | Speed & resource usage | Performance-critical code |
| roadmap | Larger feature from the roadmap | Planned features |

### GitHub Default Labels

| Label | Description | Maps to |
|-------|-------------|---------|
| good first issue | Good for newcomers | Any area, suitable for new contributors |
| documentation | Improvements or additions to documentation | `docs/`, README files, code comments |
| bug | Something isn't working | Any area with defects |
| duplicate | This issue or pull request already exists | N/A |
| enhancement | New feature or request | Any area |
| help wanted | Extra attention is needed | Any area needing help |
| invalid | This doesn't seem right | N/A |
| question | Further information is requested | N/A |
| wontfix | This will not be worked on | N/A |

### Special Labels

| Label | Description | Maps to |
|-------|-------------|---------|
| Stellar Wave | Issues in the Stellar wave program | Stellar Wave program tasks |

## Picking an Issue

When looking for issues to work on, start by filtering by the `good first issue` label. These issues are specifically marked as suitable for newcomers and provide a great way to get familiar with the codebase. Before you start working on an issue, leave a comment to claim it and let the maintainers know you're working on it. If you have questions about the issue or need clarification, ask them directly on the issue rather than in a pull request—this helps keep the PR focused on the implementation.

## Setup trouble?

Getting a fresh machine running and tripping on a toolchain issue (`circom`, `wasm32v1-none`, `stellar` vs `soroban`, friendbot limits, testnet resets, missing `circuits/build/`)? See [docs/troubleshooting.md](docs/troubleshooting.md) for symptom → cause → fix walkthroughs.

## Pre-PR checklist

Before opening a pull request, run the comprehensive local verification gate:

- Run `just verify` from anywhere inside the repository. It runs TypeScript typechecking (client and app), ESLint, a best-effort dead-code check (`ts-prune`), all unit tests (app and SDK), `cargo test`, and `cargo clippy -- -D warnings`.
- The recipe intentionally excludes `e2e` and the circuits *trusted setup* because those are slow and/or spend testnet friendbot funds.

If `just verify` passes locally, it's the single documented answer to "did I break anything?" and a good signal your change is ready for review.
