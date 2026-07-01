#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build
circom membership.circom --r1cs --wasm --sym -l ../node_modules -o build

echo "Compiled -> build/membership.r1cs, build/membership_js/membership.wasm"
