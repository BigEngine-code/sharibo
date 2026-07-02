import * as snarkjs from "snarkjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_BUILD_DIR = path.join(__dirname, "..", "..", "..", "circuits", "build");
const WASM_PATH = path.join(CIRCUITS_BUILD_DIR, "membership_js", "membership.wasm");
const ZKEY_PATH = path.join(CIRCUITS_BUILD_DIR, "membership_final.zkey");

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

function feToBytes(dec: string): Buffer {
  const hex = BigInt(dec).toString(16).padStart(FP_BYTES * 2, "0");
  return Buffer.from(hex, "hex");
}

function g1ToBuffer([x, y]: [string, string, string]): Buffer {
  return Buffer.concat([feToBytes(x), feToBytes(y)]);
}

function g2ToBuffer([[xc0, xc1], [yc0, yc1]]: [
  [string, string],
  [string, string],
  [string, string],
]): Buffer {
  return Buffer.concat([feToBytes(xc1), feToBytes(xc0), feToBytes(yc1), feToBytes(yc0)]);
}

export interface ContractProof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

export interface ContractVerificationKey {
  alpha: Buffer;
  beta: Buffer;
  gamma: Buffer;
  delta: Buffer;
  ic: Buffer[];
}

export function verificationKeyToContractFormat(vk: {
  vk_alpha_1: [string, string, string];
  vk_beta_2: [[string, string], [string, string], [string, string]];
  vk_gamma_2: [[string, string], [string, string], [string, string]];
  vk_delta_2: [[string, string], [string, string], [string, string]];
  IC: [string, string, string][];
}): ContractVerificationKey {
  return {
    alpha: g1ToBuffer(vk.vk_alpha_1),
    beta: g2ToBuffer(vk.vk_beta_2),
    gamma: g2ToBuffer(vk.vk_gamma_2),
    delta: g2ToBuffer(vk.vk_delta_2),
    ic: vk.IC.map(g1ToBuffer),
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
export async function generateProof(input: CircuitInput): Promise<ProveResult> {
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
    WASM_PATH,
    ZKEY_PATH,
  );

  return {
    proof: {
      a: g1ToBuffer(proof.pi_a),
      b: g2ToBuffer(proof.pi_b),
      c: g1ToBuffer(proof.pi_c),
    },
    nullifierHash: BigInt(publicSignals[0]),
    root: BigInt(publicSignals[1]),
    externalNullifier: BigInt(publicSignals[2]),
  };
}
