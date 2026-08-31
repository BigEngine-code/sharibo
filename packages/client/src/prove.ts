import { groth16 } from "snarkjs";
import { FR_MODULUS } from "./identity.js";
import { TREE_LEVELS } from "./tree.js";
import { InvalidInputError } from "./errors.js";

/**
 * @internal
 * 48-byte big-endian encoding of a non-negative base-10 coordinate string.
 * Each BLS12-381 field element is serialized as 48 big-endian bytes, matching
 * Soroban's `G1Affine`/`G2Affine` wire layout (see contracts/sharibo/src/lib.rs).
 */
export function encodeFieldElement48(value: bigint | string): Uint8Array {
  const hex = BigInt(value).toString(16).padStart(96, "0");
  const bytes = new Uint8Array(48);
  for (let i = 0; i < 48; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** @internal The raw output of `snarkjs.groth16.fullProve` before wire encoding. */
type SnarkProof = {
  pi_a: (string)[];
  pi_b: (string[])[];
  pi_c: (string)[];
};

/**
 * @internal
 * Encode a G1 point given as a base-10 `[x, y, z]` triple into Soroban's
 * 96-byte `be(X) || be(Y)` layout.
 */
function encodeG1([x, y]: readonly string[]): Uint8Array {
  const out = new Uint8Array(96);
  out.set(encodeFieldElement48(x), 0);
  out.set(encodeFieldElement48(y), 48);
  return out;
}

/**
 * @internal
 * Encode a G2 point given as base-10 `[[x0, x1], [y0, y1], z]` into Soroban's
 * 192-byte `be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)` layout.
 */
function encodeG2([[x0, x1], [y0, y1]]: readonly (readonly string[])[]): Uint8Array {
  const out = new Uint8Array(192);
  out.set(encodeFieldElement48(x1), 0);
  out.set(encodeFieldElement48(x0), 48);
  out.set(encodeFieldElement48(y1), 96);
  out.set(encodeFieldElement48(y0), 144);
  return out;
}

/**
 * A Groth16 proof encoded into the contract's exact wire format.
 *
 * Matches `contracts/sharibo/src/lib.rs`'s `Proof` type: `a`/`c` are BLS12-381
 * `G1Affine` (96-byte), `b` is a `G2Affine` (192-byte), each big-endian.
 */
export interface ContractProof {
  /** G1 element `A` (96 bytes: be(X) || be(Y)). */
  a: Uint8Array;
  /** G2 element `B` (192 bytes: be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)). */
  b: Uint8Array;
  /** G1 element `C` (96 bytes). */
  c: Uint8Array;
}

/**
 * A Groth16 verification key encoded into the contract's exact wire format.
 *
 * Matches `contracts/sharibo/src/lib.rs`'s `VerificationKey` type.
 */
export interface ContractVerificationKey {
  /** G1 element `[α]·G1` (96 bytes). */
  alpha: Uint8Array;
  /** G2 element `[β]·G2` (192 bytes). */
  beta: Uint8Array;
  /** G2 element `[γ]·G2` (192 bytes). */
  gamma: Uint8Array;
  /** G2 element `[δ]·G2` (192 bytes). */
  delta: Uint8Array;
  /** `vk_x` basis `ic[0] + Σ pub_input_i·ic[i+1]` (one 96-byte G1 per public input + 1). */
  ic: Uint8Array[];
}

/**
 * The witness inputs required by `circuits/membership.circom`.
 *
 * Public signals are pinned by position: `[nullifierHash, root, externalNullifier]`
 * (see `circuits/test/membership.test.js`). The circuit depth is `TREE_LEVELS`.
 */
export interface CircuitInput {
  identityNullifier: bigint;
  identitySecret: bigint;
  /** Sibling nodes along the path from leaf to root; length must equal the circuit depth. */
  pathElements: bigint[];
  /** Direction per level: 1 = current node is the right child, 0 = left child. */
  pathIndices: number[];
  root: bigint;
  externalNullifier: bigint;
}

function inField(name: string, value: bigint): void {
  if (value < 0n || value >= FR_MODULUS) {
    throw new InvalidInputError(`${name}: must be in [0, FR_MODULUS), got ${value}`);
  }
}

/**
 * Validates circuit witness input *before* handing it to snarkjs, so invalid
 * values fail with a descriptive error instead of a confusing failure deep in
 * the prover.
 *
 * @param input - The circuit input to validate.
 * @param levels - The circuit's Merkle depth. Defaults to `TREE_LEVELS`.
 * @throws {InvalidInputError} When any field is out of range or the path shape
 *   does not match `levels`.
 */
export function validateCircuitInput(input: CircuitInput, levels = TREE_LEVELS): void {
  if (input.pathElements.length !== levels) {
    throw new InvalidInputError(
      `pathElements: expected ${levels}, got ${input.pathElements.length}`,
    );
  }
  if (input.pathIndices.length !== levels) {
    throw new InvalidInputError(
      `pathIndices: expected ${levels}, got ${input.pathIndices.length}`,
    );
  }
  for (let i = 0; i < input.pathIndices.length; i++) {
    const bit = input.pathIndices[i];
    if (bit !== 0 && bit !== 1) {
      throw new InvalidInputError(`pathIndices[${i}]: expected 0 or 1, got ${bit}`);
    }
  }

  inField("identityNullifier", input.identityNullifier);
  inField("identitySecret", input.identitySecret);
  inField("root", input.root);
  inField("externalNullifier", input.externalNullifier);
  for (let i = 0; i < input.pathElements.length; i++) {
    inField(`pathElements[${i}]`, input.pathElements[i]);
  }
}

/**
 * Converts a single lower-scalar `circuits/verification_key.json` object into
 * the contract's `VerificationKey` wire format.
 *
 * Call once at circle-creation time and pass the result to
 * [`createCircle`](contract.js). The snarkjs JSON layout is `vk_alpha_1`,
 * `vk_beta_2`, `vk_gamma_2`, `vk_delta_2`, `ic`.
 *
 * @param vkJson - The parsed snarkjs verification key JSON.
 * @returns The `@sharibo/client` `ContractVerificationKey` byte encoding.
 * @throws {InvalidInputError} When any group element is malformed.
 */
export function verificationKeyToContractFormat(vkJson: any): ContractVerificationKey {
  const readG1 = (label: string, point: unknown): Uint8Array => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new InvalidInputError(`${label}: expected a [x, y, z] point`);
    }
    return encodeG1(point as string[]);
  };
  const readG2 = (label: string, point: unknown): Uint8Array => {
    if (!Array.isArray(point) || point.length !== 3) {
      throw new InvalidInputError(`${label}: expected a [[x0, x1], [y0, y1], z] point`);
    }
    return encodeG2(point as string[][]);
  };

  if (!Array.isArray(vkJson?.IC)) {
    throw new InvalidInputError("vkJson.IC: expected an array of G1 points");
  }

  return {
    alpha: readG1("vk_alpha_1", vkJson.vk_alpha_1),
    beta: readG2("vk_beta_2", vkJson.vk_beta_2),
    gamma: readG2("vk_gamma_2", vkJson.vk_gamma_2),
    delta: readG2("vk_delta_2", vkJson.vk_delta_2),
    ic: vkJson.IC.map((point: unknown, i: number) => readG1(`IC[${i}]`, point)),
  };
}

