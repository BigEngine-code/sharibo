# Sharibo circuits

Zero-knowledge membership circuit for Sharibo, compiled for **BLS12-381**
(see `membership.template.circom` header and `NOTES.md` for why BLS12-381
rather than the more common BN254).

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
