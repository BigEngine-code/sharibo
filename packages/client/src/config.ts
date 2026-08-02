import circuitsConfig from "../../../circuits/config.json" with { type: "json" };

// Single source of truth for the Merkle tree depth is circuits/config.json
// (see "Changing the Merkle tree depth" in the repo README) — everything
// that needs the depth (circuit compile, circuit tests, and this client)
// reads it from there instead of hardcoding it a second time.
export const TREE_LEVELS: number = circuitsConfig.levels;
