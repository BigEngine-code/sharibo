pragma circom 2.1.6;

// NOTE: this circuit is compiled with `--prime bls12381` (see
// scripts/compile.sh), not circom's default bn128. Stellar's Soroban host
// only exposes accelerated pairing operations for BLS12-381, not BN254 — a
// pure-Rust BN254 pairing check was measured (via Stellar's own
// `import_ark_bn254` example) at ~560M CPU instructions for a SINGLE
// pairing against a 100M budget, i.e. infeasible. So the whole pipeline
// targets BLS12-381 instead, using a third-party Poseidon parameterization
// for that field (circomlib's Poseidon constants are BN254-only) — see
// NOTES.md for the full reasoning and provenance.
include "poseidon-bls12381-circom/circuits/poseidon255.circom";

// Standard fixed-depth Merkle inclusion proof (the same shape used by
// Tornado Cash / Semaphore). At each level, pathIndices[i] selects whether
// the current node is the left (0) or right (1) child before hashing up
// with its sibling pathElements[i]. Reference implementations providing
// this exact template were not present in the environment this was built
// in, so it is written here from the well-known pattern rather than copied
// — see NOTES.md.
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels]; // must be boolean (0 = left, 1 = right)

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    signal left[levels];
    signal right[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // pathIndices[i] == 0 -> left = levelHashes[i], right = pathElements[i]
        // pathIndices[i] == 1 -> left = pathElements[i], right = levelHashes[i]
        left[i] <== (pathElements[i] - levelHashes[i]) * pathIndices[i] + levelHashes[i];
        right[i] <== (levelHashes[i] - pathElements[i]) * pathIndices[i] + pathElements[i];

        hashers[i] = Poseidon255(2);
        hashers[i].in[0] <== left[i];
        hashers[i].in[1] <== right[i];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[levels];
}

// Sharibo membership + round-nullifier circuit.
//
// Proves, without revealing which leaf, that the prover's identity
// commitment sits in the circle's Merkle tree, and emits a nullifier bound
// to (identityNullifier, externalNullifier) so the contract can block a
// second claim in the same round without learning who claimed.
template Sharibo(levels) {
    // private witness (never leaves the member's device)
    signal input identityNullifier;
    signal input identitySecret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // public inputs (checked in the contract)
    signal input root;              // circle's committed member set
    // = SHA-256(circleId, roundIndex) mod r, reduced into the contract by
    // the same rule (see NOTES.md — this is SHA-256, not Poseidon, by
    // design: it binds the proof to a round outside the circuit's
    // constraint system, where Soroban has a native accelerated SHA-256 but
    // no native Poseidon; Poseidon is kept for everything hashed *inside*
    // the circuit, where constraint-efficiency actually matters).
    signal input externalNullifier;

    // public output (recorded by the contract)
    signal output nullifierHash;    // Poseidon(identityNullifier, externalNullifier)

    // 1. leaf = Poseidon(identityNullifier, identitySecret)
    component commitmentHasher = Poseidon255(2);
    commitmentHasher.in[0] <== identityNullifier;
    commitmentHasher.in[1] <== identitySecret;

    // 2. Merkle-prove leaf hashes up to `root`
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitmentHasher.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 3. nullifierHash = Poseidon(identityNullifier, externalNullifier)
    component nullifierHasher = Poseidon255(2);
    nullifierHasher.in[0] <== identityNullifier;
    nullifierHasher.in[1] <== externalNullifier;
    nullifierHash <== nullifierHasher.out;
}

component main { public [root, externalNullifier] } = Sharibo(4);
