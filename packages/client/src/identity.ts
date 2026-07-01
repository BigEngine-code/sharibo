import { poseidon2 } from "poseidon-bls12381";
import { createHash, randomBytes } from "node:crypto";

export interface Identity {
  identityNullifier: bigint;
  identitySecret: bigint;
  commitment: bigint;
}

// BLS12-381 scalar field modulus r (matches Soroban's own Fr and the
// poseidon-bls12381 package — cross-checked against soroban-sdk's
// BLS12_381_FR_MODULUS_BE constant).
export const FR_MODULUS =
  0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

// 31 random bytes (248 bits) are always below FR_MODULUS (~2^255), so no
// rejection sampling / modular reduction is needed.
export function randomFieldElement(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

export function poseidon(a: bigint, b: bigint): bigint {
  return poseidon2([a, b]);
}

export function generateIdentity(): Identity {
  const identityNullifier = randomFieldElement();
  const identitySecret = randomFieldElement();
  const commitment = poseidon(identityNullifier, identitySecret);
  return { identityNullifier, identitySecret, commitment };
}

// DELIBERATE, PERMANENT DEVIATION from "Poseidon everywhere": external
// nullifier binding (circle_id, round) happens with SHA-256, matching the
// contract (see contracts/sharibo/src/lib.rs, compute_external_nullifier).
// Poseidon is used only where it saves constraints *inside* the circuit
// (commitment + nullifierHash); Soroban has no native Poseidon host
// function, so nothing is gained by porting Poseidon into the contract for
// this check, and SHA-256 is equally sound for binding a proof to a round.
// See NOTES.md.
export function computeExternalNullifier(circleId: bigint, round: bigint): bigint {
  const buf = Buffer.alloc(12);
  buf.writeBigUInt64BE(circleId, 0);
  buf.writeUInt32BE(Number(round), 8);
  const digest = createHash("sha256").update(buf).digest();
  return BigInt("0x" + digest.toString("hex")) % FR_MODULUS;
}

export function computeNullifierHash(
  identityNullifier: bigint,
  externalNullifier: bigint,
): bigint {
  return poseidon(identityNullifier, externalNullifier);
}
