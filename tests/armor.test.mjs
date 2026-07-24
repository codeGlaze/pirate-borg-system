// Tests for natural armor tier (Brute "Thick Skinned" Active Effect) feeding the
// character's derived damage-reduction die.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
// The armor-tier ladder the die derives from.
globalThis.CONFIG.PB.armorTiers = {
  0: { damageReductionDie: "0" },
  1: { damageReductionDie: "1d2" },
  2: { damageReductionDie: "1d4" },
  3: { damageReductionDie: "1d6" },
};
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

const actorWith = ({ equippedTier, naturalTier }) => {
  const a = Object.create(PBActor.prototype);
  Object.defineProperty(a, "attributes", { value: { naturalArmorTier: { value: naturalTier } } });
  Object.defineProperty(a, "equippedArmor", {
    value: equippedTier === undefined ? undefined : { tier: { value: equippedTier } },
  });
  return a;
};

test("no armor, no natural tier → 0 (unchanged baseline)", () => {
  assert.equal(actorWith({ equippedTier: undefined, naturalTier: 0 }).getCharacterArmorFormula(), "0");
});

test("Thick Skinned: unarmored still gets tier-1 d2", () => {
  assert.equal(actorWith({ equippedTier: undefined, naturalTier: 1 }).getCharacterArmorFormula(), "1d2");
});

test("worn armor wins when it's better than natural", () => {
  assert.equal(actorWith({ equippedTier: 2, naturalTier: 1 }).getCharacterArmorFormula(), "1d4");
});

test("natural wins when worn armor is worse", () => {
  assert.equal(actorWith({ equippedTier: 0, naturalTier: 1 }).getCharacterArmorFormula(), "1d2");
});

test("no natural tier: worn armor unchanged (backward compatible)", () => {
  assert.equal(actorWith({ equippedTier: 3, naturalTier: 0 }).getCharacterArmorFormula(), "1d6");
});
