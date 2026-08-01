# @sharibo/client

Isomorphic TypeScript SDK for interacting with Sharibo private savings circles on Stellar.

## Error Handling

The SDK exposes a typed error hierarchy, allowing consumers to distinguish between different failure states (such as invalid parameters, connection errors, and on-chain contract reverts).

### Error Hierarchy

- `ShariboError` (Base class extending `Error`)
  - `InvalidInputError` - Thrown when parameters or inputs (e.g., circle dimensions or Merkle tree leaf index boundaries) are invalid.
  - `ProvingError` - Thrown when generating the zero-knowledge Groth16 proof locally or client-side (via `snarkjs`) fails.
  - `RpcError` - Thrown when network connection, RPC endpoint queries, or ledger submissions flake.
  - `ContractError` - Thrown when the on-chain smart contract rejects the transaction or simulation fails. Contains an optional numeric `code` property mapping to the custom error code returned by the contract.

### Example Usage

```typescript
import {
  connect,
  claim,
  ContractError,
  RpcError,
  ProvingError,
  InvalidInputError,
} from "@sharibo/client";

try {
  const client = await connect(config, keypair);
  await claim(client, { ...claimArgs });
} catch (err) {
  if (err instanceof ContractError) {
    console.error(`Contract execution failed with code: ${err.code}`);
    console.error(err.message);
  } else if (err instanceof RpcError) {
    console.error("Network/RPC request failed:", err.message);
  } else if (err instanceof ProvingError) {
    console.error("ZK Proof generation failed:", err.message);
  } else if (err instanceof InvalidInputError) {
    console.error("Input validation failed:", err.message);
  } else {
    console.error("Unexpected error:", err);
  }
}
```
