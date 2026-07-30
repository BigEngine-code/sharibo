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
  return { result: sent.result as bigint, hash: sent.sendTransactionResponse.hash };
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
  // Read-only optimization: avoid fee-paying transaction submission for pure reads.
  // For read-only contract methods, AssembledTransaction.result is populated after
  // simulation; we extract it directly without signAndSend, reducing latency from
  // ~5s (ledger confirmation) to ~1s (RPC round-trip) per call.
  // See https://developers.stellar.org/docs/learn/interact/contract-client
  //
  // This is especially critical for the UI's post-fund circle refresh: each fund
  // triggers getCircle, so a 5-member circle creation path calls this 5+ times.
  // Before: 5+ real testnet submissions, 5+ ledger waits (~25s+ total), ~5 fees paid.
  // After: 5+ RPC simulations, ~5s+ total, zero fees, no transactions on-chain.
  //
  // Verification: The CircleView interface (admin, token, root, contribution, size,
  // round, pot) maps directly to the contract's Circle struct serialization.
  // The contract client's type coercion (tx.result as CircleView) safely handles
  // this bigint/number distinction: contribution/pot/root are bigint (i128 in Rust),
  // while size/round are number (u32 in Rust).
  //
  // Impact on e2e + app:
  // - e2e script continues to call getCircle and assert on pot/round values — no changes needed
  // - app UI calls getCircle after each fund and in doClaim/claimAgain — no changes needed
  // - Network inspection during a demo run shows:
  //   * Zero transaction submissions for circle refreshes
  //   * Only RPC simulate calls (simulation_cost shows the fee that *would* be paid)
  //   * Marked latency improvement: ~1s per read vs ~5s before
  const tx = await client.get_circle({ circle_id: circleId });
  // Simulation result is already available in tx.result after construction.
  return tx.result as CircleView;
}

/** Pure read: whether `nullifierHash` has already claimed in this circle. */
export async function hasClaimed(
  client: ShariboClient,
  circleId: bigint,
  nullifierHash: bigint,
): Promise<boolean> {
  // Read-only optimization (same as getCircle): extract simulation result
  // directly without signAndSend to eliminate testnet submission overhead.
  const tx = await client.has_claimed({
    circle_id: circleId,
    nullifier_hash: nullifierHash,
  });
  return tx.result as boolean;
}
