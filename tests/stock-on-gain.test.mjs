// Tests for "starting stock on gain": a feature declaring system.stockOnGain rolls a
// quantity and stacks the item onto the actor the first time it's gained, exactly once
// (idempotent via a flag) — the fix for dragging Buccan Cook not granting its rations.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.CONFIG.PB.flagScope = "pirateborg";
globalThis.CONFIG.PB.itemTypes = { ...(globalThis.CONFIG.PB.itemTypes ?? {}), feature: "feature" };
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
globalThis.ui = { notifications: { warn() {} } };

const { applyStockOnGain } = await import(path.join(REPO_ROOT, "module/system/feature-grants.js"));

const makeActor = (items = []) => ({
  items,
  getRollData: () => ({}),
  async createEmbeddedDocuments(_type, dataArray) {
    const created = dataArray.map((data, i) => ({
      id: `it${items.length + i}`,
      name: data.name,
      type: data.type,
      system: data.system ?? {},
    }));
    items.push(...created);
    return created;
  },
});

const makeFeature = (actor, stockOnGain) => {
  const flags = {};
  return {
    type: "feature",
    parent: actor,
    system: { stockOnGain },
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    async setFlag(scope, key, value) {
      flags[`${scope}.${key}`] = value;
    },
  };
};

const MEAT = "pirateborg.class-buccaneer;Exquisite smoked meat";

test("stocks the rolled quantity onto the actor on first gain", async () => {
  const actor = makeActor();
  const feature = makeFeature(actor, [{ ref: MEAT, formula: "5" }]);
  await applyStockOnGain(feature);
  const meat = actor.items.find((i) => i.name === "Exquisite smoked meat");
  assert.ok(meat, "meat was granted");
  assert.equal(meat.system.quantity, 5);
  assert.equal(feature.getFlag("pirateborg", "rationsStocked"), true, "flagged as stocked");
});

test("is idempotent — a second call does not re-stock", async () => {
  const actor = makeActor();
  const feature = makeFeature(actor, [{ ref: MEAT, formula: "5" }]);
  await applyStockOnGain(feature);
  await applyStockOnGain(feature);
  const meats = actor.items.filter((i) => i.name === "Exquisite smoked meat");
  assert.equal(meats.length, 1, "not granted twice");
  assert.equal(meats[0].system.quantity, 5, "quantity unchanged");
});

test("a feature without stockOnGain grants nothing", async () => {
  const actor = makeActor();
  const feature = makeFeature(actor, []);
  await applyStockOnGain(feature);
  assert.equal(actor.items.length, 0);
});
