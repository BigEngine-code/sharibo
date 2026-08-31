# Sharibo — Package Architecture & Import Rules

## Layer Diagram

```
┌─────────────────────────────────────────────┐
│  app/          (Vite, React, browser)        │
│  scripts/      (Node, e2e / smoke scripts)   │
└───────────────────┬─────────────────────────┘
                    │ imports via package entry point only
                    │ (@sharibo/client — never a deep src/ path)
┌───────────────────▼─────────────────────────┐
│  packages/client/   (TypeScript SDK)        │
│  May import: circuit *artifacts* (JSON)     │
│  Must NOT import: app/, scripts/            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  contracts/    (Soroban / Rust — no JS deps)│
│  circuits/     (Circom circuits — no JS deps│
│                 other than build tooling)   │
└─────────────────────────────────────────────┘
```

## Rules (enforced by ESLint `no-restricted-imports`)

| Consumer | May import | Must NOT import |
|---|---|---|
| `app/` | `@sharibo/client` (entry point) | `packages/client/src/**` (deep paths) |
| `scripts/` | `@sharibo/client` (entry point) | `packages/client/src/**` (deep paths) |
| `packages/client` | circuit artifacts (`circuits/**/*.json`) | `app/`, `scripts/` |
| `contracts/` | nothing in this repo | — |
| `circuits/` | nothing in this repo | — |

## Rationale

- **Deep imports from `app/` or `scripts/` into `packages/client/src/`** couple consumers
  to SDK internals. When the SDK refactors internally the consumer breaks even though the
  public API is unchanged.
- **The SDK importing `app/`** would drag browser-only code (React, DOM globals) into
  Node scripts and make the SDK un-tree-shakeable.
- **`contracts/` and `circuits/`** are entirely separate build systems (Cargo and
  circom/snarkjs) and must have zero JavaScript import dependencies on the rest of the
  monorepo.

## Checking compliance

```sh
npm run lint
```

A deliberately-added deep import such as:

```ts
// app/src/foo.ts
import { fr_from_dec_str } from "../../packages/client/src/prove";
```

will produce an ESLint error and fail the lint step.
