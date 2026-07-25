# Feature automation audit

A map of all **65 class features** by *how* they'd be automated, so we stop
one-off-ing and work category by category. "Current" = what the system does
today; "Approach" = the cleanest implementation; "Effort" = rough cost.

Legend for Current: ✅ automated · 🟡 partial · ⛔ inert (text-only "Use" card) ·
📖 narrative only.

---

## Two bugs to fix first (independent of the categories)

1. **Drag-drop doesn't stack same-name features.** `PBActorSheet._onDropItem`
   (`module/actor/sheet/actor-sheet.js:241`) lets `super._onDropItem` create the
   item and never merges. Dropping **Buccan Cook** (or any `maxQuantity > 1`
   feature) twice makes two copies instead of `quantity: 2`. The character
   *generator* already stacks (`updateOrCreateActorItems`); the drop path should
   too — merge into the existing item up to `maxQuantity`, delete the duplicate,
   warn if already at cap. **Fix in `_onDropItem`.**

2. **"Taken again" boosts have no feedback and can't re-apply.** Features like
   **Survivalist** (see Category B) do nothing and give no message. The pattern
   below (apply-on-gain + a re-apply guard keyed to quantity) fixes the whole
   class of them.

---

## A. Persistent numeric via Active Effect — *cleanest*

The Thick Skinned pattern: an AE on the feature moves a numeric actor field; the
derived value follows. Single source of truth.

| Feature | Class | Effect | Current | Approach |
| --- | --- | --- | --- | --- |
| Thick Skinned | Brute | counts as light armor (-d2) | ✅ AE → `naturalArmorTier` | done |
| Fast Reloading | Buccaneer | reload 1 action | ✅ AE → `reloadModifier` (on class) | done |
| Sea Turtle | Tall Tale | "extra -d2 to armor" | ⛔ | **AE → `naturalArmorTier` (identical to Thick Skinned)** |
| Shakespeare of Insults | Swashbuckler | +1 all damage rolls | ⛔ | AE → a new `damageModifier` field the damage roll reads (med) |
| Dazzling Acrobatics | Swashbuckler | +2 Agility *when defending* | ⛔ | conditional — AE a `defenseAgilityModifier` the defend flow reads (med) |

## B. One-time boost applied on gain — *your Survivalist case*

Permanent +stat/+HP the moment you gain the feature; then inert. Needs
**apply-once** logic keyed to the feature's `quantity` so "taken again" applies
the increment again but a re-render doesn't double it. This is where your
"make the Use button apply it once" instinct lands — better as automatic on
gain, with a chat line for feedback.

| Feature | Class | Effect | Current |
| --- | --- | --- | --- |
| Survivalist | Buccaneer | +1 Toughness, +d4 max HP, immune infected/sick/poisoned | ⛔ |

- Toughness +1 → could be an AE (`system.abilities.toughness.value`), but HP +d4
  is a **roll**, so it's not a static AE. Cleanest: on gain, roll d4, raise max
  HP, raise Toughness, post a card ("Survivalist: +1 Toughness, +3 max HP").
- Immunity (infected/sick/poisoned) → gate the Rest/infection dialog on a flag.
- Stacks to 2, so guard with a "applied N times" flag vs. `quantity`.

## C. Creation-time stat blocks (Tall Tale forms) — *applied at build, verify*

These set abilities/HP/attack when the character is *created* as that form. They
should already be handled by the hybrid generator; **action item: verify they
actually apply** (this is where "is it working?" bites hardest).

