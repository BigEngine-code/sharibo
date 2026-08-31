/**
 * @sharibo/client — public API.
 *
 * Every symbol below is a deliberate, supported part of the public surface;
 * anything else exported from the source modules (field constants, artifact
 * prefetch machinery, internal helpers) is internal and lives behind the
 * `./internal` subpath — see `./internal.ts`. The list here is the source of
 * truth cross-checked against `README.md` by `src/index.test.ts`.
 *
 * Values and types are separated so bundlers can drop the `export type`
 * entries entirely.
 */

// ── Identity & field arithmetic ───────────────────────────────────────
export {
  generateIdentity,
  poseidon,
  randomFieldElement,
  computeExternalNullifier,
  computeNullifierHash,
} from "./identity.js";
export type { Identity } from "./identity.js";

// ── Merkle tree ───────────────────────────────────────────────────────
export {
  MerkleTree,
  ZERO_VALUE,
  TREE_LEVELS,
  MAX_CIRCLE_SIZE,
} from "./tree.js";
export type { MerkleProof } from "./tree.js";

// ── Proving ───────────────────────────────────────────────────────────
export {
  generateProof,
  verificationKeyToContractFormat,
  validateCircuitInput,
} from "./prove.js";
export type {
  CircuitInput,
  ContractProof,
  ContractVerificationKey,
} from "./prove.js";

// ── Contract client ───────────────────────────────────────────────────
export {
  connect,
  createCircle,
  fund,
  claim,
  getCircle,
  getCircleCount,
  getRound,
  getPot,
  getStatus,
  getContributors,
  hasClaimed,
  cancelCircle,
  explorerTxUrl,
} from "./contract.js";
export type {
  ShariboNetworkConfig,
  ShariboClient,
  ShariboSigner,
  TxResult,
  CircleView,
} from "./contract.js";

// ── Errors ────────────────────────────────────────────────────────────
export {
  ShariboError,
  InvalidInputError,
  ProvingError,
  RpcError,
  ContractError,
} from "./errors.js";