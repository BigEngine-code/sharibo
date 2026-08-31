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

## Dead-code check

Sharibo uses [knip](https://knip.dev) to catch unused files, unused exports,
and unused dependencies before they accumulate.  The check runs as part of the
full test suite (`just test`) and can be run standalone:

```bash
npm run lint:dead
# or: just lint-dead
```

**Zero issues is the baseline.**  Adding an unreferenced module, export, or
import will fail the check in CI.

### Marking an intentional public export

`packages/client/src/index.ts` is the SDK barrel — every export it re-exports
is public API and is automatically exempt from dead-code reporting because
`includeEntryExports` is `false` for that workspace.

For any *other* symbol that knip flags but that you intentionally want to keep
(e.g. a utility exported only for external consumers or for tests in a
downstream package), add the `@public` JSDoc tag:

```ts
/**
 * Shared field-element modulus — exported for downstream use.
 * @public
 */
export const FR_MODULUS = 0x73eda753…n;
```

The `knip.jsonc` config at the repo root suppresses issues for any export
tagged `@public`.  Use this sparingly — prefer wiring up the module properly
over suppressing the warning.

### Fixing a reported issue

| Issue type | Typical fix |
|---|---|
| Unused file | Wire it up to an entry point, or delete it |
| Unused export | Import it somewhere, delete it, or tag `@public` |
| Unused dependency | Remove from `package.json`, or add to `ignoreDependencies` in `knip.jsonc` with a comment |

See [knip.dev/guides/handling-issues](https://knip.dev/guides/handling-issues)
for a full guide.

## Setup trouble?

Getting a fresh machine running and tripping on a toolchain issue (`circom`, `wasm32v1-none`, `stellar` vs `soroban`, friendbot limits, testnet resets, missing `circuits/build/`)? See [docs/troubleshooting.md](docs/troubleshooting.md) for symptom → cause → fix walkthroughs.
