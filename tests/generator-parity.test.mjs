// Parity between the manual creator and the random "Tavern": both call the same
// buildCharacter, so divergence can only hide at the per-field forks (use the
// player's value vs roll/draw it). These tests lock those forks so the manual
// branch can't drift from the random one — the class of bug we kept patching
// (blank ability -> 0 instead of rolling; a chosen row not resolving).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { resolveNumericChoice, getTableRows, resolveTablePath } = {
  ...(await import(path.join(REPO_ROOT, "module/api/generator/character-generator.js"))),
  ...(await import(path.join(REPO_ROOT, "module/api/compendium.js"))),
};

// --- Numeric fork: the five inline copies (abilities/luck/hp/silver) now share this.

test("a blank field rolls (does NOT become 0) — the Tavern behaviour", () => {
  for (const blank of ["", undefined, null]) {
    let rolled = false;
    const value = resolveNumericChoice(blank, () => {
      rolled = true;
      return 7;
    });
    assert.equal(rolled, true, `blank ${JSON.stringify(blank)} should roll`);
    assert.equal(value, 7);
  }
});

test("a non-numeric string rolls rather than producing NaN", () => {
  let rolled = false;
  assert.equal(
    resolveNumericChoice("abc", () => {
      rolled = true;
      return 4;
    }),
    4,
  );
  assert.equal(rolled, true);
});

test("a chosen value is used verbatim, and the roll is never called", () => {
  for (const chosen of ["5", 5]) {
    let rolled = false;
    assert.equal(
      resolveNumericChoice(chosen, () => {
        rolled = true;
        return 99;
      }),
      5,
    );
    assert.equal(rolled, false, "must not roll when a value was chosen");
  }
});

test("an explicit 0 is honored, not treated as blank", () => {
  let rolled = false;
  assert.equal(
    resolveNumericChoice("0", () => {
      rolled = true;
      return 3;
    }),
    0,
  );
  assert.equal(rolled, false);
});

// --- Table fork: every row the manual picker offers must resolve to what a roll
// would build, so no manual option is a dead end vs the random path.

test("every offered weapon row resolves to an item (manual covers the random space)", async () => {
  const rows = await getTableRows("pirateborg.rolls-character-creation", "d10 Starting weapons");
  assert.ok(rows.length > 0, "expected selectable weapon rows");
  for (const row of rows) {
    const items = await resolveTablePath("pirateborg.rolls-character-creation", "d10 Starting weapons", row.value);
    assert.ok(Array.isArray(items) && items.length > 0, `row "${row.label}" (${row.value}) should resolve to an item`);
  }
});

test("nested picks (e.g. the pet drill-down) still resolve for every leaf", async () => {
  const rows = await getTableRows("pirateborg.rolls-character-creation", "d12 Cheap gear");
  assert.ok(rows.length > 0);
  for (const row of rows) {
    // Must never throw for any offered path; leaves resolve to items.
    const items = await resolveTablePath("pirateborg.rolls-character-creation", "d12 Cheap gear", row.value);
    assert.ok(Array.isArray(items), `row "${row.label}" (${row.value}) should resolve without error`);
  }
});
