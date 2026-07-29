import * as snarkjs from "snarkjs";

// No `node:*` imports and no `Buffer` at module scope (deliberately) — this
// file is used both from Node (scripts/e2e.ts, passing filesystem paths)
// and from the browser app (Phase 5, passing fetchable URLs under
// /circuits/). snarkjs's fullProve accepts either transparently, and
// Uint8Array (unlike Buffer) needs no polyfill in the browser.

/**
 * Circuit input for the Sharibo zero-knowledge proof.
 *
 * @property identityNullifier - The nullifier component of the identity.
 * @property identitySecret - The secret component of the identity.
 * @property pathElements - The sibling nodes along the Merkle proof path.
 * @property pathIndices - Direction indicators (0 = left, 1 = right) for each level.
 * @property root - The Merkle tree root.
 * @property externalNullifier - The external nullifier binding to circle and round.
 */
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

/**
 * A Groth16 proof in the wire format expected by the Sharibo contract.
 *
 * @property a - G1 point pi_a (96 bytes: be_bytes(X) || be_bytes(Y)).
 * @property b - G2 point pi_b (192 bytes: be_bytes(X_c1) || be_bytes(X_c0) || be_bytes(Y_c1) || be_bytes(Y_c0)).
 * @property c - G1 point pi_c (96 bytes: be_bytes(X) || be_bytes(Y)).
 */
export interface ContractProof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}

/**
 * A Groth16 verification key in the wire format expected by the Sharibo contract.
 *
 * @property alpha - G1 point alpha (96 bytes).
 * @property beta - G2 point beta (192 bytes).
 * @property gamma - G2 point gamma (192 bytes).
 * @property delta - G2 point delta (192 bytes).
 * @property ic - Array of G1 points for the IC coefficients (96 bytes each).
 */
export interface ContractVerificationKey {
  alpha: Uint8Array;
  beta: Uint8Array;
  gamma: Uint8Array;
  delta: Uint8Array;
  ic: Uint8Array[];
}

/**
 * Converts a snarkjs verification key to the contract wire format.
 *
 * @param vk - The verification key in snarkjs format (decimal string coordinates).
 * @returns The verification key in contract wire format (big-endian bytes).
 */
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

/**
 * The result of generating a zero-knowledge proof.
 *
 * @property proof - The Groth16 proof in contract wire format.
 * @property nullifierHash - The computed nullifier hash.
 * @property root - The Merkle tree root used in the proof.
 * @property externalNullifier - The external nullifier used in the proof.
 */
export interface ProveResult {
  proof: ContractProof;
  nullifierHash: bigint;
  root: bigint;
  externalNullifier: bigint;
}

/**
 * Generates a Groth16 zero-knowledge proof for the Sharibo circuit.
 *
 * @param input - The circuit input containing identity and Merkle proof data.
 * @param wasmPath - Path or URL to the circuit WASM file.
 * @param zkeyPath - Path or URL to the circuit proving key (zkey) file.
 * @returns The proof and public signals in contract wire format.
 *
 * @remarks
 * Public signal order snarkjs actually emits is [nullifierHash, root,
 * externalNullifier] — circuit outputs first, then declared public inputs
 * in source order. Not [root, externalNullifier, nullifierHash]; see
 * NOTES.md (Phase 1 deviation).
 */
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
