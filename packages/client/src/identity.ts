import { poseidon2 } from "poseidon-bls12381";

// Web Crypto (`globalThis.crypto`) rather than `node:crypto`, so this module
// runs unmodified in both Node (18+) and the browser app (Phase 5) — no
// bundler polyfill needed.
const webCrypto: Crypto = globalThis.crypto;

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

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

// 31 random bytes (248 bits) are always below FR_MODULUS (~2^255), so no
// rejection sampling / modular reduction is needed.
export function randomFieldElement(): bigint {
  const bytes = webCrypto.getRandomValues(new Uint8Array(31));
  return bytesToBigInt(bytes);
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
export async function computeExternalNullifier(
  circleId: bigint,
  round: bigint,
): Promise<bigint> {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setBigUint64(0, circleId, false);
  view.setUint32(8, Number(round), false);
  const digest = await webCrypto.subtle.digest("SHA-256", buf);
  return bytesToBigInt(new Uint8Array(digest)) % FR_MODULUS;
}

export function computeNullifierHash(
  identityNullifier: bigint,
  externalNullifier: bigint,
): bigint {
  return poseidon(identityNullifier, externalNullifier);
}
