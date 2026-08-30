import type { ContractProof, ContractVerificationKey } from "./prove.js";
import type { ShariboClient } from "./connect.js";

// @ts-ignore
declare const withRetry: any;

/**
 * Result of a contract transaction.
 *
 * @template T - The type of the transaction result.
 * @property result - The return value from the contract method.
 * @property hash - The transaction hash.
 */
export interface TxResult<T> {
  result: T;
  hash: string;
  /** Ledger sequence number the transaction was included in, if available. */
  ledger?: number;
  /** Fee charged for the transaction in stroops, if available. */
  feeCharged?: string;
}

export function populateTxResult<T>(
  result: T,
  sent: { sendTransactionResponse: { hash: string }; getTransactionResponse?: { ledger?: number; feeCharged?: string } },
): TxResult<T> {
  return {
    result,
    hash: sent.sendTransactionResponse.hash,
    ledger: sent.getTransactionResponse?.ledger,
    feeCharged: sent.getTransactionResponse?.feeCharged,
  };
}

/**
 * Creates a new Sharibo circle.
 *
 * @param client - The Sharibo contract client.
 * @param args - Circle creation parameters.
 * @param args.admin - The admin address for the circle.
 * @param args.token - The token address for contributions.
 * @param args.root - The Merkle tree root of identity commitments.
 * @param args.contribution - The required contribution amount per participant.
 * @param args.size - The maximum number of participants.
 * @param args.vk - The verification key for the zero-knowledge proof circuit.
 * @returns The circle ID and transaction hash.
 */
export async function createCircle(
  client: ShariboClient,
  args: {
    admin: string;
    token: string;
    root: bigint;
    contribution: bigint;
    size: number;
    vk: ContractVerificationKey;
  },
): Promise<TxResult<bigint>> {
  const tx = await withRetry(() => client.create_circle({
    admin: args.admin,
    token: args.token,
    root: args.root,
    contribution: args.contribution,
    size: args.size,
    vk: args.vk,
  }));
  const sent = await tx.signAndSend();
  return populateTxResult(sent.result as bigint, sent);
}

/**
 * Funds a circle with a contribution.
 *
 * @param client - The Sharibo contract client.
 * @param args - Funding parameters.
 * @param args.circleId - The ID of the circle to fund.
 * @param args.from - The address sending the contribution.
 * @returns The transaction hash.
 */
export async function fund(
  client: ShariboClient,
  args: { circleId: bigint; from: string },
): Promise<TxResult<void>> {
  const tx = await withRetry(() => client.fund({ circle_id: args.circleId, from: args.from }));
  const sent = await tx.signAndSend();
  return populateTxResult(undefined, sent);
}

/**
 * Claims a reward from a circle using a zero-knowledge proof.
 *
 * @param client - The Sharibo contract client.
 * @param args - Claim parameters.
 * @param args.circleId - The ID of the circle to claim from.
 * @param args.recipient - The address to receive the reward.
 * @param args.nullifierHash - The nullifier hash to prevent double-claiming.
 * @param args.externalNullifier - The external nullifier binding to circle and round.
 * @param args.proof - The Groth16 zero-knowledge proof.
 * @returns The transaction hash.
 */
export async function claim(
  client: ShariboClient,
  args: {
    circleId: bigint;
    recipient: string;
    nullifierHash: bigint;
    externalNullifier: bigint;
    proof: ContractProof;
  },
): Promise<TxResult<void>> {
  const tx = await withRetry(() => client.claim({
    circle_id: args.circleId,
    recipient: args.recipient,
    nullifier_hash: args.nullifierHash,
    external_nullifier: args.externalNullifier,
    proof: args.proof,
  }));
  const sent = await tx.signAndSend();
  return populateTxResult(undefined, sent);
}
