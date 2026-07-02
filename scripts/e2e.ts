// Full private round against Stellar testnet: create a 5-member circle,
// fund it from 5 distinct accounts, generate a real ZK proof for one member,
// claim the pot to a FRESH address unlinkable to any funder, then confirm a
// second claim with the same nullifier is rejected on-chain.
//
// Usage: npm run e2e   (from repo root, or `npm run e2e` inside scripts/)
// Requires: circuits/build/{membership_js/membership.wasm,membership_final.zkey}
// (run circuits/scripts/{compile,setup}.sh first) and a populated .env.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateIdentity,
  computeExternalNullifier,
  MerkleTree,
  generateProof,
  verificationKeyToContractFormat,
  connect,
  createCircle,
  fund,
  claim,
  getCircle,
} from "@sharibo/client";

process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));

const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE!;
const TOKEN = process.env.TEST_TOKEN_CONTRACT_ID!;
const CONTRACT_ID = process.env.SHARIBO_CONTRACT_ID!;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;

const LEVELS = 4;
const CIRCLE_SIZE = 5;
const CONTRIBUTION = 100_000_000n; // 10 XLM (7 decimals)
const CLAIMANT_INDEX = 2;

// Node's own fetch()/undici hung indefinitely against these two endpoints in
// this environment even with AbortSignal.timeout set, while plain `curl`
// consistently worked in seconds (see NOTES.md) — so these two HTTP calls
// specifically shell out to curl rather than use fetch.
async function curlGet(url: string): Promise<string> {
  const { stdout } = await execFileAsync("curl", ["-s", "--max-time", "15", url]);
  return stdout;
}

