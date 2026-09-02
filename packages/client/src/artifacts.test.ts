import { describe, it, expect, beforeEach } from "vitest";
import {
  MEMBERSHIP_WASM_URL,
  MEMBERSHIP_ZKEY_URL,
  configureArtifacts,
  getArtifactsConfig,
  resetArtifactsConfig,
  getArtifacts,
  prefetchMembershipArtifacts,
  getArtifactPrefetchProgress,
  subscribeToArtifactPrefetch,
  type ArtifactPrefetchProgress,
} from "./artifacts.js";

describe("circuit artifacts configuration and fetching", () => {
  beforeEach(() => {
    resetArtifactsConfig();
  });

  it("uses default URLs initially", () => {
    expect(MEMBERSHIP_WASM_URL).toBe("/circuits/membership.wasm");
    expect(MEMBERSHIP_ZKEY_URL).toBe("/circuits/membership_final.zkey");

    const config = getArtifactsConfig();
    expect(config.wasmUrl).toBe(MEMBERSHIP_WASM_URL);
    expect(config.zkeyUrl).toBe(MEMBERSHIP_ZKEY_URL);
    expect(config.fetchImpl).toBeUndefined();
  });

  it("updates wasmUrl and zkeyUrl when configured", () => {
    configureArtifacts({
      wasmUrl: "/subpath/circuits/membership.wasm",
      zkeyUrl: "/subpath/circuits/membership_final.zkey",
    });

    const config = getArtifactsConfig();
    expect(config.wasmUrl).toBe("/subpath/circuits/membership.wasm");
    expect(config.zkeyUrl).toBe("/subpath/circuits/membership_final.zkey");
  });

  it("supports partial configuration updates", () => {
    configureArtifacts({
      wasmUrl: "/custom/wasm.wasm",
    });

    let config = getArtifactsConfig();
    expect(config.wasmUrl).toBe("/custom/wasm.wasm");
    expect(config.zkeyUrl).toBe(MEMBERSHIP_ZKEY_URL);

    configureArtifacts({
      zkeyUrl: "/custom/zkey.zkey",
    });

    config = getArtifactsConfig();
    expect(config.wasmUrl).toBe("/custom/wasm.wasm");
    expect(config.zkeyUrl).toBe("/custom/zkey.zkey");
  });

  it("resets configuration back to defaults", () => {
    configureArtifacts({
      wasmUrl: "/custom/wasm.wasm",
      zkeyUrl: "/custom/zkey.zkey",
      fetchImpl: async () => new Response(""),
    });

    resetArtifactsConfig();

    const config = getArtifactsConfig();
    expect(config.wasmUrl).toBe(MEMBERSHIP_WASM_URL);
    expect(config.zkeyUrl).toBe(MEMBERSHIP_ZKEY_URL);
    expect(config.fetchImpl).toBeUndefined();
  });

  it("fetches artifacts using custom fetchImpl and configured URLs", async () => {
    const requestedUrls: string[] = [];
    const mockWasmBytes = new Uint8Array([1, 2, 3, 4]);
    const mockZkeyBytes = new Uint8Array([5, 6, 7, 8]);

    const customFetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url === "/subpath/circuits/membership.wasm") {
        return new Response(mockWasmBytes, {
          status: 200,
          headers: { "content-length": mockWasmBytes.byteLength.toString() },
        });
      }
      if (url === "/subpath/circuits/membership_final.zkey") {
        return new Response(mockZkeyBytes, {
          status: 200,
          headers: { "content-length": mockZkeyBytes.byteLength.toString() },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    configureArtifacts({
      wasmUrl: "/subpath/circuits/membership.wasm",
      zkeyUrl: "/subpath/circuits/membership_final.zkey",
      fetchImpl: customFetch as typeof fetch,
    });

    const progressSnapshots: ArtifactPrefetchProgress[] = [];
    const unsubscribe = subscribeToArtifactPrefetch((p) => {
      progressSnapshots.push({ ...p });
    });

    const artifacts = await getArtifacts();

    expect(requestedUrls).toEqual([
      "/subpath/circuits/membership.wasm",
      "/subpath/circuits/membership_final.zkey",
    ]);
    expect(Array.from(artifacts.wasm)).toEqual(Array.from(mockWasmBytes));
    expect(Array.from(artifacts.zkey)).toEqual(Array.from(mockZkeyBytes));

    const finalProgress = getArtifactPrefetchProgress();
    expect(finalProgress.status).toBe("ready");
    expect(finalProgress.fraction).toBe(1);
    expect(finalProgress.loaded).toBe(mockWasmBytes.byteLength + mockZkeyBytes.byteLength);

    unsubscribe();
  });

  it("supports Node-style file-reading fetchImpl without streaming reader", async () => {
    const mockWasmBytes = new Uint8Array([10, 20, 30]);
    const mockZkeyBytes = new Uint8Array([40, 50, 60]);

    // Simulated node:fs reader returning standard Response
    const fileReaderFetch = async (input: string | URL | Request) => {
      const filePath = typeof input === "string" ? input : input.toString();
      if (filePath.endsWith("membership.wasm")) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => null, // No content-length header
          },
          body: null, // No streaming getReader
          arrayBuffer: async () => mockWasmBytes.buffer,
        } as unknown as Response;
      }
      if (filePath.endsWith("membership_final.zkey")) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
          body: null,
          arrayBuffer: async () => mockZkeyBytes.buffer,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    };

    configureArtifacts({
      wasmUrl: "C:/circuits/build/membership_js/membership.wasm",
      zkeyUrl: "C:/circuits/build/membership_final.zkey",
      fetchImpl: fileReaderFetch as unknown as typeof fetch,
    });

    const artifacts = await prefetchMembershipArtifacts();

    expect(Array.from(artifacts.wasm)).toEqual(Array.from(mockWasmBytes));
    expect(Array.from(artifacts.zkey)).toEqual(Array.from(mockZkeyBytes));
  });

  it("handles fetch errors and publishes error status", async () => {
    configureArtifacts({
      wasmUrl: "/missing/membership.wasm",
      zkeyUrl: "/missing/membership_final.zkey",
      fetchImpl: async () => new Response("Not found", { status: 404 }),
    });

    await expect(getArtifacts()).rejects.toThrow("Unable to download circuit artifact (404)");

    const progress = getArtifactPrefetchProgress();
    expect(progress.status).toBe("error");
    expect(progress.error).toBeDefined();
    expect(progress.error?.message).toContain("404");
  });

  it("resets cached promise when reconfigured so fresh fetch occurs", async () => {
    let callCount = 0;
    const fetchA = async () => {
      callCount++;
      return new Response(new Uint8Array([1]));
    };
    const fetchB = async () => {
      callCount++;
      return new Response(new Uint8Array([2]));
    };

    configureArtifacts({ fetchImpl: fetchA as typeof fetch });
    const artifactsA = await getArtifacts();
    expect(artifactsA.wasm[0]).toBe(1);
    expect(callCount).toBe(2); // wasm + zkey

    // Reconfigure
    configureArtifacts({ fetchImpl: fetchB as typeof fetch });
    const artifactsB = await getArtifacts();
    expect(artifactsB.wasm[0]).toBe(2);
    expect(callCount).toBe(4); // 2 more fetches
  });
});
