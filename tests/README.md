# Tests

Lightweight, Foundry-free unit tests for the system's pure logic. They import
the real system modules under a set of minimal Foundry stubs and run against the
**actual shipped data** in `packs/_source/`, so they catch both code and data
regressions.

## Running

```bash
npm test
# or directly:
node --test tests/*.test.mjs
```

No build step and no Foundry install required — just Node 18+.

## How it works

`helpers/foundry-stubs.mjs` installs just enough of the Foundry globals
(`game`, `CONST`, `Roll`, base `Application` classes, ...) for the logic modules
to import and execute. `game.packs.get(id).getDocuments()` reads the matching
`packs/_source/<pack>/*.json` files and wraps each in a tiny fake document, so a
test exercises the same tables players actually roll on.

Call `installFoundryStubs()` **before** importing any system module.

## Coverage

- `table-resolution.test.mjs` — manual character-creation table resolution:
  flattening nested sub-tables into selectable leaves, resolving a specific leaf
  by path (e.g. a chosen pet), plain-value resolution, and the ammo-quantity
  override guard. These lock in the character-creator fixes F10 (nested-table
  crash), F11 (null ammo quantity), and F12 (specific sub-table selection).

## Adding a test

Create `tests/<name>.test.mjs`, import and call `installFoundryStubs()`, then
`await import(...)` the module under test. Use `node:test` + `node:assert`.
If the module touches a Foundry global the stubs don't cover yet, add it to
`helpers/foundry-stubs.mjs` (keep it minimal — only what the code calls).
