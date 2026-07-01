#![no_std]
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Bytes,
    BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct Circle {
    pub admin: Address,
    pub token: Address,
    pub root: BytesN<32>,
    pub contribution: i128,
    pub size: u32,
    pub round: u32,
    pub pot: i128,
    pub vk: Bytes,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextCircleId,
    Circle(u64),
    Nullifier(u64, BytesN<32>),
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
        root: BytesN<32>,
        contribution: i128,
        size: u32,
        vk: Bytes,
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
        nullifier_hash: BytesN<32>,
        external_nullifier: BytesN<32>,
        proof: Bytes,
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
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(nullifier_hash.clone());
        public_inputs.push_back(circle.root.clone());
        public_inputs.push_back(external_nullifier.clone());
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

    // ---- PHASE 2 STUBS (see NOTES.md) ----
    // TODO(phase-3): replace both of these with the real cryptography.

    // DEMO MOCK: binds the proof to (circle_id, round) with SHA-256 rather
    // than Poseidon, since the circuit-side Poseidon params aren't wired to
    // an on-chain host function yet. This is still a real hash over
    // (circle_id, round) — not a no-op — so wrong-round-tag rejection and
    // cross-round nullifier reuse are both genuinely enforced already; only
    // the specific hash function changes in Phase 3.
    fn compute_external_nullifier(env: &Env, circle_id: u64, round: u32) -> BytesN<32> {
        let mut bytes = Bytes::new(env);
        bytes.extend_from_array(&circle_id.to_be_bytes());
        bytes.extend_from_array(&round.to_be_bytes());
        env.crypto().sha256(&bytes).to_bytes()
    }

    // DEMO MOCK: always returns true. Phase 3 replaces this with a real
    // on-chain Groth16 verification (BN254 pairing check) so this must be
    // gone before the project can claim its ZK is load-bearing.
    fn verify_groth16(
        _env: &Env,
        _vk: &Bytes,
        _proof: &Bytes,
        _public_inputs: &Vec<BytesN<32>>,
    ) -> bool {
        true
    }
}

mod test;
