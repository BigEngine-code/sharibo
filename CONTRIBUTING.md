# Contributing to Sharibo

We welcome contributions! Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Quick start with `just`

If you have [`just`](https://github.com/casey/just#installation) installed, a full local verification is one command away:

```bash
just all        # circuits + contract + client typecheck + app build (everything except e2e)
```

Available recipes:

| Recipe       | What it runs                                                                 |
|--------------|------------------------------------------------------------------------------|
| `just circuits` | Compile the Circom circuit, run the Groth16 trusted setup, and run circuit tests |
| `just contract` | Run `cargo test` and `stellar contract build` in `contracts/`                |
| `just client`   | TypeScript typecheck (`tsc --noEmit`) for `packages/client/`                 |
| `just e2e`      | Run the full end-to-end test against live Stellar testnet                    |
| `just app`      | Start the Vite dev server for the browser demo                               |
| `just all`      | Run all of the above except `e2e` (which consumes testnet friendbot quota)   |

> **`just` is optional.** Every recipe wraps the raw commands documented in
> [README.md — Run it](README.md#run-it). You can follow those instructions
> directly without installing anything extra.

## Running without `just`

Follow the step-by-step instructions in [README.md](README.md#run-it). Each
section (circuits, contract, e2e, app) gives the exact shell commands with no
abstraction layer.

## Other ways to help

- [Open issues](https://github.com/crackedstudio/sharibo/issues) — bug reports,
  feature requests, and good-first-issue tags.
- Pull requests — please open an issue first to discuss the change.
- Review the [roadmap](README.md#roadmap) and [honest limitations](README.md#honest-limitations)
  for areas that need work.
