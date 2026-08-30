/**
 * Build a Stellar explorer URL for a transaction hash, network-aware.
 *
 * @param hash - Transaction hash (hex string).
 * @param networkPassphrase - Stellar network passphrase (e.g. "Test SDF Network ; September 2015").
 * @returns A fully-qualified stellar.expert URL.
 */
export function explorerTxUrl(hash: string, networkPassphrase: string): string {
  const subdomain = networkPassphrase.includes("Public Global")
    ? "" // mainnet — no subdomain prefix
    : "testnet.";
  return `https://${subdomain}stellar.expert/explorer/tx/${hash}`;
}
