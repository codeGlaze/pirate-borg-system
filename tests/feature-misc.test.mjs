// Tests for two small feature resolvers: getCritThreshold (Calculating Cutthroat lowers
// the natural crit number to 19) and isImmuneToCondition (Survivalist blocks
// infected/sick/poison).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.CONFIG.PB.itemTypes = { ...(globalThis.CONFIG.PB.itemTypes ?? {}), feature: "feature" };
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

const actorWithItems = (items) => {
  const a = Object.create(PBActor.prototype);
  Object.defineProperty(a, "items", { value: items });
  return a;
};
const feature = (name, system) => ({ name, type: "feature", system });

test("crit threshold is 20 by default", () => {
  assert.equal(actorWithItems([feature("Grog Breath", {})]).getCritThreshold(), 20);
});

test("Calculating Cutthroat lowers the crit threshold to 19", () => {
  assert.equal(actorWithItems([feature("Calculating Cutthroat", { critThreshold: 19 })]).getCritThreshold(), 19);
});

test("the lowest feature threshold wins", () => {
  const actor = actorWithItems([feature("A", { critThreshold: 19 }), feature("B", { critThreshold: 18 })]);
  assert.equal(actor.getCritThreshold(), 18);
});

test("Survivalist is immune to infected/sick/poison but not others", () => {
  const actor = actorWithItems([feature("Survivalist", { conditionImmunity: ["infected", "disease", "poison"] })]);
  assert.equal(actor.isImmuneToCondition("poison"), true);
  assert.equal(actor.isImmuneToCondition("disease"), true);
  assert.equal(actor.isImmuneToCondition("infected"), true);
  assert.equal(actor.isImmuneToCondition("burning"), false);
});

test("no immunity feature → not immune", () => {
  assert.equal(actorWithItems([feature("Grog Breath", {})]).isImmuneToCondition("poison"), false);
});
