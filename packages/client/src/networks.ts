export interface NetworkPreset {
  passphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  friendbotUrl?: string;
  explorerBase: string;
}

export const NETWORKS: Record<string, NetworkPreset> = {
  testnet: {
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    explorerBase: "https://stellar.expert/explorer/testnet",
  },
  mainnet: {
    passphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://soroban-rpc.stellar.org",
    horizonUrl: "https://horizon.stellar.org",
    explorerBase: "https://stellar.expert/explorer/public",
  },
  futurenet: {
    passphrase: "Test SDF Future Network ; October 2022",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
    explorerBase: "https://stellar.expert/explorer/futurenet",
  },
};

export function networkOf(passphrase: string): NetworkPreset | "custom" {
  for (const preset of Object.values(NETWORKS)) {
    if (preset.passphrase === passphrase) {
      return preset;
    }
  }
  return "custom";
}
