# Sharibo Client SDK

This package provides a TypeScript SDK for interacting with the Sharibo contract on Stellar/Soroban.

## Public API

The public surface is small and explicit. `index.ts` re-exports exactly the
values and types below, and a test (`src/index.test.ts`) asserts that this list
and the barrel agree in both directions. Internal-only symbols (field constants
like `FR_MODULUS`, the circuit-artifact prefetch machinery) live behind the
`./internal` subpath and are **not** part of the public API — importing them is
an explicit opt-in.

### Values

```ts
// Identity
generateIdentity
poseidon
randomFieldElement
computeExternalNullifier
computeNullifierHash

// Merkle tree
MerkleTree
ZERO_VALUE
TREE_LEVELS
MAX_CIRCLE_SIZE

// Proving
generateProof
verificationKeyToContractFormat
validateCircuitInput
verifyProofLocally
estimateClaimFee

// Contract client
connect
createCircle
fund
claim
getCircle
getCircleCount
getRound
getPot
getStatus
getContributors
hasClaimed
cancelCircle
explorerTxUrl

// Errors
ShariboError
InvalidInputError
ProvingError
RpcError
ContractError
```

### Types

```ts
Identity
MerkleProof
CircuitInput
ContractProof
ContractVerificationKey
GenerateProofResult
ProofResult
ShariboNetworkConfig
ShariboClient
ShariboSigner
FeeEstimate
TxResult
CircleView
```

### Internal subpath

`@sharibo/client/internal` exposes non-public helpers for deep integration work
(see `src/internal.ts`). It imports nothing eagerly into the main entrypoint, so
`ArtifactPrefetchProgress` and `FR_MODULUS` no longer reach plain consumers.

## Requirements

- **Node ≥ 20** (the repo's `.nvmrc` pins Node 20; older versions are untested)
- **Web Crypto API** — `globalThis.crypto` must be available. Node 18+ exposes this
  as a built-in global; browsers have had it for years. No polyfill is needed.

## Node vs browser entry points

The package ships a conditional `exports` map:

| Condition | Entry point | Side effects |
|-----------|-------------|--------------|
| `browser` | `src/index.browser.ts` | Mounts the "Preparing prover…" DOM toast; starts background artifact pre-fetch |
| `default` (Node, tests) | `src/index.ts` | None — safe to import in scripts, tests, and CI |

Bundlers that honour the `browser` exports condition (Vite, webpack) resolve to the
browser entry automatically. Node and test runners get the side-effect-free default.

If you need the background pre-fetch in a browser app that imports the package
directly (without a bundler resolving the `browser` condition), call
`installIndicatorAndPrefetch()` explicitly after import.

## Retry Semantics

Network requests in the Soroban testnet environment can occasionally fail due to rate limits or transient load (e.g. `429 Too Many Requests`, `503 Service Unavailable`, or timeouts).

The SDK automatically handles these transient failures:
- **Simulation Phase:** Contract calls (e.g. `createCircle`, `fund`, `claim`, `getCircle`) will retry simulation/preparation steps automatically using exponential backoff with jitter (up to 3 retries, starting at 500ms).
- **Submit Phase:** Once a transaction is signed and submitted to the network (`signAndSend`), no further automatic retries are attempted. This ensures safety against double-spend or replay issues. A failure during submission or polling will surface immediately to the caller, as the state of the transaction is ambiguous.
