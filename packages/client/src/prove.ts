import { groth16 } from "snarkjs";
import {
  prefetchMembershipArtifacts,
  type ProverArtifacts,
} from "./artifacts.js";
import { FR_MODULUS } from "./identity.js";
import { TREE_LEVELS } from "./config.js";

export interface ProofResult {
  proof: unknown;
  publicSignals: string[];
  provingTimeMs: number;
  artifactDownloadTimeMs: number;
  totalTimeMs: number;
}

let artifactPromise: Promise<ProverArtifacts> | undefined;

function getArtifacts(): Promise<ProverArtifacts> {
  if (!artifactPromise) {
    artifactPromise = prefetchMembershipArtifacts();
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

export interface CircuitInput {
  identityNullifier: bigint;
  identitySecret: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
  externalNullifier: bigint;
}

// Wire format the Sharibo contract expects: G1Affine = 96 raw bytes
// (be_bytes(X) || be_bytes(Y)), G2Affine = 192 raw bytes
// (be_bytes(X_c1) || be_bytes(X_c0) || be_bytes(Y_c1) || be_bytes(Y_c0)) —
// see contracts/sharibo/src/lib.rs and NOTES.md. snarkjs's decimal Fq/Fq2
// coordinates already are canonical field elements, so a plain big-endian,
// zero-padded encoding is all that's needed (the reserved flag bits happen
// to be 0 for any canonical coordinate, since the BLS12-381 base field
// modulus itself begins with three zero bits).
//
// Exported (rather than module-private) so the encoding can be pinned with
// round-trip/known-answer tests — see prove.test.ts. This is the
// highest-leverage place in the SDK for tests: a single byte-order mistake
// here makes every proof invalid with an opaque `InvalidProof` on-chain.
export const FP_BYTES = 48;

export function feToBytes(dec: string): Uint8Array {
  const hex = BigInt(dec).toString(16).padStart(FP_BYTES * 2, "0");
  const bytes = new Uint8Array(FP_BYTES);
  for (let i = 0; i < FP_BYTES; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function g1ToBytes([x, y]: [string, string, string]): Uint8Array {
  return concatBytes(feToBytes(x), feToBytes(y));
}

export function g2ToBytes([[xc0, xc1], [yc0, yc1]]: [
  [string, string],
  [string, string],
  [string, string],
]): Uint8Array {
  return concatBytes(feToBytes(xc1), feToBytes(xc0), feToBytes(yc1), feToBytes(yc0));
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

export function verificationKeyToContractFormat(vk: {
  vk_alpha_1: [string, string, string];
  vk_beta_2: [[string, string], [string, string], [string, string]];
  vk_gamma_2: [[string, string], [string, string], [string, string]];
  vk_delta_2: [[string, string], [string, string], [string, string]];
  IC: [string, string, string][];
}): ContractVerificationKey {
  return {
    alpha: g1ToBytes(vk.vk_alpha_1),
    beta: g2ToBytes(vk.vk_beta_2),
    gamma: g2ToBytes(vk.vk_gamma_2),
    delta: g2ToBytes(vk.vk_delta_2),
    ic: vk.IC.map(g1ToBytes),
  };
}

// Validate CircuitInput before passing it into snarkjs fullProve, so
// malformed input fails with field-name-specific errors instead of opaque
// snarkjs internal failures.
export function validateCircuitInput(
  input: CircuitInput,
  levels: number = TREE_LEVELS,
): void {
  // Circuit depth: pathElements length must match the expected tree depth.
  if (input.pathElements.length !== levels) {
    throw new Error(
      `pathElements: expected ${levels}, got ${input.pathElements.length}`,
    );
  }

  // pathIndices must have the same length as pathElements.
  if (input.pathIndices.length !== input.pathElements.length) {
    throw new Error(
      `pathIndices: expected ${input.pathElements.length}, got ${input.pathIndices.length}`,
    );
  }

  // Every path index must be a boolean (0 or 1).
  for (let i = 0; i < input.pathIndices.length; i++) {
    if (input.pathIndices[i] !== 0 && input.pathIndices[i] !== 1) {
      throw new Error(
        `pathIndices[${i}]: expected 0 or 1, got ${input.pathIndices[i]}`,
      );
    }
  }

  // Every field element must lie in [0, FR_MODULUS).
  function checkField(name: string, value: bigint): void {
    if (value < 0n || value >= FR_MODULUS) {
      throw new Error(`${name}: must be in [0, FR_MODULUS), got ${value}`);
    }
  }

  checkField("identityNullifier", input.identityNullifier);
  checkField("identitySecret", input.identitySecret);
  checkField("root", input.root);
  checkField("externalNullifier", input.externalNullifier);

  for (let i = 0; i < input.pathElements.length; i++) {
    checkField(`pathElements[${i}]`, input.pathElements[i]);
  }
}

export interface ProveResult {
  proof: ContractProof;
  nullifierHash: bigint;
  root: bigint;
  externalNullifier: bigint;
}

// Public signal order snarkjs actually emits is [nullifierHash, root,
// externalNullifier] — circuit outputs first, then declared public inputs
// in source order. Not [root, externalNullifier, nullifierHash]; see
// NOTES.md (Phase 1 deviation).
export async function generateProof(
  input: CircuitInput,
  wasmPath: string,
  zkeyPath: string,
  levels: number = TREE_LEVELS,
): Promise<ProveResult> {
  validateCircuitInput(input, levels);
  const circuitInput = {
    identityNullifier: input.identityNullifier.toString(),
    identitySecret: input.identitySecret.toString(),
    pathElements: input.pathElements.map((e) => e.toString()),
    pathIndices: input.pathIndices,
    root: input.root.toString(),
    externalNullifier: input.externalNullifier.toString(),
  };

  const { proof, publicSignals } = await groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath,
  );

  return {
    proof: {
      a: g1ToBytes(proof.pi_a as [string, string, string]),
      b: g2ToBytes(
        proof.pi_b as [[string, string], [string, string], [string, string]],
      ),
      c: g1ToBytes(proof.pi_c as [string, string, string]),
    },
    nullifierHash: BigInt(publicSignals[0]),
    root: BigInt(publicSignals[1]),
    externalNullifier: BigInt(publicSignals[2]),
  };
}

export { prefetchMembershipArtifacts } from "./artifacts.js";
export type { ProverArtifacts } from "./artifacts.js";
