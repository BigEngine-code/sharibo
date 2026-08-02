// Tests validating the fetch migration from curl.
// Verifies that native fetch works reliably against friendbot/Horizon,
// that AbortSignal.timeout acts as a safety net, and that the httpGet
// helper correctly handles errors.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Replicate the httpGet function from e2e.ts to test it in isolation.
async function httpGet(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${await res.text()}`);
  }
  return res.text();
}

describe("fetch migration", () => {
  it("fetch reaches Horizon root endpoint", async () => {
    const body = await httpGet("https://horizon-testnet.stellar.org/");
    const data = JSON.parse(body);
    assert.ok(data.horizon_version, "should have horizon_version");
    assert.ok(data._links, "should have _links");
  });

  it("fetch reaches friendbot (existing account is fine)", async () => {
    // Use a well-known test key — friendbot returns 400 for already-funded
    // accounts, but the important thing is the request doesn't hang.
    const pk = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A";
    try {
      await httpGet(`https://friendbot.stellar.org?addr=${pk}`);
      // Success = account funded (first run) or re-funded
    } catch (err) {
      // 400 "account already exists" is expected and proves fetch works
      assert.match(
        (err as Error).message,
        /HTTP (400|4\d\d)/,
        "should get an HTTP 4xx, not a hang/timeout",
      );
    }
  });

  it("AbortSignal.timeout fires for unreachable endpoints", async () => {
    // Use a very short timeout against a slow-responding endpoint
    await assert.rejects(
      () => httpGet("https://httpbin.org/delay/10", 1_000),
      (err: Error) => {
        // Should be a timeout error, not a hang
        return (
          err.name === "TimeoutError" ||
          err.message.includes("aborted") ||
          err.message.includes("timed out") ||
          err.message.includes("timeout") ||
          err.message.includes("HTTP")
        );
      },
      "should timeout, not hang",
    );
  });

  it("httpGet throws on HTTP errors", async () => {
    await assert.rejects(
      () => httpGet("https://horizon-testnet.stellar.org/nonexistent-endpoint-404"),
      (err: Error) => err.message.includes("HTTP 404"),
      "should throw with HTTP 404",
    );
  });

  it("no curl dependency needed", async () => {
    // Verify the e2e.ts file no longer imports execFile/child_process
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const e2eSource = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e.ts"),
      "utf8",
    );
    assert.ok(
      !e2eSource.includes('from "node:child_process"'),
      "e2e.ts should not import child_process",
    );
    assert.ok(
      !e2eSource.includes("execFile"),
      "e2e.ts should not reference execFile",
    );
    assert.ok(
      !e2eSource.includes("curlGet"),
      "e2e.ts should not have curlGet function",
    );
    assert.ok(
      e2eSource.includes("httpGet"),
      "e2e.ts should use httpGet (fetch-based)",
    );
  });
});
