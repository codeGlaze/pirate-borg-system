// Tests for opt-in ability-test DR reductions (e.g. the Buccaneer's Treasure
// Hunter): the actor exposes the available reductions (stacked by quantity) and
// the ability-test outcome applies a selected total as a roll bonus.
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
const feature = (name, id, drTestReduction, quantity = 1) => ({
  id,
  name,
  type: "feature",
  system: { drTestReduction, quantity },
});

test("no DR-reducing features → nothing to opt into", () => {
  const actor = actorWithItems([feature("Grog Breath", "a", 0)]);
  assert.deepEqual(actor.getAbilityTestDrReductions(), []);
});

test("Treasure Hunter reports its per-copy DR reduction", () => {
  const actor = actorWithItems([feature("Treasure Hunter", "th", 3, 1)]);
  assert.deepEqual(actor.getAbilityTestDrReductions(), [{ id: "th", name: "Treasure Hunter", dr: 3 }]);
});

test("taken twice, it stacks by quantity to -6 (the reported bug)", () => {
  const actor = actorWithItems([feature("Treasure Hunter", "th", 3, 2)]);
  assert.equal(actor.getAbilityTestDrReductions()[0].dr, 6);
});

test("Burglar uses a base + uneven increment: -4 at rank 1, -6 at rank 2", () => {
  const burglar = (quantity) => ({ id: "b", name: "Burglar", type: "feature", system: { drTestReduction: 4, drTestReductionExtra: 2, quantity } });
  assert.equal(actorWithItems([burglar(1)]).getAbilityTestDrReductions()[0].dr, 4);
  assert.equal(actorWithItems([burglar(2)]).getAbilityTestDrReductions()[0].dr, 6);
});

test("non-feature items and zero-reduction features are ignored", () => {
  const actor = actorWithItems([
    { id: "w", name: "Musket", type: "weapon", system: { drTestReduction: 3 } },
    feature("Focused Aim", "fa", 0),
    feature("Treasure Hunter", "th", 3, 1),
  ]);
  assert.deepEqual(
    actor.getAbilityTestDrReductions().map((m) => m.id),
    ["th"],
  );
});

// The outcome applies a selected DR reduction as a bonus to the d20 roll.
globalThis.CONFIG.PB.abilityKey = { ...(globalThis.CONFIG.PB.abilityKey ?? {}), presence: "PB.AbilityPresence" };
const { createTestAbilityOutcome } = await import(path.join(REPO_ROOT, "module/api/outcome/actor/test-ability-outcome.js"));
const outcomeActor = { getData: () => ({ abilities: { presence: { value: 2 } } }) };

test("no modifier → plain ability formula", async () => {
  const outcome = await createTestAbilityOutcome({ actor: outcomeActor, ability: "presence" });
  assert.equal(outcome.formula, "1d20+@abilities.presence.value");
});

test("a DR reduction is applied as a +N bonus to the roll", async () => {
  const outcome = await createTestAbilityOutcome({ actor: outcomeActor, ability: "presence", drModifier: 6 });
  assert.equal(outcome.formula, "1d20+@abilities.presence.value+6");
});
