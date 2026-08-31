import { describe, it, expect } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { checkNetworkMatch, buildNetworkMismatchMessage } from "./wallet.freighter";

describe("checkNetworkMatch", () => {
  it("returns null when wallet and app networks match (both TESTNET)", () => {
    const result = checkNetworkMatch("TESTNET", Networks.TESTNET_NETWORK);
    expect(result).toBeNull();
  });

  it("returns null when wallet and app networks match (both PUBLIC/MAINNET)", () => {
    const result = checkNetworkMatch("PUBLIC", Networks.PUBLIC_NETWORK);
    expect(result).toBeNull();
  });

  it("returns null when wallet and app networks match (both FUTURENET)", () => {
    const result = checkNetworkMatch("FUTURENET", Networks.FUTURENET_NETWORK);
    expect(result).toBeNull();
  });

  it("detects mismatch when wallet is TESTNET but app is PUBLIC", () => {
    const result = checkNetworkMatch("TESTNET", Networks.PUBLIC_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Testnet");
    expect(result?.appNetwork).toBe("Mainnet");
    expect(result?.walletPassphrase).toBe(Networks.TESTNET_NETWORK);
    expect(result?.appPassphrase).toBe(Networks.PUBLIC_NETWORK);
  });

  it("detects mismatch when wallet is PUBLIC but app is TESTNET", () => {
    const result = checkNetworkMatch("PUBLIC", Networks.TESTNET_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Mainnet");
    expect(result?.appNetwork).toBe("Testnet");
  });

  it("detects mismatch when wallet is FUTURENET but app is TESTNET", () => {
    const result = checkNetworkMatch("FUTURENET", Networks.TESTNET_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Futurenet");
    expect(result?.appNetwork).toBe("Testnet");
  });

  it("detects mismatch when wallet is TESTNET but app is FUTURENET", () => {
    const result = checkNetworkMatch("TESTNET", Networks.FUTURENET_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Testnet");
    expect(result?.appNetwork).toBe("Futurenet");
  });

  it("detects mismatch when wallet is PUBLIC but app is FUTURENET", () => {
    const result = checkNetworkMatch("PUBLIC", Networks.FUTURENET_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Mainnet");
    expect(result?.appNetwork).toBe("Futurenet");
  });

  it("detects mismatch when wallet is FUTURENET but app is PUBLIC", () => {
    const result = checkNetworkMatch("FUTURENET", Networks.PUBLIC_NETWORK);
    expect(result).not.toBeNull();
    expect(result?.walletNetwork).toBe("Futurenet");
    expect(result?.appNetwork).toBe("Mainnet");
  });

  it("returns null for unknown wallet network (graceful degradation)", () => {
    const result = checkNetworkMatch("UNKNOWN_NETWORK", Networks.TESTNET_NETWORK);
    expect(result).toBeNull();
  });

  it("returns human-readable network names in the error object", () => {
    const result = checkNetworkMatch("PUBLIC", Networks.TESTNET_NETWORK);
    expect(result?.walletNetwork).toBe("Mainnet");
    expect(result?.appNetwork).toBe("Testnet");
    expect(result?.walletPassphrase).toBe(Networks.PUBLIC_NETWORK);
    expect(result?.appPassphrase).toBe(Networks.TESTNET_NETWORK);
  });
});

describe("buildNetworkMismatchMessage", () => {
  it("builds a clear error message from a mismatch error", () => {
    const mismatchError = checkNetworkMatch("PUBLIC", Networks.TESTNET_NETWORK);
    expect(mismatchError).not.toBeNull();
    
    const message = buildNetworkMismatchMessage(
      mismatchError!,
      "Please switch to Testnet in Freighter."
    );
    
    expect(message).toContain("Mainnet");
    expect(message).toContain("Testnet");
    expect(message).toContain("Please switch to Testnet in Freighter.");
  });

  it("includes both wallet and app network names in the message", () => {
    const mismatchError = checkNetworkMatch("FUTURENET", Networks.PUBLIC_NETWORK);
    expect(mismatchError).not.toBeNull();
    
    const message = buildNetworkMismatchMessage(
      mismatchError!,
      "Switch in Freighter settings."
    );
    
    expect(message).toContain("Futurenet");
    expect(message).toContain("Mainnet");
  });
});
