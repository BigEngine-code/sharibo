import { Client as ContractClient, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContractProof, ContractVerificationKey } from "./prove.js";

export interface SharaboNetworkConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

// The contract's methods (create_circle/fund/claim/get_circle) are attached
// to the Client at runtime from the on-chain contract spec (see
// @stellar/stellar-sdk's `contract.Client.from`), so they aren't visible to
// TypeScript's static checker — hence `any` here rather than a hand-rolled
// or codegen'd interface. Keeps this SDK working against whatever the
// deployed contract's real spec is, rather than a copy that can drift.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharaboClient = any;

export async function connect(
  config: SharaboNetworkConfig,
  keypair: Keypair,
): Promise<SharaboClient> {
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

export async function createCircle(
  client: SharaboClient,
  args: {
    admin: string;
    token: string;
    root: bigint;
    contribution: bigint;
    size: number;
    vk: ContractVerificationKey;
  },
): Promise<bigint> {
  const tx = await client.create_circle({
    admin: args.admin,
    token: args.token,
    root: args.root,
    contribution: args.contribution,
    size: args.size,
    vk: args.vk,
  });
  const sent = await tx.signAndSend();
  return sent.result as bigint;
}

export async function fund(
  client: SharaboClient,
  args: { circleId: bigint; from: string },
): Promise<void> {
  const tx = await client.fund({ circle_id: args.circleId, from: args.from });
  await tx.signAndSend();
}

export async function claim(
  client: SharaboClient,
  args: {
    circleId: bigint;
    recipient: string;
    nullifierHash: bigint;
    externalNullifier: bigint;
    proof: ContractProof;
  },
): Promise<void> {
  const tx = await client.claim({
    circle_id: args.circleId,
    recipient: args.recipient,
    nullifier_hash: args.nullifierHash,
    external_nullifier: args.externalNullifier,
    proof: args.proof,
  });
  await tx.signAndSend();
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

export async function getCircle(client: SharaboClient, circleId: bigint): Promise<CircleView> {
  // get_circle is a pure read: the SDK detects no signature is needed and
  // refuses signAndSend() without `force` (there's nothing to sign/submit).
  const tx = await client.get_circle({ circle_id: circleId });
  const sent = await tx.signAndSend({ force: true });
  return sent.result as CircleView;
}
