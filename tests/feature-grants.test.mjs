// Tests for the "apply on gain" feature-grant math: per-application HP rolls
// reconcile up and down with quantity, and the resulting Active Effect changes
// scale correctly (fixed abilities × quantity, maxHp = sum of rolls).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { reconcileRolls, buildGrantChanges } = await import(path.join(REPO_ROOT, "module/system/feature-grants.js"));

test("first take rolls one value", () => {
  let n = 0;
  assert.deepEqual(
    reconcileRolls([], 1, () => [3, 2][n++]),
    [3],
  );
});

test("second take rolls another value, keeping the first (not a duplicate)", () => {
  let n = 0;
  assert.deepEqual(
    reconcileRolls([3], 2, () => [2][n++]),
    [3, 2],
  );
});

test("dropping from 2 to 1 removes the newest roll exactly, keeping the first", () => {
  assert.deepEqual(
    reconcileRolls([3, 2], 1, () => {
      throw new Error("should not roll when shrinking");
    }),
    [3],
  );
});

test("Survivalist ×1: +1 Toughness, +HP = the single roll", () => {
  const changes = buildGrantChanges({ abilities: { toughness: 1 }, maxHp: "1d4" }, [3], 1);
  assert.deepEqual(changes, [
    { key: "system.abilities.toughness.value", mode: 2, value: "1", priority: 20 },
    { key: "system.attributes.hp.max", mode: 2, value: "3", priority: 20 },
  ]);
});

test("Survivalist ×2: Toughness scales to +2, HP = sum of both rolls", () => {
  const changes = buildGrantChanges({ abilities: { toughness: 1 }, maxHp: "1d4" }, [3, 2], 2);
  assert.equal(changes.find((c) => c.key.includes("toughness")).value, "2");
  assert.equal(changes.find((c) => c.key.includes("hp.max")).value, "5");
});

test("abilities-only grant produces no HP change", () => {
  const changes = buildGrantChanges({ abilities: { toughness: 1 } }, [], 1);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, "system.abilities.toughness.value");
});
