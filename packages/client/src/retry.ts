import { RpcError, ContractError } from "./errors.js";

/**
 * Options for the withRetry helper.
 *
 * @property maxAttempts - Maximum number of retry attempts (default: 5).
 * @property baseDelay - Initial delay in milliseconds (default: 100).
 * @property maxDelay - Maximum delay between retries in milliseconds (default: 30000).
 * @property isNonRetryable - Function to determine if an error is non-retryable.
 * @property sleep - Custom sleep function for testing (default: uses setTimeout).
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  isNonRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Computes the delay for a given attempt number using exponential backoff with jitter.
 *
 * Formula: min(baseDelay * 2^attempt * random[0.5, 1.5], maxDelay)
 *
 * @param attempt - The attempt number (0-indexed).
 * @param baseDelay - The base delay in milliseconds.
 * @param maxDelay - The maximum delay in milliseconds.
 * @returns The computed delay in milliseconds.
 */
export function computeDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = 0.5 + Math.random() * 1;
  const delayWithJitter = exponentialDelay * jitter;
  return Math.min(delayWithJitter, maxDelay);
}

/**
 * Retries a function with exponential backoff and jitter.
 *
 * The function retries transient errors (RPC errors) but gives up immediately on
 * non-retryable errors. Errors from the submit phase (signAndSend) are not retried.
 * If all attempts fail, the last error is rethrown with previous errors chained
 * via the cause property.
 *
 * @template T - The return type of the function.
 * @param fn - The function to retry.
 * @param options - Retry configuration.
 * @returns The result from the function on success, or rethrows the last error.
 * @throws If the function fails after maxAttempts, or if a non-retryable error occurs.
 */
export async function withRetry<T>(
  fn: () => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelay = options.baseDelay ?? 100;
  const maxDelay = options.maxDelay ?? 30000;
  const isNonRetryable = options.isNonRetryable ?? defaultIsNonRetryable;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Non-retryable errors are thrown immediately on the first attempt
      if (isNonRetryable(error)) {
        throw error;
      }

      // Last attempt: rethrow with cause chain
      if (attempt === maxAttempts - 1) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        const rpcError = new RpcError(`Failed after ${maxAttempts} attempts: ${message}`, {
          cause: lastError,
        });
        throw rpcError;
      }

      // Sleep before next attempt
      const delay = computeDelay(attempt, baseDelay, maxDelay);
      await sleep(delay);
    }
  }

  // This should never be reached due to the rethrow in the loop, but needed for type safety
  throw lastError;
}

/**
 * Default implementation: RpcError is retryable, ContractError is not.
 * Errors without a specific type are considered retryable (e.g., transient RPC failures).
 */
function defaultIsNonRetryable(error: unknown): boolean {
  if (error instanceof ContractError) {
    return true;
  }
  return false;
}

/**
 * Default sleep implementation using setTimeout.
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
