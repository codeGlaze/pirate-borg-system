# Rules fidelity — system vs. the PIRATE BORG core rulebook

A living checklist comparing the Foundry system's compendium data against the
printed rules. Findings are verified against the **2nd edition (v2)** core book;
where an entry is corrected, it's pinned by a test in `tests/rules-fidelity.test.mjs`.

## Editions matter

The system's data was authored against the **1st edition (1e)** printing and has
been stable since its first export. The comparison book here is **2e**. Most
content is identical; a handful of entries drifted between printings. Where we
correct data we move it **toward 2e** (the current print). Book **page
references** are kept for at-the-table use and written **dual-edition**:
`2e pg. X / 1e pg. Y`.

Legend: ✅ matches · 🔧 corrected (see commit) · ⏳ not yet compared

## Character creation

| Content                                                 | Rulebook  | Status                                       |
| ------------------------------------------------------- | --------- | -------------------------------------------- |
| d12 Cheap gear, d10 Pets                                | pg. 27    | ✅                                           |
| d12 Fancy gear, d10 Instruments                         | pg. 27    | ✅                                           |
| d6 Container                                            | pg. 27    | ✅                                           |
| Ability score modifiers                                 | pg. 28    | ✅ (`abilityBonus()`)                        |
| d10 Starting weapons (+ the 3 "X or Y" sub-tables)      | pg. 50–51 | ✅                                           |
| d10 Clothing/Armor, d12 Hats                            | pg. 52    | ✅ (incl. hats 11 metal-lined, 12 morion)    |
| Broken table (d6)                                       | pg. 32    | ✅                                           |
| d100 Backgrounds — names, gold formulas, starting items | pg. 55    | 🔧 24/25 swap (`c380d70`)                    |
| d20 Distinctive Flaws                                   | pg. 56    | ✅                                           |
| d20 Physical Trademark                                  | pg. 57    | ✅                                           |
| d20 Idiosyncrasies                                      | pg. 58    | 🔧 #5 grammar (`c380d70`)                    |
| d20 Unfortunate Incidents & Conditions                  | pg. 59    | ✅                                           |
| d100 Thing of Importance                                | pg. 60–61 | 🔧 #90 sub-roll, #84 ASH (`c380d70`)         |
| d20 Ancient Relics — names + effects                    | pg. 62–63 | 🔧 #12 Heart of the Sea cubic ft (`7e1fa53`) |
| d20 Arcane Rituals — set + effects                      | pg. 64–65 | 🔧 Mermaid's Kiss, Black Spot (`7e1fa53`)    |

## Classes

| Class                                                   | Rulebook  | Status                                      |
| ------------------------------------------------------- | --------- | ------------------------------------------- |
| Brute — stats, trusted weapon (d6), getting better (d6) | pg. 34–35 | ✅                                          |
| Rapscallion — stats, features (d6), 54-card deck        | pg. 36–37 | ✅                                          |
| Buccaneer — stats, features (d6)                        | pg. 38–39 | ✅ (10+Presence ammo now modeled)           |
| Swashbuckler — stats, starting + getting-better (d6)    | pg. 40–41 | ✅                                          |
| Zealot — stats, prayers (d10), deity (d8)               | pg. 42–43 | ✅                                          |
| Sorcerer — stats, spells (d6)                           | pg. 44–45 | ✅ (spell d6-order cosmetic; random-learn)  |
| Haunted Soul — ailments (d6)                            | pg. 46–47 | ✅                                          |
| Tall Tale — Merfolk / Aquatic Mutant (d8) / animals     | pg. 48–49 | 🔧 Sentient Animal d6 reordered (`47dfbcb`) |

## GM / other

| Content                                 | Status                                       |
| --------------------------------------- | -------------------------------------------- |
| Reaction, Morale, Fumble (black powder) | ✅ (spot-checked)                            |
| Mystical Mishaps (d20, full effects)    | 🔧 #18 wording aligned (`PENDING`)           |
| Grenades & Bombs (d6, names + damage)   | ✅                                           |
| Ship: Derelict Takes Damage             | ❔ not in the compared PDF — unverified      |
| Ship: full naval rules, ASH tables      | ⛔ not in the system (do not add — see note) |

