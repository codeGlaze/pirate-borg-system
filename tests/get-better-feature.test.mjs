// The default Get Better mode is "roll" (rules-as-written): the feature is gained
// randomly, so the choice resolver returns null (no dialog) and the caller rolls.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
globalThis.Dialog = class {
  render() {
    throw new Error("no dialog should be shown in roll mode");
  }
};
const { chooseGettingBetterFeatureValue, cappedFeatureNames } = await import(path.join(REPO_ROOT, "module/dialog/get-better-feature-dialog.js"));

const feature = (name, quantity, maxQuantity) => ({ type: "feature", name, quantity, maxQuantity });

test("features at their max are reported capped; below-max and unlimited are not", () => {
  const capped = cappedFeatureNames({
    items: [
      feature("Treasure Hunter", 2, 2), // at cap → capped
      feature("Buccan Cook", 1, 2), // below cap → available
      feature("Focused Aim", 1, 1), // single, held → capped
      feature("Endless", 5, 0), // maxQuantity 0 = unlimited → never capped
      { type: "weapon", name: "Musket", quantity: 1, maxQuantity: 1 }, // not a feature → ignored
    ],
  });
  assert.deepEqual([...capped].sort(), ["Focused Aim", "Treasure Hunter"]);
});

const actor = { items: [] };

test('default "roll" mode returns null without prompting', async () => {
  game.settings.set("pirateborg", "getBetterFeatureMode", "roll");
  assert.equal(await chooseGettingBetterFeatureValue(actor, "pirateborg.rolls-buccaneer", "Features"), null);
});

test("unset mode also falls through to a roll (null)", async () => {
  game.settings._values.getBetterFeatureMode = undefined;
  assert.equal(await chooseGettingBetterFeatureValue(actor, "pirateborg.rolls-buccaneer", "Features"), null);
});