/**
 * Result of proving membership for a circle.
 *
 * `proof` is the contract-wire-format Groth16 proof; the public signals we
 * expose as bigints correspond to the circuit's pinned signal order
 * `[nullifierHash, root, externalNullifier]`.
 */
export interface CircomDerivedProof {
  proof: ContractProof;
  nullifierHash: bigint;
  root: bigint;
  externalNullifier: bigint;
}

/**
 * Generates a real Groth16 membership proof and encodes it into the contract's
 * exact wire format.
 *
 * @param input - Validated circuit input.
 * @param wasm - The compiled `membership.wasm` witness generator, either a path/URL
 *   (string) or the already-fetched bytes (`Uint8Array`).
 * @param zkey - The `membership_final.zkey` proving key, either a path/URL (string)
 *   or the already-fetched bytes (`Uint8Array`).
 * @returns The wire-format proof plus the three bigint public signals.
 * @throws {InvalidInputError} When the input is invalid.
 */
export async function generateProof(
  input: CircuitInput,
  wasm: string | Uint8Array,
  zkey: string | Uint8Array,
): Promise<CircomDerivedProof> {
  validateCircuitInput(input);

  // snarkjs types its witness input as `CircuitSignals` (a string-indexed
  // record); our narrower `CircuitInput` satisfies it structurally but not by
  // index signature, so cast to snarkjs's own parameter type to stay resilient.
  const { proof, publicSignals } = await groth16.fullProve(
    input as unknown as Parameters<typeof groth16.fullProve>[0],
    wasm,
    zkey,
  );

  const [nullifierHash, root, externalNullifier] = publicSignals.map((s: string) =>
    BigInt(s),
  );

  return {
    proof: {
      a: encodeG1(proof.pi_a),
      b: encodeG2(proof.pi_b),
      c: encodeG1(proof.pi_c),
    },
    nullifierHash,
    root,
    externalNullifier,
  };
}