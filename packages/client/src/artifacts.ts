export const MEMBERSHIP_WASM_URL = "/circuits/membership.wasm";
export const MEMBERSHIP_ZKEY_URL = "/circuits/membership_final.zkey";

export interface ArtifactsConfig {
  wasmUrl?: string;
  zkeyUrl?: string;
  fetchImpl?: typeof fetch | ((input: string | URL | Request, init?: RequestInit) => Promise<Response>);
}

let configuredWasmUrl = MEMBERSHIP_WASM_URL;
let configuredZkeyUrl = MEMBERSHIP_ZKEY_URL;
let configuredFetchImpl:
  | typeof fetch
  | ((input: string | URL | Request, init?: RequestInit) => Promise<Response>)
  | undefined;

export type ArtifactPrefetchStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface ArtifactPrefetchProgress {
  status: ArtifactPrefetchStatus;
  loaded: number;
  total: number | null;
  fraction: number | null;
  error?: Error;
}

export interface ProverArtifacts {
  wasm: Uint8Array;
  zkey: Uint8Array;
}

type Listener = (progress: ArtifactPrefetchProgress) => void;

let prefetchPromise: Promise<ProverArtifacts> | undefined;
let currentProgress: ArtifactPrefetchProgress = {
  status: "idle",
  loaded: 0,
  total: null,
  fraction: null,
};
const listeners = new Set<Listener>();
let indicatorInstalled = false;

/**
 * Configures the circuit artifact locations and optional custom fetch implementation.
 *
 * @param config - Configuration options for artifact URLs and fetch implementation.
 */
export function configureArtifacts(config: ArtifactsConfig): void {
  if (config.wasmUrl !== undefined) {
    configuredWasmUrl = config.wasmUrl;
  }
  if (config.zkeyUrl !== undefined) {
    configuredZkeyUrl = config.zkeyUrl;
  }
  if (config.fetchImpl !== undefined) {
    configuredFetchImpl = config.fetchImpl;
  }
  prefetchPromise = undefined;
  publish({
    status: "idle",
    loaded: 0,
    total: null,
    fraction: null,
  });
}

/**
 * Returns the currently active artifact configuration.
 */
export function getArtifactsConfig(): {
  wasmUrl: string;
  zkeyUrl: string;
  fetchImpl?: typeof fetch | ((input: string | URL | Request, init?: RequestInit) => Promise<Response>);
} {
  return {
    wasmUrl: configuredWasmUrl,
    zkeyUrl: configuredZkeyUrl,
    fetchImpl: configuredFetchImpl,
  };
}

/**
 * Resets artifact configuration and prefetch state back to initial defaults.
 */
export function resetArtifactsConfig(): void {
  configuredWasmUrl = MEMBERSHIP_WASM_URL;
  configuredZkeyUrl = MEMBERSHIP_ZKEY_URL;
  configuredFetchImpl = undefined;
  prefetchPromise = undefined;
  publish({
    status: "idle",
    loaded: 0,
    total: null,
    fraction: null,
  });
}

function publish(progress: ArtifactPrefetchProgress): void {
  currentProgress = progress;
  for (const listener of listeners) {
    listener(progress);
  }
  updateIndicator(progress);
}

