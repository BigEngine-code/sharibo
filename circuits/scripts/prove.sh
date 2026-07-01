#!/usr/bin/env bash
# Generate a witness + Groth16 proof for a given input, then verify it
# locally. Usage: scripts/prove.sh [path/to/input.json]
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=build
INPUT="${1:-input.example.json}"

if [ ! -f "$BUILD/membership_final.zkey" ]; then
  echo "membership_final.zkey not found — run scripts/setup.sh first" >&2
  exit 1
fi

node "$BUILD/membership_js/generate_witness.js" "$BUILD/membership_js/membership.wasm" "$INPUT" "$BUILD/witness.wtns"
npx --yes snarkjs groth16 prove "$BUILD/membership_final.zkey" "$BUILD/witness.wtns" "$BUILD/proof.json" "$BUILD/public.json"
npx --yes snarkjs groth16 verify verification_key.json "$BUILD/public.json" "$BUILD/proof.json"

echo "Proof -> build/proof.json, public signals -> build/public.json"