## Corrections applied

| #   | Entry                        | Was                            | Now (2e)                                         | Commit    |
| --- | ---------------------------- | ------------------------------ | ------------------------------------------------ | --------- |
| 1   | Backgrounds 24/25            | 24 Bandit, 25 Assassin         | 24 Assassin, 25 Bandit                           | `c380d70` |
| 2   | Thing of Importance 90       | "2 loved one, 3 enemy"         | "2 enemy, 3 loved one"                           | `c380d70` |
| 3   | Thing of Importance 84       | "(rum, powder, ashes)"         | "…, ASH)"                                        | `c380d70` |
| 4   | Idiosyncrasy 5               | "Rats is…"                     | "Rats are…"                                      | `c380d70` |
| 5   | Ritual Mermaid's Kiss        | +STR/AGI/TOU/**PRE**           | +STR/AGI/TOU                                     | `7e1fa53` |
| 6   | Ritual The Black Spot        | die within d8 **hours**        | d8 **days**                                      | `7e1fa53` |
| 7   | Relic Heart of the Sea       | 30 **square** ft fog           | 30 **cubic** ft fog                              | `7e1fa53` |
| 8   | Tall Tale Sentient Animal d6 | 2 Croc/3 Parrot/4 Jaguar/5 Rat | 2 Jaguar/3 Croc/4 Rat/5 Parrot                   | `47dfbcb` |
| 9   | Starting rounds of shot      | flat 10 / 20 default           | 10 + Presence                                    | `47dfbcb` |
| 10  | Mystical Mishap 18 (crabs)   | "extra -2 armor"               | "-d2 damage reduction (does not count as armor)" | `PENDING` |

Notes:

- Thing of Importance 65 (tattoo) was checked — its "d4: 1 love / 2 revenge /
  3 ancestors / 4 unknown origin" detail lives intact in the feature item's
  description; nothing lost. Guarded by a test.
- Mermaid's Kiss / Black Spot: no published edition or errata supports the old
  values, so treated as system transcription errors, not intentional.
- ASH in Thing of Importance 84: almost certainly a 2e addition (the system is
  otherwise 1e-faithful and ASH is 2e's central setting concept), so adding it
  correctly moves the entry to 2e.
- Mystical Mishap 18: aligned to the book's "-d2 damage reduction (does not
  count as armor)". This is also _more_ modellable than the old "-2 armor": the
  defend dialog's armor field is a free-text roll formula, so a defending player
  adds `+ 1d2` to their damage reduction — the same way the system's existing
  "extra protection in addition to armor" relics (Crown of the Sunken Lord,
  Spiritual Ward) are applied.
- Ammo model: the book's shop list sells "20 rounds of shot — 10s", so the ammo
  item's default quantity of 20 (a purchase) is correct and distinct from the
  "10 + Presence" a character starts play with (correction #9).

## Scope & licensing

This comparison only **corrects content the system already ships** — reordering,
grammar, effect values, and text on entries already present under the system's
MÖRK BORG 3rd-party license. It does **not** add content that is absent from the
system (full naval rules, ASH market/consumption tables, bestiary), since that
would introduce new licensed material. Content printed on the free Pirate Borg
quick-start character sheet is a defensible source if scope is ever expanded —
provide the sheet and it can be treated as allowed.

## Book page references (dual-edition)

Only these compendium entries cite a book page. Corrected to `2e / 1e`:

| Referenced       | Items                            | 2e  | 1e  |
| ---------------- | -------------------------------- | --- | --- |
| Instrument table | Musician, Performer backgrounds  | 27  | 11  |
| Reaction table   | Mystical Mishaps (mishaps 3 & 4) | 31  | 30  |
| The Kraken       | Release the Kraken ritual        | 105 | 61  |

Unchanged (identical in both editions): Heart Hex → Reaction pg. 31; Reopen the
Grave → Zombies pg. 94 / Skeletons pg. 92. Ship-domain refs (shanties,
marrow-cannons: pg. 74/84) point outside the compared pages and are left as-is
pending a 2e cross-check.
