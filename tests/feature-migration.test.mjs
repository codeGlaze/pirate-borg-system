// Tests for the re-sync migration helpers: existing embedded features/classes get
// the mechanical fields/effects added this session, idempotently and only for the
// whitelisted bits.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { computeSystemPatch, missingEffects } = await import(path.join(REPO_ROOT, "module/system/feature-migration.js"));

test("patch fills a stale field, empty when already current (idempotent)", () => {
  const compendium = { system: { drTestReduction: 3 } };
  assert.deepEqual(computeSystemPatch({ system: { drTestReduction: 0 } }, compendium, ["drTestReduction"]), {
    "system.drTestReduction": 3,
  });
  assert.deepEqual(computeSystemPatch({ system: { drTestReduction: 3 } }, compendium, ["drTestReduction"]), {});
});

test("patch handles object fields like onGain", () => {
  const compendium = { system: { onGain: { abilities: { toughness: 1 }, maxHp: "1d4" } } };
  const patch = computeSystemPatch({ system: { onGain: {} } }, compendium, ["onGain"]);
  assert.deepEqual(patch["system.onGain"], { abilities: { toughness: 1 }, maxHp: "1d4" });
});

test("only whitelisted fields are touched", () => {
  const compendium = { system: { actionMacro: "X", description: "SHOULD NOT COPY" } };
  const patch = computeSystemPatch({ system: { actionMacro: "", description: "mine" } }, compendium, ["actionMacro"]);
  assert.deepEqual(patch, { "system.actionMacro": "X" });
});

test("missingEffects returns compendium effects the item lacks (as transfer effects, no id)", () => {
  const compendium = {
    effects: [{ _id: "abc", changes: [{ key: "system.attributes.naturalArmorTier.value", mode: 4, value: "1" }], transfer: false }],
  };
  const missing = missingEffects({ effects: [] }, compendium);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].transfer, true);
  assert.equal(missing[0]._id, undefined);
  assert.equal(missing[0].changes[0].key, "system.attributes.naturalArmorTier.value");
});

test("missingEffects is empty when the item already has the effect key (idempotent)", () => {
  const compendium = { effects: [{ changes: [{ key: "system.attributes.reloadModifier.value", mode: 2, value: "1" }] }] };
  const embedded = { effects: [{ changes: [{ key: "system.attributes.reloadModifier.value", mode: 2, value: "1" }] }] };
  assert.deepEqual(missingEffects(embedded, compendium), []);
});