async function readResponse(
  response: Response,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Unable to download circuit artifact (${response.status})`);
  }

  const contentLengthHeader = response.headers?.get?.("content-length");
  const total = contentLengthHeader ? Number(contentLengthHeader) : null;
  const reader = typeof response.body?.getReader === "function" ? response.body.getReader() : undefined;

  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress(buffer.byteLength, total ?? buffer.byteLength);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(loaded, total ?? loaded);
  return result;
}

async function fetchArtifacts(): Promise<ProverArtifacts> {
  publish({
    status: "loading",
    loaded: 0,
    total: null,
    fraction: null,
  });

  const fetchFn = configuredFetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error(
      "fetch is not available in this environment. Provide a custom fetchImpl via configureArtifacts({ fetchImpl }).",
    );
  }

  const [wasmResponse, zkeyResponse] = await Promise.all([
    fetchFn(configuredWasmUrl),
    fetchFn(configuredZkeyUrl),
  ]);

  let wasmLoaded = 0;
  let zkeyLoaded = 0;
  const wasmTotal = wasmResponse.headers?.get?.("content-length");
  const zkeyTotal = zkeyResponse.headers?.get?.("content-length");
  const knownTotal =
    wasmTotal && zkeyTotal ? Number(wasmTotal) + Number(zkeyTotal) : null;

  const read = async (
    response: Response,
    index: 0 | 1,
  ): Promise<Uint8Array> => {
    return readResponse(response, (value) => {
      if (index === 0) wasmLoaded = value;
      else zkeyLoaded = value;
      const currentLoaded = wasmLoaded + zkeyLoaded;
      publish({
        status: "loading",
        loaded: currentLoaded,
        total: knownTotal,
        fraction:
          knownTotal && knownTotal > 0
            ? Math.min(currentLoaded / knownTotal, 1)
            : null,
      });
    });
  };

  const [wasm, zkey] = await Promise.all([
    read(wasmResponse, 0),
    read(zkeyResponse, 1),
  ]);

  const loaded = wasm.byteLength + zkey.byteLength;
  const total = knownTotal ?? loaded;
  publish({ status: "ready", loaded, total, fraction: 1 });
  return { wasm, zkey };
}

export function prefetchMembershipArtifacts(): Promise<ProverArtifacts> {
  if (!prefetchPromise) {
    prefetchPromise = fetchArtifacts().catch((cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      publish({
        status: "error",
        loaded: currentProgress.loaded,
        total: currentProgress.total,
        fraction: currentProgress.fraction,
        error,
      });
      throw error;
    });
  }
  return prefetchPromise;
}

/**
 * Retrieves the compiled circuit artifacts, prefetching them if not already started.
 */
export function getArtifacts(): Promise<ProverArtifacts> {
  return prefetchMembershipArtifacts();
}

export function getArtifactPrefetchProgress(): ArtifactPrefetchProgress {
  return currentProgress;
}

export function subscribeToArtifactPrefetch(
  listener: Listener,
): () => void {
  listeners.add(listener);
  listener(currentProgress);
  return () => listeners.delete(listener);
}

function updateIndicator(progress: ArtifactPrefetchProgress): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById("sharibo-prover-preparation");
  if (!element) return;

  if (progress.status === "ready") {
    element.remove();
    return;
  }

  element.textContent =
    progress.status === "error"
      ? "Prover preparation failed"
      : progress.fraction === null
        ? "Preparing prover…"
        : `Preparing prover… ${Math.round(progress.fraction * 100)}%`;
}

function installIndicator(): void {
  if (indicatorInstalled || typeof document === "undefined") return;
  indicatorInstalled = true;

  const add = () => {
    if (document.getElementById("sharibo-prover-preparation")) return;
    const element = document.createElement("div");
    element.id = "sharibo-prover-preparation";
    element.setAttribute("aria-live", "polite");
    element.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:1000;padding:6px 10px;border-radius:6px;background:rgba(20,25,35,.78);color:#b9c2d0;font:12px system-ui,sans-serif;pointer-events:none";
    document.body.appendChild(element);
    updateIndicator(currentProgress);
  };

  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
}

// NOTE: This module no longer runs any side effects on import.
// Browser entry points that want the "Preparing prover…" toast and background
// prefetch should call installIndicatorAndPrefetch() explicitly after import,
// or import from the browser-specific entry point.

/**
 * Installs the "Preparing prover…" DOM toast and starts pre-fetching the
 * circuit artifacts in the background.
 *
 * Call this once from a browser entry point (e.g. main.tsx or index.browser.ts).
 * It is a no-op in Node (document is undefined).
 */
export function installIndicatorAndPrefetch(): void {
  installIndicator();
  prefetchMembershipArtifacts().catch(() => {
    // Errors are surfaced through subscribeToArtifactPrefetch; swallow
    // here so an unhandled rejection doesn't abort the page.
  });
}
