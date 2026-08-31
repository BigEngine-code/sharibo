export const MEMBERSHIP_WASM_URL = "/circuits/membership.wasm";
export const MEMBERSHIP_ZKEY_URL = "/circuits/membership_final.zkey";

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
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Unable to download circuit artifact (${response.status})`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  const total = contentLengthHeader ? Number(contentLengthHeader) : null;
  const reader = response.body?.getReader();

  if (!reader) {
    signal?.throwIfAborted();
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress(buffer.byteLength, total ?? buffer.byteLength);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  // If the signal fires while we are blocked on reader.read(), cancel the
  // underlying stream so the read() promise rejects, then re-throw as
  // AbortError for uniform error handling.
  const abortHandler = () => reader.cancel();
  signal?.addEventListener("abort", abortHandler);

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress(loaded, total);
      }
    }
  } catch (err) {
    // reader.cancel() (triggered by the abort handler above) causes read() to
    // throw — convert that back to a recognisable AbortError.
    if (signal?.aborted) {
      throw new DOMException("Artifact download aborted", "AbortError");
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
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

async function fetchArtifacts(signal?: AbortSignal): Promise<ProverArtifacts> {
  signal?.throwIfAborted();

  publish({
    status: "loading",
    loaded: 0,
    total: null,
    fraction: null,
  });

  let loaded = 0;
  let total: number | null = null;

  const update = (artifactLoaded: number, artifactTotal: number | null) => {
    loaded += artifactLoaded;
    if (artifactTotal !== null) {
      total = (total ?? 0) + artifactTotal;
    }
    publish({
      status: "loading",
      loaded,
      total,
      fraction: total && total > 0 ? Math.min(loaded / total, 1) : null,
    });
  };

  const [wasmResponse, zkeyResponse] = await Promise.all([
    fetch(MEMBERSHIP_WASM_URL, { signal }),
    fetch(MEMBERSHIP_ZKEY_URL, { signal }),
  ]);

  let wasmLoaded = 0;
  let zkeyLoaded = 0;
  const wasmTotal = wasmResponse.headers.get("content-length");
  const zkeyTotal = zkeyResponse.headers.get("content-length");
  const knownTotal =
    wasmTotal && zkeyTotal ? Number(wasmTotal) + Number(zkeyTotal) : null;

  const read = async (
    response: Response,
    index: 0 | 1,
  ): Promise<Uint8Array> => {
    return readResponse(
      response,
      (value) => {
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
      },
      signal,
    );
  };

  const [wasm, zkey] = await Promise.all([
    read(wasmResponse, 0),
    read(zkeyResponse, 1),
  ]);

  loaded = wasm.byteLength + zkey.byteLength;
  total = knownTotal ?? loaded;
  publish({ status: "ready", loaded, total, fraction: 1 });
  return { wasm, zkey };
}

/**
 * Background prefetch — called once at module load with no signal so the
 * artifacts are ready by the time the user clicks "Claim". The returned
 * promise is memoised; callers that only need "give me the cached bytes"
 * should call this with no argument.
 *
 * When a signal is provided (e.g. from a React effect cleanup), a *separate*
 * signal-aware fetch is started and returned. This does NOT replace the
 * background singleton — if the background fetch already finished or is in
 * flight its result is still used by the no-signal path.
 */
export function prefetchMembershipArtifacts(signal?: AbortSignal): Promise<ProverArtifacts> {
  // Signal-aware callers get their own cancellable promise so an abort does
  // not poison the shared background cache.
  if (signal) {
    return fetchArtifacts(signal).catch((cause: unknown) => {
      // Don't publish an error for an intentional abort.
      if (cause instanceof DOMException && cause.name === "AbortError") {
        throw cause;
      }
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
      prefetchPromise = undefined; // allow retry
      throw error;
    });
  }
  return prefetchPromise;
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

installIndicator();
prefetchMembershipArtifacts();
