// One-off generator for circuits/input.example.json: builds a tiny 3-member
// circle in a levels=4 tree and writes a genuinely provable witness for the
// member at index 1, claiming circleId=1, round=0. Run with:
//   node -r tsx/cjs scripts/gen-example-input.cjs
const fs = require("fs");
const path = require("path");
const {
  generateIdentity,
  computeExternalNullifier,
} = require("../../packages/client/src/identity.ts");
const { MerkleTree } = require("../../packages/client/src/tree.ts");

const LEVELS = 4;
const CLAIMANT_INDEX = 1;
const CIRCLE_ID = 1n;
const ROUND = 0n;

async function main() {
  const identities = await Promise.all(
    Array.from({ length: 3 }, () => generateIdentity()),
  );
  const tree = await MerkleTree.create(
    LEVELS,
    identities.map((id) => id.commitment),
  );
  const identity = identities[CLAIMANT_INDEX];
  const merkleProof = tree.proof(CLAIMANT_INDEX);
  const externalNullifier = await computeExternalNullifier(CIRCLE_ID, ROUND);

  const input = {
    identityNullifier: identity.identityNullifier.toString(),
    identitySecret: identity.identitySecret.toString(),
    pathElements: merkleProof.pathElements.map((e) => e.toString()),
    pathIndices: merkleProof.pathIndices,
    root: merkleProof.root.toString(),
    externalNullifier: externalNullifier.toString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "input.example.json"),
    JSON.stringify(input, null, 2) + "\n",
  );
  console.log("wrote input.example.json for member index", CLAIMANT_INDEX);
  console.log(input);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
