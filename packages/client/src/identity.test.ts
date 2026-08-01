import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FR_MODULUS,
  randomFieldElement,
  computeExternalNullifier,
} from "./identity.js";
import { InvalidInputError } from "./errors.js";


// Issue #63: pin FR_MODULUS against independent sources so a transcription
// error in the hex literal fails the suite instead of silently corrupting
// every identity and nullifier.
test("FR_MODULUS matches the known BLS12-381 scalar field modulus", () => {
  // Decimal value from the BLS12-381 spec.
  const expectedDecimal =
    52435875175126190479447740508185965837690552500527637822603658699938581184513n;
  assert.equal(FR_MODULUS, expectedDecimal);
});

test("FR_MODULUS has the expected bit length (255)", () => {
  assert.equal(FR_MODULUS.toString(2).length, 255);
});

test("FR_MODULUS - 1 is divisible by 2**32 (known FFT-friendly property)", () => {
  assert.equal((FR_MODULUS - 1n) % 2n ** 32n, 0n);
});

// Issue #66: randomFieldElement now uses wide reduction (512 random bits mod
// FR_MODULUS) rather than 31-byte narrow sampling, so it draws uniformly
// from the full field. Verify the invariant that must always hold.
test("randomFieldElement always returns a value below FR_MODULUS", () => {
  for (let i = 0; i < 200; i++) {
    const value = randomFieldElement();
    assert.ok(value >= 0n);
    assert.ok(value < FR_MODULUS);
  }
});

// Issue #65: out-of-range circleId/round must fail loudly rather than
// producing a silently truncated (and therefore wrong) hash.
test("computeExternalNullifier accepts the round boundary (2**32 - 1)", async () => {
  await computeExternalNullifier(1n, 2n ** 32n - 1n);
});

test("computeExternalNullifier rejects round >= 2**32", async () => {
  await assert.rejects(
    () => computeExternalNullifier(1n, 2n ** 32n),
    InvalidInputError,
  );
});

test("computeExternalNullifier rejects negative round", async () => {
  await assert.rejects(() => computeExternalNullifier(1n, -1n), InvalidInputError);
});

test("computeExternalNullifier accepts the circleId boundary (2**64 - 1)", async () => {
  await computeExternalNullifier(2n ** 64n - 1n, 1n);
});

test("computeExternalNullifier rejects circleId >= 2**64", async () => {
  await assert.rejects(
    () => computeExternalNullifier(2n ** 64n, 1n),
    InvalidInputError,
  );
});

test("computeExternalNullifier rejects negative circleId", async () => {
  await assert.rejects(() => computeExternalNullifier(-1n, 1n), InvalidInputError);
});
