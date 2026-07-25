# Migration coverage

Which of this session's changes need migration for **existing** worlds, and how
each is handled. The core problem: a compendium edit never reaches items already
embedded on an actor, so automations added to a feature/class only apply to
newly-created characters unless we re-sync.

## Data changes → migrated (re-sync on load, GM-only, idempotent)

`module/system/feature-migration.js` (`migrateFeatureMechanics`) patches only the
whitelisted mechanical bits from the compendium onto existing embedded copies:

| Item                  | What existing copies were missing                                                                                                                                     | Handled                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Buccaneer (class)     | `reloadModifier` Active Effect                                                                                                                                        | AE synced                                |
| Thick Skinned         | `naturalArmorTier` AE — **regression risk**: the getting-better macro now deletes the old "Thick Skin" armor, so without this AE an existing Brute would lose its −d2 | AE synced                                |
| Treasure Hunter       | `system.drTestReduction` (opt-in DR prompt)                                                                                                                           | field synced                             |
| Survivalist           | `system.onGain` + the boost applied                                                                                                                                   | field synced + grant reconciled (silent) |
| Buccan Cook           | `actionMacro`/label ("Cook")                                                                                                                                          | fields synced                            |
| Exquisite smoked meat | `actionMacro`/label ("Eat")                                                                                                                                           | fields synced                            |

Idempotent: only writes when the embedded value differs / the AE key is absent, so
it can run every load and self-heals imported actors. Feedback is suppressed during
migration (`{pbMigration:true}` update option) so it doesn't spam chat.

## Data changes → already migrated separately

| Change                     | Handled                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| Relic/ritual premium icons | `repairPremiumIcons` + runtime fallback hooks (gated on the premium module) |

## Schema additions → no migration needed

`template.json` gained `reloadModifier` / `naturalArmorTier` (default 0), feature
`drTestReduction` (0) and `onGain` ({}), and the `getBetterFeatureMode` setting.
Foundry fills template defaults on load, so existing actors/items read the defaults
with no migration.

## Code-only changes → no data migration

Broken content-link clone fix; reload-counter display; Get Better roll-or-choose;
feature drag-drop stacking; the manual/random numeric-resolver refactor. These
change behavior, not stored data.

## Known non-migrated edges (low-impact, documented on purpose)

- **Pre-existing duplicate features** (someone who hit the old drag-drop bug and has
  two copies of a feature) are **not** auto-merged into one stacked item — merging
  live items with their own state is riskier than it's worth for a rare case. Delete
  the extra copy by hand; new drops stack correctly.
- **Orphaned "Thick Skin" armor** on an existing Brute is left in place (harmless:
  `getCharacterArmorFormula` takes the max, so it never stacks with the AE) and the
  getting-better macro removes it on the next level-up.
