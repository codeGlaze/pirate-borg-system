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
