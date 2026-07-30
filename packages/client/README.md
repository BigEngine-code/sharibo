# @sharibo/client

Isomorphic TypeScript SDK for Sharibo private rotating savings circles on Stellar. Provides identity generation, Merkle tree construction, zero-knowledge proof generation, and Stellar contract interaction — runs unmodified in **Node.js 18+** and **modern browsers** (Web Crypto, no `Buffer`).

```ts
import {
  generateIdentity,
  computeExternalNullifier,
  MerkleTree,
  generateProof,
  verificationKeyToContractFormat,
  connect,
  createCircle,
  fund,
  claim,
  getCircle,
  TREE_LEVELS,
} from "@sharibo/client";
```

## Installation

```bash
npm install @sharibo/client
```

**Peer dependencies** (already present if you're working inside the Sharibo monorepo):

- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) `^16.0.1` — Soroban contract client
- [`poseidon-bls12381`](https://www.npmjs.com/package/poseidon-bls12381) `1.0.2` — Poseidon hash over the BLS12-381 scalar field
- [`snarkjs`](https://www.npmjs.com/package/snarkjs) `0.7.6` — Groth16 proof generation (used in browser and Node)

## Modules

### identity

Identity primitives: random field elements, Poseidon hashing, and nullifier computation.

#### `FR_MODULUS: bigint`

The BLS12-381 scalar field modulus `r`. Every field element in the system (identities, nullifiers, commitments, Merkle tree nodes) is a value in `[0, r)`. Cross-checked against `soroban-sdk`'s own `BLS12_381_FR_MODULUS_BE` constant.

```ts
import { FR_MODULUS } from "@sharibo/client";
// = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n
// = 52435875175126190479447740508185965837690552500527637822603658699938581184513n
```

#### `randomFieldElement(): bigint`

Samples a uniformly random element from the full BLS12-381 scalar field using wide reduction: 64 random bytes (512 bits) modulo `FR_MODULUS`. Uses `globalThis.crypto.getRandomValues()` for Web Crypto compatibility.

```ts
import { randomFieldElement } from "@sharibo/client";
const r = randomFieldElement(); // always 0 <= r < FR_MODULUS
```

#### `poseidon(a: bigint, b: bigint): bigint`

Poseidon hash of two BLS12-381 field elements. Used internally for commitments (`poseidon(nullifier, secret)`) and the Merkle tree. Thin wrapper around `poseidon2` from `poseidon-bls12381`.

```ts
import { poseidon } from "@sharibo/client";
const h = poseidon(a, b);
```

#### `generateIdentity(): Identity`

Generates a fresh identity with a cryptographically random nullifier and secret, plus their Poseidon commitment (the leaf value committed into the circle's Merkle tree).

```ts
import { generateIdentity } from "@sharibo/client";
const id = generateIdentity();
// { identityNullifier: bigint, identitySecret: bigint, commitment: bigint }
// commitment === poseidon(identityNullifier, identitySecret)
```

**Keep `identityNullifier` and `identitySecret` private.** The `commitment` is public — it goes into the Merkle tree that's stored on-chain during `createCircle`.

#### `computeExternalNullifier(circleId: bigint, round: bigint): Promise<bigint>`

Binds a proof to a specific `(circle_id, round)` pair using SHA-256 (matching the contract's `compute_external_nullifier`). Returns a field element reduced modulo `FR_MODULUS`.

```ts
import { computeExternalNullifier } from "@sharibo/client";
const extNull = await computeExternalNullifier(42n, 0n);
```

**Why SHA-256 and not Poseidon?** This binding happens *outside* the ZK circuit (both in the contract and client). Soroban has a native accelerated SHA-256 host function but no native Poseidon — Poseidon is used only where it saves constraints *inside* the circuit.

Throws `RangeError` if `circleId` ≥ 2⁶⁴ or `round` ≥ 2³² (matching the contract's field types: `u64` and `u32`).

#### `computeNullifierHash(identityNullifier: bigint, externalNullifier: bigint): bigint`

The nullifier that proves "this identity hasn't claimed yet in this round." Computed as `poseidon(identityNullifier, externalNullifier)` — inside the circuit, this ties the identity to the round without revealing the identity.

```ts
import { computeNullifierHash } from "@sharibo/client";
const nullifier = computeNullifierHash(id.identityNullifier, extNull);
```

---

### tree

Incremental Merkle tree over Poseidon commitments. Zero-value padding convention for unfilled leaves.

#### `ZERO_VALUE: 0n`

Constant `0n` used to pad the tree to full capacity (`2^levels`). Zero cannot equal a real Poseidon commitment from `generateIdentity()`, so there's no collision risk.

#### `MerkleTree.create(levels: number, leaves: bigint[]): MerkleTree`

Builds a complete Merkle tree of depth `levels` from the given leaf commitments. Any slots beyond the provided leaves are padded with `ZERO_VALUE`.

```ts
import { MerkleTree } from "@sharibo/client";

const commitments = members.map((m) => m.identity.commitment);
const tree = MerkleTree.create(TREE_LEVELS, commitments);

console.log(tree.root);      // bigint — submit this to createCircle
console.log(tree.levels);    // number — the depth (from config)
```

Throws if `leaves.length > 2 ** levels`.

#### `merkleTree.proof(leafIndex: number): MerkleProof`

Generates a Merkle inclusion proof for the leaf at the given index.

```ts
const proof = tree.proof(2);
// { root: bigint; pathElements: bigint[]; pathIndices: number[] }
```

- `pathElements[i]` — the sibling node at level `i`
- `pathIndices[i]` — `0` if the leaf is the left child at that level, `1` if right

This convention matches the circuit's `MerkleTreeChecker` template exactly.

#### `merkleTree.indexOf(leaf: bigint): number`

Returns the index of a leaf in the original (unpadded) leaf array, or `-1` if not found.

```ts
const idx = tree.indexOf(id.commitment); // 0..n-1
```

---

### prove

Zero-knowledge proof generation and encoding for on-chain verification.

#### `CircuitInput`

```ts
interface CircuitInput {
  identityNullifier: bigint;
  identitySecret: bigint;
  pathElements: bigint[];   // from MerkleTree.proof()
  pathIndices: number[];    // from MerkleTree.proof()
  root: bigint;             // from MerkleTree.root
  externalNullifier: bigint; // from computeExternalNullifier()
}
```

#### `generateProof(input: CircuitInput, wasmPath: string, zkeyPath: string): Promise<ProveResult>`

Generates a Groth16 proof using snarkjs's `fullProve`. Accepts either filesystem paths (Node) or fetchable URLs (browser) for the WASM and zkey artifacts.

```ts
import { generateProof } from "@sharibo/client";
import { readFileSync } from "node:fs";

const vkJson = JSON.parse(readFileSync("circuits/verification_key.json", "utf8"));

const { proof, nullifierHash, root, externalNullifier } = await generateProof(
  {
    identityNullifier: claimant.identity.identityNullifier,
    identitySecret: claimant.identity.identitySecret,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
    root: tree.root,
    externalNullifier: extNull,
  },
  "circuits/build/membership_js/membership.wasm",
  "circuits/build/membership_final.zkey",
);
```

The returned `ProveResult`:

```ts
interface ProveResult {
  proof: ContractProof;       // ready for claim()
  nullifierHash: bigint;      // public signal [0]
  root: bigint;               // public signal [1]
  externalNullifier: bigint;  // public signal [2]
}
```

**⚠️ Public signal order gotcha:** snarkjs emits `[nullifierHash, root, externalNullifier]` — circuit outputs first, then declared public inputs in source order. The contract reads them in the same order. This is the actual wire format, not `[root, externalNullifier, nullifierHash]` as a naive reading of the circuit source might suggest.

#### `verificationKeyToContractFormat(vk: snarkjsVk): ContractVerificationKey`

Converts snarkjs's verification key (from `verification_key.json`) to the raw byte format the Sharibo Soroban contract expects. Each G1 affine point is 96 bytes (`X || Y` in big-endian), each G2 affine point is 192 bytes (`X_c1 || X_c0 || Y_c1 || Y_c0`).

```ts
import { verificationKeyToContractFormat } from "@sharibo/client";

const vk = verificationKeyToContractFormat(vkJson);
// { alpha: Uint8Array(96), beta: Uint8Array(192), gamma: Uint8Array(192),
//   delta: Uint8Array(192), ic: Uint8Array(96)[] }
```

Pass `vk` to `createCircle()`.

#### `ContractProof`

```ts
interface ContractProof {
  a: Uint8Array; // G1Affine, 96 bytes
  b: Uint8Array; // G2Affine, 192 bytes
  c: Uint8Array; // G1Affine, 96 bytes
}
```

#### `ContractVerificationKey`

```ts
interface ContractVerificationKey {
  alpha: Uint8Array;    // G1Affine, 96 bytes
  beta: Uint8Array;     // G2Affine, 192 bytes
  gamma: Uint8Array;    // G2Affine, 192 bytes
  delta: Uint8Array;    // G2Affine, 192 bytes
  ic: Uint8Array[];     // G1Affine[], each 96 bytes
}
```

---

### contract

Stellar Soroban contract interaction — create circles, fund, claim, and query.

#### `ShariboNetworkConfig`

```ts
interface ShariboNetworkConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}
```

#### `connect(config: ShariboNetworkConfig, keypair: Keypair): Promise<ShariiboClient>`

Connects to the Sharibo contract on Stellar.

```ts
import { connect } from "@sharibo/client";
import { Keypair } from "@stellar/stellar-sdk";

const client = await connect(
  {
    contractId: "CB64...",                                     // deployed Sharibo contract
    rpcUrl: "https://soroban-testnet.stellar.org",             // Soroban RPC
    networkPassphrase: "Test SDF Network ; September 2015",    // testnet passphrase
  },
  Keypair.fromSecret("S..."),
);
```

The returned client is a `@stellar/stellar-sdk` contract `Client` instance. Its methods (`create_circle`, `fund`, `claim`, `get_circle`, `has_claimed`) are attached at runtime from the on-chain contract spec, so they aren't visible to TypeScript's static checker — the SDK exposes typed wrapper functions below.

#### `createCircle(client, args): Promise<TxResult<bigint>>`

Creates a new savings circle on-chain. Returns the assigned `circle_id`.

```ts
import { createCircle } from "@sharibo/client";

const { result: circleId, hash: txHash } = await createCircle(client, {
  admin: adminKeypair.publicKey(),
  token: "CDLZ...",            // test token contract id (or native SAC id)
  root: tree.root,             // Merkle root of member commitments
  contribution: 100_000_000n,  // per-member contribution in stroops
  size: 5,                     // number of members in this circle
  vk,                          // ContractVerificationKey from verificationKeyToContractFormat()
});
// circleId: bigint,  txHash: string
```

#### `fund(client, args): Promise<TxResult<void>>`

Deposits one member's contribution into the circle's pot.

```ts
import { fund } from "@sharibo/client";

const { hash } = await fund(client, {
  circleId,
  from: memberKeypair.publicKey(),
});
```

Requires `from` to authorize the transaction (the `fund` entry point checks `from.require_auth()`).

#### `claim(client, args): Promise<TxResult<void>>`

Claims the pot for a round by submitting a valid Groth16 proof. The recipient address can be any Stellar account — it does not need to be a circle member.

```ts
import { claim } from "@sharibo/client";

const { hash } = await claim(client, {
  circleId,
  recipient: freshRecipient.publicKey(), // unlinkable payout address
  nullifierHash,                         // from ProveResult.nullifierHash
  externalNullifier,                     // from ProveResult.externalNullifier
  proof,                                 // from ProveResult.proof
});
```

The contract will reject the transaction if:
- The pot isn't fully funded
- The external nullifier doesn't match `SHA-256(circle_id, round) mod r`
- The nullifier hash has already been used for this circle
- The Groth16 proof fails BLS12-381 pairing verification

#### `getCircle(client, circleId): Promise<CircleView>`

Reads a circle's current on-chain state.

```ts
import { getCircle } from "@sharibo/client";

const circle = await getCircle(client, 0n);
// { admin, token, root, contribution, size, round, pot }
```

#### `hasClaimed(client, circleId, nullifierHash): Promise<boolean>`

Checks whether a specific nullifier has already been used in a given circle.

```ts
import { hasClaimed } from "@sharibo/client";

const alreadyUsed = await hasClaimed(client, circleId, nullifierHash);
// true if someone already claimed with this nullifier
```

#### `CircleView`

```ts
interface CircleView {
  admin: string;         // admin's Stellar public key
  token: string;         // token contract id
  root: bigint;          // Merkle root of member commitments
  contribution: bigint;  // per-member contribution (stroops)
  size: number;          // number of members
  round: number;         // current round (increments after each successful claim)
  pot: bigint;           // current pot balance (stroops)
}
```

#### `TxResult<T>`

```ts
interface TxResult<T> {
  result: T;      // return value from the contract function
  hash: string;   // Stellar transaction hash
}
```

---

### config

Single source of truth for the Merkle tree depth.

#### `TREE_LEVELS: number`

Read from `circuits/config.json` at import time. Everything that needs the tree depth (the circuit, circuit tests, and this client) reads it from the same config file.

```ts
import { TREE_LEVELS } from "@sharibo/client";
// e.g. 3 for up to 8 members, 4 for up to 16, etc.
```

To change the depth, edit `circuits/config.json`, recompile the circuit, re-run the trusted setup, and redeploy.

---

## Complete example (Node.js)

```ts
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateIdentity,
  computeExternalNullifier,
  MerkleTree,
  generateProof,
  verificationKeyToContractFormat,
  connect,
  createCircle,
  fund,
  claim,
  getCircle,
  TREE_LEVELS,
} from "@sharibo/client";

// 1. Generate member identities
const members = Array.from({ length: 5 }, () => ({
  keypair: Keypair.random(),
  identity: generateIdentity(),
}));

// 2. Build the Merkle tree
const tree = MerkleTree.create(
  TREE_LEVELS,
  members.map((m) => m.identity.commitment),
);

// 3. Connect to the contract
const adminClient = await connect(
  { contractId: "...", rpcUrl: "...", networkPassphrase: "..." },
  adminKeypair,
);

// 4. Create the circle
const vk = verificationKeyToContractFormat(
  JSON.parse(readFileSync("circuits/verification_key.json", "utf8")),
);
const { result: circleId } = await createCircle(adminClient, {
  admin: adminKeypair.publicKey(),
  token: "...",
  root: tree.root,
  contribution: 100_000_000n,
  size: 5,
  vk,
});

// 5. Fund from all members
for (const m of members) {
  const c = await connect(config, m.keypair);
  await fund(c, { circleId, from: m.keypair.publicKey() });
}

// 6. Generate proof for a member (e.g. index 2)
const claimant = members[2];
const merkleProof = tree.proof(2);
const extNull = await computeExternalNullifier(circleId, 0n);
const { proof, nullifierHash, externalNullifier } = await generateProof(
  {
    identityNullifier: claimant.identity.identityNullifier,
    identitySecret: claimant.identity.identitySecret,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
    root: tree.root,
    externalNullifier: extNull,
  },
  "circuits/build/membership_js/membership.wasm",
  "circuits/build/membership_final.zkey",
);

// 7. Claim to an unlinkable recipient
const recipient = Keypair.random();
await claim(adminClient, {
  circleId,
  recipient: recipient.publicKey(),
  nullifierHash,
  externalNullifier,
  proof,
});

// 8. Verify on-chain state
const circle = await getCircle(adminClient, circleId);
console.log(circle.round); // 1 (round advanced)
console.log(circle.pot);   // 0n (pot emptied)
```

## Environment compatibility

This SDK is **isomorphic** — the same imports work in Node.js and the browser:

| Feature | Node.js 18+ | Browser |
|---|---|---|
| Cryptographic randomness | `globalThis.crypto.getRandomValues()` | `globalThis.crypto.getRandomValues()` |
| SHA-256 | `globalThis.crypto.subtle.digest("SHA-256", ...)` | `globalThis.crypto.subtle.digest("SHA-256", ...)` |
| WASM proof generation | Filesystem paths to `.wasm`/`.zkey` | Fetchable URLs to `/circuits/` |
| No `Buffer` dependency | ✅ | ✅ |
| No `node:*` imports at module scope | ✅ | ✅ |

Proof generation in the browser: pass URLs instead of filesystem paths to `generateProof()` — snarkjs's `fullProve` accepts either transparently.

## Tests and benchmarks

```bash
# Typecheck
npm run typecheck

# Unit tests (identity, computeExternalNullifier validation)
npm test

# Proof-generation benchmark
npm run bench:prove          # 5 runs
npm run bench:prove -- --n 10  # custom count
```

## Related docs

- [Main Sharibo README](../../README.md) — architecture, invariants, run instructions
- [Full product breakdown](../../full_product_breakdown.md)
- [Build notes / decisions log](../../NOTES.md)
- [ADR 001: Upgradeability](../../docs/adr/001-upgradeability.md)
- [Circuit README](../../circuits/README.md)
