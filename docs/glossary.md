# Glossary

Plain-language definitions of cryptographic terms used throughout the Sharibo repository. Each entry links to the file where the concept is most central.

---

### BLS12-381

A specific elliptic curve — think of it as the mathematical "field" on which Sharibo's zero-knowledge proofs run. Most ZK projects use BN254, but Stellar's Soroban blockchain natively accelerates BLS12-381 pairing operations, which is what makes on-chain verification actually fit within the transaction budget (BN254 doesn't).  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs) · [`NOTES.md`](../NOTES.md)

### Circom

A domain-specific language for writing arithmetic circuits — the programs that describe what a zero-knowledge proof is proving. Sharibo's circuit (`membership.circom`) encodes "I am a member of this circle."  
→ [`circuits/membership.template.circom`](../circuits/membership.template.circom)

### Commitment

A cryptographic digest that binds to secret data without revealing it. In Sharibo, each member's leaf is `Poseidon(identityNullifier, identitySecret)` — the contract stores only this hash, never the raw secrets.  
→ [`packages/client/src/identity.ts`](../packages/client/src/identity.ts)

### Constraint

A single logical rule the circuit enforces (e.g., "this bit must be 0 or 1"). The number of constraints determines proof size and proving time. Sharibo's circuit uses ~1,452 constraints.  
→ [`circuits/membership.template.circom`](../circuits/membership.template.circom)

### External nullifier

A value that binds a proof to a specific circle and round, so a proof generated for round 1 can't be replayed in round 2. Computed as `SHA256(circle_id, round) mod r` — SHA-256 is used here (not Poseidon) because this check lives on-chain where Soroban accelerates SHA-256 natively.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Groth16

A zero-knowledge proving system with the smallest proof size of any widely used scheme (~3 elliptic curve points). Sharibo uses Groth16 over BLS12-381: the contract verifies the proof via Soroban's native `pairing_check`.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Identity nullifier / Identity secret

Two random numbers that together form a member's private identity. The nullifier is combined with the external nullifier to produce a one-time `nullifierHash` for claiming; the secret stays purely hidden. Neither is ever revealed on-chain.  
→ [`packages/client/src/identity.ts`](../packages/client/src/identity.ts)

### Merkle root / Merkle tree

A cryptographic data structure that commits to a set of values using only a single hash (the root). Sharibo puts every member's commitment into a Merkle tree and stores only the root on-chain. A claimant proves "my leaf is in this tree" without revealing *which* leaf.  
→ [`packages/client/src/tree.ts`](../packages/client/src/tree.ts)

### Nullifier / Nullifier hash

A one-time marker that proves "this specific member already claimed" without identifying the member. `nullifierHash = Poseidon(identityNullifier, externalNullifier)` — the contract stores it permanently and rejects any future claim using the same value.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Pairing check

The mathematical operation that verifies a Groth16 proof. Soroban provides a native `bls12_381().pairing_check(vp1, vp2)` host function that runs in about 48M CPU instructions — fast enough to fit within the 100M per-transaction budget.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Poseidon

A hash function designed specifically for zero-knowledge circuits — it uses far fewer constraints than traditional hashes like SHA-256. Sharibo uses Poseidon inside the circuit (for commitments and nullifiers) and a dedicated BLS12-381-compatible variant throughout.  
→ [`circuits/membership.template.circom`](../circuits/membership.template.circom) · [`test-vectors/poseidon.json`](../test-vectors/poseidon.json)

### Powers-of-Tau

The first phase of a trusted setup ceremony: a multi-party computation that produces "toxic waste" parameters which, if not destroyed, could allow forging fake proofs. Sharibo currently uses a single-party setup (fine for a demo, insufficient for production).  
→ [`circuits/scripts/setup.sh`](../circuits/scripts/setup.sh) · [`circuits/SETUP_TRANSCRIPT.md`](../circuits/SETUP_TRANSCRIPT.md)

### Proof (ZK proof)

A small piece of data (in Groth16: three elliptic curve points A, B, C) that proves a statement is true without revealing *why* it's true. Sharibo's proof says: "one of the five members is claiming the pot" — without revealing which one.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Public inputs / Public signals

The values that both the prover and verifier agree on publicly. In Sharibo: `[nullifierHash, root, externalNullifier]`. The proof demonstrates that some private inputs (identityNullifier, identitySecret, Merkle path) satisfy the circuit *given these public values*.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Scalar field (BLS12-381 scalar field)

The set of numbers used for all hash outputs and field arithmetic in Sharibo — the modulus is the large prime `r` defined by the BLS12-381 curve. Every Poseidon hash, nullifier, and commitment lives in this field.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)

### Trusted setup

The one-time process that generates the proving key and verification key for a Groth16 circuit. It requires a "ceremony" where participants contribute randomness and destroy their portion afterward. Sharibo's current single-party setup is documented and committed; a production deployment would need a multi-party ceremony.  
→ [`circuits/scripts/setup.sh`](../circuits/scripts/setup.sh)

### Verification key (vk)

The public key produced during trusted setup, stored on-chain in each `Circle`. The contract uses it to check that submitted proofs were generated from the correct circuit — without it, anyone could submit a fake proof.  
→ [`circuits/verification_key.json`](../circuits/verification_key.json)

### Witness

The complete set of values (public + private inputs + all intermediate computations) that satisfy a circuit. In Sharibo, the witness includes the member's secret identity, the Merkle path, and every intermediate Poseidon hash — all computed locally, never sent to the contract.  
→ [`circuits/membership.template.circom`](../circuits/membership.template.circom)

### Zero-knowledge proof (ZKP)

A cryptographic technique where one party (the prover) convinces another (the verifier) that a statement is true without revealing anything beyond the truth of the statement itself. Sharibo's ZK proof convinces the contract "this person is a member" without revealing which member.  
→ [`contracts/sharibo/src/lib.rs`](../contracts/sharibo/src/lib.rs)
