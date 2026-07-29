# Project conventions (codeGlaze fork)

## Dev / test macros

- Hand-run Foundry macros (e.g. `tools/dev/*.js`) do **not** go through the betaify
  transform, so **never hardcode `pirateborg.` pack prefixes** — derive them from
  `game.system.id` (`pirateborg` in the real system, `pirate-borg-beta` in the beta
  build). The `game.pirateborg` API namespace and `CONFIG.PB.flagScope` are already
  version-agnostic; only literal `pirateborg.<pack>` refs need this.
- Shipped content (macros in packs, `grantsItems`/`stockOnGain`/`actionMacro` specs)
  _is_ betaified — `tools/beta/build-beta.mjs` rewrites `pirateborg.<pack>` →
  `pirate-borg-beta.<pack>` — so those may keep the literal prefix.

## Git / commits

- Author as **codeGlaze <github@codeglaze.com>**; do **not** add Claude/AI commit
  trailers.
- **Conventional Commits with a required scope** (commitlint enforces it): e.g.
  `feat(attack): …`, `fix(grants): …`, `chore(beta): …`. Merge commits need a
  conventional message too (`chore(release): …`).
- husky runs commitlint + lint-staged (prettier + eslint) on commit; keep changes
  prettier/eslint clean.

## Branches / build

- Feature work lands on `community/05-chat-ux-and-bayonets` (tip of the stacked
  `community/01..05`). A GitHub Action auto-merges the current community branch into
  the rolling **`beta/community`** branch on every push; build the beta with
  `npm run build:beta` (stamps `v1.8.0-beta`).
- We are based on upstream **v1.8.0** (`Limithron-Foundry-VTT/pirate-borg-system`),
  plus our automation on top. v12/v13/v14 compat is maintained (upstream's AppV2
  rewrite drops v12 — keep our UI logic decoupled from sheet/dialog markup).

## Feature automation shapes (on a feature's `system`)

- `attackDr: { dr, requires, conditional, stacks }` — attack-dialog DR reduction
  (`requires`: `"ranged"` | `"sword"` | `{ nameIncludes: [...] }`).
- `onGain` — apply-on-gain ability/HP via reversible transfer AE.
- `grantsItems` — feature-owned items (revert on removal, may scale).
- `stockOnGain: [{ ref, formula }]` — starting gear granted once on gain (kept; not
  reverted).
- `drTestReduction` — ability-test DR (Treasure Hunter–style header button).
- Active Effect flag `pirateborg.equipGate.weaponNameIncludes: [...]` — effect
  suppresses itself while the gated weapon isn't equipped (`PBActiveEffect.isSuppressed`).

## Active Effects — who applies what (transfer flag)

The fork added an effect lifecycle on top of a system that used to compute everything
in outcome macros (Ken Kyger, `da918f6`, 2025-09-17, "expansion of effect system").
`PBItem._transferEffectsToActor` copies an item's effects onto the actor as
actor-owned documents on equip and deletes them on unequip. That predates / overlaps
Foundry's own transfer, so the split MUST be kept clean:

- **`transfer: true`** → **core owns it.** Foundry applies the effect from the item
  automatically (it appears via `actor.allApplicableEffects()`, not in `actor.effects`).
  The fork's hook **skips these** — copying one too would double-apply it (the classic
  two-row "Ostentatious Fencer", one sourced "None"). Use `transfer: true` for passive
  feature effects, including equip-gated ones (`PBActiveEffect.isSuppressed` handles the
  gating; no manual copy needed).
- **`transfer: false`** → **the hook owns it.** Core leaves these alone; the hook copies
  them on equip / removes on unequip. This is the only path that should ever add an
  actor-owned copy of an item effect.

`feature-migration.js#cleanupTransferEffectDuplicates` is a one-time self-heal that
deletes stale hook copies of `transfer: true` effects left on characters made before
the guard landed.

## Reading effect flags safely (`getFlag` throws)

`doc.getFlag(scope, key)` **validates `scope` against active packages and throws** for
an unregistered scope — so `getFlag("pirateborg", …)` throws in the beta build (scope
is `pirate-borg-beta`). Read equip-gate/automation flags via the raw `flags` object
instead (see `equip-gate.js#readEquipGate`, which falls back across both scopes).

## Betaify also rescopes flag _keys_

`tools/beta/build-beta.mjs` rewrites `pirateborg.<pack>` dot-refs, **and** the flag
namespace key `"pirateborg":` → `"pirate-borg-beta":` in shipped JSON. If a feature's
flags silently "vanish" in the beta build, check that the key got rescoped (a missed
rescope is why equip-gate flags read empty and the migration looped).
