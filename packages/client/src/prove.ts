import { groth16 } from "snarkjs";

import type { ProverArtifacts } from "./artifacts";

export interface ProofResult {
  proof: unknown;
  publicSignals: string[];
  provingTimeMs: number;
  artifactDownloadTimeMs: number;
  totalTimeMs: number;
}

let artifactPromise: Promise<ProverArtifacts> | undefined;

async function getArtifacts(): Promise<ProverArtifacts> {
  if (!artifactPromise) {
    artifactPromise = import("./artifacts").then(({ prefetchMembershipArtifacts }) =>
      prefetchMembershipArtifacts()
    );
  }
  return artifactPromise;
}

/**
 * Generates a membership proof using the already-downloaded binary circuit
 * artifacts. The proving timer intentionally starts after this await so that
 * network time is not reported as proving/compute time.
 */
export async function fullProve(
  input: Record<string, unknown>,
): Promise<ProofResult> {
  const artifacts = await getArtifacts();

  const provingStartedAt = performance.now();
  const result = await groth16.fullProve(
    input,
    artifacts.wasm,
    artifacts.zkey,
  );
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
): Promise<ProofResult> {
  return fullProve(input);
}

export async function prefetchMembershipArtifacts(): Promise<ProverArtifacts> {
  return getArtifacts();
}

export type { ProverArtifacts } from "./artifacts";
