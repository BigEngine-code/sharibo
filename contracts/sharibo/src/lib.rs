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
    /// Addresses that have funded the **current** round in order.
    /// Reset to empty after a successful `claim`, `cancel_circle`, or
    /// `expire_round`. Refunds are processed in this same order.
    /// Funding is unshielded (addresses are already public), so storing
    /// them here imposes no additional privacy loss — see issue #82.
    pub contributors: Vec<Address>,
    /// True once `cancel_circle` has been called; prevents any further
    /// `fund` or `claim` calls so the circle is permanently closed.
    pub cancelled: bool,
    /// Number of ledgers each round is allowed to stay open before any
    /// contributor may call `expire_round` to recover their funds.
    /// Set at circle creation and never changes.
    pub round_deadline_ledgers: u32,
    /// The ledger sequence number at which the current round began.
    /// Reset to the current ledger after each successful `claim` or
    /// `expire_round`.
    pub round_started_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextCircleId,
    Circle(u64),
    Nullifier(u64, Fr),
    /// Pending admin proposed via `propose_admin`; cleared on `accept_admin`.
    PendingAdmin(u64),
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
    /// The round pot is already at `contribution * size`; further funds
    /// would permanently brick `claim`'s exact-equality check.
    RoundFull = 6,
    /// Checked pot arithmetic overflowed (absurd contribution/size).
    Overflow = 7,
    /// `cancel_circle` or `fund`/`claim` called on a cancelled circle.
    CircleCancelled = 8,
    /// `expire_round` called before the deadline has passed.
    RoundNotExpired = 9,
    /// `claim` recipient is the contract's own address; payout would be
    /// silently unrecoverable (no entrypoint moves the balance back out).
    /// Also guards refund loops in `cancel_circle` and `expire_round` against
    /// a pathological `contributors` entry.
    InvalidRecipient = 10,
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
        round_deadline_ledgers: u32,
        vk: VerificationKey,
    ) -> u64 {
        admin.require_auth();

        let circle_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCircleId)
            .unwrap_or(0);

        let round_started_ledger = env.ledger().sequence();
        let circle = Circle {
            admin,
            token,
            root,
            contribution,
            size,
            round: 0,
            pot: 0,
            vk,
            contributors: Vec::new(&env),
            cancelled: false,
            round_deadline_ledgers,
            round_started_ledger,
        };
        let key = DataKey::Circle(circle_id);
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::NextCircleId, &(circle_id + 1));
        // Extend instance-storage TTL every time a new circle is created.
        // NextCircleId lives in instance storage; if the instance entry
        // is archived on a quiet network and later restored, NextCircleId
        // would reset to 0 and create_circle would silently overwrite
        // circle 0. Extending here ensures the counter outlives quiet
        // periods (see contracts/README.md §Instance-storage archival).
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        circle_id
    }

    /// Deposit one `contribution` into the circle's pot for the current round.
    ///
    /// **Open funding:** any address may call `fund` (only `from.require_auth()`
    /// is required). The Merkle root constrains who may *claim*, not who may
    /// *fund*. That lets a benefactor top up a community pot without being a
    /// member. Once the pot reaches `contribution * size`, further deposits
    /// are rejected with [`Error::RoundFull`] so over-funding cannot brick
    /// `claim`'s exact-equality check. See `contracts/README.md`.
    pub fn fund(env: Env, circle_id: u64, from: Address) {
        from.require_auth();

        let key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        // Reject funding into an already-expired round: the pot will never
        // reach the target (someone non-showed), so new deposits would just
        // get trapped until expire_round is called. Fail fast instead.
        if is_round_expired(&env, &circle) {
            panic_with_error!(&env, Error::RoundNotExpired);
        }

        let target = pot_target(&env, &circle);
        if circle.pot >= target {
            panic_with_error!(&env, Error::RoundFull);
        }

        let token_client = token::Client::new(&env, &circle.token);
        token_client.transfer(&from, &env.current_contract_address(), &circle.contribution);

        // Defensive: with RoundFull above, pot + contribution cannot exceed
        // target when target itself fits in i128. Still use checked_add so an
        // absurd contribution surfaces as Error::Overflow rather than a bare
        // arithmetic trap (which would also depend on Cargo.toml overflow-checks).
        circle.pot = circle
            .pot
            .checked_add(circle.contribution)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        circle.contributors.push_back(from);
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
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

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        // 1. round must be fully funded
        if circle.pot != pot_target(&env, &circle) {
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

        // 5. recipient must not be the contract itself — a self-transfer zeroes
        //    the pot and burns the nullifier while leaving the tokens stranded
        //    with no accounting or recovery path.
        if recipient == env.current_contract_address() {
            panic_with_error!(&env, Error::InvalidRecipient);
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
        circle.contributors = Vec::new(&env);
        circle.round_started_ledger = env.ledger().sequence();
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }

    pub fn get_circle(env: Env, circle_id: u64) -> Circle {
        env.storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound))
    }

    /// Pure read: whether `nullifier_hash` has already been used to claim in
    /// this circle. Mirrors the storage lookup in [`Self::claim`] so wallets
    /// can check eligibility without submitting a failing transaction.
    pub fn has_claimed(env: Env, circle_id: u64, nullifier_hash: Fr) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(circle_id, nullifier_hash))
    }

    /// Step 1 of two-step admin transfer: the current admin nominates a
    /// `new_admin` address.  The transfer is **not** final until `accept_admin`
    /// is called by `new_admin`.  This prevents a typo from permanently
    /// locking the circle: if the wrong address is proposed, the current
    /// admin can overwrite the pending slot with a corrected `propose_admin`
    /// call before anyone calls `accept_admin`.
    ///
    /// Reverts with [`Error::CircleCancelled`] on a cancelled circle — there
    /// is no point transferring admin rights once the circle is closed.
    pub fn propose_admin(env: Env, circle_id: u64, new_admin: Address) {
        let key = DataKey::Circle(circle_id);
        let circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        circle.admin.require_auth();

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        let pending_key = DataKey::PendingAdmin(circle_id);
        env.storage().persistent().set(&pending_key, &new_admin);
        env.storage()
            .persistent()
            .extend_ttl(&pending_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (soroban_sdk::symbol_short!("prop_adm"), circle_id),
            (circle.admin, new_admin),
        );
    }

    /// Step 2 of two-step admin transfer: the nominated address accepts,
    /// atomically updating `Circle.admin` and clearing the pending slot.
    ///
    /// Only the address stored by [`Self::propose_admin`] may call this.
    /// Reverts with [`Error::CircleCancelled`] on a cancelled circle.
    pub fn accept_admin(env: Env, circle_id: u64) {
        let circle_key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&circle_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        let pending_key = DataKey::PendingAdmin(circle_id);
        let new_admin: Address = env
            .storage()
            .persistent()
            .get(&pending_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        new_admin.require_auth();

        let old_admin = circle.admin.clone();
        circle.admin = new_admin.clone();
        env.storage().persistent().set(&circle_key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&circle_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage().persistent().remove(&pending_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("acc_adm"), circle_id),
            (old_admin, new_admin),
        );
    }

    /// Permissionless: expire a stuck round and refund all current-round
    /// contributors once the deadline has passed and the pot is below target.
    ///
    /// Unlike [`Self::cancel_circle`] this does **not** permanently close the
    /// circle — it resets the round counter so the group can continue. A ROSCA
    /// with one silent member in a single round should not be destroyed; the
    /// group can re-start without the absent member (admin can update the
    /// Merkle root in a new circle, or the group simply re-funds round N+1
    /// with willing participants).
    ///
    /// Conditions to trigger:
    /// - Circle is not cancelled.
    /// - Pot is below `contribution * size` (fully-funded rounds cannot be expired;
    ///   the claimer should call `claim` instead).
    /// - `env.ledger().sequence() > round_started_ledger + round_deadline_ledgers`.
    ///
    /// Effects:
    /// - Refunds every contributor for the current round (FIFO, same as cancel).
    /// - Increments `circle.round` so old proof round-tags are invalidated.
    /// - Resets `pot`, `contributors`, and `round_started_ledger`.
    /// - Emits a `rnd_exp` event.
    pub fn expire_round(env: Env, circle_id: u64) {
        let key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        // Only callable once the deadline has passed.
        if !is_round_expired(&env, &circle) {
            panic_with_error!(&env, Error::RoundNotExpired);
        }

        // A fully-funded round should be claimed, not expired.
        if circle.pot >= pot_target(&env, &circle) {
            panic_with_error!(&env, Error::RoundFull);
        }

        // Refund every contributor for the current (stuck) round.
        let token_client = token::Client::new(&env, &circle.token);
        for contributor in circle.contributors.iter() {
            if contributor == env.current_contract_address() {
                panic_with_error!(&env, Error::InvalidRecipient);
            }
            token_client.transfer(
                &env.current_contract_address(),
                &contributor,
                &circle.contribution,
            );
        }

        let expired_round = circle.round;
        circle.pot = 0;
        circle.round += 1;
        circle.contributors = Vec::new(&env);
        circle.round_started_ledger = env.ledger().sequence();
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (soroban_sdk::symbol_short!("rnd_exp"), circle_id),
            expired_round,
        );
    }

    /// Admin-only: cancel a stuck circle and refund all current-round
    /// contributors in FIFO order.
    ///
    /// **When to use**: a circle where a member disappears and the pot will
    /// never reach the full target. Without this, contributed tokens are
    /// permanently stranded (claim requires `pot == contribution * size`).
    ///
    /// **Privacy note**: contributor addresses are already public (funding is
    /// unshielded), so refunds expose no additional information today.
    /// However, per-contributor storage constrains any future shielded-funding
    /// design — see issue #82.
    ///
    /// After cancellation the circle is permanently closed:
    /// further `fund` and `claim` calls revert with `Error::CircleCancelled`.
    pub fn cancel_circle(env: Env, circle_id: u64) {
        let key = DataKey::Circle(circle_id);
        let mut circle: Circle = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));

        circle.admin.require_auth();

        if circle.cancelled {
            panic_with_error!(&env, Error::CircleCancelled);
        }

        // Refund every contributor for the current (stuck) round.
        let token_client = token::Client::new(&env, &circle.token);
        for contributor in circle.contributors.iter() {
            // Defence in depth: a contributor address equal to the contract
            // itself would silently absorb the refund with no recovery path.
            // This can only arise from a future bug in `fund`; reject it here
            // so a bad state never silently loses funds.
            if contributor == env.current_contract_address() {
                panic_with_error!(&env, Error::InvalidRecipient);
            }
            token_client.transfer(
                &env.current_contract_address(),
                &contributor,
                &circle.contribution,
            );
        }

        circle.pot = 0;
        circle.cancelled = true;
        circle.contributors = Vec::new(&env);
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
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

/// `contribution * size` for the current round, or [`Error::Overflow`].
fn pot_target(env: &Env, circle: &Circle) -> i128 {
    circle
        .contribution
        .checked_mul(circle.size as i128)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
}

/// True when the current ledger sequence is strictly past the round deadline
/// and the round is not yet fully funded.
///
/// The check is `current > started + deadline_ledgers` (strict greater-than)
/// so the deadline ledger itself is still valid funding time.
fn is_round_expired(env: &Env, circle: &Circle) -> bool {
    // Use saturating_add: round_deadline_ledgers is u32 and round_started_ledger
    // is u32, but sequence() returns u32 too; overflow here would be absurdly
    // far in the future (>136 years at 5 s/ledger), so saturating is fine.
    let deadline = circle
        .round_started_ledger
        .saturating_add(circle.round_deadline_ledgers);
    env.ledger().sequence() > deadline
}

mod test;
