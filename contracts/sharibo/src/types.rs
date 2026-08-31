//! Data model types: `VerificationKey`, `Proof`, `Circle`, `DataKey`, `Error`.

use soroban_sdk::{
    contracterror, contracttype,
    crypto::bls12_381::{Fr, G1Affine, G2Affine},
    Address, Vec,
};

/// Groth16 verification key over BLS12-381.
///
/// Committed at circle creation time; every [`crate::Contract::claim`] proof is checked
/// against this key. Encodes the trusted-setup output of the Semaphore-style
/// circuit used by the off-chain prover.
#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    /// `G1` element from the toxic-waste combination `[α]·G1`.
    pub alpha: G1Affine,
    /// `G2` element `[β]·G2`.
    pub beta: G2Affine,
    /// `G2` element `[γ]·G2` — the public-input gate.
    pub gamma: G2Affine,
    /// `G2` element `[δ]·G2` — the private-witness gate.
    pub delta: G2Affine,
    /// `vk_x` basis: `ic[0] + Σ pub_input_i · ic[i+1]`.
    /// Length must be exactly `number_of_public_inputs + 1`.
    pub ic: Vec<G1Affine>,
}

/// A Groth16 proof over BLS12-381 produced by the off-chain prover.
///
/// The three group elements satisfy the standard pairing equation checked by
/// [`crate::Contract::verify_groth16`].
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    /// `A` commitment (the `π_a` G1 element).
    pub a: G1Affine,
    /// `B` commitment (the `π_b` G2 element).
    pub b: G2Affine,
    /// `C` commitment (the `π_c` G1 element).
    pub c: G1Affine,
}

/// On-chain state for a single Semaphore-style contribution circle.
///
/// A circle is a fixed-size ring of members (commitment [`Self::root`]) who
/// each contribute [`Self::contribution`] tokens per round. Once the pot is
/// full, one member can claim the entire pot per round using a ZK proof that
/// they are in the ring, with their nullifier preventing double-claims
/// across rounds.
#[contracttype]
#[derive(Clone)]
pub struct Circle {
    /// Owner of the circle. Required to call [`crate::Contract::cancel_circle`];
    /// does **not** gate funding or claiming — those are permissionless
    /// (fund) / zero-knowledge (claim).
    pub admin: Address,
    /// SAC token contract used for contributions and payouts.
    pub token: Address,
    /// Merkle root of the member-commitment tree. Committed at creation
    /// and used as a public input to every [`crate::Contract::claim`] proof; binds
    /// the set of members who are eligible to claim.
    pub root: Fr,
    /// Amount each [`crate::Contract::fund`] call deposits into [`Self::pot`].
    /// All contributors pay the same fixed amount per round.
    pub contribution: i128,
    /// Number of funders required to fill a round. `pot_target =
    /// contribution * size`; [`crate::Contract::claim`] requires exact equality.
    pub size: u32,
    /// Current round number. Increments by 1 after each successful
    /// [`crate::Contract::claim`]. Binds the proof's external_nullifier so a
    /// proof from round N cannot be replayed in round N+1.
    pub round: u32,
    /// Tokens deposited for the **current** round. Zeroed out after a
    /// successful claim or cancel (after refunds are issued).
    pub pot: i128,
    /// Verification key for the ZK circuit — all claims in this circle
    /// must prove against this key.
    pub vk: VerificationKey,
    /// Addresses that have funded the **current** round in order.
    /// Reset to empty after a successful `claim` or `cancel_circle`.
    /// Refunds on cancel are processed in this same order.
    /// Funding is unshielded (addresses are already public), so storing
    /// them here imposes no additional privacy loss — see issue #82.
    pub contributors: Vec<Address>,
    /// True once `cancel_circle` has been called; prevents any further
    /// `fund` or `claim` calls so the circle is permanently closed.
    pub cancelled: bool,
}

/// Storage keys for the contract's persistent and instance storage.
///
/// Exposed publicly because callers that read storage directly (e.g. SDK
/// indexers) need to know the exact `#[contracttype]` discriminants.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Instance-stored `u64` counter assigning the next free circle id.
    NextCircleId,
    /// Persistent-stored [`Circle`] keyed by its assigned id.
    Circle(u64),
    /// Persistent-stored `bool` marker: has `(circle_id, nullifier_hash)`
    /// already been used in a successful [`crate::Contract::claim`]? Prevents
    /// double-claims across rounds.
    Nullifier(u64, Fr),
}

/// Revertable error codes for every public entrypoint.
///
/// All panics use `panic_with_error!` so the discriminant is surfaced to
/// on-chain callers and off-chain simulations.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// No [`Circle`] is stored at the requested `circle_id`.
    CircleNotFound = 1,
    /// [`crate::Contract::claim`] called before the pot reached `contribution * size`.
    RoundNotFunded = 2,
    /// Proof's external_nullifier did not match `hash(circle_id, round)`.
    WrongRoundTag = 3,
    /// Nullifier has already been used in a prior claim for this circle.
    AlreadyClaimed = 4,
    /// Groth16 pairing check returned false.
    InvalidProof = 5,
    /// The round pot is already at `contribution * size`; further funds
    /// would permanently brick `claim`'s exact-equality check.
    RoundFull = 6,
    /// Checked pot arithmetic overflowed (absurd contribution/size).
    Overflow = 7,
    /// `cancel_circle` or `fund`/`claim` called on a cancelled circle.
    CircleCancelled = 8,
    /// `apply_fee` called with `fee_bps > 10_000` or `amount < 0`.
    InvalidFeeParams = 9,
}
