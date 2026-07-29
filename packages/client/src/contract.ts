import { Client as ContractClient, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContractProof, ContractVerificationKey } from "./prove.js";

export interface ShariboNetworkConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

// The contract's methods (create_circle/fund/claim/get_circle/has_claimed)
// are attached to the Client at runtime from the on-chain contract spec (see
// @stellar/stellar-sdk's `contract.Client.from`), so they aren't visible to
// TypeScript's static checker — hence `any` here rather than a hand-rolled
// or codegen'd interface. Keeps this SDK working against whatever the
// deployed contract's real spec is, rather than a copy that can drift.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShariboClient = any;

export async function connect(
  config: ShariboNetworkConfig,
  keypair: Keypair,
): Promise<ShariboClient> {
  const signer = basicNodeSigner(keypair, config.networkPassphrase);
  return ContractClient.from({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: keypair.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  });
}

export interface TxResult<T> {
  result: T;
  hash: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt >= retries) throw error;

      const msg = (error?.message || String(error)).toLowerCase();
      const isTransient =
        msg.includes("429") ||
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        msg.includes("connection reset") ||
        msg.includes("fetch failed");

      if (!isTransient) throw error;

      attempt++;
      const jitter = 0.5 + Math.random() * 0.5;
      const delay = baseMs * Math.pow(2, attempt - 1) * jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

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
  return { result: sent.result as bigint, hash: sent.sendTransactionResponse.hash };
}

export async function fund(
  client: ShariboClient,
  args: { circleId: bigint; from: string },
): Promise<TxResult<void>> {
  const tx = await withRetry(() => client.fund({ circle_id: args.circleId, from: args.from }));
  const sent = await tx.signAndSend();
  return { result: undefined, hash: sent.sendTransactionResponse.hash };
}

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
  return { result: undefined, hash: sent.sendTransactionResponse.hash };
}

export interface CircleView {
  admin: string;
  token: string;
  root: bigint;
  contribution: bigint;
  size: number;
  round: number;
  pot: bigint;
}

export async function getCircle(client: ShariboClient, circleId: bigint): Promise<CircleView> {
  // get_circle is a pure read: the SDK detects no signature is needed and
  // refuses signAndSend() without `force` (there's nothing to sign/submit).
  const tx = await withRetry(() => client.get_circle({ circle_id: circleId }));
  const sent = await tx.signAndSend({ force: true });
  return sent.result as CircleView;
}

/** Pure read: whether `nullifierHash` has already claimed in this circle. */
export async function hasClaimed(
  client: ShariboClient,
  circleId: bigint,
  nullifierHash: bigint,
): Promise<boolean> {
  const tx = await withRetry(() => client.has_claimed({
    circle_id: circleId,
    nullifier_hash: nullifierHash,
  }));
  const sent = await tx.signAndSend({ force: true });
  return sent.result as boolean;
}
