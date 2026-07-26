// Tests for the attack-DR feature resolver (getAttackDrFeatures). Auto features are
// gated on the weapon (Crack Shot → ranged, Sword Master → sword) and always apply;
// situational features (Focused Aim, etc.) apply to any weapon as opt-in toggles.
// dr scales with quantity only when the feature declares `stacks`.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.CONFIG.PB.itemTypes = { ...(globalThis.CONFIG.PB.itemTypes ?? {}), feature: "feature" };
globalThis.CONFIG.PB.swordWeaponKeywords = ["sword", "cutlass", "rapier", "scimitar"];
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

const actorWithItems = (items) => {
  const a = Object.create(PBActor.prototype);
  Object.defineProperty(a, "items", { value: items });
  return a;
};
const feature = (name, id, attackDr, quantity = 1) => ({ id, name, type: "feature", system: { attackDr, quantity } });
const rangedWeapon = { name: "Musket", isRanged: true };
const meleeSword = { name: "Cutlass", isRanged: false };
const meleeDagger = { name: "Dagger", isRanged: false };

test("Crack Shot applies to a ranged weapon (auto), not a melee one", () => {
  const actor = actorWithItems([feature("Crack Shot", "cs", { dr: 2, requires: "ranged", stacks: true })]);
  assert.deepEqual(actor.getAttackDrFeatures(rangedWeapon), [{ id: "cs", name: "Crack Shot", dr: 2, auto: true }]);
  assert.deepEqual(actor.getAttackDrFeatures(meleeSword), []);
});

test("Crack Shot stacks with quantity (−2 → −4 at ×2)", () => {
  const actor = actorWithItems([feature("Crack Shot", "cs", { dr: 2, requires: "ranged", stacks: true }, 2)]);
  assert.equal(actor.getAttackDrFeatures(rangedWeapon)[0].dr, 4);
});

test("Sword Master applies only to swords, and does not stack (no `stacks`)", () => {
  const actor = actorWithItems([feature("Sword Master", "sm", { dr: 2, requires: "sword" }, 2)]);
  assert.deepEqual(actor.getAttackDrFeatures(meleeSword), [{ id: "sm", name: "Sword Master", dr: 2, auto: true }]);
  assert.deepEqual(actor.getAttackDrFeatures(meleeDagger), []);
});

test("situational features (Focused Aim) apply to any weapon and are opt-in (auto:false)", () => {
  const actor = actorWithItems([feature("Focused Aim", "fa", { dr: 4, conditional: true })]);
  assert.deepEqual(actor.getAttackDrFeatures(rangedWeapon), [{ id: "fa", name: "Focused Aim", dr: 4, auto: false }]);
  assert.deepEqual(actor.getAttackDrFeatures(meleeDagger), [{ id: "fa", name: "Focused Aim", dr: 4, auto: false }]);
});

test("a conditional feature does not scale with quantity (flat dr)", () => {
  const actor = actorWithItems([feature("Focused Aim", "fa", { dr: 4, conditional: true }, 2)]);
  assert.equal(actor.getAttackDrFeatures(rangedWeapon)[0].dr, 4);
});

test("non-feature items and zero/absent attackDr are ignored", () => {
  const actor = actorWithItems([
    { id: "w", name: "Musket", type: "weapon", system: { attackDr: { dr: 5 } } },
    feature("Grog Breath", "g", undefined),
    feature("Bad Spec", "b", { dr: 0, requires: "ranged" }),
    feature("Crack Shot", "cs", { dr: 2, requires: "ranged" }),
  ]);
  assert.deepEqual(
    actor.getAttackDrFeatures(rangedWeapon).map((f) => f.id),
    ["cs"],
  );
});

test("mixed loadout: only weapon-appropriate auto features plus all situational ones", () => {
  const actor = actorWithItems([
    feature("Crack Shot", "cs", { dr: 2, requires: "ranged", stacks: true }),
    feature("Sword Master", "sm", { dr: 2, requires: "sword" }),
    feature("Scurvy Scallywag", "ss", { dr: 2, conditional: true }),
  ]);
  // With a sword: Sword Master (auto) + Scurvy (situational); Crack Shot excluded.
  assert.deepEqual(
    actor
      .getAttackDrFeatures(meleeSword)
      .map((f) => f.id)
      .sort(),
    ["sm", "ss"],
  );
});
