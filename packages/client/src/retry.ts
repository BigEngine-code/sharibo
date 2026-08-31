import { SdkEventEmitter } from "./events.js";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY = 1000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  emitter?: SdkEventEmitter,
  maxRetries = DEFAULT_MAX_RETRIES,
  initialDelay = DEFAULT_INITIAL_DELAY
): Promise<T> {
  let attempt = 1;
  let delay = initialDelay;

  while (true) {
    emitter?.emit({ type: "rpc:attempt" });
    const start = Date.now();
    try {
      const result = await fn();
      emitter?.emit({ type: "rpc:success", duration: Date.now() - start });
      return result;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      emitter?.emit({ type: "rpc:retry", attempt, delay, error });
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
      delay *= 2;
    }
  }
}
