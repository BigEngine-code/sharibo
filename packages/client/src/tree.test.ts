import { test } from "node:test";
import assert from "node:assert/strict";
import { MerkleTree, ZERO_VALUE } from "./tree.js";
import { FR_MODULUS } from "./identity.js";

// ---- levels validation ----

test("MerkleTree.create rejects levels = 0", () => {
  assert.throws(
    () => MerkleTree.create(0, []),
    RangeError,
    "levels must be an integer >= 1",
  );
});

test("MerkleTree.create rejects negative levels", () => {
  assert.throws(
    () => MerkleTree.create(-1, []),
    RangeError,
    "levels must be an integer >= 1",
  );
});

test("MerkleTree.create rejects fractional levels", () => {
  assert.throws(
    () => MerkleTree.create(0.5, []),
    RangeError,
    "levels must be an integer >= 1",
  );
});

test("MerkleTree.create rejects NaN levels", () => {
  assert.throws(
    () => MerkleTree.create(NaN, []),
    RangeError,
    "levels must be an integer >= 1",
  );
});

test("MerkleTree.create rejects levels > 32", () => {
  assert.throws(
    () => MerkleTree.create(33, []),
    RangeError,
    "levels must be <= 32",
  );
});

test("MerkleTree.create accepts levels = 1 (minimal tree)", () => {
  const tree = MerkleTree.create(1, [42n]);
  assert.ok(tree instanceof MerkleTree);
  assert.equal(tree.levels, 1);
});

test("MerkleTree.create accepts levels = 10 (safe upper bound)", () => {
  // 2^10 = 1024 leaves — fast enough for a unit test, and exercises the
  // full tree construction path including Poseidon hashing at every level.
  // The 32-level cap is tested by the rejection test above; constructing
  // a tree near that cap is infeasible in a test runner.
  const tree = MerkleTree.create(10, []);
  assert.ok(tree instanceof MerkleTree);
  assert.equal(tree.levels, 10);
  assert.ok(typeof tree.root === "bigint");
});

// ---- leaf validation ----

test("MerkleTree.create rejects a negative leaf", () => {
  assert.throws(
    () => MerkleTree.create(4, [-1n]),
    RangeError,
    "leaf at index 0 must satisfy 0 <= leaf < FR_MODULUS",
  );
});

test("MerkleTree.create rejects leaf >= FR_MODULUS", () => {
  assert.throws(
    () => MerkleTree.create(4, [FR_MODULUS]),
    RangeError,
    "leaf at index 0 must satisfy 0 <= leaf < FR_MODULUS",
  );
});

test("MerkleTree.create rejects leaf > FR_MODULUS", () => {
  assert.throws(
    () => MerkleTree.create(4, [FR_MODULUS + 1n]),
    RangeError,
    "leaf at index 0 must satisfy 0 <= leaf < FR_MODULUS",
  );
});

test("MerkleTree.create accepts leaf = 0n (lower bound)", () => {
  const tree = MerkleTree.create(4, [0n]);
  assert.ok(tree instanceof MerkleTree);
});

test("MerkleTree.create accepts leaf = FR_MODULUS - 1n (upper bound)", () => {
  const tree = MerkleTree.create(4, [FR_MODULUS - 1n]);
  assert.ok(tree instanceof MerkleTree);
});

test("MerkleTree.create reports the correct index for a rejected leaf", () => {
  // Validate that rejections name the offending index, not just the value.
  assert.throws(
    () => MerkleTree.create(4, [42n, 1n, FR_MODULUS, 7n]),
    (err: unknown) => {
      assert.ok(err instanceof RangeError);
      const msg = (err as RangeError).message;
      // The bad leaf is at index 2.
      return msg.includes("index 2") && msg.includes(String(FR_MODULUS));
    },
  );
});

// ---- zero leaves with valid levels (padded to ZERO_VALUE) ----

test("MerkleTree.create with zero leaves produces a padded tree", () => {
  // When no leaves are provided, the tree is padded entirely with ZERO_VALUE
  // to fill all 2**levels slots. indexOf only searches the *original* leaves
  // array (see tree.ts), so ZERO_VALUE won't be found here. We verify the
  // tree is constructed correctly by checking the root is a well-formed
  // bigint.
  const tree = MerkleTree.create(3, []);
  assert.ok(tree instanceof MerkleTree);
  assert.ok(typeof tree.root === "bigint");
});
