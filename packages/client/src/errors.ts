// SDK-specific error classes that build on the pure crypto primitives'
// error base types. The shared base (`ShariboError`) and `InvalidInputError`
// (thrown by the pure field/primitives) live in @sharibo/core. We import
// `ShariboError` here to subclass it, and re-export both so consumers can
// keep importing them from @sharibo/client.
import { ShariboError } from "@sharibo/core";
export { ShariboError, InvalidInputError } from "@sharibo/core";

export class ProvingError extends ShariboError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class RpcError extends ShariboError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ContractError extends ShariboError {
  readonly code?: number;

  constructor(message: string, code?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}
