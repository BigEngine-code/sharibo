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

export class ContractError extends ShariboError {
  readonly code?: number;

  constructor(message: string, code?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * A human-readable description of a contract error code.
 *
 * @property code - The numeric error discriminant (matches
 *   `contracts/sharibo/src/lib.rs`'s `Error` enum).
 * @property name - The `Error` enum variant name (e.g. `"AlreadyClaimed"`).
 * @property message - A user-facing sentence describing what happened.
 * @property hint - A short explanation of why, or what the user can do next.
 */
export interface ContractErrorDescription {
  code: number;
  name: string;
  message: string;
  hint: string;
}

// Mirrors contracts/sharibo/src/lib.rs's `Error` enum discriminants 1-5 —
// the ones `Contract::claim` (and, for #1, `get_circle`/`cancel_circle`) can
// panic with. Codes 6-8 (RoundFull, Overflow, CircleCancelled) aren't
// covered by Issue #53's scope and fall through to the raw-string fallback
// below like any other unrecognized code.
const CONTRACT_ERROR_DESCRIPTIONS: Record<number, Omit<ContractErrorDescription, "code">> = {
  1: {
    name: "CircleNotFound",
    message: "No circle exists with this ID.",
    hint: "Double-check the circle ID and that you're pointed at the right network/contract — it may never have been created, or the contract was redeployed.",
  },
  2: {
    name: "RoundNotFunded",
    message: "This round hasn't been fully funded yet.",
    hint: "The pot must reach exactly contribution × size before anyone can claim — keep funding until the round is complete.",
  },
  3: {
    name: "WrongRoundTag",
    message: "This proof doesn't match the circle's current round.",
    hint: "Proofs are bound to a specific circle and round; generate a fresh proof for the current round rather than reusing one from an earlier round.",
  },
  4: {
    name: "AlreadyClaimed",
    message: "This proof's nullifier was already used; each member can claim only once per circle.",
    hint: "If you believe this is wrong, confirm you're using the identity that hasn't claimed yet — every member gets exactly one claim across all rounds of this circle.",
  },
  5: {
    name: "InvalidProof",
    message: "The zero-knowledge proof failed verification.",
    hint: "The proof doesn't match the circle's committed membership root — make sure you're proving with the correct identity and Merkle path for this circle.",
  },
};

/**
 * Maps a Sharibo contract error code (1-5) to a human-readable description.
 *
 * The five codes are stable and documented in
 * `contracts/sharibo/src/lib.rs`'s `Error` enum: 1 CircleNotFound,
 * 2 RoundNotFunded, 3 WrongRoundTag, 4 AlreadyClaimed, 5 InvalidProof.
 *
 * @param code - The numeric error discriminant from a `Error(Contract, #N)`
 *   failure.
 * @returns The description for a known code, or `undefined` for anything
 *   else (codes 6+ or a number that isn't a Sharibo error code at all) — the
 *   caller should fall back to displaying the raw error string in that case.
 */
export function describeContractError(code: number): ContractErrorDescription | undefined {
  const entry = CONTRACT_ERROR_DESCRIPTIONS[code];
  if (!entry) return undefined;
  return { code, ...entry };
}

// Soroban surfaces a rejected host function as a diagnostic string embedding
// `Error(Contract, #<code>)` (see soroban-sdk's Error Display impl). The
// stellar-sdk contract Client's `signAndSend()` throws a plain `Error` whose
// `.message` contains this string — confirmed by the existing raw-string
// checks in scripts/e2e.ts's replay-rejection path (`message.includes(
// "Error(Contract, #4)")`) and scripts/smoke.ts (`msg.includes(
// "Error(Contract, #1)")`), both matching against real signAndSend()
// rejections. No SDK-level structured error is exposed here — this pattern
// is the only stable extraction point.
const CONTRACT_ERROR_PATTERN = /Error\(Contract,\s*#(\d+)\)/;

/**
 * Extracts the numeric Sharibo contract error code out of a failure thrown
 * by `signAndSend()` (or anything wrapping one), if it's a contract
 * rejection at all.
 *
 * @param error - Anything caught from a contract call, typically the
 *   `Error` thrown by the stellar-sdk contract Client's `signAndSend()`.
 * @returns The parsed code, or `undefined` if `error` isn't a contract
 *   rejection in the recognized `Error(Contract, #N)` shape.
 */
export function parseContractErrorCode(error: unknown): number | undefined {
  if (error instanceof ContractError && typeof error.code === "number") {
    return error.code;
  }

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  if (!message) return undefined;

  const match = message.match(CONTRACT_ERROR_PATTERN);
  if (!match) return undefined;

  return Number(match[1]);
}

/**
 * Turns any error caught from a contract call into display-ready text.
 *
 * Tries to parse a Sharibo contract error code out of `error` and, if it's
 * one of the five known codes, renders `"<Name>: <message> <hint>"`. Falls
 * back to the error's raw message (or a generic string) for anything else —
 * an unrecognized code, a network/RPC error, or a non-Error throw — so the
 * UI never breaks on an error it doesn't specifically know about.
 *
 * @param error - Anything caught from a contract call.
 * @returns Human-readable text safe to show directly in the UI.
 */
export function describeError(error: unknown): string {
  const code = parseContractErrorCode(error);
  const description = code !== undefined ? describeContractError(code) : undefined;
  if (description) {
    return `${description.name}: ${description.message} ${description.hint}`;
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please retry.";
}
