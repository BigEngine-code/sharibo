import { buildPoseidon } from "circomlibjs";
import { randomBytes } from "node:crypto";

export interface Identity {
  identityNullifier: bigint;
  identitySecret: bigint;
  commitment: bigint;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonInstance: any;
async function getPoseidon() {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

// 31 random bytes (248 bits) are always below the BN254 scalar field prime
// (~2^254), so no rejection sampling / modular reduction is needed.
export function randomFieldElement(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([a, b]));
}

export async function generateIdentity(): Promise<Identity> {
  const identityNullifier = randomFieldElement();
  const identitySecret = randomFieldElement();
  const commitment = await poseidon2(identityNullifier, identitySecret);
  return { identityNullifier, identitySecret, commitment };
}

export async function computeExternalNullifier(
  circleId: bigint,
  round: bigint,
): Promise<bigint> {
  return poseidon2(circleId, round);
}

export async function computeNullifierHash(
  identityNullifier: bigint,
  externalNullifier: bigint,
): Promise<bigint> {
  return poseidon2(identityNullifier, externalNullifier);
}
