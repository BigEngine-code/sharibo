import {
  ContractError,
  RpcError,
  ProvingError,
  InvalidInputError,
} from "@sharibo/client";
import { FriendbotRetryableError } from "../lib/friendbot.js";

// Which step failed. The UI uses this to scope the retry action and to
// decide whether retrying is even meaningful (a failed claim, for example,
// can reuse an already-generated proof; a failed create cannot).
export type FailureStep = "start" | "fund" | "claim";

// A modelled failure: enough context for the UI to both explain what went
// wrong and to re-run exactly the action that failed. `retry` carries the
// step's retry closure so the notification (Toaster) never has to know
// which handler to call.
export interface Failure {
  step: FailureStep;
  message: string;
  // Retryable = transient (RPC / network). When false, the failure is
  // terminal and offering a retry would be pointless (e.g. AlreadyClaimed).
  retryable: boolean;
  retry: () => void;
}

// Terminal contract / input rejections that retrying cannot resolve.
function isTerminalError(e: unknown): boolean {
  if (e instanceof InvalidInputError) return true;
  if (e instanceof ProvingError) return true;
  // Any on-chain revert is a logic error, not a transient RPC blip, so it is
  // terminal by default — with AlreadyClaimed / InvalidProof called out
  // explicitly below for message-based detection.
  if (e instanceof ContractError) return true;
  const msg = e instanceof Error ? e.message : "";
  if (/already.?claimed|invalid.?proof/i.test(msg)) return true;
  return false;
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) {
    return /fetch|network|timeout|abort/i.test(e.message);
  }
  const msg = e instanceof Error ? e.message : "";
  return /failed to fetch|network|timeout|econnrefused|etimedout|connection/i.test(msg);
}

// Retryable = transient (RPC, network). Everything else is treated as
// terminal, with AlreadyClaimed / InvalidProof explicitly non-retryable.
// An unrecognized error is optimistically considered retryable so a user
// facing a transient failure still gets a path forward.
export function isRetryableError(e: unknown): boolean {
  if (e instanceof RpcError) return true;
  if (e instanceof FriendbotRetryableError) return true;
  if (isTerminalError(e)) return false;
  if (isNetworkError(e)) return true;
  return true;
}

export function failureMessage(e: unknown): string {
  if (e instanceof FriendbotRetryableError) {
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return "Something went wrong. Please retry.";
}
