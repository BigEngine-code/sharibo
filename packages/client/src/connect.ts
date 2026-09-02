import { Client as ContractClient, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * Network configuration for connecting to the Sharibo contract.
 *
 * @property contractId - The Stellar contract ID.
 * @property rpcUrl - The RPC URL for the Stellar network.
 * @property networkPassphrase - The network passphrase (e.g., "Test SDF Network").
 */
export interface ShariboNetworkConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

/**
 * A Sharibo contract client with dynamically attached methods.
 *
 * The contract's methods (create_circle/fund/claim/get_circle/has_claimed)
 * are attached to the Client at runtime from the on-chain contract spec (see
 * @stellar/stellar-sdk's `contract.Client.from`), so they aren't visible to
 * TypeScript's static checker — hence `any` here rather than a hand-rolled
 * or codegen'd interface. Keeps this SDK working against whatever the
 * deployed contract's real spec is, rather than a copy that can drift.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShariboClient = any;

export interface ShariboSigner {
  publicKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction: (txXdr: string, opts?: any) => Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAuthEntry?: (entryXdr: string, opts?: any) => Promise<string>;
}

export async function connect(
  config: ShariboNetworkConfig,
  keypairOrSigner: Keypair | ShariboSigner,
): Promise<ShariboClient> {
  let publicKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signTransaction: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signAuthEntry: any;

  if (keypairOrSigner instanceof Keypair) {
    const signer = basicNodeSigner(keypairOrSigner, config.networkPassphrase);
    publicKey = keypairOrSigner.publicKey();
    signTransaction = signer.signTransaction;
    signAuthEntry = signer.signAuthEntry;
  } else {
    publicKey = keypairOrSigner.publicKey;
    signTransaction = keypairOrSigner.signTransaction;
    signAuthEntry = keypairOrSigner.signAuthEntry;
  }

  return ContractClient.from({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey,
    signTransaction,
    signAuthEntry,
  });
}

// ── withRetry ────────────────────────────────────────────────────────────────
// Retries the simulation/preparation phase of a contract call on transient
// errors (429 / 503 / timeouts). The submit phase is never retried — once a
// transaction is signed and sent, retrying could cause a double-spend.

const RETRY_DELAYS_MS = [500, 1000, 2000];

export function isTransient(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("Too Many Requests")
  );
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length && isTransient(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
