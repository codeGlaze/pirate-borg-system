// Tests for the shared grants API (game.pirateborg.api.grants). grantItem is the
// single primitive the buccaneer macros now call: it stacks onto an existing
// same-name item, or embeds a fresh copy from the compendium with the requested
// quantity / equipped / grantedBy state.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
// grantItem stamps grant flags and warns via ui.notifications; the stubs omit both.
globalThis.CONFIG.PB.flagScope = "pirateborg";
globalThis.foundry.utils.setProperty = (obj, keyPath, value) => {
  const keys = keyPath.split(".");
  let node = obj;
  while (keys.length > 1) {
    const key = keys.shift();
    node[key] = node[key] ?? {};
    node = node[key];
  }
  node[keys[0]] = value;
  return obj;
};
let warned = null;
globalThis.ui = { notifications: { warn: (msg) => (warned = msg) } };

const { grantItem } = await import(path.join(REPO_ROOT, "module/api/grants.js"));

// A fake actor that records createEmbeddedDocuments/update calls and returns items
// exposing enough surface (id/system/update) for grantItem to operate on.
const makeActor = (items = []) => {
  const actor = {
    items,
    getRollData: () => ({}),
    async createEmbeddedDocuments(_type, dataArray) {
      const created = dataArray.map((data, i) => ({
        id: `granted${items.length + i}`,
        name: data.name,
        type: data.type,
        system: data.system ?? {},
        flags: data.flags ?? {},
        async update(changes) {
          for (const [key, value] of Object.entries(changes)) {
            const path = key.replace(/^system\./, "");
            this.system[path] = value;
          }
        },
      }));
      items.push(...created);
      return created;
    },
  };
  return actor;
};

const existingMeat = () => ({
  name: "Exquisite smoked meat",
  type: "misc",
  system: { quantity: 3 },
  async update(changes) {
    for (const [key, value] of Object.entries(changes)) {
      this.system[key.replace(/^system\./, "")] = value;
    }
  },
});

test("stack: bumps an existing same-name item instead of creating a duplicate", async () => {
  const meat = existingMeat();
  const actor = makeActor([meat]);
  const result = await grantItem(actor, "pirateborg.class-buccaneer;Exquisite smoked meat", { quantity: 2, stack: true });
  assert.equal(result, meat, "returns the existing item");
  assert.equal(meat.system.quantity, 5, "3 + 2");
  assert.equal(actor.items.length, 1, "no new item created");
});

test("create: embeds a fresh copy from the compendium with the requested quantity", async () => {
  const actor = makeActor();
  const created = await grantItem(actor, "pirateborg.class-buccaneer;Exquisite smoked meat", { quantity: 4 });
  assert.equal(created.name, "Exquisite smoked meat");
  assert.equal(created.system.quantity, 4);
  assert.equal(actor.items.length, 1);
});

test("quantity=null keeps the compendium item's own default quantity", async () => {
  const actor = makeActor();
  const created = await grantItem(actor, "pirateborg.class-buccaneer;Exquisite smoked meat", {});
  assert.equal(created.system.quantity, 1, "the shipped default, not overridden");
});

test("equip + grantedBy: the created item is equipped and stamped for auto-revert", async () => {
  const actor = makeActor();
  const created = await grantItem(actor, "pirateborg.equipment-melee-weapons;Bayonet", { equip: true, grantedBy: "feat123" });
  assert.equal(created.system.equipped, true);
  assert.equal(created.flags.pirateborg.grantedBy, "feat123");
});

test("invalid actor / ref returns null without throwing", async () => {
  assert.equal(await grantItem(null, "pirateborg.class-buccaneer;Exquisite smoked meat", {}), null);
  assert.equal(await grantItem(makeActor(), "no-semicolon", {}), null);
  assert.equal(await grantItem(makeActor(), "", {}), null);
});

test("missing compendium item returns null and warns", async () => {
  warned = null;
  const actor = makeActor();
  const result = await grantItem(actor, "pirateborg.class-buccaneer;Nonexistent Item", {});
  assert.equal(result, null);
  assert.ok(warned, "a warning was surfaced");
  assert.equal(actor.items.length, 0);
});
