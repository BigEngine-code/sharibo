//! Protocol fee calculation helper.

use soroban_sdk::Env;

use crate::types::Error;

/// Split `amount` into a protocol fee and the net payout.
///
/// # Formula
///
/// ```text
/// fee = fee_bps * amount / 10_000   (integer truncation — rounds down)
/// net = amount - fee
/// ```
///
/// Because `fee` is truncated, the sum `fee + net` is always exactly
/// equal to `amount` — no tokens are created or destroyed.
///
/// # Overflow safety
///
/// The intermediate product `fee_bps * amount` would overflow `i128` for
/// large amounts if computed naively. The implementation avoids this by
/// splitting `amount` into a quotient and remainder:
///
/// ```text
/// fee = (amount / 10_000) * fee_bps + (amount % 10_000) * fee_bps / 10_000
/// ```
///
/// Both terms fit in `i128` for all `amount >= 0` and `fee_bps <= 10_000`.
///
/// # Arguments
///
/// * `fee_bps` — fee in basis points; must be in `0..=10_000` (i.e.
///   0 % – 100 %). Values outside this range are **rejected** with
///   [`Error::InvalidFeeParams`] — they are never silently accepted.
/// * `amount` — gross token amount to split. Must be non-negative;
///   negative values are **rejected** with [`Error::InvalidFeeParams`].
///
/// # Returns
///
/// `(fee, net)` where `fee + net == amount`.
///
/// # Errors
///
/// * [`Error::InvalidFeeParams`] — `fee_bps > 10_000` or `amount < 0`.
pub fn apply_fee(env: &Env, fee_bps: u32, amount: i128) -> (i128, i128) {
    use soroban_sdk::panic_with_error;
    if fee_bps > 10_000 || amount < 0 {
        panic_with_error!(env, Error::InvalidFeeParams);
    }
    // Split to avoid overflow: amount = q * 10_000 + r, so
    //   fee_bps * amount = fee_bps * q * 10_000 + fee_bps * r
    // Dividing by 10_000:
    //   fee = fee_bps * q + fee_bps * r / 10_000
    // Both `fee_bps * q` and `fee_bps * r` fit in i128 for all valid inputs
    // (q <= i128::MAX / 10_000 and r < 10_000, fee_bps <= 10_000).
    let bps = fee_bps as i128;
    let q = amount / 10_000;
    let r = amount % 10_000;
    let fee = bps * q + bps * r / 10_000;
    let net = amount - fee;
    (fee, net)
}
