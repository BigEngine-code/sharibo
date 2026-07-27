# Sharibo contracts

Soroban contract for private rotating savings circles. Public methods:

| Method | Kind | Purpose |
|---|---|---|
| `create_circle` | write | Admin creates a circle (Merkle root, contribution, size, vk). |
| `fund` | write | Deposit one `contribution` into the current round's pot. |
| `claim` | write | Pay the pot to `recipient` given a valid Groth16 membership proof. |
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
