import { describe, it } from "vitest";
import assert from "node:assert";
import { withRetry, computeDelay } from "./retry.js";
import { RpcError, ContractError } from "./errors.js";

// ============================================================================
// Tests for computeDelay function
// ============================================================================

describe("computeDelay", () => {
  it("returns base delay for attempt 0", () => {
    const delay = computeDelay(0, 100, 30000);
    // With attempt 0: baseDelay * 2^0 * jitter[0.5, 1.5]
    // = 100 * 1 * jitter = 100 * jitter
    // jitter is deterministic in this test due to seeding, should be within [50, 150]
    assert.ok(delay >= 50 && delay <= 150, `delay ${delay} should be in [50, 150]`);
  });

  it("exponentially increases with attempt number", () => {
    // Using attempt numbers but accounting for randomness
    const delay0 = computeDelay(0, 100, 30000);
    const delay1 = computeDelay(1, 100, 30000);
    const delay2 = computeDelay(2, 100, 30000);
    // Attempt 1 should be roughly 2x attempt 0 (before jitter)
    // Attempt 2 should be roughly 4x attempt 0 (before jitter)
    assert.ok(delay1 > delay0, "delay1 should be > delay0");
    assert.ok(delay2 > delay1, "delay2 should be > delay1");
  });

  it("respects maxDelay cap", () => {
    const maxDelay = 1000;
    const delay = computeDelay(10, 100, maxDelay);
    assert.ok(delay <= maxDelay, `delay ${delay} should not exceed maxDelay ${maxDelay}`);
  });

  it("applies jitter within bounds", () => {
    // Run multiple times to verify jitter stays within [0.5, 1.5]
    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const delay = computeDelay(0, 100, 30000);
      // Jitter factor is between 0.5 and 1.5, so delay should be [50, 150]
      assert.ok(delay >= 50 && delay <= 150, `delay ${delay} should be in [50, 150]`);
    }
  });
});

// ============================================================================
// Tests for withRetry function
// ============================================================================

describe("withRetry", () => {
  it("succeeds on first attempt", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      return "success";
    });

    assert.strictEqual(result, "success");
    assert.strictEqual(attempts, 1);
  });

  it("retries on transient failure and succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Transient failure");
        }
        return "success";
      },
      { sleep: async () => {} }, // Fake sleep to avoid actual delays
    );

    assert.strictEqual(result, "success");
    assert.strictEqual(attempts, 3);
  });

  it("gives up after maxAttempts", async () => {
    let attempts = 0;
    const maxAttempts = 3;
    let caughtError: unknown;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("Always fails");
        },
        { maxAttempts, sleep: async () => {} },
      );
    } catch (error) {
      caughtError = error;
    }

    assert.strictEqual(attempts, maxAttempts);
    assert.ok(caughtError instanceof RpcError, "Should be an RpcError");
    assert.match((caughtError as RpcError).message, /Failed after 3 attempts/);
  });

  it("throws non-retryable error immediately", async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    let caughtError: unknown;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new ContractError("Contract validation failed", 123);
        },
        { sleep: fakeSleep },
      );
    } catch (error) {
      caughtError = error;
    }

    assert.strictEqual(attempts, 1, "Should fail on first attempt");
    assert.strictEqual(sleepCalls.length, 0, "Should not sleep on non-retryable error");
    assert.ok(caughtError instanceof ContractError, "Should be a ContractError");
    assert.strictEqual((caughtError as ContractError).code, 123);
  });

  it("preserves cause chain for retryable errors", async () => {
    let attempts = 0;
    let caughtError: unknown;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("Original transient error");
        },
        { maxAttempts: 2, sleep: async () => {} },
      );
    } catch (error) {
      caughtError = error;
    }

    assert.ok(caughtError instanceof RpcError, "Should be an RpcError");
    assert.ok(
      (caughtError as RpcError).cause instanceof Error,
      "error.cause should be the original error",
    );
    assert.strictEqual(
      ((caughtError as RpcError).cause as Error).message,
      "Original transient error",
      "cause message should match original",
    );
  });

  it("uses exponential backoff delays", async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    const maxAttempts = 4;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("Always fails");
        },
        { maxAttempts, baseDelay: 100, maxDelay: 30000, sleep: fakeSleep },
      );
    } catch {
      // Expected to fail
    }

    // Should have 3 sleep calls (attempts 0, 1, 2; not after attempt 3 which fails)
    assert.strictEqual(sleepCalls.length, 3);

    // Delays should increase exponentially (accounting for jitter)
    // Attempt 0: 100 * 2^0 = 100 with jitter [50, 150]
    // Attempt 1: 100 * 2^1 = 200 with jitter [100, 300]
    // Attempt 2: 100 * 2^2 = 400 with jitter [200, 600]
    assert.ok(sleepCalls[0] >= 50 && sleepCalls[0] <= 150);
    assert.ok(sleepCalls[1] >= 100 && sleepCalls[1] <= 300);
    assert.ok(sleepCalls[2] >= 200 && sleepCalls[2] <= 600);
  });

  it("respects maxDelay in backoff", async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    const maxDelay = 500;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("Always fails");
        },
        { maxAttempts: 5, baseDelay: 100, maxDelay, sleep: fakeSleep },
      );
    } catch {
      // Expected to fail
    }

    // All delays should respect maxDelay
    for (const delay of sleepCalls) {
      assert.ok(delay <= maxDelay, `delay ${delay} should not exceed maxDelay ${maxDelay}`);
    }
  });

  it("works with synchronous functions", async () => {
    let attempts = 0;
    const result = await withRetry(() => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Sync failure");
      }
      return "sync success";
    }, { sleep: async () => {} });

    assert.strictEqual(result, "sync success");
    assert.strictEqual(attempts, 2);
  });

  it("handles RpcError as retryable", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new RpcError("RPC timeout");
        }
        return "recovered";
      },
      { sleep: async () => {} },
    );

    assert.strictEqual(result, "recovered");
    assert.strictEqual(attempts, 2);
  });

  it("chains multiple errors as cause", async () => {
    let attempts = 0;
    let caughtError: unknown;
    try {
      await withRetry(
        async () => {
          attempts++;
          throw new Error(`Attempt ${attempts} failed`);
        },
        { maxAttempts: 2, sleep: async () => {} },
      );
    } catch (error) {
      caughtError = error;
    }

    // The final error should have the last error as its cause
    assert.ok(caughtError, "error should exist");
    assert.ok((caughtError as any).cause, "error should have a cause");
  });

  it("uses default options correctly", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Failure");
      }
      return "success";
    }); // No options, but we need to mock sleep at runtime

    // Since we don't provide sleep option, this will use real setTimeout
    // This test just verifies default options don't cause issues
    assert.strictEqual(result, "success");
    assert.strictEqual(attempts, 2);
  });

  it("empty error message handling", async () => {
    let caughtError: unknown;
    try {
      await withRetry(
        () => {
          throw null; // Non-Error object
        },
        { maxAttempts: 1, sleep: async () => {} },
      );
    } catch (error) {
      caughtError = error;
    }

    assert.ok(caughtError instanceof RpcError, "Should be an RpcError");
    assert.match((caughtError as RpcError).message, /Failed after 1 attempts/);
    assert.strictEqual((caughtError as RpcError).cause, null);
  });
});
