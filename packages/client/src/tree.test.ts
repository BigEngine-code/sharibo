import { describe, it, expect } from "vitest";
import { MerkleTree, ZERO_VALUE } from "./tree.js";
import { poseidon } from "./identity.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recompute the root from a proof by walking up the path. */
function recomputeRoot(
  leaf: bigint,
  { pathElements, pathIndices }: { pathElements: bigint[]; pathIndices: number[] },
): bigint {
  let node = leaf;
  for (let i = 0; i < pathElements.length; i++) {
    const sibling = pathElements[i];
    // pathIndices[i] = 1 → current node is the RIGHT child, sibling is left
    node =
      pathIndices[i] === 1
        ? poseidon(sibling, node)
        : poseidon(node, sibling);
  }
  return node;
}

const LEVELS = 4;
const CAPACITY = 2 ** LEVELS; // 16

// Deterministic test leaves (non-zero, distinct)
const LEAF_A = 111n;
const LEAF_B = 222n;
const LEAF_C = 333n;

// ---------------------------------------------------------------------------
// Root determinism
// ---------------------------------------------------------------------------

describe("MerkleTree root determinism", () => {
  it("produces the same root for the same leaves", () => {
    const t1 = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B]);
    const t2 = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B]);
    expect(t1.root).toBe(t2.root);
  });

  it("produces a different root when a leaf changes", () => {
    const t1 = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B]);
    const t2 = MerkleTree.create(LEVELS, [LEAF_A, LEAF_C]); // LEAF_C ≠ LEAF_B
    expect(t1.root).not.toBe(t2.root);
  });

  it("produces a different root when leaf order changes", () => {
    const t1 = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B]);
    const t2 = MerkleTree.create(LEVELS, [LEAF_B, LEAF_A]);
    expect(t1.root).not.toBe(t2.root);
  });
});

// ---------------------------------------------------------------------------
// Padding with ZERO_VALUE
// ---------------------------------------------------------------------------

describe("MerkleTree padding", () => {
  it("root of [a] equals root of [a, 0, 0, …] explicitly constructed", () => {
    const implicit = MerkleTree.create(LEVELS, [LEAF_A]);
    const explicit = MerkleTree.create(
      LEVELS,
      [LEAF_A, ...Array(CAPACITY - 1).fill(ZERO_VALUE)],
    );
    expect(implicit.root).toBe(explicit.root);
  });

  it("empty tree root equals all-zeros tree root", () => {
    const empty = MerkleTree.create(LEVELS, []);
    const allZeros = MerkleTree.create(
      LEVELS,
      Array(CAPACITY).fill(ZERO_VALUE),
    );
    expect(empty.root).toBe(allZeros.root);
  });

  it("accepts exactly capacity leaves without throwing", () => {
    const leaves = Array.from({ length: CAPACITY }, (_, i) => BigInt(i + 1));
    expect(() => MerkleTree.create(LEVELS, leaves)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Overflow guard
// ---------------------------------------------------------------------------

describe("MerkleTree.create overflow", () => {
  it("throws when leaves.length > 2**levels", () => {
    const tooMany = Array(CAPACITY + 1).fill(LEAF_A);
    expect(() => MerkleTree.create(LEVELS, tooMany)).toThrow();
  });

  it("throw message mentions the counts", () => {
    const tooMany = Array(CAPACITY + 1).fill(1n);
    expect(() => MerkleTree.create(LEVELS, tooMany)).toThrowError(
      /too many leaves/i,
    );
  });
});

// ---------------------------------------------------------------------------
// proof() — root recomputation for all 16 indices
// ---------------------------------------------------------------------------

describe("MerkleTree.proof root recomputation", () => {
  const leaves = Array.from({ length: CAPACITY }, (_, i) => BigInt(i + 1));
  const tree = MerkleTree.create(LEVELS, leaves);

  it("recomputing root from pathElements/pathIndices reproduces tree.root for every index", () => {
    for (let i = 0; i < CAPACITY; i++) {
      const p = tree.proof(i);
      expect(p.root).toBe(tree.root);
      const recomputed = recomputeRoot(leaves[i], p);
      expect(recomputed).toBe(
        tree.root,
        `Root recomputation failed at index ${i}`,
      );
    }
  });

  it("proof length equals tree levels", () => {
    const p = tree.proof(0);
    expect(p.pathElements).toHaveLength(LEVELS);
    expect(p.pathIndices).toHaveLength(LEVELS);
  });
});

// ---------------------------------------------------------------------------
// proof() — out-of-range indices
// ---------------------------------------------------------------------------

describe("MerkleTree.proof out-of-range", () => {
  const tree = MerkleTree.create(LEVELS, [LEAF_A]);

  it("throws for negative index", () => {
    expect(() => tree.proof(-1)).toThrow();
  });

  it("throws for index equal to capacity", () => {
    expect(() => tree.proof(CAPACITY)).toThrow();
  });

  it("throws for index well beyond capacity", () => {
    expect(() => tree.proof(9999)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// indexOf
// ---------------------------------------------------------------------------

describe("MerkleTree.indexOf", () => {
  const tree = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B, LEAF_C]);

  it("finds leaves at their correct indices", () => {
    expect(tree.indexOf(LEAF_A)).toBe(0);
    expect(tree.indexOf(LEAF_B)).toBe(1);
    expect(tree.indexOf(LEAF_C)).toBe(2);
  });

  it("returns -1 for a leaf not in the tree", () => {
    expect(tree.indexOf(999n)).toBe(-1);
  });

  it("returns -1 for ZERO_VALUE when tree was not built with it explicitly", () => {
    const t = MerkleTree.create(LEVELS, [LEAF_A, LEAF_B]);
    // ZERO_VALUE was used as padding internally, but indexOf searches only
    // the leaves array passed to create(), so it should return -1.
    expect(t.indexOf(ZERO_VALUE)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// pathIndices convention: 1 = right child
// ---------------------------------------------------------------------------

describe("pathIndices convention", () => {
  it("index 0 is always the left child at every level (all pathIndices = 0)", () => {
    const tree = MerkleTree.create(LEVELS, [LEAF_A]);
    const { pathIndices } = tree.proof(0);
    expect(pathIndices.every((v) => v === 0)).toBe(true);
  });

  it("index 1 is the right child at level 0 (pathIndices[0] = 1)", () => {
    const leaves = [LEAF_A, LEAF_B];
    const tree = MerkleTree.create(LEVELS, leaves);
    const { pathIndices } = tree.proof(1);
    expect(pathIndices[0]).toBe(1);
  });

  it("pathIndices match binary representation of leaf index", () => {
    const leaves = Array.from({ length: CAPACITY }, (_, i) => BigInt(i + 1));
    const tree = MerkleTree.create(LEVELS, leaves);

    for (let i = 0; i < CAPACITY; i++) {
      const { pathIndices } = tree.proof(i);
      for (let level = 0; level < LEVELS; level++) {
        const expected = (i >> level) & 1; // bit `level` of index i
        expect(pathIndices[level]).toBe(
          expected,
          `pathIndices[${level}] for index ${i}: expected ${expected}, got ${pathIndices[level]}`,
        );
      }
    }
  });
});
