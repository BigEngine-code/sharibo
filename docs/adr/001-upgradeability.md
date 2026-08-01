# ADR 001: Upgradeability and circle admin keys

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** Pre-mainnet decision record. Retrofitting either upgradeability or admin rotation onto live circles is much harder than deciding now.

## Context

The Sharibo contract today has:

1. **No upgrade path** — there is no `update_current_contract_wasm` (or equivalent) entry point. Once deployed, the WASM is fixed for that contract id.
2. **Admin set once** — `create_circle` stores `Circle.admin` after `admin.require_auth()`, and there is no rotation / transfer entry point.

Before the project grows past testnet, both need deliberate decisions.

## Decision drivers

### Immutable vs upgradeable contract

Sharibo holds user funds and runs a Groth16 verifier. An upgrade key is an existential risk: whoever can replace the WASM can redirect `claim` payouts, skip nullifier checks, or drain every circle's pot. For a funds-holding ZK verifier, that key is effectively a master steal key.

Immutability flips the failure mode: a critical bug cannot be patched in place. Response is **migrate** — deploy a new contract, move users/circles off the broken one, accept that in-flight pots on the old id stay stuck unless a recovery path was designed in advance.

| | Immutable | Upgradeable |
|---|---|---|
| Bug response | Deploy + migrate | Patch WASM |
| Steal / governance risk | None from upgrade key | Upgrade key can take everything |
| User trust story | "Code can't change under you" | "Trust the key / multisig / timelock" |
| Operational cost | Migration playbooks | Key ceremony, timelock, monitoring |

### What does `Circle.admin` actually do?

**Today: almost nothing after creation.**

Reading `contracts/sharibo/src/lib.rs`:

- `create_circle` — `admin.require_auth()`; admin is written into storage.
- `fund` — auth is `from.require_auth()` only; **admin is not checked**.
- `claim` — no auth on a circle admin; verification is pot / round-tag / nullifier / proof.
- `get_circle` — read-only.

So `Circle.admin` is **not load-bearing for fund or claim**. It is recorded at creation and never consulted again by any entry point. There is no admin-gated pause, root update, VK rotation, member add/remove, or pot rescue.

That is worth stating loudly: **admin key rotation is not an urgent safety feature for the current code**, because the admin key cannot move funds or alter circle rules post-creation. Rotation only becomes load-bearing if we later add admin-gated operations.

## Decision

1. **Stay immutable on testnet and for the first production deployment** of the verifier contract. Prefer migration over an upgrade key that can steal pots. If a later version needs upgradeability, it should be a new contract with an explicit, time-locked, multi-party upgrade authority — not bolted onto circles that already hold funds under an implicit "we'll add upgrades later."
2. **Do not add admin rotation yet.** Document that `admin` is currently ceremonial post-creation. If product needs (pause, VK rotate, emergency withdraw) appear, design those entry points and *then* decide whether admin is a single key, a multisig, or a DAO — and add rotation as part of that design, not as a standalone patch.
3. **If admin-gated ops are added**, treat admin as load-bearing: require rotation, clear auth checks on every privileged path, and update this ADR.

## Consequences

- Bug response = new deploy + off-chain coordination to recreate circles; no silent WASM swap.
- Storage field `Circle.admin` remains for provenance / future use but must not be mistaken for an access-control root.
- Future ADRs should cover migration tooling and any privilege model before mainnet funds scale up.
