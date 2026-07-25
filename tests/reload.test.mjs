// Tests for effective reload time (Buccaneer fast-reload Active Effect).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { PBActor } = await import(path.join(REPO_ROOT, "module/actor/actor.js"));

// Build a bare actor exposing just the attributes the getter reads.
const actorWith = (reloadModifier) => {
  const a = Object.create(PBActor.prototype);
  Object.defineProperty(a, "attributes", { value: { reloadModifier: { value: reloadModifier } } });
  return a;
};

test("no reload modifier leaves reload time unchanged", () => {
  assert.equal(actorWith(0).getEffectiveReloadTime({ reloadTime: 2 }), 2);
});

test("Buccaneer +1 turns a 2-action reload into 1", () => {
  assert.equal(actorWith(1).getEffectiveReloadTime({ reloadTime: 2 }), 1);
});

test("reload time never drops below 1 action", () => {
  assert.equal(actorWith(5).getEffectiveReloadTime({ reloadTime: 2 }), 1);
});

test("weapon without a reload time defaults to 1", () => {
  assert.equal(actorWith(0).getEffectiveReloadTime({}), 1);
});

// The character sheet's reload counter (loadingStatus/denominator) must be built
// from the effective reload time, not the weapon's raw reloadTime — otherwise a
// Buccaneer's 1-action Musket reload reads as "1/2" instead of "0/1".
const reloadCounter = (actor, weapon, loadingCount) => {
  const effective = actor.getEffectiveReloadTime(weapon);
  return { loadingStatus: effective - loadingCount, denominator: effective };
};

test("Buccaneer freshly-fired Musket reads 0/1, not 1/2", () => {
  // Firing sets loadingCount to the effective reload time (1) for a Buccaneer.
  const { loadingStatus, denominator } = reloadCounter(actorWith(1), { reloadTime: 2 }, 1);
  assert.equal(`${loadingStatus}/${denominator}`, "0/1");
});

test("non-Buccaneer Musket still reads against its raw 2-action reload", () => {
  const { loadingStatus, denominator } = reloadCounter(actorWith(0), { reloadTime: 2 }, 1);
  assert.equal(`${loadingStatus}/${denominator}`, "1/2");
});
