# Sharibo contracts

Soroban contract for private rotating savings circles. Public methods:

| Method          | Kind  | Purpose                                                            |
| --------------- | ----- | ------------------------------------------------------------------ |
| `create_circle` | write | Admin creates a circle (Merkle root, contribution, size, vk).      |
| `fund`          | write | Deposit one `contribution` into the current round's pot.           |
| `claim`         | write | Pay the pot to `recipient` given a valid Groth16 membership proof. |
| `get_circle`    | view  | Read circle state.                                                 |
| `has_claimed`   | view  | Whether a nullifier has already been used in this circle.          |

## Open funding (deliberate)

`fund(circle_id, from)` requires only `from.require_auth()` — **any address may fund any circle**. The Merkle tree constrains who may _claim_, not who may _fund_.

**Why keep it open**

- A benefactor can top up a community pot without being a Merkle member.
- On-chain membership is intentionally anonymous (Poseidon commitments only). Gating funders on-chain would need a separate eligibility design that re-identifies or re-lists payers — at odds with claim-side privacy.

**Why this is safe**

- Once the pot reaches exactly `contribution * size`, further `fund` calls revert with `Error::RoundFull`. Without that cap, a griefing sixth deposit would push `pot` past the target and permanently brick `claim` (exact-equality check, no refund path).
- Pot math uses checked arithmetic (`Error::Overflow`) so absurd `contribution`/`size` values fail as typed errors rather than bare traps.

Protected by the `anyone_can_fund` contract test — open funding is a contract guarantee, not an accident.

## Admin cancel / refund (`cancel_circle`)

`cancel_circle(circle_id)` is callable by the circle admin only. It:

1. Iterates `circle.contributors` (addresses that funded the _current_ round, stored in insertion order) and transfers `contribution` back to each funder.
2. Sets `circle.cancelled = true` and clears `circle.pot` and `contributors`.
3. Permanently closes the circle: subsequent `fund` and `claim` calls revert with `Error::CircleCancelled`.

**Privacy note**: contributor addresses are already public (funding is unshielded). Storing and iterating them for refunds imposes no additional privacy loss _today_. However it constrains a future shielded-funding design, which would need to avoid recording funder addresses on-chain — see issue #82.

## Instance-storage archival (`NextCircleId`)

`NextCircleId` lives in **instance storage** (`env.storage().instance()`). Soroban instance entries have a TTL measured in ledgers; once a TTL lapses the entry is _archived_ (removed from the live state) and can be restored later via `RestoreFootprintOp`.

**What happens on testnet when instance storage is archived and restored?** After a successful `RestoreFootprintOp` the entry reappears with its last-written value intact — the counter does _not_ reset. The risk is the gap between archival and restoration: any `create_circle` call during that gap would reinitialise the counter to `0` (the `unwrap_or(0)` default), silently overwriting circle 0.

To prevent this, every write path that touches the contract (`create_circle`, `fund`, `claim`) calls:

```rust
env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
```

`LEDGER_EXTEND_TO = 500_000` ledgers (~29 days at 5 s/ledger) ensures the counter outlives any realistic quiet period on testnet or mainnet.

**Source**: Soroban docs — [State Archival](https://developers.stellar.org/docs/build/smart-contracts/state-archival); confirmed by reading `soroban-env-host` source for `extend_ttl` semantics.
