export const NETWORK = {
  contractId: import.meta.env.VITE_SHARIBO_CONTRACT_ID as string,
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL as string,
  networkPassphrase: import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE as string,
};
export const TOKEN = import.meta.env.VITE_TEST_TOKEN_CONTRACT_ID as string;
export const LEVELS = 4;
export const CIRCLE_SIZE = 5;
export const STROOPS_PER_XLM = 10_000_000n;
