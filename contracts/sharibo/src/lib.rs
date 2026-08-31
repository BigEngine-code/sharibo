#![no_std]
#[cfg(test)]
extern crate std;

mod fee;
mod storage;
mod types;
mod verify;

// Re-export every public item so the on-chain contract spec and any direct
// crate consumers see the same paths as before.  This keeps the deployed
// WASM's contract interface byte-identical to the pre-split build.
pub use fee::apply_fee;
pub use storage::{LEDGER_EXTEND_TO, LEDGER_THRESHOLD};
pub use types::{Circle, DataKey, Error, Proof, VerificationKey};
pub use verify::{compute_external_nullifier, verify_groth16};

use soroban_sdk::{
    contract, contractimpl,
    crypto::bls12_381::Fr,
    panic_with_error, token, vec, Address, Env, Vec,
};

use storage::extend_instance_ttl;
use types::DataKey::*;

/// Sharibo contract: permissionless Semaphore-style contribution circles on
/// Soroban.
///
/// # Lifecycle
///
/// 1. [`Self::create_circle`] — deployer commits a member root, fixed
///    contribution/size, and Groth16 VK. Returns the new circle id.
/// 2. [`Self::fund`] — any address deposits `contribution` tokens until the
///    pot reaches `contribution * size`.
/// 3. [`Self::claim`] — one eligible member (proves membership in the
///    Merkle root via ZK) takes the entire pot; round advances.
/// 4. (Escape hatch) [`Self::cancel_circle`] — admin refunds the current
///    round's contributors and permanently closes the circle.
#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    /// Create a new contribution circle and return its assigned `circle_id`.
    ///
    /// # Authentication
    ///
    /// Requires `admin.require_auth()`. The admin is the only address that
    /// may later [`Self::cancel_circle`]; they have no special power over
    /// funding or claiming.
    ///
    /// # Arguments
    ///
    /// * `admin` — circle owner; can cancel. Stored in [`Circle::admin`].
    /// * `token` — SAC token address for contributions/payouts. Stored in
    ///   [`Circle::token`].
    /// * `root` — Merkle root of the Semaphore commitment tree; binds who
    ///   is eligible to claim. Stored in [`Circle::root`].
    /// * `contribution` — fixed amount each [`Self::fund`] deposits.
    ///   Stored in [`Circle::contribution`].
    /// * `size` — number of funders needed to fill a round. `pot_target =
    ///   contribution * size`. Stored in [`Circle::size`].
    /// * `vk` — Groth16 verification key for the membership circuit.
    ///   Stored in [`Circle::vk`].
    ///
    /// # State effects
    ///
    /// * Writes a fresh [`Circle`] at [`DataKey::Circle`]`(id)` with
    ///   `round = 0`, `pot = 0`, empty contributors, `cancelled = false`.
    /// * Increments [`DataKey::NextCircleId`] in instance storage.
    /// * Extends both instance and persistent TTLs.
    ///
    /// # Errors
    ///
    /// This entrypoint does not panic with any [`Error`] variant — it
    /// performs no arithmetic on user-provided `contribution`/`size`.
    /// Overflow is first possible in [`Self::fund`]/[`Self::claim`] where
    /// `pot_target` is computed.
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
            contributors: Vec::new(&env),
            cancelled: false,
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
        extend_instance_ttl(&env);

        circle_id
    }

    /// Deposit one `contribution` into the circle's pot for the current round.
    ///
    /// # Authentication
    ///
    /// Requires `from.require_auth()`. **Open funding:** the Merkle root
    /// constrains who may *claim*, not who may *fund*. That lets a
    /// benefactor top up a community pot without being a member.
    ///
    /// # Arguments
    ///
    /// * `circle_id` — which circle to contribute to.
    /// * `from` — SAC token spender. Transfers [`Circle::contribution`]
    ///   tokens to the contract and is appended to
    ///   [`Circle::contributors`] for potential cancel-time refunds.
    ///
    /// # State effects
    ///
    /// * Transfers `contribution` tokens from `from` → contract via SAC.
    /// * Adds `contribution` to [`Circle::pot`] using checked arithmetic.
    /// * Pushes `from` onto [`Circle::contributors`].
    /// * Writes the updated circle and extends TTLs.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    /// * [`Error::CircleCancelled`] — circle was already cancelled.
    /// * [`Error::RoundFull`] — pot already at `contribution * size`;
    ///   over-funding would permanently brick [`Self::claim`]'s
    ///   exact-equality check. See `contracts/README.md`.
    /// * [`Error::Overflow`] — `contribution * size` (computed via
    ///   `pot_target`) or `pot + contribution` overflows `i128`.
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
        extend_instance_ttl(&env);
    }

    /// Zero-knowledge payout: transfer the full round pot to `recipient`
    /// after verifying membership in the circle's Merkle root.
    ///
    /// # Authentication
    ///
    /// No address-based auth — eligibility is proved in zero knowledge.
    /// The recipient is unauthenticated: the prover chooses where funds
    /// land. (The ZK circuit proves the caller knows the secret for a
    /// commitment in the tree, which is the actual authorization check.)
    ///
    /// # Arguments
    ///
    /// * `circle_id` — which circle to claim from.
    /// * `recipient` — SAC token payout address. Receives the full pot.
    /// * `nullifier_hash` — unique per-claim marker computed from the
    ///   prover's identity nullifier. Stored to prevent the same identity
    ///   from claiming twice across any round.
    /// * `external_nullifier` — public input binding the proof to this
    ///   specific (circle, round) tuple. Must equal
    ///   `compute_external_nullifier(circle_id, round)`; prevents replay
    ///   of a valid proof from a different round or circle.
    /// * `proof` — Groth16 `(A, B, C)` triple over BLS12-381.
    ///
    /// # Verification steps (in order)
    ///
    /// 1. **Round fully funded.** `pot == contribution * size` exactly —
    ///    not ≥. Partial pots cannot be partially claimed; the round must
    ///    be complete, or else the admin must `cancel_circle` and refund.
    ///    Reverts with [`Error::RoundNotFunded`].
    ///
    /// 2. **External nullifier matches current round.** Computed
    ///    off-chain by calling [`Self::compute_external_nullifier`] on
    ///    `(circle_id, round)`; a mismatch means the proof was created
    ///    for a different round/circle and cannot be replayed here.
    ///    Reverts with [`Error::WrongRoundTag`].
    ///
    /// 3. **Nullifier unused.** A per-circle set stores every
    ///    `nullifier_hash` from a successful claim. Hitting an existing
    ///    entry means this identity already claimed (in any prior round)
    ///    and is trying to double-spend. Reverts with
    ///    [`Error::AlreadyClaimed`].
    ///
    /// 4. **Groth16 proof verifies.** Standard pairing check against the
    ///    circle's [`VerificationKey`] with public inputs
    ///    `(nullifier_hash, root, external_nullifier)`. Reverts with
    ///    [`Error::InvalidProof`].
    ///
    /// # State effects
    ///
    /// * Sets [`DataKey::Nullifier`]`(circle_id, nullifier_hash) = true`
    ///   and extends TTL — idempotent double-claim fence.
    /// * Transfers the entire [`Circle::pot`] to `recipient` via the
    ///   token client.
    /// * Zeros [`Circle::pot`], increments [`Circle::round`], clears
    ///   [`Circle::contributors`], and writes the updated circle back.
    /// * Extends both instance and persistent TTLs.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    /// * [`Error::CircleCancelled`] — circle was already cancelled.
    /// * [`Error::RoundNotFunded`] — check 1 failed.
    /// * [`Error::WrongRoundTag`] — check 2 failed.
    /// * [`Error::AlreadyClaimed`] — check 3 failed.
    /// * [`Error::InvalidProof`] — check 4 failed.
    /// * [`Error::Overflow`] — computing `contribution * size` overflows
    ///   `i128` (absurd parameters set at circle creation).
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
        let expected_en = compute_external_nullifier(&env, circle_id, circle.round);
        if external_nullifier != expected_en {
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
        if !verify_groth16(&env, &circle.vk, &proof, &public_inputs) {
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
        circle.contributors = Vec::new(&env);
        env.storage().persistent().set(&key, &circle);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        extend_instance_ttl(&env);
    }

    /// Look up a [`Circle`] by its assigned id.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — no circle stored at `circle_id`.
    pub fn get_circle(env: Env, circle_id: u64) -> Circle {
        env.storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound))
    }

    /// Pure read: the current count of circles ever created (i.e. the next
    /// circle id that would be assigned). 0 if no circle has been created yet.
    pub fn get_circle_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextCircleId)
            .unwrap_or(0)
    }

    /// Pure read: the current round number for `circle_id`.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    pub fn get_round(env: Env, circle_id: u64) -> u32 {
        let circle: Circle = env
            .storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));
        circle.round
    }

    /// Pure read: the current pot balance (in token stroops) for `circle_id`.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    pub fn get_pot(env: Env, circle_id: u64) -> i128 {
        let circle: Circle = env
            .storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));
        circle.pot
    }

    /// Pure read: compact status tuple `(round, pot, target, cancelled)`.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    /// * [`Error::Overflow`] — `contribution * size` overflows `i128`.
    pub fn get_status(env: Env, circle_id: u64) -> (u32, i128, i128, bool) {
        let circle: Circle = env
            .storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));
        let target = pot_target(&env, &circle);
        (circle.round, circle.pot, target, circle.cancelled)
    }

    /// Pure read: ordered list of addresses that have funded the current round.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    pub fn get_contributors(env: Env, circle_id: u64) -> Vec<Address> {
        let circle: Circle = env
            .storage()
            .persistent()
            .get(&DataKey::Circle(circle_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CircleNotFound));
        circle.contributors
    }

    /// Pure read: whether `nullifier_hash` has already been used to claim in
    /// this circle.
    pub fn has_claimed(env: Env, circle_id: u64, nullifier_hash: Fr) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(circle_id, nullifier_hash))
    }

    /// Admin-only: cancel a stuck circle and refund all current-round
    /// contributors in FIFO order.
    ///
    /// # Authentication
    ///
    /// Requires [`Circle::admin`]`.require_auth()`.
    ///
    /// # Errors
    ///
    /// * [`Error::CircleNotFound`] — `circle_id` does not exist.
    /// * [`Error::CircleCancelled`] — circle was already cancelled.
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

    // Delegating wrappers — kept as associated functions so tests and the
    // contract spec that references `Contract::compute_external_nullifier` and
    // `Contract::verify_groth16` continue to compile without change.

    /// See [`compute_external_nullifier`].
    pub(crate) fn compute_external_nullifier(env: &Env, circle_id: u64, round: u32) -> Fr {
        compute_external_nullifier(env, circle_id, round)
    }

    /// See [`verify_groth16`].
    pub(crate) fn verify_groth16(
        env: &Env,
        vk: &VerificationKey,
        proof: &Proof,
        public_inputs: &Vec<Fr>,
    ) -> bool {
        verify_groth16(env, vk, proof, public_inputs)
    }
}

/// `contribution * size` for the current round, or [`Error::Overflow`].
fn pot_target(env: &Env, circle: &Circle) -> i128 {
    circle
        .contribution
        .checked_mul(circle.size as i128)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
}

mod test;
