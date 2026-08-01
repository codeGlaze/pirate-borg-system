# Installing / updating the PIRATE BORG (Beta) on The Forge

The beta is a **manually-managed** system (no `manifest` URL — the build strips it so it never
tries to auto-update to the real upstream system). Install and update it by replacing the
folder directly, **not** through Foundry's Install/Update/Uninstall buttons.

## Why not the Uninstall / in-place Update buttons

Foundry/Forge remove a system by deleting the files they know about and then `rmdir`-ing each
compendium folder. Our packs are LevelDB **directories**, and once Foundry has opened them it
leaves behind log/compaction files (`LOG`, `*.log`, `LOCK`, …). `rmdir` only removes an _empty_
directory, so it throws:

```
ENOTEMPTY: directory not empty, rmdir '.../packs/<something>'
```

The uninstall/update then aborts and the **old build stays registered** (you'll see the old
version number and "fails to finish installing"). Forge's _file browser_ deletes recursively,
so it doesn't hit this.

## The reliable way (install and every update)

1. Build the beta: `npm run build:beta` → `dist/pirateborg-beta-b<N>-<sha>.zip`.
2. In Forge, open the **Assets Library / Data file browser** and go to `Data/systems/`.
3. **Delete the whole `pirateborg-beta` folder there** (recursive delete — this is the step
   that avoids the `rmdir` failure). Do this even for a first install if a stale one is present.
4. Extract the zip and upload the inner `systems/pirateborg-beta/` folder into `Data/systems/`,
   so you end up with `Data/systems/pirateborg-beta/system.json`.
5. Restart Foundry.

Because each update is effectively a clean first-install, it always finishes.

## Build safety

`tools/beta/build-beta.mjs` validates the staged system before zipping and **refuses to emit a
broken build** — every manifest-declared pack must be present and a loadable LevelDB, every
shipped module JS must still parse after the betaify rewrite, and the settings-namespace /
`flagScope` rescopes must have landed. Forge gives no feedback on a bad upload, so the build is
its own quality gate.
