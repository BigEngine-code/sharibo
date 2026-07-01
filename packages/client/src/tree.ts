import { poseidon } from "./identity.js";

// Fixed placeholder for unused leaves when padding the tree out to full
// capacity (2**levels). 0 can never equal a real commitment Poseidon(a, b)
// for field elements a, b sampled the way generateIdentity() does it, so
// there's no collision risk for this demo's threat model.
export const ZERO_VALUE = 0n;

export interface MerkleProof {
  root: bigint;
  pathElements: bigint[];
  pathIndices: number[];
}

// Same convention the circuit's MerkleTreeChecker uses: pathIndices[i] = 1
// means the current node is the RIGHT child at that level (sibling is to
// its left), pathIndices[i] = 0 means it's the LEFT child.
export class MerkleTree {
  readonly levels: number;
  private readonly leaves: readonly bigint[];
  private readonly layers: readonly bigint[][];

  private constructor(levels: number, leaves: bigint[], layers: bigint[][]) {
    this.levels = levels;
    this.leaves = leaves;
    this.layers = layers;
  }

  static create(levels: number, leaves: bigint[]): MerkleTree {
    const capacity = 2 ** levels;
    if (leaves.length > capacity) {
      throw new Error(
        `too many leaves (${leaves.length}) for ${levels} levels (capacity ${capacity})`,
      );
    }

    const padded = leaves.slice();
    while (padded.length < capacity) padded.push(ZERO_VALUE);

    const layers: bigint[][] = [padded];
    let current = padded;
    for (let level = 0; level < levels; level++) {
      const next: bigint[] = [];
      for (let i = 0; i < current.length; i += 2) {
        next.push(poseidon(current[i], current[i + 1]));
      }
      layers.push(next);
      current = next;
    }

    return new MerkleTree(levels, leaves, layers);
  }

  get root(): bigint {
    return this.layers[this.levels][0];
  }

  indexOf(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  proof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.layers[0].length) {
      throw new Error("leaf index out of range");
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let index = leafIndex;

    for (let level = 0; level < this.levels; level++) {
      const layer = this.layers[level];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;
      pathElements.push(layer[siblingIndex]);
      pathIndices.push(isRightNode ? 1 : 0);
      index = Math.floor(index / 2);
    }

    return { root: this.root, pathElements, pathIndices };
  }
}
