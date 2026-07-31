# Contributing to Sharibo

Thanks for contributing! Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Dependency update policy

Sharibo is a cryptographic project: the client proves Groth16 proofs with `snarkjs`
and the Poseidon hashes (`poseidon-bls12381`, `poseidon-bls12381-circom`), and it
talks to the Stellar network through `@stellar/stellar-sdk`. An unreviewed minor-version
drift in any of those packages is a supply-chain surface, so we are deliberate about
when and how they move.

### Pinning rules

- **Runtime crypto dependencies are pinned exactly** in every workspace: `snarkjs`,
  `poseidon-*`, and `@stellar/stellar-sdk` must use exact versions (e.g. `"snarkjs": "0.7.6"`),
  never a range (`^`, `~`, `>=`).
- **Ranged versions are acceptable for devDependencies** and non-crypto runtime
  dependencies, though exact pins are always welcome.
- When a package is added to a workspace, pin it according to the rules above in the
  same commit.

### How updates happen

1. **Deliberate PR only.** Never run a blanket `npm update` or `npx npm-check-updates -u`.
   Dependency bumps go through a normal review PR, one logical change at a time.
2. **Changelog review for crypto deps.** Before upgrading `snarkjs`, `poseidon-*`, or
   `@stellar/stellar-sdk`, read the package's changelog/release notes for security
   fixes, breaking changes, and parameter or input-format changes that could affect
   generated proofs or on-chain verification. State what you reviewed in the PR body.
3. **Check for duplicates.** After any change, run `npm ls <package>` (e.g.
   `npm ls snarkjs`, `npm ls poseidon-bls12381`) from the repo root and confirm there
   is exactly one installed version — duplicate copies of a crypto dependency defeat
   the purpose of pinning.
4. **Keep the lockfile in sync.** `package-lock.json` must be updated in the same PR
   as the manifest change (`npm install --package-lock-only --ignore-scripts`).

## Development

- **Install:** `npm install` at the repo root (npm workspaces).
- **Type-check:** `npm run typecheck --workspace=@sharibo/client`
- **Client tests:** `npm test --workspace=@sharibo/client`
- **Circuit tests:** `npm test --workspace=@sharibo/circuits`
- **End-to-end:** `npm run e2e`
