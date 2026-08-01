import { Client as ContractClient, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContractProof, ContractVerificationKey } from "./prove.js";
import { ContractError, RpcError } from "./errors.js";

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

function wrapContractCallError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/Error\(Contract, #(\d+)\)/);
  if (match) {
    const code = parseInt(match[1], 10);
    throw new ContractError(message, code, { cause: err });
  }
  if (
    message.includes("HostError") ||
    message.includes("Simulation failed") ||
    message.includes("Contract") ||
    message.includes("WasmVm")
  ) {
    throw new ContractError(message, undefined, { cause: err });
  }
  throw new RpcError(message, { cause: err });
}

export async function connect(
  config: ShariboNetworkConfig,
  keypair: Keypair,
): Promise<ShariboClient> {
  try {
    const signer = basicNodeSigner(keypair, config.networkPassphrase);
    return await ContractClient.from({
      contractId: config.contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: keypair.publicKey(),
      signTransaction: signer.signTransaction,
      signAuthEntry: signer.signAuthEntry,
    });
  } catch (err) {
    throw wrapContractCallError(err);
  }
}

export interface TxResult<T> {
  result: T;
  hash: string;
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
  try {
    const tx = await client.create_circle({
      admin: args.admin,
      token: args.token,
      root: args.root,
      contribution: args.contribution,
      size: args.size,
      vk: args.vk,
    });
    const sent = await tx.signAndSend();
    return { result: sent.result as bigint, hash: sent.sendTransactionResponse.hash };
  } catch (err) {
    throw wrapContractCallError(err);
  }
}

export async function fund(
  client: ShariboClient,
  args: { circleId: bigint; from: string },
): Promise<TxResult<void>> {
  try {
    const tx = await client.fund({ circle_id: args.circleId, from: args.from });
    const sent = await tx.signAndSend();
    return { result: undefined, hash: sent.sendTransactionResponse.hash };
  } catch (err) {
    throw wrapContractCallError(err);
  }
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
  try {
    const tx = await client.claim({
      circle_id: args.circleId,
      recipient: args.recipient,
      nullifier_hash: args.nullifierHash,
      external_nullifier: args.externalNullifier,
      proof: args.proof,
    });
    const sent = await tx.signAndSend();
    return { result: undefined, hash: sent.sendTransactionResponse.hash };
  } catch (err) {
    throw wrapContractCallError(err);
  }
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
  try {
    // get_circle is a pure read: the SDK detects no signature is needed and
    // refuses signAndSend() without `force` (there's nothing to sign/submit).
    const tx = await client.get_circle({ circle_id: circleId });
    const sent = await tx.signAndSend({ force: true });
    return sent.result as CircleView;
  } catch (err) {
    throw wrapContractCallError(err);
  }
}

/** Pure read: whether `nullifierHash` has already claimed in this circle. */
export async function hasClaimed(
  client: ShariboClient,
  circleId: bigint,
  nullifierHash: bigint,
): Promise<boolean> {
  try {
    const tx = await client.has_claimed({
      circle_id: circleId,
      nullifier_hash: nullifierHash,
    });
    const sent = await tx.signAndSend({ force: true });
    return sent.result as boolean;
  } catch (err) {
    throw wrapContractCallError(err);
  }
}
