/**
 * Sharibo SDK error classes.
 *
 * See docs/errors.md for the full mapping between on-chain contract error
 * codes, these classes, user-facing messages, likely causes, and remedies.
 *
 * ## Class hierarchy
 *
 * ```
 * ShariboError
 * ├── ContractError      — on-chain revert; .code matches docs/errors.md table
 * ├── InvalidInputError  — bad argument caught client-side before any RPC call
 * ├── ProvingError       — snarkjs / witness generation failure
 * └── RpcError           — network or RPC transport failure
 * ```
 */

export class ShariboError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidInputError extends ShariboError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ProvingError extends ShariboError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class RpcError extends ShariboError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/**
 * Thrown when the Soroban contract reverts with a typed error code.
 *
 * `code` matches the discriminant of `pub enum Error` in
 * `contracts/sharibo/src/lib.rs`. Use the constants below for readable
 * comparisons. Full semantics for each code are in `docs/errors.md`.
 *
 * @example
 * ```ts
 * import { ContractError, ErrorCode } from "@sharibo/client";
 *
 * try {
 *   await claim(client, args);
 * } catch (err) {
 *   if (err instanceof ContractError) {
 *     if (err.code === ErrorCode.AlreadyClaimed) { ... }
 *   }
 * }
 * ```
 */
export class ContractError extends ShariboError {
  readonly code?: number;

  constructor(message: string, code?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

// ── Typed contract-error subclasses (error codes 1..8) ──────────────────────
// Each mirrors a `#[contracterror]` variant in contracts/sharibo/src/lib.rs.
// Callers can use `instanceof` to branch on the specific failure reason
// without parsing XDR dumps.

/** #1 – No Circle is stored at the requested circle_id. */
export class CircleNotFoundError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 1, options);
  }
}

/** #2 – Claim called before the pot reached contribution * size. */
export class RoundNotFundedError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 2, options);
  }
}

/** #3 – Proof's external_nullifier did not match hash(circle_id, round). */
export class WrongRoundTagError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 3, options);
  }
}

/** #4 – Nullifier has already been used in a prior claim for this circle. */
export class AlreadyClaimedError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 4, options);
  }
}

/** #5 – Groth16 pairing check returned false. */
export class InvalidProofError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 5, options);
  }
}

/** #6 – The round pot is already full; further funds would brick claim. */
export class RoundFullError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 6, options);
  }
}

/** #7 – Checked pot arithmetic overflowed. */
export class OverflowError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 7, options);
  }
}

/** #8 – cancel_circle or fund/claim called on a cancelled circle. */
export class CircleCancelledError extends ContractError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 8, options);
  }
}
