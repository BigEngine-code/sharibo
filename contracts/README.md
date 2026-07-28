# Sharibo contract

Soroban contract for private rotating savings circles: `create_circle`, `fund`, `claim`, `get_circle`. Groth16 verification over BLS12-381 via host pairing functions.

## Design decisions

- [ADR 001 — Upgradeability and admin keys](../docs/adr/001-upgradeability.md): stay immutable; `Circle.admin` is not load-bearing after creation.

## CPU instruction benchmarks

Measured by `cpu_instruction_benchmarks` in `sharibo/src/test.rs` (`cargo test -p sharibo cpu_instruction_benchmarks -- --nocapture`).

| Call | CPU instructions | Notes |
|---|---:|---|
| `create_circle` | 65,414 | storage write + auth |
| `fund` (one member) | 256,645 | token transfer + pot update |
| `claim` (3 public inputs, `ic.len() == 4`) | **48,066,196** | ~48% of the 100M budget |
| `verify_groth16` with 5 public inputs (`ic.len() == 6`) | 54,589,346 | synthetic: +2 `g1_mul` terms |

**Environment:** `soroban-sdk` **23.5.3** (workspace), host `soroban-env-host` 23.0.1, measured in the Rust testutils (native) harness.

**Headroom check:** the harness asserts `claim < 60_000_000` so an SDK upgrade that blows the budget fails the suite.

**Takeaway:** Merkle tree depth does not change on-chain `claim` cost (depth is circuit-only; public inputs stay `{nullifier, root, external_nullifier}`). IC / public-input length does: two extra inputs cost ~6.5M more instructions in this measurement.

## Tests

```bash
cargo test --package sharibo
```
