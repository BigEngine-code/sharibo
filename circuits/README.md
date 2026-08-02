# Sharibo circuits

Zero-knowledge membership circuit for Sharibo, compiled for **BLS12-381**
(see `membership.template.circom` header and `NOTES.md` for why BLS12-381
rather than the more common BN254).

## Circuit purpose

The `membership.circom` circuit proves:
1. **Membership verification**: `Poseidon(identityNullifier, identitySecret)` is a leaf under the circle's committed Merkle root (hiding which specific member).
2. **Nullifier generation**: Computes `nullifierHash = Poseidon(identityNullifier, externalNullifier)`, binding the proof to a specific round to prevent replay attacks.

For more details, see the inline comments in `membership.template.circom`.

## Script workflow

The `scripts/` directory handles the complete zero-knowledge pipeline:

- `scripts/compile.sh`: Runs circom compilation. Uses `--prime bls12381` to target the correct curve.
- `scripts/setup.sh`: Runs the Powers-of-Tau ceremony (Phase 1 & 2) and generates Groth16 proving keys (`*.zkey`).
- `scripts/prove.sh`: Generates Groth16 proofs locally and runs the verification flow against `verification_key.json`.
- `scripts/gen-example-input.cjs`: Generates example circuit inputs (`input.example.json`) for testing.

## Artifact management

- **Committed**: `verification_key.json`
  The verification key is small, required by the contract, and needed to verify proofs.
- **Ignored**: `build/`, `*.zkey`, `*.ptau`
  The `build/` folder contains generated compilation artifacts. `*.zkey` and `*.ptau` are massive cryptographic keys generated locally via `setup.sh` and shouldn't bloat the repository.

## Cryptographic choices

- **Why BLS12-381**: Soroban provides native host functions for BLS12-381 curve pairings.
- **Why it is preferred over bn128**: A pure-Rust BN254 (bn128) pairing check inside the contract exceeds Stellar's hard 100M CPU instruction cap per transaction. We had to use BLS12-381 across the entire stack.

(See `NOTES.md` at the repo root for more context.)

## Expected outputs

When a contributor runs the workflow scripts (compile → setup → prove):
- `build/` directory is created with `membership.r1cs`, `membership.sym`, `membership_js/`
- After setup: `pot12_final.ptau`, `membership_final.zkey`, and `verification_key.json` are created.
- After prove: `proof.json` and `public.json` are created.
- A contributor knows the workflow succeeded when `prove.sh` prints a successful validation message without errors.

---

## Constraint count

**Current count: 1,452 constraints** (Merkle depth 4, 3 Poseidon instances).

### How to reproduce

```bash
# 1. Compile (generates build/membership.r1cs)
npm run compile            # or: cd circuits && scripts/compile.sh

# 2. Print the constraint count
npx snarkjs r1cs info build/membership.r1cs
```

The relevant line in the output is:

```
# of Constraints: 1452
```

> **Keep in sync**: if you change `circuits/config.json` (tree depth) or the
> circuit template, re-run the command above and update the count here *and*
> in `app/src/App.tsx` (search for "1,452 constraints").

### Breakdown estimate

| Component | Constraints (approx.) |
|---|---|
| `commitmentHasher` — Poseidon(identityNullifier, identitySecret) | ~315 |
| `nullifierHasher` — Poseidon(identityNullifier, externalNullifier) | ~315 |
| `MerkleTreeChecker` (4 levels × Poseidon + mux per level) | ~820 |
| Booleanity checks (4 × `pathIndices[i] * (1 − pathIndices[i]) === 0`) | 4 |
| **Total** | **~1,452** |

Each `Poseidon255(2)` instance costs roughly 315 constraints (BLS12-381
Poseidon with a 3-element state and 8 full + 57 partial rounds — see the
`poseidon-bls12381-circom` library). Each Merkle level adds one Poseidon
instance plus two degree-2 mux assignments (already folded into the Poseidon
input wires).
