# Sharibo contracts

Soroban contract for private rotating savings circles. Public methods:

| Method | Kind | Purpose |
|---|---|---|
| `create_circle` | write | Admin creates a circle (Merkle root, contribution, size, deadline, vk). |
| `fund` | write | Deposit one `contribution` into the current round's pot. |
| `claim` | write | Pay the pot to `recipient` given a valid Groth16 membership proof. |
| `expire_round` | write | Permissionless: refund contributors and advance the round once the deadline passes. |
| `cancel_circle` | write | Admin cancels a stuck circle and refunds all current-round contributors. |
| `propose_admin` | write | Step 1 of admin transfer: current admin nominates a new admin address. |
| `accept_admin` | write | Step 2 of admin transfer: nominated address accepts, atomically updating `Circle.admin`. |
| `get_circle` | view | Read circle state. |
| `has_claimed` | view | Whether a nullifier has already been used in this circle. |

## Open funding (deliberate)

`fund(circle_id, from)` requires only `from.require_auth()` — **any address may fund any circle**. The Merkle tree constrains who may *claim*, not who may *fund*.

**Why keep it open**

- A benefactor can top up a community pot without being a Merkle member.
- On-chain membership is intentionally anonymous (Poseidon commitments only). Gating funders on-chain would need a separate eligibility design that re-identifies or re-lists payers — at odds with claim-side privacy.

**Why this is safe**

- Once the pot reaches exactly `contribution * size`, further `fund` calls revert with `Error::RoundFull`. Without that cap, a griefing sixth deposit would push `pot` past the target and permanently brick `claim` (exact-equality check, no refund path).
- Pot math uses checked arithmetic (`Error::Overflow`) so absurd `contribution`/`size` values fail as typed errors rather than bare traps.

Protected by the `anyone_can_fund` contract test — open funding is a contract guarantee, not an accident.

## Round deadline and permissionless expiry (`expire_round`)

Each circle is created with a `round_deadline_ledgers: u32` that sets the maximum number of ledgers a round may stay open. The ledger at which the current round started is stored in `Circle.round_started_ledger` and reset after every successful `claim` or `expire_round`.

Once `env.ledger().sequence() > round_started_ledger + round_deadline_ledgers` and `pot < contribution * size`, **anyone** may call `expire_round(circle_id)`:

1. Every contributor for the current round is refunded `contribution` (FIFO, same path as `cancel_circle`).
2. `circle.round` increments, invalidating any proof bound to the old round tag.
3. `circle.pot`, `contributors`, and `round_started_ledger` are reset.
4. The circle remains **open** — unlike `cancel_circle`, the group can continue funding round N+1.

This removes the single point of failure where a contributor needed admin availability to recover funds from an abandoned round. See `docs/threat-model.md §R1` and `§R2`.

**Note for callers:** `fund` rejects deposits into an already-expired round (`Error::RoundNotExpired`) — there is no point locking more tokens into a round that cannot complete.



`cancel_circle(circle_id)` is callable by the circle admin only. It:

1. Iterates `circle.contributors` (addresses that funded the *current* round, stored in insertion order) and transfers `contribution` back to each funder.
2. Sets `circle.cancelled = true` and clears `circle.pot` and `contributors`.
3. Permanently closes the circle: subsequent `fund` and `claim` calls revert with `Error::CircleCancelled`.

**Privacy note**: contributor addresses are already public (funding is unshielded). Storing and iterating them for refunds imposes no additional privacy loss *today*. However it constrains a future shielded-funding design, which would need to avoid recording funder addresses on-chain — see issue #82.

## Admin rotation (`propose_admin` / `accept_admin`)

Because `cancel_circle` is the only escape hatch for a stuck round, a lost admin key permanently strands every contributor's funds. `propose_admin` / `accept_admin` implement a two-step transfer to prevent this.

**Flow**

1. Current admin calls `propose_admin(circle_id, new_admin)` — stores `new_admin` in a separate `PendingAdmin` slot; does not alter `Circle.admin` yet.
2. `new_admin` calls `accept_admin(circle_id)` — requires `new_admin.require_auth()`, atomically writes `new_admin` into `Circle.admin`, and removes the pending slot.

**Why two steps?** A single-call `admin_transfer(new_admin)` would brick the circle permanently if `new_admin` is a typo — exactly the failure mode the feature is meant to prevent. The pending slot is overwritable: the current admin can issue a fresh `propose_admin` to correct a mistake before acceptance.

Both calls revert with `Error::CircleCancelled` on a cancelled circle.

## Instance-storage archival (`NextCircleId`)

`NextCircleId` lives in **instance storage** (`env.storage().instance()`). Soroban instance entries have a TTL measured in ledgers; once a TTL lapses the entry is *archived* (removed from the live state) and can be restored later via `RestoreFootprintOp`.

**What happens on testnet when instance storage is archived and restored?** After a successful `RestoreFootprintOp` the entry reappears with its last-written value intact — the counter does *not* reset. The risk is the gap between archival and restoration: any `create_circle` call during that gap would reinitialise the counter to `0` (the `unwrap_or(0)` default), silently overwriting circle 0.

To prevent this, every write path that touches the contract (`create_circle`, `fund`, `claim`) calls:

```rust
env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
```

`LEDGER_EXTEND_TO = 500_000` ledgers (~29 days at 5 s/ledger) ensures the counter outlives any realistic quiet period on testnet or mainnet.

**Source**: Soroban docs — [State Archival](https://developers.stellar.org/docs/build/smart-contracts/state-archival); confirmed by reading `soroban-env-host` source for `extend_ttl` semantics.
