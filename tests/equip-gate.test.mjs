// Tests for equip-gated features (Ostentatious Fencer): the shared weapon-match /
// wielding helpers, plus the attack-DR resolver honoring a { nameIncludes } weapon
// gate. The equip-gated Active Effect's suppression delegates to isWieldingGatedWeapon,
// so covering that covers the gate logic without standing up a full ActiveEffect.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.CONFIG.PB.itemTypes = { ...(globalThis.CONFIG.PB.itemTypes ?? {}), feature: "feature", weapon: "weapon" };
globalThis.CONFIG.PB.swordWeaponKeywords = ["sword", "cutlass", "rapier"];

globalThis.CONFIG.PB.flagScope = "pirate-borg-beta";
const { weaponNameMatches, isWieldingGatedWeapon, readEquipGate } = await import(path.join(REPO_ROOT, "module/system/equip-gate.js"));

const gate = { weaponNameIncludes: ["rapier"] };
test("readEquipGate resolves the flag under the shipped 'pirateborg' scope (beta build)", () => {
  // In beta, CONFIG.PB.flagScope is pirate-borg-beta but shipped data keeps flags.pirateborg.
  assert.deepEqual(readEquipGate({ flags: { pirateborg: { equipGate: gate } } }), gate);
});
test("readEquipGate resolves the flag under the active flagScope too", () => {
  assert.deepEqual(readEquipGate({ flags: { "pirate-borg-beta": { equipGate: gate } } }), gate);
});
test("readEquipGate returns undefined when there's no gate (never throws on scope)", () => {
  assert.equal(readEquipGate({ flags: {} }), undefined);
  assert.equal(readEquipGate({}), undefined);
});
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

const RC = ["rapier", "cutlass"];

test("weaponNameMatches matches by name keyword, case-insensitive, incl. adjectives", () => {
  assert.equal(weaponNameMatches({ name: "Rapier" }, RC), true);
  assert.equal(weaponNameMatches({ name: "Finely crafted rapier" }, RC), true);
  assert.equal(weaponNameMatches({ name: "Office's cutlass" }, RC), true);
  assert.equal(weaponNameMatches({ name: "Dagger" }, RC), false);
  assert.equal(weaponNameMatches({ name: "" }, RC), false);
});

const weapon = (name, equipped) => ({ type: "weapon", name, system: { equipped } });

test("isWieldingGatedWeapon requires an EQUIPPED matching weapon", () => {
  assert.equal(isWieldingGatedWeapon({ items: [weapon("Rapier", true)] }, RC), true);
  assert.equal(isWieldingGatedWeapon({ items: [weapon("Rapier", false)] }, RC), false, "carried but not equipped");
  assert.equal(isWieldingGatedWeapon({ items: [weapon("Dagger", true)] }, RC), false, "equipped but wrong weapon");
  assert.equal(isWieldingGatedWeapon({ items: [] }, RC), false);
});

// The attack half is gated the same way, via the attack-DR resolver.
const actorWithItems = (items) => {
  const a = Object.create(PBActor.prototype);
  Object.defineProperty(a, "items", { value: items });
  return a;
};
const feature = (name, id, attackDr) => ({ id, name, type: "feature", system: { attackDr, quantity: 1 } });

test("attack-DR resolver honors a { nameIncludes } weapon gate (auto)", () => {
  const actor = actorWithItems([feature("Ostentatious Fencer", "of", { dr: 2, requires: { nameIncludes: RC } })]);
  assert.deepEqual(actor.getAttackDrFeatures({ name: "Cutlass" }), [{ id: "of", name: "Ostentatious Fencer", dr: 2, auto: true }]);
  assert.deepEqual(actor.getAttackDrFeatures({ name: "Dagger" }), []);
});
