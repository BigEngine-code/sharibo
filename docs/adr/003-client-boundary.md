# ADR 003: Client boundary between app, SDK, and contract

- **Status:** Accepted
- **Date:** 2026-08-30
- **Context:** Decision record for the contract-facing boundary used by the browser app, the client SDK, and the runtime contract API discovery.

## Context

The project currently uses a three-layer design:

1. The browser app owns orchestration and user UX.
2. The SDK exposes a small set of free functions that operate on an untyped client object.
3. The contract interface is discovered at runtime from Soroban metadata / generated server-side contract bindings, rather than being code-generated into a fully-typed, package-level API.

This shape is a pragmatic outcome of the hackathon phase: the team needed to ship a working demo quickly, without first stabilizing a typed contract schema, without a final SDK facade, and without blocking the app on a large codegen or abstraction layer.

The boundary is visible in the current code: the app orchestrates flows, while the SDK methods roughly correspond to contract operations (`create_circle`, `fund`, `claim`, `get_circle`, etc.) and accept `client` as the first argument. They are deliberately thin and free-function oriented rather than a stateful `ShariboSDK` object.

That choice has been workable because the contract API was still evolving, the exact wire format was not yet a stable public product surface, and the project needed to move quickly with a small amount of code that could change without broad refactors.

## Decision drivers

### Why the current boundary was chosen

Under hackathon time pressure, the design optimized for the following:

- **Fast iteration:** the contract and app both changed while the project was still proving the core idea.
- **Low ceremony:** no generated client layer or wrapper API to maintain while the schema was in flux.
- **Runtime flexibility:** Soroban contract specs and runtime values can be re-discovered without a full regen of every call site.
- **Minimal architectural commitment:** the app can orchestrate calls while the SDK remains a thin, composable layer rather than a richer object model that may be wrong before the product constraints are stable.

This is the cheapest path to get a working end-to-end flow: app logic + SDK free functions + contract runtime discovery.

### Options considered

#### Option A — Free functions + untyped client (status quo)

This is the current design.

- **Shape:** `fund(client, args)`, `claim(client, args)`, etc.
- **Strengths:** minimal setup, easy to call from the app, flexible during a moving target contract API, small footprint, easy to evolve with the contract.
- **Weaknesses:** the client is effectively `any`, so the boundary is not self-documenting; TypeScript does not protect call sites from drift; package boundaries are looser than a formal typed SDK.

#### Option B — Generated bindings + thin wrappers

A generated contract client would give us typed call signatures and stronger validation of contract and SDK agreement.

- **Strengths:** clear public API, tooling support, stronger compile-time correctness, easier for downstream apps to use safely.
- **Weaknesses:** requires a stable contract schema and a code generation flow that is currently more expensive than the project needs; the generated layer creates churn when the contract is still evolving; it is a better fit once the boundary is settled.

#### Option C — Stateful `ShariboSDK` facade

A stateful SDK object would own config, client-lifecycle management, and convenience methods for common flows.

- **Strengths:** clean app-facing object model, better ergonomics for a product-grade SDK, easier to maintain as a public API if we want one shared facade.
- **Weaknesses:** too much abstraction too early; it hard-wires a design decision before the contract boundary is settled; it creates a broader API surface than the project currently needs; it would be premature under a hackathon timeline.

## Decision

Keep the current boundary as the authoritative design for now:

- the app remains the orchestrator,
- the SDK remains a thin collection of free functions,
- the contract spec remains discovered at runtime,
- the `client` parameter remains untyped in the SDK surface as a deliberate, minimal boundary.

This is the right decision for the current phase because the contract is still evolving and the project is still validating the overall product shape. The cost of prematurely formalizing the boundary would be higher than the benefit of a cleaner public API.

We will not introduce a typed generated client or a stateful SDK facade until the project has a stable contract spec and a concrete product-level API contract to preserve. At that point, the work should move into the follow-up issues for typed bindings and the SDK facade.

## Consequences

### Positive

- The project keeps moving quickly with a small API surface.
- The app can adapt to contract changes without a major SDK refactor.
- The boundary remains intentionally thin and composable.
- This is easier to maintain before the contract stabilizes.

### Negative

- The SDK does not give compile-time guarantees about contract shape.
- The app can drift from the contract API without strong structural feedback.
- Package boundaries are intentionally loose and may be less ergonomic for consumers.
- The design is a deliberate compromise rather than a final public API.

### Follow-up work

This ADR should be read alongside the implementation work for:

- typed bindings: [Typed bindings issue](https://github.com/crackedstudio/sharibo/issues?q=typed+bindings)
- SDK facade: [SDK facade issue](https://github.com/crackedstudio/sharibo/issues?q=SDK+facade)

These are the issues that will carry the eventual migration from the current thin free-function boundary to a stricter, product-grade interface once the contract and app architecture settle.

## Related issues

- [Typed bindings](https://github.com/crackedstudio/sharibo/issues?q=typed+bindings)
- [SDK facade](https://github.com/crackedstudio/sharibo/issues?q=SDK+facade)

## Summary

The project chose a deliberately minimal contract boundary under time pressure: free functions over an untyped client, app-managed orchestration, and runtime contract discovery. That is the right choice for now, but it should be treated as a transitional architecture, not the final public shape of the SDK.
