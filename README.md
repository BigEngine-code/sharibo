# Sharibo

**ajo · esusu · tanda · cundina · susu · tontine · junta · pandero · consórcio · hui · paluwagan · chit fund**

Every culture has one: a circle of people who each put in a fixed amount every round, and each round one member takes the whole pot. Sharibo puts that circle on Stellar — a stablecoin instead of a shared notebook, and zero-knowledge so nobody can trace a payout back to a member.

Built for the **Stellar Hacks: Real-World ZK** hackathon. Testnet only, no real funds.

## What it does

A private rotating savings circle (ROSCA) on Stellar:
- Members fund a shared pot each round with a test token.
- The round's payout goes to whoever can prove, in zero-knowledge, that they are a circle member entitled to claim — without revealing *which* member they are.
- A per-round nullifier stops the same proof from claiming twice.

## What the ZK is doing (the load-bearing part)

A Circom circuit (`circuits/membership.circom`) proves two things about the claimant, without revealing which member they are:

1. **Membership** — their Poseidon commitment is a leaf in the circle's committed Merkle tree.
2. **A fresh nullifier** — `nullifierHash = Poseidon(identityNullifier, externalNullifier)`, bound to this specific circle+round.

That proof is verified **for real, on-chain**, inside a Soroban contract (`contracts/sharibo/src/lib.rs`), using Stellar's native BLS12-381 pairing host functions — no mocked or stubbed verification remains anywhere in the shipped contract. The contract records the nullifier so it can't be reused, then pays the pot to whatever recipient address the claimant supplies — which can be, and in the demo is, a **fresh address never seen before**, unlinkable to any funder.

An on-chain observer sees five deposits and one payout per round, and cannot tell which of the five depositors the payout belongs to.

**Demo-honest scope:** privacy is on the *claim* side only (who takes the pot). *Funding*-side privacy (hiding who funded) is not implemented — see Honest limitations.

## Architecture

```
create_circle(admin, token, root, contribution, size, vk) -> circle_id
        │  root = Merkle root of Poseidon(identityNullifier, identitySecret)
        │  for every member, computed off-chain by the client
        ▼
fund(circle_id, from)  ×5
        │  from.require_auth(); pot += contribution
        ▼
claim(circle_id, recipient, nullifier_hash, external_nullifier, proof)
        │  1. pot == contribution * size                      ("round not funded")
        │  2. external_nullifier == SHA256(circle_id, round) mod r ("wrong round tag")
        │  3. nullifier_hash unused for (circle_id, ·)         ("already claimed")
        │  4. real Groth16 / BLS12-381 pairing check passes    ("invalid proof")
        │  → mark nullifier used, pay pot to recipient, pot=0, round+=1
```

Circuit: `circuits/membership.circom`. Contract: `contracts/sharibo/src/lib.rs`. Client SDK: `packages/client/`. E2E script: `scripts/e2e.ts`. Browser demo: `app/`.

### Invariants held across circuit / contract / client

- **BLS12-381** throughout — not the more common BN254/bn128. Stellar's Soroban host only accelerates BLS12-381 pairing operations; a pure-Rust BN254 pairing check measured ~560M CPU instructions against a 100M budget (see `NOTES.md`), so BN254 verification doesn't fit at all. This is the single biggest deviation from a "default" ZK stack and is documented in detail in `NOTES.md`.
- **Commitment:** `leaf = Poseidon(identityNullifier, identitySecret)`.
- **Nullifier:** `nullifierHash = Poseidon(identityNullifier, externalNullifier)` — Poseidon is used here and for the Merkle tree because it's cheap *inside the circuit's constraint system*.
- **Round tag:** `externalNullifier = SHA256(circle_id, round) mod r` — **not** Poseidon. This binding happens outside the circuit (in the contract and in the client, not inside the SNARK), where Soroban has a native accelerated SHA-256 and no native Poseidon at all, so nothing is gained by matching the circuit's hash choice there. Deliberate and permanent, not a placeholder — see `NOTES.md`.
- **Public signal order:** `[nullifierHash, root, externalNullifier]` (circuit output first, then declared public inputs, in that order) — this is what circom/snarkjs actually emit, not the `[root, externalNullifier, nullifierHash]` a naive reading might assume. Circuit, contract, and client all agree on this order.
- **Field:** BLS12-381 scalar field throughout (client, contract, circuit).

## Run it

Fresh-machine steps, in order. Everything below targets **Stellar testnet only**.

### 0. Prerequisites

