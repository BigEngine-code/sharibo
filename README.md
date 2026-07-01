# Sharibo

**ajo · esusu · tanda · cundina · susu · tontine · junta · pandero · consórcio · hui · paluwagan · chit fund**

Every culture has one: a circle of people who each put in a fixed amount every round, and each round one member takes the whole pot. Sharibo puts that circle on Stellar — stablecoins instead of a shared notebook, and zero-knowledge so nobody can trace a payout back to a member.

> Status: **under construction for the Stellar Hacks: Real-World ZK hackathon.** Testnet only. No real funds. See "Honest limitations" below (filled in as phases land).

## What it does

A private rotating savings circle (ROSCA) on Stellar:
- Members fund a shared pot each round with a test stablecoin.
- The round's payout goes to whoever can prove, in zero-knowledge, that they are a circle member entitled to claim — without revealing *which* member they are.
- A per-round nullifier stops the same member from claiming twice in the same round.

## What the ZK is doing

A Circom circuit proves **Merkle membership** in the circle (without revealing the leaf) and emits a **round-bound nullifier**, which is verified on-chain in Soroban via a Groth16 verifier. This is the load-bearing part of the project — see `circuits/membership.circom` and `contracts/sharibo/src/lib.rs`.

Full architecture, invariants, and run instructions land as each phase completes — see `NOTES.md` for the running build log.

## Honest limitations

_(filled in progressively; see NOTES.md in the meantime)_

## Roadmap

_(filled in during Phase 6)_
