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
const { chooseGettingBetterFeatureValue } = await import(path.join(REPO_ROOT, "module/dialog/get-better-feature-dialog.js"));

test('default "roll" mode returns null without prompting', async () => {
  game.settings.set("pirateborg", "getBetterFeatureMode", "roll");
  assert.equal(await chooseGettingBetterFeatureValue("pirateborg.rolls-buccaneer", "Features"), null);
});

test("unset mode also falls through to a roll (null)", async () => {
  game.settings._values.getBetterFeatureMode = undefined;
  assert.equal(await chooseGettingBetterFeatureValue("pirateborg.rolls-buccaneer", "Features"), null);
});
