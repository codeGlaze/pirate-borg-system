import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { findEquippedBayonet, findReloadableGunpowderWeapon, isBayonetWeapon } = await import(
  path.join(REPO_ROOT, "module/api/action/character/fix-bayonets.js")
);

const makeActor = (items) => ({
  items: {
    filter: (fn) => items.filter(fn),
  },
});

test("isBayonetWeapon supports Bayonet and Bayonets names", () => {
  assert.equal(isBayonetWeapon({ type: "weapon", name: "Bayonet" }), true);
  assert.equal(isBayonetWeapon({ type: "weapon", name: "Bayonets" }), true);
  assert.equal(isBayonetWeapon({ type: "weapon", name: "Cutlass" }), false);
});

test("findEquippedBayonet returns the equipped bayonet only", () => {
  const items = [
    { id: "a", type: "weapon", name: "Bayonets", system: { equipped: false } },
    { id: "b", type: "weapon", name: "Bayonet", system: { equipped: true } },
  ];
  assert.equal(findEquippedBayonet(makeActor(items))?.id, "b");
});

test("findReloadableGunpowderWeapon finds an equipped loading gunpowder weapon", () => {
  const items = [
    { id: "melee", type: "weapon", name: "Bayonets", system: { equipped: true, needsReloading: false } },
    {
      id: "musket",
      type: "weapon",
      name: "Musket",
      system: { equipped: true, needsReloading: true, loadingCount: 1, isGunpowderWeapon: true },
    },
  ];
  assert.equal(findReloadableGunpowderWeapon(makeActor(items))?.id, "musket");
});

test("findReloadableGunpowderWeapon honors excluded item id", () => {
  const items = [
    {
      id: "pistol",
      type: "weapon",
      name: "Flintlock Pistol",
      system: { equipped: true, needsReloading: true, loadingCount: 2, isGunpowderWeapon: true },
    },
  ];
  assert.equal(findReloadableGunpowderWeapon(makeActor(items), { excludeItemId: "pistol" }), undefined);
});
