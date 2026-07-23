// Tests for the dice-ladder single-source-of-truth helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { REPO_ROOT } from "./helpers/foundry-stubs.mjs";

const { DICE_LADDER, normalizeDie, dieToStep, stepToDie, stepDie } = await import(path.join(REPO_ROOT, "module/api/dice-ladder.js"));

test("ladder is the Pirate Borg rungs (no d3)", () => {
  assert.deepEqual(DICE_LADDER, ["0", "1d2", "1d4", "1d6", "1d8", "1d10", "1d12"]);
});

test("normalizeDie canonicalises shorthand", () => {
  assert.equal(normalizeDie("d4"), "1d4");
  assert.equal(normalizeDie("1D6"), "1d6");
  assert.equal(normalizeDie(" d8 "), "1d8");
  assert.equal(normalizeDie(""), "0");
  assert.equal(normalizeDie("0"), "0");
});

test("dieToStep finds the rung, -1 off-ladder", () => {
  assert.equal(dieToStep("1d2"), 1);
  assert.equal(dieToStep("d6"), 3);
  assert.equal(dieToStep("2d6"), -1); // multi-dice not a ladder rung
});

test("stepDie steps up and down, clamped", () => {
  assert.equal(stepDie("1d2", 1), "1d4"); // the "AE picks up d2 -> d4" case
  assert.equal(stepDie("1d6", -1), "1d4"); // crit-style one tier down
  assert.equal(stepDie("1d12", 1), "1d12"); // clamp at top
  assert.equal(stepDie("0", -1), "0"); // clamp at bottom
});

test("stepDie leaves off-ladder dice unchanged", () => {
  assert.equal(stepDie("2d6", 1), "2d6");
});

test("stepToDie clamps out-of-range steps", () => {
  assert.equal(stepToDie(-5), "0");
  assert.equal(stepToDie(99), "1d12");
  assert.equal(stepToDie(2), "1d4");
});
