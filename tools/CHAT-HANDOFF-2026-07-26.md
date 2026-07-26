# Pirate Borg Handoff (2026-07-26)

## Scope

This handoff captures the replay/stack work through `community/05`, all bayonet/reload/effects regressions discovered during Foundry QA, and the follow-up fixes shipped to both `community/05-chat-ux-and-bayonets` and `beta/community-05`.

## Branch and Remote State

- `community/01-manual-creator-core` tracks `origin/community/01-manual-creator-core`
- `community/02-rules-fidelity-tables` tracks `origin/community/02-rules-fidelity-tables`
- `community/03-ae-foundation-buccaneer` tracks `origin/community/03-ae-foundation-buccaneer`
- `community/04-feature-grants-engine` tracks `origin/community/04-feature-grants-engine`
- `community/05-chat-ux-and-bayonets` tracks `origin/community/05-chat-ux-and-bayonets`
- `beta/community-05` tracks `origin/beta/community-05`

Current tips:

- `community/05-chat-ux-and-bayonets`: `ae7a6ef`
- `beta/community-05`: `d644b96`

## High-Level Timeline (Newest First)

- `ae7a6ef` / `d644b96`: Prevent duplicate bayonet grants by adopting legacy/orphan copies instead of creating a second bayonet.
- `4f3ea31` / `c3723c2`: Migration backfill for legacy bayonets so older copies participate in reload follow-up behavior.
- `1de0a66` / `e42fd84`: Multi-weapon reload chooser for bayonet follow-up.
- `3161bab` / `e0b2451`: Persist secondary outcomes in chat flags (fix dead reload button), switch bayonet grant source to canonical bayonet, grant cleanup self-heal.
- `c2c6692` / `494e3fb`: Fix localized button labels, stale chat action item lookup fallback, effects tab condition icon sizing, stronger Ready Bayonet macro behavior.
- `7e308c2`, `6c8c003` (beta branch only): Side-by-side beta packager workflow (`build:beta`) with robust dirty stamping.

## Problems Reported During QA and Technical Root Causes

### 1) Effects tab showed oversized icons

Root cause:

- Condition icon markup in effects tab lacked explicit size/style constraints under newer rendering/layout paths.

Fix:

- Added explicit `.effects .condition-list` and `.condition img` sizing/layout CSS.

Files:

- `css/pirateborg.css`

### 2) Chat card showed localization keys instead of text

Root cause:

- Some runtime paths rendered keys in environments where key resolution did not match expected language payload timing/state.

Fix:

- Added `localizeWithFallback(...)` usage for bayonet prompt/button labels to avoid raw key leakage.

Files:

- `module/api/action/character/character-reload-action.js`
- `module/api/outcome/character/attack-outcome.js`
- `lang/en.json`
- `lang/fr.json`
- `lang/pl.json`

### 3) Bayonet attack generated reload button, but click did nothing

Root cause:

- Chat rendered nested `secondaryOutcome`, but message flags stored only top-level `outcomes`.
- Click resolver looked up `outcomeId` in flags and failed to resolve nested outcome IDs.

Fix:

- Flatten outcomes when storing message flags.
- Add nested outcome resolver fallback.
- Keep flags flattened after button actions.

Files:

- `module/chat-message/generic-card.js`
- `module/api/automation/outcome-chat-button.js`

### 4) “Bayonets” item appeared with crossed-weapons icon and old behavior

Root cause:

- Feature grant source referenced `pirateborg.class-buccaneer;Bayonets` (legacy class item with generic icon).

Fix:

- Changed grant source to canonical item: `pirateborg.equipment-melee-weapons;Bayonet`.
- Updated macro fallback creation source to canonical bayonet.
- Added stale granted-item cleanup when grant refs changed.

Files:

- `packs/_source/class-buccaneer/fix-bayonets.json`
- `packs/_source/macros-pirateborg/ready-bayonet.json`
- `module/system/feature-grants.js`

### 5) Legacy bayonets did not trigger reload follow-up until deleted/recreated

Root cause:

- Older item instances lacked the newer behavior markers/shape expected by current bayonet flow.

Fix:

- Added migration backfill to mark legacy/orphan grant bayonets with `flags.<scope>.fixBayonetWeapon`.
- `isBayonetWeapon` now accepts explicit marker flag in addition to name match.

Files:

- `module/system/feature-migration.js`
- `module/system/feature-grants.js`
- `module/api/action/character/fix-bayonets.js`

### 6) Duplicate bayonet after migration/self-heal

Root cause:

