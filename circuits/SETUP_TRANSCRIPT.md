# Sharibo Trusted-Setup Transcript

Each entry below records one ceremony run.  The **verification key hash** is
the authoritative fingerprint: it must match `shasum -a 256 verification_key.json`
(or `sha256sum verification_key.json` on Linux) for any set of local artifacts
to be considered canonical.

> ⚠️ **A new `setup.sh` run produces a brand-new verification key.**
> Any on-chain circle created with a previous vk stores that old key
> inside its contract state (written at `create_circle` time).  Proofs
> generated from the new key will **fail** to verify against those circles.
> All existing circles must be cancelled and recreated after a key rotation.

---

## Entry — 2025-07-01T00:00:00Z (canonical / committed)

| Field                              | Value |
|------------------------------------|-------|
| Date (UTC)                         | `2025-07-01T00:00:00Z` |
| snarkjs version                    | `0.7.6` |
| Curve                              | `bls12381` |
| Powers-of-Tau power                | `12` |
| `verification_key.json` SHA-256    | `4cddb51d4ce86b07ec30082cbf32c168ece062325fb479b7a6a44073b1292333` |
| `membership_final.zkey` SHA-256    | *(not committed — large binary)* |
| `pot12_bls12381_final.ptau` SHA-256 | *(not committed — large binary)* |

> **How to verify:** run `shasum -a 256 circuits/verification_key.json` (macOS/Linux)
> or `certutil -hashfile circuits\verification_key.json SHA256` (Windows).
> The hash must match the `verification_key.json` SHA-256 entry above.
>
> To reproduce the full ceremony from scratch:
> ```bash
> cd circuits
> npm run compile          # generates build/membership.r1cs
> scripts/setup.sh         # re-runs Powers-of-Tau + Groth16 setup
> ```
> Because setup uses `/dev/urandom` entropy, a fresh run will produce
> **different** zkey and vk values.  The hash above is for the artifact that
> was committed to this repository and used by the deployed contract.

> Note: `membership_final.zkey` and the ptau file are **not committed** to the
> repository (large binary files excluded via .gitignore).  Only
> `verification_key.json` and this transcript are committed.

---
