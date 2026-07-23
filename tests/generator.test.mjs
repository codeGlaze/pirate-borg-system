// Tests for character-generator helpers. Imports the real module under the
// Foundry stubs.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const gen = await import(path.join(REPO_ROOT, "module/api/generator/character-generator.js"));

test("starting rounds of shot = 10 + Presence, floored at 0 (pg. 51)", () => {
  assert.equal(gen.startingRoundsOfShotQuantity(0), 10);
  assert.equal(gen.startingRoundsOfShotQuantity(2), 12);
  assert.equal(gen.startingRoundsOfShotQuantity(-3), 7);
  assert.equal(gen.startingRoundsOfShotQuantity(6), 16);
});
