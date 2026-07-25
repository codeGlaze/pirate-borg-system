# Plan: automate manual class/effect reminders with Active Effects

**Branch:** `claude/ae-automation`. Goal: turn the effects the system currently
leaves as card-reminder text into real, automated Active Effects (AEs) where
it's clean to do so — with a **single source of truth** so die/stat changes are
derived, not duplicated.

## Principles

- **AEs are core Foundry** (no dependency). The system already uses them
  (`carryingModifier` is AE-driven since v1.1.4).
- **Actor-level, numeric fields are the clean targets.** A class-feature item
  carries a transfer AE that changes a numeric actor field; the relevant logic
  reads that field. This is the same shape as `carryingModifier`.
- **Single source of truth via a step + lookup.** Store a numeric step, derive
  the die/label from a ladder/table, and let AEs (`ADD`/`UPGRADE`/`DOWNGRADE`)
  move the number. The die updates automatically — armor tiers already work this
  way (`tier.value` → `armorTiers[tier].damageReductionDie`).
- **Dice ladder** (Pirate Borg): `["0","1d2","1d4","1d6","1d8","1d10","1d12"]`
  (note: no d3). Stepping = index ±1 on this ladder.

## What's clean vs. hard

| Effect type                                 | Approach                                              | Difficulty   |
| ------------------------------------------- | ----------------------------------------------------- | ------------ |
| Actor-wide numeric (reload actions, carry)  | actor field + item transfer AE                        | easy         |
| Armor/protection **tier** (derives its die) | AE the tier step (UPGRADE/ADD)                        | easy–med     |
| A specific **weapon's** damage die          | needs item-applied effects                            | hard (defer) |
| "-d2 damage reduction" one-offs (relics)    | leave as reminder (already usable via defend formula) | n/a          |

## Phases

### Phase 1 — Buccaneer 1-action reload (this PR)

The Buccaneer reloads black-powder weapons in 1 action instead of 2; today the
weapon keeps `reloadTime: 2` and the perk is text only.

- Add `system.attributes.reloadModifier.value` (default 0) to the character
  schema — mirrors `carryingModifier`.
- Actor: `reloadModifier` getter + `getEffectiveReloadTime(weapon) = max(1, weapon.reloadTime - reloadModifier)`.
- Reload + post-fire reload-reset logic read the effective time.
- The Buccaneer class item carries a transfer AE: `reloadModifier` `ADD` 1.
- Tests for `getEffectiveReloadTime`; CHANGELOG entry.

### Phase 2 — dice-ladder + natural armor tier

- ✅ `module/api/dice-ladder.js` — `DICE_LADDER` + `normalizeDie` / `dieToStep` /
  `stepToDie` / `stepDie` (tested). This is the single-source-of-truth helper:
  a numeric step an AE can move, deriving the die (e.g. `stepDie("1d2", +1)` →
  `"1d4"`).
- ✅ **Natural armor tier** — `system.attributes.naturalArmorTier.value` added
  to the character schema. `PBActor.getCharacterArmorFormula()` derives the
  damage-reduction die from `armorTiers[max(equippedTier, naturalArmorTier)]`,
  and both armor-die spots (`getActorArmorFormula` when targeted, `_getDefendArmor`
  when defending) use it. Default 0 → identical to before for everyone without
  a natural tier.
- ✅ **Brute "Thick Skinned"** — the feature item carries a transfer AE that
  `UPGRADE`s `naturalArmorTier` to 1, so an unarmored Brute counts as light armor
  (-d2). Tested. This is the tier-as-single-source-of-truth demo: the AE moves a
  number, the die follows.
  - **Reconciled with upstream's phantom item.** Stock Pirate Borg automated
    Thick Skinned by having the Brute *Getting Better* macro grant a separate
    `Thick Skin` **armor item** (tier 1, `equipped:false`) — which did nothing
    until the player manually equipped it, and only appeared on a leveled-up
    Brute. That's now redundant: the feature's AE applies the -d2 the instant the
    feature is gained, unarmored, no equip step. `getCharacterArmorFormula()` uses
    `max(wornTier, naturalArmorTier)` so the two never stacked, but the phantom
    item was confusing. Retired it: deleted the `Thick Skin` armor source
    (`class-brute/thick-skin.json`) and rewrote `macros-brute/getting-better.json`
    to *remove* any legacy `Thick Skin` armor copy instead of granting one.
- ⏳ **Crit "armor −1 tier"** — deferred to Phase 2b. This is the defender-side,
  persistent reduction (like a fumble damaging your own armor), cross-actor and
  higher-risk. When done it will use `dice-ladder.stepDie(armorDie, -1)`.

### Phase 3 — case-by-case flat feature AEs

Evaluate other features (e.g. Survivalist +1 Toughness). **Skip anything already
applied at character creation** (class ability bonuses are baked into abilities
at build time — an AE would double-count).

## Non-goals

- Rewriting damage dice to a step index (big refactor; only if a real effect
  needs weapon-die stepping).
- Automating narrative-only mishaps/relics that have no clean numeric target.
