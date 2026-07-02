const path = require("path");
const { expect } = require("chai");
const wasm_tester = require("circom_tester").wasm;
const {
  generateIdentity,
  computeExternalNullifier,
  computeNullifierHash,
} = require("../../packages/client/src/identity.ts");
const { MerkleTree } = require("../../packages/client/src/tree.ts");

const LEVELS = 4;

describe("Sharibo membership circuit (BLS12-381)", function () {
  this.timeout(120000);

  let circuit;
  let identities;
  let tree;

  before(async () => {
    circuit = await wasm_tester(path.join(__dirname, "..", "membership.circom"), {
      include: path.join(__dirname, "..", "..", "node_modules"),
      prime: "bls12381",
    });

    identities = Array.from({ length: 5 }, () => generateIdentity());
    tree = MerkleTree.create(
      LEVELS,
      identities.map((id) => id.commitment),
    );
  });

  async function buildInput(memberIndex, circleId, round) {
    const identity = identities[memberIndex];
    const merkleProof = tree.proof(memberIndex);
    const externalNullifier = await computeExternalNullifier(BigInt(circleId), BigInt(round));
    return {
      identityNullifier: identity.identityNullifier.toString(),
      identitySecret: identity.identitySecret.toString(),
      pathElements: merkleProof.pathElements.map((e) => e.toString()),
      pathIndices: merkleProof.pathIndices,
      root: merkleProof.root.toString(),
      externalNullifier: externalNullifier.toString(),
    };
  }

  async function expectThrows(fn) {
    let threw = false;
    try {
      await fn();
    } catch (e) {
      threw = true;
    }
    expect(threw, "expected the operation to throw").to.equal(true);
  }

  it("accepts a genuine member and outputs the correct nullifierHash", async () => {
    const input = await buildInput(2, 1, 0);
    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);

    const expected = computeNullifierHash(
      identities[2].identityNullifier,
      BigInt(input.externalNullifier),
    );
    await circuit.assertOut(witness, { nullifierHash: expected.toString() });
  });

  it("rejects a wrong root", async () => {
    const input = await buildInput(2, 1, 0);
    input.root = (BigInt(input.root) + 1n).toString();
    await expectThrows(() => circuit.calculateWitness(input, true));
  });

  it("rejects a non-member (tampered Merkle path)", async () => {
    const input = await buildInput(2, 1, 0);
    input.pathElements[0] = (BigInt(input.pathElements[0]) + 1n).toString();
    await expectThrows(() => circuit.calculateWitness(input, true));
  });

  it("nullifierHash is deterministic per identity+round and changes across rounds", async () => {
    await circuit.loadSymbols();
    const varIdx = circuit.symbols["main.nullifierHash"].varIdx;

    const inputA = await buildInput(3, 7, 0);
    const inputB = await buildInput(3, 7, 0);
    const inputNextRound = await buildInput(3, 7, 1);

    const witnessA = await circuit.calculateWitness(inputA, true);
    const witnessB = await circuit.calculateWitness(inputB, true);
    const witnessNextRound = await circuit.calculateWitness(inputNextRound, true);

    expect(witnessA[varIdx].toString()).to.equal(witnessB[varIdx].toString());
    expect(witnessA[varIdx].toString()).to.not.equal(
      witnessNextRound[varIdx].toString(),
    );
  });

  it("rejects a non-boolean pathIndices entry", async () => {
    const input = await buildInput(2, 1, 0);
    input.pathIndices[0] = 2;
    await expectThrows(() => circuit.calculateWitness(input, true));
  });
});
