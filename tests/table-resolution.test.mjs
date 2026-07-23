// Tests for manual character-creation table resolution, run against the real
// shipped packs/_source data. Guards the three character-creator fixes:
//   - nested sub-tables resolve instead of crashing (F10)
//   - ammo quantity overrides never land as NaN/null (F11)
//   - players can pick a *specific* leaf inside a sub-table (F12)
//
// Run with: npm test   (or: node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const compendium = await import(path.join(REPO_ROOT, "module/api/compendium.js"));

const CC = "pirateborg.rolls-character-creation";

test("getTableRows flattens 'X or Y' starting-weapon rows into leaf choices", async () => {
  const rows = await compendium.getTableRows(CC, "d10 Starting weapons");
  const byValue = Object.fromEntries(rows.map((r) => [r.value, r.label]));

  // Parent becomes a "(random)" header, and each leaf gets a path value.
  assert.match(byValue["1"] ?? "", /Marlinspike or Belaying Pin \(random\)/);
  assert.ok(byValue["1>1"], "leaf 1>1 exists");
  assert.ok(byValue["1>2"], "leaf 1>2 exists");

  // Plain single-item rows stay single options.
  assert.match(byValue["7"] ?? "", /Flintlock pistol/);
  assert.ok(!byValue["7>1"], "a plain row is not expanded");
});

test("getTableRows expands d10 Pets under d12 Cheap gear row 12", async () => {
  const rows = await compendium.getTableRows(CC, "d12 Cheap gear");
  const pets = rows.filter((r) => String(r.value).startsWith("12>"));
  assert.ok(pets.length >= 10, "all pets are listed as leaves");
  assert.ok(
    rows.some((r) => r.value === "12" && /\(random\)/.test(r.label)),
    "row 12 keeps a (random) header"
  );
});

test("resolveTablePath resolves a specific nested leaf, not a random one", async () => {
  // The headline case: Jimmy James Jimbo's parrot = d12 Cheap gear 12 -> d10 Pets 5.
  const parrot = await compendium.resolveTablePath(CC, "d12 Cheap gear", "12>5");
  assert.deepEqual(
    parrot.map((i) => i.name),
    ["Parrot"]
  );

  const weapon = await compendium.resolveTablePath(CC, "d10 Starting weapons", "1>2");
  assert.ok(
    weapon.some((i) => i.name === "Belaying pin"),
    "1>2 resolves the specific Belaying pin"
  );
});

test("resolveTablePath with a plain value still resolves the whole row", async () => {
  const flintlockRow = await compendium.resolveTablePath(CC, "d10 Starting weapons", "7");
  const names = flintlockRow.map((i) => i.name);
  assert.ok(names.includes("Flintlock pistol"), "row 7 yields the flintlock");
  assert.ok(names.includes("Rounds of shot"), "row 7 also grants ammo");
});

test("ammo quantity override is a finite number, never null (F11)", async () => {
  const flintlockRow = await compendium.resolveTablePath(CC, "d10 Starting weapons", "7");
  const ammo = flintlockRow.find((i) => i.name === "Rounds of shot");
  assert.ok(ammo, "ammo present");
  assert.ok(Number.isFinite(ammo.system.quantity), `quantity is finite (got ${ammo.system.quantity})`);
});
