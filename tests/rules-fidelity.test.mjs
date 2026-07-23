// Data-fidelity tests: pin specific character-creation table entries to the
// PIRATE BORG v2 core rulebook so a future edit can't silently drift from the
// book. Reads packs/_source directly (no Foundry needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./helpers/foundry-stubs.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8"));
const rowText = (table, value) => {
  const d = readJson(`packs/_source/rolls-character-creation/${table}.json`);
  const r = d.results.find((res) => value >= res.range[0] && value <= res.range[1]);
  return r?.text ?? "";
};

test("Backgrounds 24=Assassin, 25=Bandit (rulebook pg. 55)", () => {
  assert.equal(rowText("d100-backgrounds", 24), "Assassin");
  assert.equal(rowText("d100-backgrounds", 25), "Bandit");
});

test("Thing of Importance 90 wanted poster: 2 enemy, 3 loved one (pg. 61)", () => {
  assert.match(rowText("d100-thing-of-importance", 90), /2 enemy, 3 loved one/);
});

test("Thing of Importance 84 small keg lists ASH (pg. 61)", () => {
  assert.match(rowText("d100-thing-of-importance", 84), /ashes, ASH/);
});

test("Idiosyncrasy 5 reads 'Rats are ...' (pg. 58)", () => {
  assert.match(rowText("d20-idiosyncrasies", 5), /^Rats are/);
});

test("Thing of Importance 65 tattoo keeps its d4 sub-table in the item (pg. 61)", () => {
  // The table row is an item reference labelled just "tattoo"; the d4 detail
  // lives in the feature item's description. Guard it so it is never lost.
  const tattoo = readJson("packs/_source/feature-thing-of-importance/tattoo.json");
  assert.match(tattoo.system.description, /d4: 1 love, 2 revenge, 3 ancestors, 4 unknown origin/);
});
