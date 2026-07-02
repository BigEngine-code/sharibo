import * as snarkjs from "snarkjs";

// No `node:*` imports and no `Buffer` at module scope (deliberately) — this
// file is used both from Node (scripts/e2e.ts, passing filesystem paths)
// and from the browser app (Phase 5, passing fetchable URLs under
// /circuits/). snarkjs's fullProve accepts either transparently, and
// Uint8Array (unlike Buffer) needs no polyfill in the browser.

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
const FP_BYTES = 48;

function feToBytes(dec: string): Uint8Array {
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

function g1ToBytes([x, y]: [string, string, string]): Uint8Array {
  return concatBytes(feToBytes(x), feToBytes(y));
}

function g2ToBytes([[xc0, xc1], [yc0, yc1]]: [
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
): Promise<ProveResult> {
  const circuitInput = {
    identityNullifier: input.identityNullifier.toString(),
    identitySecret: input.identitySecret.toString(),
    pathElements: input.pathElements.map((e) => e.toString()),
    pathIndices: input.pathIndices,
    root: input.root.toString(),
    externalNullifier: input.externalNullifier.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath,
  );

  return {
    proof: {
      a: g1ToBytes(proof.pi_a as [string, string, string]),
      b: g2ToBytes(proof.pi_b as [[string, string], [string, string], [string, string]]),
      c: g1ToBytes(proof.pi_c as [string, string, string]),
    },
    nullifierHash: BigInt(publicSignals[0]),
    root: BigInt(publicSignals[1]),
    externalNullifier: BigInt(publicSignals[2]),
  };
}
