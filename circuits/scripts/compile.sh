#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Regenerate membership.circom from membership.template.circom + config.json
# (single source of truth for the Merkle tree depth).
node scripts/gen-circuit.cjs

mkdir -p build
circom membership.circom --r1cs --wasm --sym --prime bls12381 -l ../node_modules -o build

echo "Compiled -> build/membership.r1cs, build/membership_js/membership.wasm"
