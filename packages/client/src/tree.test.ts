import { test } from "node:test";
import assert from "node:assert/strict";
import { MerkleTree } from "./tree.js";
import { generateIdentity } from "./identity.js";

const LEVELS = 4;

test("proofOf returns a valid Merkle proof for a leaf known to be in the tree", () => {
  const identities = Array.from({ length: 5 }, () => generateIdentity());
  const leaves = identities.map((id) => id.commitment);
  const tree = MerkleTree.create(LEVELS, leaves);

  const proof = tree.proofOf(leaves[2]);
  assert.equal(proof.root, tree.root);
  assert.equal(proof.pathElements.length, LEVELS);
  assert.equal(proof.pathIndices.length, LEVELS);

  // The path should match the one returned by proof(indexOf(leaf)).
  const expected = tree.proof(tree.indexOf(leaves[2]));
  assert.deepEqual(proof.pathElements, expected.pathElements);
  assert.deepEqual(proof.pathIndices, expected.pathIndices);
  assert.equal(proof.root, expected.root);
});

test("proofOf returns a valid proof for the first and last occupied leaf", () => {
  const identities = Array.from({ length: 5 }, () => generateIdentity());
  const leaves = identities.map((id) => id.commitment);
  const tree = MerkleTree.create(LEVELS, leaves);

  for (const leaf of [leaves[0], leaves[identities.length - 1]]) {
    const proof = tree.proofOf(leaf);
    assert.equal(proof.root, tree.root);
    assert.equal(proof.pathElements.length, LEVELS);
  }
});

test("proofOf throws a descriptive error for a leaf not in the tree", () => {
  const identities = Array.from({ length: 5 }, () => generateIdentity());
  const leaves = identities.map((id) => id.commitment);
  const tree = MerkleTree.create(LEVELS, leaves);

  const unknownLeaf = generateIdentity().commitment;
  // Make sure it really isn't in the tree.
  assert.equal(tree.indexOf(unknownLeaf), -1);

  assert.throws(
    () => tree.proofOf(unknownLeaf),
    (err: Error) => {
      return (
        err.message.includes("not found in this tree") &&
        err.message.includes("16 slots") &&
        err.message.includes("5 occupied")
      );
    },
  );
});

test("proofOf error message includes a shortened hex representation of the leaf", () => {
  const identities = Array.from({ length: 5 }, () => generateIdentity());
  const leaves = identities.map((id) => id.commitment);
  const tree = MerkleTree.create(LEVELS, leaves);

  const unknownLeaf = generateIdentity().commitment;
  assert.throws(
    () => tree.proofOf(unknownLeaf),
    (err: Error) => {
      // The error should mention "0x" (the hex prefix) and "not found"
      return err.message.startsWith("leaf 0x") && err.message.includes("not found");
    },
  );
});

test("proofOf works for a tree with a single leaf", () => {
  const identity = generateIdentity();
  const tree = MerkleTree.create(LEVELS, [identity.commitment]);

  const proof = tree.proofOf(identity.commitment);
  assert.equal(proof.root, tree.root);
  assert.equal(proof.pathElements.length, LEVELS);
});

test("proofOf throws for a leaf not in a tree that has zero occupied slots (empty)", () => {
  const tree = MerkleTree.create(LEVELS, []);
  const unknownLeaf = generateIdentity().commitment;

  assert.throws(
    () => tree.proofOf(unknownLeaf),
    (err: Error) => {
      return (
        err.message.includes("not found in this tree") &&
        err.message.includes("0 occupied")
      );
    },
  );
});