async function friendbotFund(publicKey: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await curlGet(`https://friendbot.stellar.org?addr=${publicKey}`);
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function nativeBalance(publicKey: string): Promise<bigint> {
  const body = await curlGet(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
  const account = JSON.parse(body);
  const native = account.balances.find((b: { asset_type: string }) => b.asset_type === "native");
  // Horizon reports balances as decimal XLM strings; convert to stroops.
  return BigInt(Math.round(parseFloat(native.balance) * 1e7));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// Testnet RPC calls occasionally stall rather than erroring outright; a
// bounded timeout turns that into a clear failure instead of a silent hang.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

async function main() {
  console.log("Sharibo e2e — full private round on Stellar testnet\n");

  const admin = Keypair.fromSecret(ADMIN_SECRET);

  console.log("1. Generating 5 member identities + funding their accounts via friendbot...");
  const members = Array.from({ length: CIRCLE_SIZE }, () => ({
    keypair: Keypair.random(),
    identity: generateIdentity(),
  }));
  for (const m of members) {
    await friendbotFund(m.keypair.publicKey());
  }
  console.log(
    "   members:",
    members.map((m) => m.keypair.publicKey()),
  );

  const tree = MerkleTree.create(
    LEVELS,
    members.map((m) => m.identity.commitment),
  );
  console.log("   Merkle root:", tree.root.toString());

  const vkJson = JSON.parse(
    readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "circuits", "verification_key.json"),
      "utf8",
    ),
  );
  const vk = verificationKeyToContractFormat(vkJson);

  console.log("\n2. Creating the circle...");
  const adminClient = await withTimeout(
    connect({ contractId: CONTRACT_ID, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }, admin),
    30_000,
    "connect(admin)",
  );
  const circleId = await withTimeout(
    createCircle(adminClient, {
      admin: admin.publicKey(),
      token: TOKEN,
      root: tree.root,
      contribution: CONTRIBUTION,
      size: CIRCLE_SIZE,
      vk,
    }),
    30_000,
    "createCircle",
  );
  console.log("   circle_id =", circleId);

  console.log("\n3. Funding from all 5 members...");
  for (const [i, m] of members.entries()) {
    const memberClient = await withTimeout(
      connect({ contractId: CONTRACT_ID, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }, m.keypair),
      30_000,
      `connect(member ${i})`,
    );
    await withTimeout(
      fund(memberClient, { circleId, from: m.keypair.publicKey() }),
      30_000,
      `fund(member ${i})`,
    );
    console.log(`   [${i + 1}/${CIRCLE_SIZE}] funded from`, m.keypair.publicKey());
  }
  const fundedCircle = await getCircle(adminClient, circleId);
  assert(
    fundedCircle.pot === CONTRIBUTION * BigInt(CIRCLE_SIZE),
    `pot should equal ${CIRCLE_SIZE} x contribution, got ${fundedCircle.pot}`,
  );
  console.log("   pot fully funded:", fundedCircle.pot.toString(), "stroops");

  console.log("\n4. Generating a real ZK proof for member", CLAIMANT_INDEX, "...");
  const claimant = members[CLAIMANT_INDEX];
  const merkleProof = tree.proof(CLAIMANT_INDEX);
  const externalNullifier = computeExternalNullifier(circleId, 0n);
  const { proof, nullifierHash, root, externalNullifier: provenExternalNullifier } =
    await generateProof({
      identityNullifier: claimant.identity.identityNullifier,
      identitySecret: claimant.identity.identitySecret,
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
      root: tree.root,
      externalNullifier,
    });
  assert(root === tree.root, "proof's public root must match the circle's root");
  assert(
    provenExternalNullifier === externalNullifier,
    "proof's public externalNullifier must match the expected round tag",
  );
  console.log("   proof generated, nullifierHash =", nullifierHash.toString());

  console.log("\n5. Generating a FRESH recipient address (never used as a funder)...");
  const recipient = Keypair.random();
  await friendbotFund(recipient.publicKey());
  console.log("   recipient =", recipient.publicKey());

  console.log("\n6. Claiming the pot to the fresh recipient...");
  const balanceBefore = await nativeBalance(recipient.publicKey());
  await withTimeout(
    claim(adminClient, {
      circleId,
      recipient: recipient.publicKey(),
      nullifierHash,
      externalNullifier,
      proof,
    }),
    30_000,
    "claim (round 0)",
  );
  const balanceAfter = await nativeBalance(recipient.publicKey());
  assert(
    balanceAfter - balanceBefore === CONTRIBUTION * BigInt(CIRCLE_SIZE),
    `recipient should have received exactly the pot (got delta ${balanceAfter - balanceBefore})`,
  );

  const claimedCircle = await getCircle(adminClient, circleId);
  assert(claimedCircle.pot === 0n, "pot should be empty after claim");
  assert(claimedCircle.round === 1, "round should have advanced to 1");
  console.log("   payout confirmed: pot -> 0, round -> 1");

  console.log("\n7. Funding round 1, then attempting to reuse round 0's nullifier...");
  // Fund a fresh round first so this specifically exercises nullifier-reuse
  // rejection (AlreadyClaimed) rather than the (also-true, but less
  // interesting) fact that an empty pot can't be claimed.
  for (const [i, m] of members.entries()) {
    const memberClient = await withTimeout(
      connect({ contractId: CONTRACT_ID, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }, m.keypair),
      30_000,
      `connect(member ${i}, round 1)`,
    );
    await withTimeout(
      fund(memberClient, { circleId, from: m.keypair.publicKey() }),
      30_000,
      `fund(member ${i}, round 1)`,
    );
    console.log(`   [${i + 1}/${CIRCLE_SIZE}] funded round 1 from`, m.keypair.publicKey());
  }
  const round1ExternalNullifier = computeExternalNullifier(circleId, 1n);

  let secondClaimRejected = false;
  try {
    await withTimeout(
      claim(adminClient, {
        circleId,
        recipient: Keypair.random().publicKey(),
        nullifierHash,
        externalNullifier: round1ExternalNullifier,
        proof,
      }),
      30_000,
      "claim (reuse attempt)",
    );
  } catch (err) {
    const message = (err as Error).message;
    secondClaimRejected = true;
    assert(
      message.includes("Error(Contract, #4)"),
      `expected AlreadyClaimed (#4), got: ${message.split("\n")[0]}`,
    );
    console.log("   rejected as expected (AlreadyClaimed):", message.split("\n")[0]);
  }
  assert(secondClaimRejected, "a second claim with the same nullifier must be rejected");

  console.log("\nAll assertions passed.");
  console.log(
    `Recipient ${recipient.publicKey()} is a freshly generated keypair with no on-chain history`,
    "connecting it to any of the 5 funders — that's the unlinkability the ZK proof buys.",
  );

  // The RPC client's underlying HTTP keep-alive connections otherwise leave
  // the process hanging after main() resolves.
  process.exit(0);
}

main().catch((err) => {
  console.error("\ne2e FAILED:", err);
  process.exit(1);
});
