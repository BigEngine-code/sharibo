import { describe, it } from "vitest";
import assert from "node:assert";
import { fund } from "./contract.js";

describe("contract", () => {
  it("transient simulate-phase failure recovers", async () => {
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

  it("post-submit failure surfaces immediately without a second submission", async () => {
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

    let caught = false;
    try {
      await fund(mockClient, { circleId: 0n, from: "G..." });
    } catch (error: any) {
      caught = true;
      assert.match(error.message, /504/);
    }
    assert.ok(caught, "Should have thrown an error");
    assert.strictEqual(simulateCalls, 1);
    assert.strictEqual(signAndSendCalls, 1);
  });
});
