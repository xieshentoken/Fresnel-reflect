import test from "node:test";
import assert from "node:assert/strict";
import { calculateStack, rangeValues, validateConfig } from "../core.js";

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);
}

test("air/glass normal-incidence interface matches Fresnel result", () => {
  const result = calculateStack({
    wavelength: 550,
    thetaDeg: 0,
    nIn: 1,
    kIn: 0,
    nSub: 1.5,
    kSub: 0,
    layers: [],
  });
  close(result.R_avg, 0.04, 1e-12);
  close(result.T_avg, 0.96, 1e-12);
  close(result.A_avg, 0, 1e-12);
});

test("air/glass oblique interface resolves s and p polarization", () => {
  const result = calculateStack({
    wavelength: 550,
    thetaDeg: 45,
    nIn: 1,
    kIn: 0,
    nSub: 1.5,
    kSub: 0,
    layers: [],
  });
  close(result.R_s, 0.0920133630455244, 1e-12);
  close(result.R_p, 0.00846645897894749, 1e-12);
  close(result.energy_s, 1, 1e-12);
  close(result.energy_p, 1, 1e-12);
});

test("quarter-wave ideal antireflection layer suppresses reflection", () => {
  const nLayer = Math.sqrt(1.5);
  const result = calculateStack({
    wavelength: 550,
    thetaDeg: 0,
    nIn: 1,
    kIn: 0,
    nSub: 1.5,
    kSub: 0,
    layers: [{ n: nLayer, k: 0, d: 550 / (4 * nLayer) }],
  });
  close(result.R_avg, 0, 1e-12);
  close(result.T_avg, 1, 1e-12);
});

test("absorbing Ag-like layer conserves R/T/A accounting", () => {
  const result = calculateStack({
    wavelength: 550,
    thetaDeg: 0,
    nIn: 1,
    kIn: 0,
    nSub: 1.5,
    kSub: 0,
    layers: [{ n: 0.13, k: 3.49, d: 100 }],
  });
  close(result.energy_s, 1, 1e-12);
  close(result.energy_p, 1, 1e-12);
  assert.ok(result.R_avg > 0.9);
  assert.ok(result.A_avg > 0);
  assert.ok(result.T_avg < 0.01);
});

test("range and validation helpers reject invalid inputs", () => {
  assert.deepEqual(rangeValues(0, 5, 2), [0, 2, 4, 5]);
  assert.deepEqual(rangeValues(5, 0, 1), []);
  const errors = validateConfig({
    wavelength: -1,
    lambdaS: -1,
    lambdaP: 550,
    thetaDeg: 90,
    nIn: 1,
    kIn: 0,
    nSub: 1.5,
    kSub: 0,
    layers: [{ n: 1, k: -0.1, d: -2 }],
  });
  assert.ok(errors.length >= 3);
});
