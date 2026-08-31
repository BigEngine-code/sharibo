import test from "node:test";
import assert from "node:assert";
import { fund, getCircle, getCircleCount, hasClaimed } from "./contract.js";

// ── Write-path retry tests ───────────────────────────────────────────────────

test("transient simulate-phase failure recovers", async () => {
  let simulateCalls = 0;
  let signAndSendCalls = 0;
  const mockTx = {
    signAndSend: async () => {
      signAndSendCalls++;
      return {
        result: undefined,
        sendTransactionResponse: { hash: "0xabc" },
      };
    },
  };

  const mockClient = {
    fund: (args: any) => {
      simulateCalls++;
      if (simulateCalls < 3) {
        throw new Error("RPC Error 429 Too Many Requests");
      }
      return mockTx;
    },
  };

  const result = await fund(mockClient, { circleId: 0n, from: "G..." });
  assert.strictEqual(simulateCalls, 3);
  assert.strictEqual(signAndSendCalls, 1);
  assert.strictEqual(result.hash, "0xabc");
});

test("post-submit failure surfaces immediately without a second submission", async () => {
  let simulateCalls = 0;
  let signAndSendCalls = 0;
  const mockTx = {
    signAndSend: async () => {
      signAndSendCalls++;
      throw new Error("RPC Error 504 Gateway Timeout during polling");
    },
  };

  const mockClient = {
    fund: (args: any) => {
      simulateCalls++;
      return mockTx;
    },
  };

  await assert.rejects(
    async () => await fund(mockClient, { circleId: 0n, from: "G..." }),
    /504/
  );
  assert.strictEqual(simulateCalls, 1);
  assert.strictEqual(signAndSendCalls, 1);
});

// ── Read-path tests — signAndSend must never be called ───────────────────────

/**
 * Builds a mock AssembledTransaction for a read function.
 * `signAndSend` is present but throws if called — so any test that reaches it
 * will fail loudly rather than silently succeeding.
 */
function readOnlyMockTx(returnValue: unknown) {
  return {
    result: returnValue,
    signAndSend: async () => {
      throw new Error(
        "signAndSend must not be called for read-only functions",
      );
    },
  };
}

test("getCircle does not call signAndSend", async () => {
  const mockCircle = {
    admin: "GADMIN",
    token: "CTOKEN",
    root: 42n,
    contribution: 1000n,
    size: 5,
    round: 1,
    pot: 0n,
  };

  const mockClient = {
    get_circle: (_args: any) => Promise.resolve(readOnlyMockTx(mockCircle)),
  };

  const result = await getCircle(mockClient, 0n);
  assert.deepStrictEqual(result, mockCircle);
});

test("getCircleCount does not call signAndSend", async () => {
  const mockClient = {
    get_circle_count: () => Promise.resolve(readOnlyMockTx(3n)),
  };

  const result = await getCircleCount(mockClient);
  assert.strictEqual(result, 3n);
});

test("hasClaimed does not call signAndSend", async () => {
  const mockClient = {
    has_claimed: (_args: any) => Promise.resolve(readOnlyMockTx(true)),
  };

  const result = await hasClaimed(mockClient, 0n, 999n);
  assert.strictEqual(result, true);
});

test("getCircle retries on transient RPC failure without signAndSend", async () => {
  let callCount = 0;
  const mockCircle = { admin: "G", token: "C", root: 1n, contribution: 1n, size: 5, round: 0, pot: 0n };

  const mockClient = {
    get_circle: (_args: any) => {
      callCount++;
      if (callCount < 3) throw new Error("RPC Error 429 Too Many Requests");
      return Promise.resolve(readOnlyMockTx(mockCircle));
    },
  };

  const result = await getCircle(mockClient, 0n);
  assert.strictEqual(callCount, 3);
  assert.deepStrictEqual(result, mockCircle);
});
