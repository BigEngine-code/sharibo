#![no_std]
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bls12_381::{Fr, G1Affine, G2Affine},
    panic_with_error, token, vec, Address, Bytes, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: G1Affine,
    pub beta: G2Affine,
    pub gamma: G2Affine,
    pub delta: G2Affine,
    pub ic: Vec<G1Affine>,
}

#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: G1Affine,
    pub b: G2Affine,
    pub c: G1Affine,
}

#[contracttype]
#[derive(Clone)]
pub struct Circle {
    pub admin: Address,
    pub token: Address,
    pub root: Fr,
    pub contribution: i128,
    pub size: u32,
    pub round: u32,
    pub pot: i128,
    pub vk: VerificationKey,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextCircleId,
    Circle(u64),
    Nullifier(u64, Fr),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    CircleNotFound = 1,
    RoundNotFunded = 2,
    WrongRoundTag = 3,
    AlreadyClaimed = 4,
    InvalidProof = 5,
}

const LEDGER_THRESHOLD: u32 = 100;
const LEDGER_EXTEND_TO: u32 = 500_000;

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn create_circle(
        env: Env,
        admin: Address,
        token: Address,
        root: Fr,
        contribution: i128,
        size: u32,
        vk: VerificationKey,
    ) -> u64 {
        admin.require_auth();

        let circle_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCircleId)
            .unwrap_or(0);

        let circle = Circle {
            admin,
            token,
            root,
            contribution,
            size,
            round: 0,
            pot: 0,
            vk,
        };
        let key = DataKey::Circle(circle_id);
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::NextCircleId, &(circle_id + 1));

        circle_id
    }

    pub fn fund(env: Env, circle_id: u64, from: Address) {
        from.require_auth();

        let key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        let token_client = token::Client::new(&env, &circle.token);
        token_client.transfer(&from, &env.current_contract_address(), &circle.contribution);

        circle.pot += circle.contribution;
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }

    pub fn claim(
        env: Env,
        circle_id: u64,
        recipient: Address,
        nullifier_hash: Fr,
        external_nullifier: Fr,
        proof: Proof,
    ) {
        let key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        // 1. round must be fully funded
        if circle.pot != circle.contribution * (circle.size as i128) {
            panic_with_error!(&env, Error::RoundNotFunded);
        }

        // 2. the proof's external_nullifier must be bound to this exact circle+round
        let expected_external_nullifier = Self::compute_external_nullifier(&env, circle_id, circle.round);
        if external_nullifier != expected_external_nullifier {
            panic_with_error!(&env, Error::WrongRoundTag);
        }

        // 3. this nullifier must not have claimed before (any round, this circle)
        let nullifier_key = DataKey::Nullifier(circle_id, nullifier_hash.clone());
        if env.storage().persistent().has(&nullifier_key) {
            panic_with_error!(&env, Error::AlreadyClaimed);
        }

        // 4. the ZK proof itself must verify against the circle's committed root
        let public_inputs = vec![
            &env,
            nullifier_hash.clone(),
            circle.root.clone(),
            external_nullifier,
        ];
        if !Self::verify_groth16(&env, &circle.vk, &proof, &public_inputs) {
            panic_with_error!(&env, Error::InvalidProof);
        }

        // effects
        env.storage().persistent().set(&nullifier_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&nullifier_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        let token_client = token::Client::new(&env, &circle.token);
        token_client.transfer(&env.current_contract_address(), &recipient, &circle.pot);

        circle.pot = 0;
        circle.round += 1;
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }

    pub fn get_circle(env: Env, circle_id: u64) -> Circle {
        env.storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound))
    }

    // Binds a proof to (circle_id, round) with SHA-256 (a native, accelerated
    // Soroban host function), reduced into the BLS12-381 scalar field via
    // `Fr::from_bytes` (which reduces mod r automatically). This is a
    // deliberate, permanent choice, not a placeholder: Soroban has no native
    // Poseidon host function, so hashing this check with Poseidon would mean
    // hand-porting a Poseidon permutation into pure Rust for no security
    // benefit — SHA-256 is equally sound for binding a proof to a round.
    // Poseidon is used where it actually earns its keep: *inside* the
    // circuit's constraint system (commitment + nullifierHash), where a
    // SNARK-unfriendly hash like SHA-256 would cost far more constraints.
    // See NOTES.md.
    fn compute_external_nullifier(env: &Env, circle_id: u64, round: u32) -> Fr {
        let mut bytes = Bytes::new(env);
        bytes.extend_from_array(&circle_id.to_be_bytes());
        bytes.extend_from_array(&round.to_be_bytes());
        let digest = env.crypto().sha256(&bytes).to_bytes();
        Fr::from_bytes(digest)
    }

    // Real on-chain Groth16 verification over BLS12-381, using Soroban's
    // native accelerated pairing host functions (see NOTES.md for why
    // BLS12-381 rather than BN254 — a pure-Rust BN254 pairing check does not
    // fit the CPU budget). Checks the standard Groth16 pairing equation:
    // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    // where vk_x = ic[0] + sum(public_inputs[i] * ic[i+1]).
    fn verify_groth16(
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
        let vp1 = vec![
            env,
            neg_a,
            vk.alpha.clone(),
            vk_x,
            proof.c.clone(),
        ];
        let vp2 = vec![env, proof.b.clone(), vk.beta.clone(), vk.gamma.clone(), vk.delta.clone()];

        bls.pairing_check(vp1, vp2)
    }
}

mod test;
