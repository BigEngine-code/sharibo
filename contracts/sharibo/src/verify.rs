//! Groth16 verifier and external-nullifier computation.

use soroban_sdk::{crypto::bls12_381::Fr, vec, Bytes, Env, Vec};

use crate::types::{Proof, VerificationKey};

/// Compute `SHA-256(circle_id ‖ round)` reduced into the BLS12-381 scalar
/// field.
///
/// Binds a proof to a `(circle_id, round)` tuple using SHA-256 — a native,
/// accelerated Soroban host function — reduced into the BLS12-381 scalar field
/// via `Fr::from_bytes` (which reduces mod r automatically). This is a
/// deliberate, permanent choice, not a placeholder: Soroban has no native
/// Poseidon host function, so hashing this check with Poseidon would mean
/// hand-porting a Poseidon permutation into pure Rust for no security
/// benefit — SHA-256 is equally sound for binding a proof to a round.
/// Poseidon is used where it actually earns its keep: *inside* the circuit's
/// constraint system (commitment + nullifierHash), where a SNARK-unfriendly
/// hash like SHA-256 would cost far more constraints. See NOTES.md.
pub fn compute_external_nullifier(env: &Env, circle_id: u64, round: u32) -> Fr {
    let mut bytes = Bytes::new(env);
    bytes.extend_from_array(&circle_id.to_be_bytes());
    bytes.extend_from_array(&round.to_be_bytes());
    let digest = env.crypto().sha256(&bytes).to_bytes();
    Fr::from_bytes(digest)
}

/// Real on-chain Groth16 verification over BLS12-381.
///
/// Uses Soroban's native accelerated pairing host functions (see NOTES.md for
/// why BLS12-381 rather than BN254 — a pure-Rust BN254 pairing check does not
/// fit the CPU budget). Checks the standard Groth16 pairing equation:
///
/// ```text
/// e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
/// ```
///
/// where `vk_x = ic[0] + Σ(public_inputs[i] · ic[i+1])`.
///
/// Returns `false` (rather than panicking) when `public_inputs.len() + 1 !=
/// vk.ic.len()`; the caller is responsible for converting `false` to the
/// appropriate [`crate::types::Error`] variant.
pub fn verify_groth16(
    env: &Env,
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &Vec<Fr>,
) -> bool {
    if public_inputs.len() + 1 != vk.ic.len() {
        return false;
    }

    let bls = env.crypto().bls12_381();

    let mut vk_x = vk.ic.get(0).unwrap();
    for i in 0..public_inputs.len() {
        let term = bls.g1_mul(&vk.ic.get(i + 1).unwrap(), &public_inputs.get(i).unwrap());
        vk_x = bls.g1_add(&vk_x, &term);
    }

    let neg_a = -proof.a.clone();
    let vp1 = vec![env, neg_a, vk.alpha.clone(), vk_x, proof.c.clone()];
    let vp2 = vec![
        env,
        proof.b.clone(),
        vk.beta.clone(),
        vk.gamma.clone(),
        vk.delta.clone(),
    ];

    bls.pairing_check(vp1, vp2)
}
