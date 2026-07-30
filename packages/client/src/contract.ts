import { Client as ContractClient, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContractProof, ContractVerificationKey } from "./prove.js";

export interface ShariboNetworkConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

// Methods are still attached at runtime from the on-chain contract spec via
// `@stellar/stellar-sdk`'s `contract.Client.from`. This interface is only the
// call-site contract for our wrappers (not a full client) so typos like
// `creat_circle` fail typecheck; we cast once in `connect()`.
//
// We evaluated `stellar contract bindings typescript` codegen and skipped it:
// it would freeze a build-time copy of the spec (drift vs live `from`), needs
// a wasm/bindings pipeline this package does not have, and we only call five
// method shapes — a structural interface + one cast is enough.
interface AssembledTx<T> {
  signAndSend(opts?: { force?: boolean }): Promise<{
    result: T;
    sendTransactionResponse: { hash: string };
  }>;
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

export interface ShariboClient {
  create_circle(args: {
    admin: string;
    token: string;
    root: bigint;
    contribution: bigint;
    size: number;
    vk: ContractVerificationKey;
  }): Promise<AssembledTx<bigint>>;
  fund(args: { circle_id: bigint; from: string }): Promise<AssembledTx<void>>;
  claim(args: {
    circle_id: bigint;
    recipient: string;
    nullifier_hash: bigint;
    external_nullifier: bigint;
    proof: ContractProof;
  }): Promise<AssembledTx<void>>;
  get_circle(args: { circle_id: bigint }): Promise<AssembledTx<CircleView>>;
  has_claimed(args: {
    circle_id: bigint;
    nullifier_hash: bigint;
  }): Promise<AssembledTx<boolean>>;
}

export async function connect(
  config: ShariboNetworkConfig,
  keypair: Keypair,
): Promise<ShariboClient> {
  const signer = basicNodeSigner(keypair, config.networkPassphrase);
  return (await ContractClient.from({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: keypair.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  })) as unknown as ShariboClient;
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
  const tx = await client.create_circle({
    admin: args.admin,
    token: args.token,
    root: args.root,
    contribution: args.contribution,
    size: args.size,
    vk: args.vk,
  });
  const sent = await tx.signAndSend();
  return { result: sent.result, hash: sent.sendTransactionResponse.hash };
}

export async function fund(
  client: ShariboClient,
  args: { circleId: bigint; from: string },
): Promise<TxResult<void>> {
  const tx = await client.fund({ circle_id: args.circleId, from: args.from });
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
  const tx = await client.claim({
    circle_id: args.circleId,
    recipient: args.recipient,
    nullifier_hash: args.nullifierHash,
    external_nullifier: args.externalNullifier,
    proof: args.proof,
  });
  const sent = await tx.signAndSend();
  return { result: undefined, hash: sent.sendTransactionResponse.hash };
}

export async function getCircle(client: ShariboClient, circleId: bigint): Promise<CircleView> {
  // get_circle is a pure read: the SDK detects no signature is needed and
  // refuses signAndSend() without `force` (there's nothing to sign/submit).
  const tx = await client.get_circle({ circle_id: circleId });
  const sent = await tx.signAndSend({ force: true });
  return sent.result;
}

/** Pure read: whether `nullifierHash` has already claimed in this circle. */
export async function hasClaimed(
  client: ShariboClient,
  circleId: bigint,
  nullifierHash: bigint,
): Promise<boolean> {
  const tx = await client.has_claimed({
    circle_id: circleId,
    nullifier_hash: nullifierHash,
  });
  const sent = await tx.signAndSend({ force: true });
  return sent.result;
}
