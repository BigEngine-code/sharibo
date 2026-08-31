# ADR 004: Storage archival and the nullifier TTL fence

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Pre-mainnet decision record. The double-claim fence in `claim` is enforced by a persistent storage entry whose TTL is not indefinite. This is the single document analysing every storage key's archival behaviour and the resulting security posture; `contracts/README.md` links here instead of duplicating the analysis.

## Context

Soroban expires storage entries whose TTL (`live_until_ledger`) lapses. Instance and persistent entries are *archived*, not deleted — an archived entry falls out of the live ledger state. This repo's own contract logic already shows what that means in practice: `create_circle`'s `unwrap_or(0)` handling of `NextCircleId` means an un-restored archived entry reads back as **absent** to `get()`/`has()`, not as a hard transaction failure. Every storage entry the contract writes needs the same question asked of it: does anything re-extend it, and what happens the day nothing does?

## Storage entries

| `DataKey` variant | Storage class | Extended on | Consequence if archived |
| --- | --- | --- | --- |
| `NextCircleId` | Instance | Every `create_circle`, `fund`, `claim` (`env.storage().instance().extend_ttl(...)`) | If archived and a `create_circle` runs before restoration, `get()` on the missing entry falls back to `unwrap_or(0)` and silently overwrites circle 0. Already documented in `contracts/README.md`. This entry is touched by every write across every circle, so archival requires the *entire contract* to go quiet for the full TTL window, not just one circle. |
| `Circle(circle_id)` | Persistent | Every `fund`/`claim` on that circle (`extend_ttl` on the `Circle` key) | If archived, reads (`get_circle`) and writes (`fund`, `claim`) against that circle fail closed — `unwrap_or_else` panics with `Error::CircleNotFound` — until restored. No security consequence: a stalled circle stops responding, it does not misbehave. |
| `Nullifier(circle_id, nullifier_hash)` | Persistent | **Once**, at the claim that creates it — never again | This is the load-bearing case. See below. |

## The nullifier case

`claim`'s double-claim fence is exactly this check:

```rust
let nullifier_key = DataKey::Nullifier(circle_id, nullifier_hash.clone());
if env.storage().persistent().has(&nullifier_key) {
    panic_with_error!(&env, Error::AlreadyClaimed);
}
```

Every other persistent write in the contract (`Circle`) is re-extended on the *circle's* next `fund`/`claim`, so as long as a circle keeps getting used its entries never lapse. A `Nullifier` entry has no such second touch: nothing in `claim`, `fund`, or `has_claimed` ever extends an *existing* nullifier's TTL — it is written once, extended once (to `LEDGER_EXTEND_TO = 500_000` ledgers from that moment), and never referenced again unless the same `nullifier_hash` is presented a second time.

**Replay risk.** If that second presentation happens after the entry's TTL has lapsed and nobody has restored it, `env.storage().persistent().has(&nullifier_key)` reads the archived, un-restored key as absent — the same fallback-to-default behaviour documented for `NextCircleId` above — and the `AlreadyClaimed` check silently passes. A member who claimed once could claim again in a later round of the same circle, defeating the exact fence the entry exists to enforce. This is tracked separately as issue #254, because unlike `Circle`/`NextCircleId` (which fail closed, or require the whole contract to go quiet), the nullifier case fails *open* and only requires one circle's one nullifier to sit untouched for one TTL window — a far more plausible scenario for a circle that finished its rounds and was never revisited.

**Why nullifiers alone have this shape.** `Circle` entries are read and rewritten on every `fund`/`claim` for that circle, so their TTL rides along for free. A nullifier is deliberately write-once — it exists purely to remember that one specific claim happened — so there is no natural second write to piggyback a TTL extension onto, unlike the circle it belongs to.

## Decision

1. **Accept the residual risk for now, bounded by a concrete operational window**, rather than block this document on a fix: a nullifier remains a reliable fence for at least `LEDGER_EXTEND_TO` ledgers (~29 days, at `500_000 ledgers × ~5s average close time ≈ 2.5M s`) after the claim that wrote it, and archival requires that specific key to go completely untouched — no restore, no repeat claim attempt with that nullifier — for the entire window.
2. **The fix belongs to issue #254, not this ADR.** That issue lays out three options: (a) re-extend every nullifier on every claim to the same circle — unbounded work, doesn't scale with round count; (b) fold nullifiers into a bounded `Vec` on the `Circle` entry itself (at most `size` entries for a fixed-size ROSCA) so they inherit the circle's continuously-refreshed TTL for free; (c) declare circles time-bounded and document that a circle must fully complete (all `size` claims) inside one `LEDGER_EXTEND_TO` window. **This ADR recommends option (b)**: it removes the write-once TTL gap entirely instead of working around it, and the bound (`size` members) already exists as a circle parameter, so the `Vec` cannot grow unbounded. Implementation and the ledger-advancement test proving the fence survives TTL expiry are #254's scope, not this document's.
3. **Until #254 lands**, treat "a circle whose current round hasn't turned over within ~29 days of its last claim" as outside the trust boundary for operational monitoring: a claimed-but-dormant round is exactly the window where a replay becomes possible, and ops should flag circles that have gone quiet that long.

## Consequences

- `NextCircleId` and `Circle` entries fail closed under archival (a stuck call, not a security hole) — no action needed beyond what's already implemented for instance-TTL extension (issue #84).
- The `Nullifier` archival gap is a known, accepted, time-bounded risk until #254 ships. This ADR must be revisited once #254's fix lands — the Decision section above should then describe the shipped bounded-`Vec` design instead of the residual-risk acceptance.
- Any future `DataKey` variant must state, in its own doc comment and in the table above, whether something re-extends it. A write-once entry with no natural companion write needs the same explicit accept-or-fix decision the nullifier case got here.
