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

test("Ritual Mermaid's Kiss buffs 3 abilities, not presence (pg. 65)", () => {
  const r = readJson("packs/_source/invokable-arcane-rituals/mermaids-kiss.json");
  assert.match(r.system.description, /strength, agility, &amp; toughness/);
  assert.doesNotMatch(r.system.description, /presence/i);
});

test("Ritual The Black Spot kills within d8 days, not hours (pg. 65)", () => {
  const r = readJson("packs/_source/invokable-arcane-rituals/the-black-spot.json");
  assert.match(r.system.description, /die within d8 days/);
});

test("Relic Heart of the Sea makes cubic feet of fog (pg. 63)", () => {
  const r = readJson("packs/_source/invokable-ancient-relics/heart-of-the-sea.json");
  assert.match(r.system.description, /30 cubic feet of fog/);
});

test("Tall Tale Sentient Animal d6 matches book order (pg. 48-49)", () => {
  const d = readJson("packs/_source/rolls-tall-tale/sentient-animal.json");
  const order = d.results
    .slice()
    .sort((a, b) => a.range[0] - b.range[0])
    .map((r) => [r.range[0], r.text.replace(/<[^>]+>/g, "")]);
  assert.deepEqual(order, [
    [1, "Foul Fowl"],
    [2, "Jaguar"],
    [3, "Crocodile"],
    [4, "Bilge Rat"],
    [5, "Lucky Parrot"],
    [6, "Clever Monkey"],
  ]);
});
