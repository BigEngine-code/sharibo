import { groth16 } from "snarkjs";
import {
  prefetchMembershipArtifacts,
  type ProverArtifacts,
} from "./artifacts";

export interface ProofResult {
  proof: unknown;
  publicSignals: string[];
  provingTimeMs: number;
  artifactDownloadTimeMs: number;
  totalTimeMs: number;
}

export interface ContractProof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}

export interface ContractVerificationKey {
  alpha: Uint8Array;
  beta: Uint8Array;
  gamma: Uint8Array;
  delta: Uint8Array;
  ic: Uint8Array[];
}

let artifactPromise: Promise<ProverArtifacts> | undefined;

function getArtifacts(): Promise<ProverArtifacts> {
  if (!artifactPromise) {
    artifactPromise = prefetchMembershipArtifacts();
  }
  return artifactPromise;
}

function decimalStringToUint8Array(decimal: string, length: number): Uint8Array {
  const value = BigInt(decimal);
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining = remaining >> 8n;
  }
  return bytes;
}

function packG1(coords: [string, string, string]): Uint8Array {
  const x = decimalStringToUint8Array(coords[0], 48);
  const y = decimalStringToUint8Array(coords[1], 48);
  const packed = new Uint8Array(96);
  packed.set(x, 0);
  packed.set(y, 48);
  return packed;
}

function packG2(coords: [string, string, string, string]): Uint8Array {
  const x1 = decimalStringToUint8Array(coords[0], 48);
  const x0 = decimalStringToUint8Array(coords[1], 48);
  const y1 = decimalStringToUint8Array(coords[2], 48);
  const y0 = decimalStringToUint8Array(coords[3], 48);
  const packed = new Uint8Array(192);
  packed.set(x1, 0);
  packed.set(x0, 48);
  packed.set(y1, 96);
  packed.set(y0, 144);
  return packed;
}

export function verificationKeyToContractFormat(vkJson: unknown): ContractVerificationKey {
  if (typeof vkJson !== "object" || vkJson === null) {
    throw new Error("verification key must be an object");
  }

  const vk = vkJson as Record<string, unknown>;

  if (typeof vk.nPublic !== "number") {
    throw new Error("verification key missing nPublic");
  }

  const ic = vk.IC;
  if (!Array.isArray(ic)) {
    throw new Error("verification key missing IC array");
  }

  if (ic.length !== vk.nPublic + 1) {
    throw new Error(
      `verification key IC length ${ic.length} does not match nPublic + 1 (${vk.nPublic + 1})`,
    );
  }

  const alpha1 = vk.vk_alpha_1;
  if (!Array.isArray(alpha1) || alpha1.length < 2) {
    throw new Error("verification key missing vk_alpha_1 coordinates");
  }
  const alpha = packG1([alpha1[0] as string, alpha1[1] as string, alpha1[2] as string]);

  const beta2 = vk.vk_beta_2;
  if (!Array.isArray(beta2) || beta2.length < 2) {
    throw new Error("verification key missing vk_beta_2 coordinates");
  }
  const beta = packG2([beta2[0][0] as string, beta2[0][1] as string, beta2[1][0] as string, beta2[1][1] as string]);

  const gamma2 = vk.vk_gamma_2;
  if (!Array.isArray(gamma2) || gamma2.length < 2) {
    throw new Error("verification key missing vk_gamma_2 coordinates");
  }
  const gamma = packG2([gamma2[0][0] as string, gamma2[0][1] as string, gamma2[1][0] as string, gamma2[1][1] as string]);

  const delta2 = vk.vk_delta_2;
  if (!Array.isArray(delta2) || delta2.length < 2) {
    throw new Error("verification key missing vk_delta_2 coordinates");
  }
  const delta = packG2([delta2[0][0] as string, delta2[0][1] as string, delta2[1][0] as string, delta2[1][1] as string]);

  const icPoints: Uint8Array[] = [];
  for (const point of ic) {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error("verification key IC entry missing coordinates");
    }
    icPoints.push(packG1([point[0] as string, point[1] as string, point[2] as string]));
  }

  return { alpha, beta, gamma, delta, ic: icPoints };
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

export { prefetchMembershipArtifacts } from "./artifacts";
export type { ProverArtifacts } from "./artifacts";
