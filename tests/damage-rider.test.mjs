// Tests for the damage-rider resolver (getDamageRiderFeatures). Riders add bonus damage
// on a hit. Weapon gating and the auto-vs-situational split mirror attack-DR features;
// `minQuantity` withholds a rider until the feature has been taken that many times
// (Focused Aim's +d4 only at rank 2).
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
const feature = (name, id, damageRider, quantity = 1) => ({ id, name, type: "feature", system: { damageRider, quantity } });
const rangedWeapon = { name: "Musket", isRanged: true };
const rapier = { name: "Fine rapier", isRanged: false };
const dagger = { name: "Dagger", isRanged: false };

test("Back Stabber (conditional, no gate) rides any weapon and is opt-in (auto:false)", () => {
  const actor = actorWithItems([feature("Back Stabber", "bs", { damage: "1d2", conditional: true })]);
  assert.deepEqual(actor.getDamageRiderFeatures(dagger), [{ id: "bs", name: "Back Stabber", damage: "1d2", countable: false, auto: false }]);
  assert.deepEqual(actor.getDamageRiderFeatures(rangedWeapon), [{ id: "bs", name: "Back Stabber", damage: "1d2", countable: false, auto: false }]);
});

test("Ostentatious Fencer's +1 rides only rapier/cutlass, opt-in for the duel", () => {
  const actor = actorWithItems([feature("Ostentatious Fencer", "of", { damage: "1", requires: { nameIncludes: ["rapier", "cutlass"] }, conditional: true })]);
  assert.deepEqual(actor.getDamageRiderFeatures(rapier), [{ id: "of", name: "Ostentatious Fencer", damage: "1", countable: false, auto: false }]);
  assert.deepEqual(actor.getDamageRiderFeatures(dagger), []);
});

test("Focused Aim's +d4 is withheld until rank 2 (minQuantity) and requires ranged", () => {
  const rider = { damage: "1d4", requires: "ranged", conditional: true, minQuantity: 2 };
  assert.deepEqual(actorWithItems([feature("Focused Aim", "fa", rider, 1)]).getDamageRiderFeatures(rangedWeapon), []);
  assert.deepEqual(actorWithItems([feature("Focused Aim", "fa", rider, 2)]).getDamageRiderFeatures(rangedWeapon), [
    { id: "fa", name: "Focused Aim", damage: "1d4", countable: false, auto: false },
  ]);
  // Even at rank 2, a melee weapon fails the ranged gate.
  assert.deepEqual(actorWithItems([feature("Focused Aim", "fa", rider, 2)]).getDamageRiderFeatures(dagger), []);
});

test("a gated, non-conditional rider is auto:true", () => {
  const actor = actorWithItems([feature("Sharpshooter", "sh", { damage: "1d4", requires: "ranged" })]);
  assert.equal(actor.getDamageRiderFeatures(rangedWeapon)[0].auto, true);
});

test("a countable rider (Blood Frenzy +2/kill) is flagged countable and never auto", () => {
  const actor = actorWithItems([feature("Blood Frenzy", "bf", { damage: "2", countable: true, conditional: true })]);
  assert.deepEqual(actor.getDamageRiderFeatures(dagger), [{ id: "bf", name: "Blood Frenzy", damage: "2", countable: true, auto: false }]);
});

test("features without a damageRider.damage are ignored", () => {
  const actor = actorWithItems([
    { id: "w", name: "Musket", type: "weapon", system: { damageRider: { damage: "1d6" } } },
    feature("No spec", "n", undefined),
    feature("Empty", "e", {}),
    feature("Back Stabber", "bs", { damage: "1d2", conditional: true }),
  ]);
  assert.deepEqual(
    actor.getDamageRiderFeatures(dagger).map((r) => r.id),
    ["bs"],
  );
});
