// Pure crypto primitives (Poseidon, Merkle trees, identity/nullifier
// derivation) now live in @sharibo/core. Re-export them here so existing
// consumers (the app, mocks, etc.) can keep importing from "@sharibo/client".
export * from "@sharibo/core";

export * from "./prove.js";
export * from "./contract.js";
export * from "./config.js";

// SDK-specific error classes (base types come from @sharibo/core).
export {
  ProvingError,
  RpcError,
  ContractError,
} from "./errors.js";

// Re-exported for convenience so consumers can import from "@sharibo/client"
// rather than digging into the contract module.
export { explorerTxUrl } from "./contract.js";
