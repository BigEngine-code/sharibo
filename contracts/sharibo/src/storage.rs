//! Storage TTL constants and helper functions.

use soroban_sdk::Env;

/// Minimum remaining TTL (in ledgers) that triggers a `extend_ttl` call.
///
/// Every write entrypoint (`create_circle`, `fund`, `claim`, `cancel_circle`)
/// calls `extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO)`. The Soroban host
/// only performs the extension when the entry's current TTL has fallen below
/// `LEDGER_THRESHOLD`; if it is already higher, the call is a no-op. Setting
/// this to 100 ledgers (≈ 8 minutes at ~5 s/ledger) means that any write
/// performed in the last few minutes of a circle's live window will refresh it
/// to the full `LEDGER_EXTEND_TO` budget.
pub const LEDGER_THRESHOLD: u32 = 100;

/// TTL (in ledgers) that persistent and instance entries are extended to on
/// each write.
///
/// 500,000 ledgers × 5 s/ledger ≈ **29 days** of activity-triggered liveness.
///
/// The Soroban network cap for persistent entry TTL is **535,679 ledgers**
/// (≈ 30 days; see <https://developers.stellar.org/docs/tools/cli/cookbook/extend-contract-wasm>).
/// `LEDGER_EXTEND_TO` is intentionally set just below that ceiling to leave a
/// small safety margin while still giving circles close to the maximum window.
///
/// If a circle goes dormant (no `fund`, `claim`, or `cancel_circle` call) for
/// longer than this window, its persistent entry will be archived. An operator
/// must then submit a `RestoreFootprintOp` (via `stellar contract restore`)
/// before any further interaction is possible. See `contracts/README.md §Storage
/// lifetime` for the runbook.
pub const LEDGER_EXTEND_TO: u32 = 500_000;

// Compile-time sanity check: the threshold at which we re-extend must be
// strictly less than the target we extend to, or the extension can never
// make progress.
const _: () = assert!(
    LEDGER_THRESHOLD < LEDGER_EXTEND_TO,
    "LEDGER_THRESHOLD must be strictly less than LEDGER_EXTEND_TO",
);

/// Extend instance storage TTL on every write entrypoint.
///
/// `NextCircleId` lives in instance storage; if the instance entry is archived
/// on a quiet network and later restored, `NextCircleId` would reset to 0 and
/// `create_circle` would silently overwrite circle 0. Extending here ensures
/// the counter outlives quiet periods (see `contracts/README.md §Instance-storage
/// archival`).
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
}