- Reconcile could create a fresh canonical bayonet even when a legacy/orphan feature-owned bayonet already existed.

Fix:

- In `reconcileItemGrants`, for Fix Bayonets grants:
  - adopt an existing legacy/orphan candidate (by existing grant flag, marker flag, or legacy plural name) by reassigning `grantedBy` to current feature instance,
  - enforce equip/die updates on adopted item,
  - prune other legacy/orphan duplicates.
- Narrowed migration backfill to avoid sweeping all bayonet-named weapons; only legacy/orphan grant copies are targeted.

Files:

- `module/system/feature-grants.js`
- `module/system/feature-migration.js`

## Multi-Weapon Reload Chooser Design

Behavior:

- If bayonet attack follow-up sees >1 reloadable equipped gunpowder weapon, chat button opens chooser dialog.
- If exactly 1 reloadable weapon exists, reload proceeds directly.
- If user cancels chooser, no action occurs.

Implementation:

- Added `findReloadableGunpowderWeapons(actor, { excludeItemId })`.
- Kept existing single-item helper (`findReloadableGunpowderWeapon`) for compatibility and tests.
- Secondary outcome text changes to chooser-specific localization in multi-weapon case.

Files:

- `module/api/action/character/fix-bayonets.js`
- `module/api/outcome/character/attack-outcome.js`
- `module/api/action/chat/chat-reload-item-button-action.js`
- `lang/en.json`
- `lang/fr.json`
- `lang/pl.json`

## Migration Reporting Behavior

- Migration whisper is expected only when actual changes occur.
- No whisper can be correct if actor/world data was already in sync for this pass.

File:

- `module/system/feature-migration.js`

## Validation and Tooling Notes

- Lint: `npm run lint:check` used after each patch set.
- Tests: `npm test` repeatedly run; final status in this session remained green (`67 pass`, `0 fail`).
- Precommit hooks (`lint-staged`) auto-format staged files.

## Important Decisions

- Keep stacked branch model (`community/01` ... `community/05`) and duplicate commits onto beta branch rather than merging branches into each other.
- Use cherry-pick to move discrete fixes between `beta/community-05` and `community/05-chat-ux-and-bayonets` to avoid pulling beta-only packaging commits into community PR history.
- Prefer canonical bayonet compendium source for grants to stabilize icon/metadata.
- Preserve backwards compatibility for helper return contracts (e.g., undefined vs null behavior where tests enforce it).

## Remaining Risks / Watchpoints

- Existing worlds with unusual custom-renamed bayonet items may still require manual confirmation because adoption/backfill matching is intentionally conservative.
- If users intentionally own multiple unrelated bayonet items, cleanup logic should be monitored to ensure only legacy/orphan grant copies are touched.
- Foundry runtime state can differ from unit tests; final confirmation still requires in-client chat-button interaction tests.

## Retest Matrix for Next Agent

1. Legacy actor with pre-patch bayonet:
   - Attack with bayonet.
   - Confirm reload follow-up appears and works.
2. Actor with duplicate bayonet artifacts from prior patches:
   - Run migration/reconcile (GM reload world).
   - Confirm single feature-owned bayonet remains active.
3. Multi-weapon scenario:
   - Equip 2+ reloadable gunpowder weapons.
   - Bayonet attack -> click reload follow-up -> chooser appears -> selected weapon reloads.
4. Single-weapon scenario:
   - Equip only one reloadable gunpowder weapon.
   - Follow-up button reloads directly (no chooser).
5. Localization:
   - Verify chooser and bayonet button strings in EN/FR/PL.
6. Effects tab:
   - Confirm condition icons remain normal-sized.

## Files Most Relevant for Further Work

- `module/system/feature-grants.js`
- `module/system/feature-migration.js`
- `module/api/action/character/fix-bayonets.js`
- `module/api/outcome/character/attack-outcome.js`
- `module/api/action/chat/chat-reload-item-button-action.js`
- `module/api/automation/outcome-chat-button.js`
- `module/chat-message/generic-card.js`
- `packs/_source/class-buccaneer/fix-bayonets.json`
- `packs/_source/macros-pirateborg/ready-bayonet.json`
- `lang/en.json`, `lang/fr.json`, `lang/pl.json`

## Operational Context

- Repo path used in this chat: `/home/codeglaze/projects/pirate-borg-system-upstream-replay`
- Common local untracked artifacts observed during this work:
  - `dist/`
  - `tools/REPLAY-STACK-MAP.md`
- These were intentionally left uncommitted.