Anglerfish, Bilge Rat, Clever Monkey, Crab, Crocodile, Electric Eel, Foul Fowl,
Jaguar, Jellyfish, Lucky Parrot, Merfolk, Octopus, Sea Turtle*, Sentient Animal,
Shark, Aquatic Mutant, The Great Old One. (*Sea Turtle's armor bit → Category A.)

## D. Opt-in situational modifier at roll time — *Treasure Hunter pattern*

"-X DR when [situation]" the system can't detect, so the player elects it per
roll (checkbox on the roll dialog). Treasure Hunter already does this for
**ability tests**; extending to **attack/defense** rolls is the same idea one
layer over.

| Feature | Class | Effect | Current |
| --- | --- | --- | --- |
| Treasure Hunter | Buccaneer | -3/-6 DR on a subset of ability tests | ✅ opt-in `drTestReduction` |
| Crack Shot | Buccaneer | all ranged -2/-4 DR | ⛔ |
| Focused Aim | Buccaneer | -4 DR vs already-shot enemy (+d4 dmg if 2×) | ⛔ |
| Sword Master | Swashbuckler | -2 DR attacking with a sword | ⛔ |
| Ostentatious Fencer | Swashbuckler | -2 DR rapier/cutlass, +1 dmg dueling | ⛔ |
| Scurvy Scallywag | Swashbuckler | -2 DR vs already-attacked enemy | ⛔ |
| Back Stabber | Rapscallion | -2 DR + d2 dmg on surprise | ⛔ |
| Burglar | Rapscallion | -4 DR pick/disarm/trap (also grants lock picks) | ⛔ |
| Sneaky Bastard | Rapscallion | auto-crit test from shadows | ⛔ |
| Skylarker | Rapscallion | Agi test to auto-hit +2 dmg after a maneuver | ⛔ |

## E. Usable action button — *rolls/effects on demand (Buccan Cook pattern)*

Press to roll/produce something. Buccan Cook already works this way.

| Feature | Class | Action | Current |
| --- | --- | --- | --- |
| Buccan Cook | Buccaneer | eat (heal), cook rations | ✅ macros |
| Grog Brewer | Rapscallion | brew d4 grog servings | ⛔ (Cook-style) |
| Drinking Grog | Rapscallion | Toughness test to heal d4 | ⛔ (roll button) |
| Inspiring Leader | Swashbuckler | roll d4 ally buff | ⛔ (roll button) |
| Blood Frenzy | Brute | +2 dmg per kill this battle | ⛔ (combat counter) |
| Grog Breath | Brute | stun once/hour | 📖 mostly reminder |
| Lucky Devil / Joker Table / Deck of Cards | Rapscallion | card draws | 🟡 tables exist |
| Ghost / Conduit / Military Mastermind / Eldritch Mind | HS/Swash | timed tests/rolls | 📖 reminder + optional roll button |

## F. Grant items on gain

| Feature | Class | Grants | Current |
| --- | --- | --- | --- |
| Black Powder Poet | Swashbuckler | d4 rolls on Bombs table | ✅ creation macro |
| Burglar | Rapscallion | lock picks | ⛔ |
| Knife Knave | Swashbuckler | 2 knives | ⛔ |
| Fix Bayonets! | Buccaneer | a bayonet (d4/d6) | ⛔ |

## G. Weapon / crit property change

| Feature | Class | Effect | Current |
| --- | --- | --- | --- |
| Calculating Cutthroat | Swashbuckler | crit on 19–20 | ⛔ (book even says "update Crit On manually") |
| Fix Bayonets! | Buccaneer | attack with bayonet same turn as reload | ⛔ (also Category F) |

## H. Reminder-only / GM adjudication — *leave as text*

No clean numeric hook, cross-actor, or pure flavor.

- **Flavor:** all 8 Zealot "Whom dost thou serve?" deities; Muscles Only.
- **Permission gates** (could be soft-checks later): Armored Caster (use rituals
  in medium armor), Muscles Only (can't use relics).
- **Cross-actor:** Intimidating Presence (enemies -2 Morale), Inspiring Leader.
- **Complex narrative:** Haunted Soul — Skeleton, Vampirism, Zombie, Conduit,
  Eldritch Mind, Ghost. Some have a usable roll (Category E) but the ongoing
  bookkeeping stays manual.
- **Situational:** Merfolk (-4 DR underwater), Flintlock Fanatic / Knife Knave
  multi-attacks.

---

## Recommended order of attack

1. **Bug: drag-drop stacking** (small, self-contained) + **verify Tall Tale
   stat blocks apply** (Category C) — correctness first.
2. **Category A leftovers** (Sea Turtle) — trivial reuse of Thick Skinned.
3. **Category B one-time boosts** (Survivalist) — build the reusable
   apply-on-gain-with-quantity-guard mechanism; it unlocks any future +stat/+HP.
4. **Category F grants** (lock picks, knives, bayonet) — reuse Buccan Cook's
   grant-once pattern.
5. **Category D attack DR** — generalize the Treasure Hunter opt-in to attack
   rolls; biggest bang, medium cost.
6. **Category E buttons** — case by case.
7. **Category G** — Calculating Cutthroat crit range.
8. **Category H** — leave as reminders.

## Data field / mechanism inventory (so we reuse, not reinvent)

- `naturalArmorTier` (AE) — armor-tier features (A).
- `reloadModifier` (AE) — reload features (A).
- `drTestReduction` (data + opt-in dialog) — ability-test DR (D); needs an
  attack-roll sibling for the rest of D.
- Grant-once macro + feature flag (Buccan Cook) — F.
- New, to build: `damageModifier` field for +damage features; apply-on-gain
  helper for B; a stacking merge in `_onDropItem` for the bug.
