import { groth16 } from "snarkjs";
import {
  prefetchMembershipArtifacts,
  type ProverArtifacts,
} from "./artifacts";
import { TREE_LEVELS } from "./config";
import { FR_MODULUS } from "./identity";

export interface ProofResult {
  proof: unknown;
  publicSignals: string[];
  provingTimeMs: number;
  artifactDownloadTimeMs: number;
  totalTimeMs: number;
}

/** Typed circuit inputs for the membership circuit. */
export interface CircuitInput {
  identityNullifier: bigint;
  identitySecret: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
  externalNullifier: bigint;
}

export interface ProveOptions {
  /** Optional AbortSignal to cancel the operation.
   *
   * **Artifact download:** the fetch and stream-read are wired directly to the
   * signal — cancellation is immediate and clean.
   *
   * **Proof generation:** `snarkjs`' `groth16.fullProve` does not accept a
   * signal and cannot be interrupted once started.  When the signal fires
   * mid-proof, `fullProve` / `prove` / `generateProof` reject with a
   * `DOMException("Aborted", "AbortError")` so the *caller* stops waiting,
   * but the underlying WASM computation continues to completion in the
   * background.  The result is silently discarded.  This is the best
   * available behaviour given the library's API.
   */
  signal?: AbortSignal;
}

/** Validates a {@link CircuitInput} against the current tree depth.
 *  Throws a descriptive {@link Error} on the first violation found.
 */
export function validateCircuitInput(
  input: CircuitInput,
  levels: number = TREE_LEVELS,
): void {
  if (input.pathElements.length !== levels) {
    throw new Error(
      `pathElements: expected ${levels}, got ${input.pathElements.length}`,
    );
  }
  if (input.pathIndices.length !== levels) {
    throw new Error(
      `pathIndices: expected ${levels}, got ${input.pathIndices.length}`,
    );
  }
  for (let i = 0; i < input.pathIndices.length; i++) {
    const idx = input.pathIndices[i];
    if (idx !== 0 && idx !== 1) {
      throw new Error(`pathIndices[${i}]: expected 0 or 1, got ${idx}`);
    }
  }

  const fieldScalars: Array<[string, bigint]> = [
    ["identityNullifier", input.identityNullifier],
    ["identitySecret", input.identitySecret],
    ["root", input.root],
    ["externalNullifier", input.externalNullifier],
    ...input.pathElements.map(
      (e, i) => [`pathElements[${i}]`, e] as [string, bigint],
    ),
  ];
  for (const [name, value] of fieldScalars) {
    if (value < 0n || value >= FR_MODULUS) {
      throw new Error(
        `${name}: must be in [0, FR_MODULUS), got ${value}`,
      );
    }
  }
}

let artifactPromise: Promise<ProverArtifacts> | undefined;

function getArtifacts(signal?: AbortSignal): Promise<ProverArtifacts> {
  // If a signal is provided, use a dedicated cancellable fetch so an abort
  // does not poison the shared background cache.
  if (signal) {
    return prefetchMembershipArtifacts(signal);
  }
  if (!artifactPromise) {
    artifactPromise = prefetchMembershipArtifacts();
  }
  return artifactPromise;
}

// Internal helper: races a snarkjs prove call against an optional abort signal.
// snarkjs does not accept an AbortSignal, so we use Promise.race — the WASM
// worker keeps running in the background but the caller stops waiting.
async function raceProve(
  input: Record<string, unknown>,
  wasm: string | Uint8Array,
  zkey: string | Uint8Array,
  signal: AbortSignal | undefined,
): Promise<{ proof: unknown; publicSignals: string[] }> {
  const provePromise = groth16.fullProve(input, wasm, zkey);

  if (!signal) return provePromise;

  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });

  return Promise.race([provePromise, abortPromise]);
}

/**
 * Generates a membership proof using the already-downloaded binary circuit
 * artifacts. The proving timer intentionally starts after this await so that
 * network time is not reported as proving/compute time.
 */
export async function fullProve(
  input: Record<string, unknown>,
  options?: ProveOptions,
): Promise<ProofResult> {
  const { signal } = options ?? {};

  const artifacts = await getArtifacts(signal);

  // Check before entering the un-interruptible WASM phase.
  signal?.throwIfAborted();

  const provingStartedAt = performance.now();
  const result = await raceProve(input, artifacts.wasm, artifacts.zkey, signal);
  const provingTimeMs = Math.max(0, performance.now() - provingStartedAt);

  return {
    ...result,
    provingTimeMs,
    artifactDownloadTimeMs: 0,
    totalTimeMs: provingTimeMs,
  };
}

export async function prove(
  input: Record<string, unknown>,
  options?: ProveOptions,
): Promise<ProofResult> {
  return fullProve(input, options);
}

/**
 * Generates a membership proof with explicitly supplied circuit artifact paths
 * or buffers — useful in Node.js (e2e scripts, benchmarks) where the module-
 * level fetch cache is not in play.  In a browser, prefer {@link fullProve}
 * which reuses the prefetched artifacts automatically.
 *
 * Accepts an optional {@link ProveOptions} as the fourth argument, including
 * an `AbortSignal`.  See {@link ProveOptions} for cancellation semantics.
 */
export interface GenerateProofResult {
  proof: unknown;
  publicSignals: string[];
  nullifierHash: bigint;
  root: bigint;
  externalNullifier: bigint;
  provingTimeMs: number;
}

export async function generateProof(
  input: CircuitInput,
  wasm: string | Uint8Array,
  zkey: string | Uint8Array,
  options?: ProveOptions,
): Promise<GenerateProofResult> {
  const { signal } = options ?? {};

  signal?.throwIfAborted();

  const provingStartedAt = performance.now();
  const result = await raceProve(
    {
      identityNullifier: input.identityNullifier.toString(),
      identitySecret: input.identitySecret.toString(),
      pathElements: input.pathElements.map(String),
      pathIndices: input.pathIndices,
      root: input.root.toString(),
      externalNullifier: input.externalNullifier.toString(),
    },
    wasm,
    zkey,
    signal,
  );
  const provingTimeMs = Math.max(0, performance.now() - provingStartedAt);

  // Public signal order: [nullifierHash, root, externalNullifier]
  // This is what circom/snarkjs actually emit — circuit output first,
  // then declared public inputs in declaration order.
  const [nullifierHashStr, rootStr, externalNullifierStr] =
    result.publicSignals as string[];

  return {
    proof: result.proof,
    publicSignals: result.publicSignals,
    nullifierHash: BigInt(nullifierHashStr),
    root: BigInt(rootStr),
    externalNullifier: BigInt(externalNullifierStr),
    provingTimeMs,
  };
}

export { prefetchMembershipArtifacts } from "./artifacts";
export type { ProverArtifacts } from "./artifacts";
