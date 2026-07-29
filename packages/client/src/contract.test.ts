import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { connect, createCircle, fund, claim, type ShariboClient } from "./contract.js";

const VALID_ACCOUNT = Keypair.random().publicKey();
const INVALID_ACCOUNT = "not-an-address";

// A real, deployed Sharibo contract ID (see README's "On-chain evidence"
// table) — passes StrKey's checksum, unlike an arbitrary made-up string.
const VALID_CONTRACT = "CB64IZIBBSPUY63UMIVACKWDKRFNH6WJ2EPAOLM7QR4ZI6IJOT4N2LCF";
const INVALID_CONTRACT = "not-a-contract-id";

// Stub client: `createCircle`/`fund`/`claim` must validate *before* ever
// calling into the client, so a valid-input test can run fully offline
// (no RPC) while still exercising the real function body end to end.
function stubClient(): ShariboClient {
  const stubTx = { signAndSend: async () => ({ result: undefined, sendTransactionResponse: { hash: "stub" } }) };
  return {
    create_circle: async () => stubTx,
    fund: async () => stubTx,
    claim: async () => stubTx,
  };
}

test("createCircle rejects an invalid admin address", async () => {
  await assert.rejects(
    () =>
      createCircle(stubClient(), {
        admin: INVALID_ACCOUNT,
        token: VALID_CONTRACT,
        root: 0n,
        contribution: 1n,
        size: 5,
        vk: {} as never,
      }),
    /admin is not a valid Stellar address/,
  );
});

test("createCircle accepts a valid admin address", async () => {
  await createCircle(stubClient(), {
    admin: VALID_ACCOUNT,
    token: VALID_CONTRACT,
    root: 0n,
    contribution: 1n,
    size: 5,
    vk: {} as never,
  });
});

test("createCircle rejects an invalid token contract ID", async () => {
  await assert.rejects(
    () =>
      createCircle(stubClient(), {
        admin: VALID_ACCOUNT,
        token: INVALID_CONTRACT,
        root: 0n,
        contribution: 1n,
        size: 5,
        vk: {} as never,
      }),
    /token is not a valid Stellar contract ID/,
  );
});

test("createCircle accepts a valid token contract ID", async () => {
  await createCircle(stubClient(), {
    admin: VALID_ACCOUNT,
    token: VALID_CONTRACT,
    root: 0n,
    contribution: 1n,
    size: 5,
    vk: {} as never,
  });
});

test("fund rejects an invalid from address", async () => {
  await assert.rejects(
    () => fund(stubClient(), { circleId: 0n, from: INVALID_ACCOUNT }),
    /from is not a valid Stellar address/,
  );
});

test("fund accepts a valid from address", async () => {
  await fund(stubClient(), { circleId: 0n, from: VALID_ACCOUNT });
});

test("claim rejects an invalid recipient address", async () => {
  await assert.rejects(
    () =>
      claim(stubClient(), {
        circleId: 0n,
        recipient: INVALID_ACCOUNT,
        nullifierHash: 0n,
        externalNullifier: 0n,
        proof: {} as never,
      }),
    /recipient is not a valid Stellar address/,
  );
});

test("claim accepts a valid recipient address", async () => {
  await claim(stubClient(), {
    circleId: 0n,
    recipient: VALID_ACCOUNT,
    nullifierHash: 0n,
    externalNullifier: 0n,
    proof: {} as never,
  });
});

test("connect rejects an invalid config.contractId", async () => {
  await assert.rejects(
    () =>
      connect(
        { contractId: INVALID_CONTRACT, rpcUrl: "https://example.invalid", networkPassphrase: "Test" },
        Keypair.random(),
      ),
    /config\.contractId is not a valid Stellar contract ID/,
  );
});

// connect()'s valid-input path calls stellar-sdk's ContractClient.from,
// which fetches the live contract spec over RPC — that's exercised by
// scripts/e2e.ts against real testnet infrastructure, not here, so this
// suite stays offline like the rest of the client's unit tests.