- Rust + `wasm32v1-none` target (`rustup target add wasm32v1-none`)
- [`stellar` CLI](https://developers.stellar.org/docs/tools/cli/install-cli) (the current CLI; `soroban` CLI is superseded)
- Node.js 20+
- [`circom` 2.x](https://docs.circom.io/getting-started/installation/) on your `PATH`

### 1. Install and configure

```bash
npm install                       # installs the whole workspace (circuits, packages/client, scripts, app)
cp .env.example .env               # fill in ADMIN_SECRET_KEY / MEMBER_SECRET_KEY etc.
stellar keys generate admin --network testnet --fund
stellar keys generate member --network testnet --fund
stellar keys show admin            # paste into .env as ADMIN_SECRET_KEY / ADMIN_PUBLIC_KEY
stellar keys show member           # paste into .env as MEMBER_SECRET_KEY / MEMBER_PUBLIC_KEY
```

### 2. Build the circuit + trusted setup

```bash
cd circuits
npm run compile     # circom --prime bls12381 -> build/membership.{r1cs,sym}, build/membership_js/membership.wasm
npm run setup        # Powers-of-Tau (bls12381) + Groth16 zkey -> verification_key.json (committed)
npm run prove         # proves + verifies circuits/input.example.json locally
npm test               # circom_tester suite: valid proof, wrong root, tampered path, nullifier determinism, boolean checks
cd ..
```

### 3. Contract

```bash
cd contracts
cargo test                 # 8/8: happy path (real proof!), underfunded, double-claim, stale round tag,
                             # tampered-proof rejection, CPU budget, both auth checks
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/sharibo.wasm --source admin --network testnet
cd ..
# paste the returned contract id into .env as SHARIBO_CONTRACT_ID
```

A test token is needed for the pot — the simplest option on testnet is the native asset:

```bash
stellar contract id asset --asset native --network testnet
# paste into .env as TEST_TOKEN_CONTRACT_ID
```

### 4. End-to-end script (Node, no browser)

```bash
npm run e2e
```

Runs a full round against testnet for real: creates a 5-member circle, funds it from 5 fresh friendbot-funded accounts, generates a real Groth16 proof for one member, claims the pot to a **freshly generated recipient address**, asserts the payout/round-advance, then funds a second round and asserts that replaying the same proof's nullifier is rejected on-chain with `AlreadyClaimed`.

> This script shells out to `curl` for friendbot/Horizon calls rather than using `fetch()` — see `NOTES.md` if you're curious why. Run it in the foreground (not backgrounded) for the same reason.

### 5. Browser demo

```bash
cd app
cp .env.example .env       # same contract/token ids as above, VITE_-prefixed
npm run dev                  # runs `sync-circuit` first (copies circuits/build/* into app/public/circuits/)
```

Open the printed localhost URL. The whole flow (identities, funding, proving, claiming) runs against real testnet from a single browser tab — see Honest limitations for what was and wasn't verified.

## Honest limitations

- **One round demoed, not multi-round.** Turn-ordering across rounds (who claims next) is not enforced on-chain — this is a hackathon MVP, not a governance system.
- **Claim-side privacy only.** Funding is fully visible on-chain (5 deposits from 5 known addresses); only the payout recipient is unlinkable. Shielding *who funded* is roadmap, not shipped.
- **Testnet + test token only.** The demo uses native testnet XLM as the pot's asset, not a real stablecoin.
- **Trusted setup is a single-contributor demo ceremony** (`circuits/scripts/setup.sh`, run once by me), not a real multi-party ceremony. Fine for a hackathon demo, not for anything real.
- **Poseidon-over-BLS12-381 uses third-party constants**, not iden3/arkworks-official ones: [`poseidon-bls12381-circom`](https://github.com/jmagan/poseidon-bls12381-circom) and [`poseidon-bls12381`](https://github.com/jmagan/poseidon-bls12381) (same author). Their hardcoded field modulus was cross-checked against Soroban SDK's own `BLS12_381_FR_MODULUS_BE` constant (exact match) and the circuit structure was read and looks like a standard Poseidon implementation, but neither package has an independent security audit. Reasoning for using them instead of BN254 (where circomlib's audited constants would apply) is in `NOTES.md` — in short, BN254 verification doesn't fit Soroban's CPU budget at all.
- **`compute_external_nullifier` uses SHA-256, not Poseidon**, for binding a proof to (circle, round) — a deliberate, permanent choice (Soroban has no native Poseidon host function, and this binding happens outside the circuit where SNARK-friendliness doesn't matter), not a leftover stub. Full reasoning in `NOTES.md`.
- **The browser demo was not click-tested in an actual browser this session** — the browser automation tool was unavailable. What *was* verified: clean typecheck, clean production build, correct static-asset serving, and the actual snarkjs `fetch()`-based proof-generation code path exercised for real (via Node's native `fetch`, forcing the same `process.browser` branch the real browser takes) — it produced a proof that verified. See `NOTES.md` for detail. Verify the click-through yourself before demoing live.
- Every `// DEMO MOCK:`-style shortcut is documented inline in the code and cross-referenced in `NOTES.md`, which is the full build/decision log for this project.

## Compliance by design (roadmap)

Not built, but the shape is straightforward given what's already here: a **view key** could let an admin/auditor prove a circle's *total* historical contributions (a sum over the funding events they already have `require_auth`-gated visibility into) without exposing which individual funded which round — selective disclosure without touching the claim-side anonymity set at all, since it's an entirely separate read path over already-public on-chain funding events.

## Roadmap

- Funding-side shielding (hide *who* funded, not just who claimed).
- Multi-round automation / on-chain turn ordering.
- Multi-party trusted setup ceremony.
- Independent audit of the BLS12-381 Poseidon parameters (or a switch to self-generated / better-provenanced constants).
- Real stablecoin (issued test asset or mainnet equivalent) instead of native testnet XLM.
