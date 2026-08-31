# ADR 003: Protocol fees — not shipping (removing `apply_fee`)

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Issue #251. `contracts/sharibo/src/lib.rs` carried a 40-line,
  overflow-safe, property-tested `apply_fee(fee_bps, amount) -> (fee, net)`
  that nothing called — `claim` transfers `circle.pot` in full. A reader
  could not tell whether fees were "not yet wired up" or "deliberately
  abandoned."

## Context

`apply_fee` was added in isolation (`feat: add apply_fee utility and
proptest for fee+net==amount invariant`) as a self-contained, overflow-safe
integer split with a proptest pinning `fee + net == amount`. It was never
wired into `claim`, never given a place to store `fee_bps`/a recipient, and
is not mentioned anywhere outside its own definition and tests — not in
`contracts/README.md`, `docs/threat-model.md`, or the hackathon submission
docs. It is pure unreferenced surface area today.

## Decision drivers

### Option A — ship it: wire `apply_fee` into `claim`

Would require, at minimum:

- `fee_bps: u32` and `fee_recipient: Address` added to `Circle`, validated
  (`fee_bps <= 10_000`) in `create_circle`.
- `claim`'s payout block split into two `token_client.transfer` calls and a
  new event emitting both amounts.
- A decision on who sets `fee_recipient` and `fee_bps` per circle (the
  circle admin? A protocol-wide constant? Governance?) and whether they're
  mutable after creation — none of which is decided anywhere in this repo.
- `Circle` is a `#[contracttype]` struct written to persistent storage by
  `create_circle`. Per **ADR 001**, this contract has **no upgrade path and
  no migration tooling** — "retrofitting ... is much harder than deciding
  now." Adding fields to `Circle` is exactly the kind of structural,
  load-bearing change ADR 001 says should be designed deliberately up
  front, not bolted on to satisfy a dead-code lint.
- The contract currently emits **no events at all** (`grep -rn
  "events()\|\.publish(" contracts/` is empty). "Emit both amounts in the
  claim event" means designing the first event schema for this contract
  from scratch — a decision that deserves its own review, not a side effect
  of deleting dead code.

### Option B — remove it

Delete `apply_fee`, `mod proptest_apply_fee` in `test.rs`, and the now-unused
`proptest` dev-dependency. `claim` is unchanged. Zero product decisions get
made by accident; the next time fees are actually wanted, they get designed
with a real fee-recipient model, an event schema, and a storage-migration
plan for circles that already exist on-chain — not retrofitted onto
whatever shape `apply_fee` happened to have.

## Decision

**Option B: remove.** There is no recorded product decision anywhere in
this repo that Sharibo charges a protocol fee, no design for who receives
it, and no event system for `claim` to extend. Speculatively shipping a
partial fee mechanism into an **immutable, non-upgradeable** contract (ADR
001) — before any of those questions are answered — creates exactly the
kind of "we'll design it properly later" debt ADR 001 already argued
against for admin rotation. Removing is reversible in the way that matters:
nothing on-chain depends on `apply_fee` existing, so shipping fees later is
still a green-field design, not a migration off a half-built one.

## Consequences

- `contracts/sharibo/src/lib.rs`: `apply_fee` and its rustdoc removed.
- `contracts/sharibo/src/test.rs`: `mod proptest_apply_fee` removed.
- `contracts/sharibo/Cargo.toml`: `proptest` dev-dependency removed (it had
  no other consumer).
- No unreferenced public function remains in the contract.
- If protocol fees are wanted later: open a fresh issue/ADR that decides the
  fee-recipient model (admin-set? protocol-constant? governance-set?),
  designs the first `claim` event schema for this contract, and — because
  `Circle` already has on-chain instances once circles exist — a storage
  migration story consistent with ADR 001's "decide now, retrofitting is
  harder" stance.
