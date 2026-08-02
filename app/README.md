# Sharibo app

This folder contains the React + Vite browser demo for the Sharibo project.

It runs a live testnet demo in the browser using a compiled circuit, a Soroban contract, and real Stellar testnet transactions.

## Setup

1. Install dependencies.

From the repository root:

```bash
npm install
```

Then go into the app folder:

```bash
cd app
```

2. Copy the app environment file.

```bash
cp .env.example .env
```

3. Fill in the required `VITE_` variables in `app/.env`.

- `VITE_SHARIBO_CONTRACT_ID`
  - The deployed Sharibo contract ID on Stellar testnet.
- `VITE_STELLAR_RPC_URL`
  - The Stellar RPC endpoint the demo uses.
  - Default value in `.env.example`: `https://soroban-testnet.stellar.org`
- `VITE_STELLAR_NETWORK_PASSPHRASE`
  - The network passphrase for the Stellar network.
  - Default value in `.env.example`: `Test SDF Network ; September 2015`
- `VITE_TEST_TOKEN_CONTRACT_ID`
  - The contract ID of the test token used for funding the circle.

## Circuit artifacts

The app expects the following circuit artifacts to exist in `app/public/circuits/`:

- `membership.wasm`
- `membership_final.zkey`
- `verification_key.json`

`npm run dev` and `npm run build` automatically run `npm run sync-circuit` first. That script copies these files from the repository `circuits/` build output into `app/public/circuits/`.

### What `scripts/sync-circuit.mjs` does

It copies:

- `circuits/build/membership_js/membership.wasm` → `app/public/circuits/membership.wasm`
- `circuits/build/membership_final.zkey` → `app/public/circuits/membership_final.zkey`
- `circuits/verification_key.json` → `app/public/circuits/verification_key.json`

If any of the source files are missing, the script exits with an error and tells you to run the circuit build/setup scripts first.

### Circuit compile prerequisite

Before the app can sync and run, the circuit artifacts must already be built in the repository root under `circuits/build/`.

Run this first from the repo root:

```bash
cd circuits
npm run compile
npm run setup
```

If you are working on the full repo, also verify the circuit once compiled:

```bash
npm test
```

## Running the app

Start the local development server:

```bash
cd app
npm run dev
```

This runs `npm run sync-circuit` first, then starts Vite.

Open the URL shown by Vite in your browser to use the app.

## What the demo does on-chain

The app is not a mock demo. It creates and uses real Stellar testnet state for each run.

- The browser demo loads the compiled circuit artifacts from `public/circuits/`.
- It constructs a real Groth16 proof in the browser.
- It uses the configured `VITE_SHARIBO_CONTRACT_ID` and `VITE_TEST_TOKEN_CONTRACT_ID`.
- It creates a real testnet Sharibo circle and funds it with test token deposits.
- It submits a real contract `claim` transaction on Stellar testnet.

That means every run produces actual testnet transactions and interacts with live Stellar infrastructure.

## Build and preview

Build the production app:

```bash
cd app
npm run build
```

`npm run build` also runs `npm run sync-circuit` first, so the latest built circuit artifacts are copied into `app/public/circuits/` before the bundle is generated.

Preview the production build locally:

```bash
cd app
npm run preview
```

## Notes

- `app/.env` is loaded by Vite only for variables that start with `VITE_`.
- If `app/public/circuits/` does not contain the expected files, `npm run dev` / `npm run build` will fail.
- The circuit artifacts in `app/public/circuits/` are copied from the repository `circuits/` folder; make sure `circuits/` is compiled and the trusted setup is complete before running the app.
