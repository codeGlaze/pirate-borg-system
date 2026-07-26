// Sea Turtle (Tall Tale) grants "Extra -d2 to armor" via an Active Effect that adds
// +1 to system.attributes.combat.armorTierModifier. This verifies the armor formula
// treats that modifier additively (one tier on top of worn armor) — unlike Thick
// Skinned's naturalArmorTier, which is only a floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.CONFIG.PB.armorTiers = {
  0: { damageReductionDie: "0" },
  1: { damageReductionDie: "1d2" },
  2: { damageReductionDie: "1d4" },
  3: { damageReductionDie: "1d6" },
};
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

// Build an actor stub exposing just what getCharacterArmorFormula reads.
const armorActor = ({ armorTier = 0, tierModifier = 0, naturalTier = 0 } = {}) => {
  const actor = Object.create(PBActor.prototype);
  Object.defineProperty(actor, "attributes", {
    value: { combat: { armorTierModifier: tierModifier }, naturalArmorTier: { value: naturalTier } },
  });
  Object.defineProperty(actor, "equippedArmor", { value: { tier: { value: armorTier } } });
  return actor;
};

test("no modifier → armor die follows worn armor tier", () => {
  assert.equal(armorActor({ armorTier: 2 }).getCharacterArmorFormula(), "1d4");
});

test("Sea Turtle (+1 armorTierModifier) adds a tier on top of worn armor", () => {
  assert.equal(armorActor({ armorTier: 2, tierModifier: 1 }).getCharacterArmorFormula(), "1d6");
});

test("Sea Turtle on an unarmored character grants tier 1 (-d2)", () => {
  assert.equal(armorActor({ armorTier: 0, tierModifier: 1 }).getCharacterArmorFormula(), "1d2");
});

test("the extra tier is clamped to the top of the ladder", () => {
  assert.equal(armorActor({ armorTier: 3, tierModifier: 1 }).getCharacterArmorFormula(), "1d6");
});
