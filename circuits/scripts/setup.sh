#!/usr/bin/env bash
# Powers-of-Tau (bn128) + Groth16 trusted setup for the Sharibo circuit.
#
# This is a hackathon-demo trusted setup: single contributor, random entropy
# from /dev/urandom. Real deployments would run a multi-party ceremony. See
# README "Honest limitations".
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=build
CURVE=bls12381
PTAU_POWER=12
PTAU_FINAL="$BUILD/pot${PTAU_POWER}_${CURVE}_final.ptau"

mkdir -p "$BUILD"

if [ ! -f "$BUILD/membership.r1cs" ]; then
  echo "membership.r1cs not found — run scripts/compile.sh first" >&2
  exit 1
fi

if [ ! -f "$PTAU_FINAL" ]; then
  npx --yes snarkjs powersoftau new "$CURVE" "$PTAU_POWER" "$BUILD/pot${PTAU_POWER}_${CURVE}_0000.ptau" -v
  npx --yes snarkjs powersoftau contribute "$BUILD/pot${PTAU_POWER}_${CURVE}_0000.ptau" "$BUILD/pot${PTAU_POWER}_${CURVE}_0001.ptau" \
    --name="Sharibo phase1 contribution" -v -e="$(head -c 64 /dev/urandom | base64)"
  npx --yes snarkjs powersoftau prepare phase2 "$BUILD/pot${PTAU_POWER}_${CURVE}_0001.ptau" "$PTAU_FINAL" -v
fi

npx --yes snarkjs groth16 setup "$BUILD/membership.r1cs" "$PTAU_FINAL" "$BUILD/membership_0000.zkey"
npx --yes snarkjs zkey contribute "$BUILD/membership_0000.zkey" "$BUILD/membership_final.zkey" \
  --name="Sharibo circuit key contribution" -v -e="$(head -c 64 /dev/urandom | base64)"
npx --yes snarkjs zkey export verificationkey "$BUILD/membership_final.zkey" verification_key.json

echo "Setup complete -> build/membership_final.zkey, verification_key.json"
