# Class emblems

Per-class emblem art (a skull/head over a crossed weapon, on the black disc) used as the
class item `img` and offered as selectable alternates. Emblems are authored with the dev tool
in `tools/dev/emblem-builder/` **from art already in this repo** — never invented or
externally sourced.

> Not every class uses this scheme. **Tall Tale** ships its own set of animal icons
> (`tall-tale/shark.png`, `crab.png`, …) and is intentionally excluded.

## Class codes

Each class has a stable 3-letter code. The code prefixes every emblem filename so a basename
is self-describing even when copied out of its folder (a flattened dump, a symlink pull, an
asset picker that shows names without paths).

| Code  | Class        | Pack                 |
| ----- | ------------ | -------------------- |
| `brt` | Brute        | `class-brute`        |
| `buc` | Buccaneer    | `class-buccaneer`    |
| `rap` | Rapscallion  | `class-rapscallion`  |
| `swa` | Swashbuckler | `class-swashbuckler` |
| `sor` | Sorcerer     | `class-sorcerer`     |
| `zel` | Zealot       | `class-zealot`       |
| `hnt` | Haunted Soul | `class-haunted-soul` |
| `lub` | Landlubber   | `class-landlubber`   |

## Layout & filenames

```
icons/classes/<class>/emblems/<code>-<description>.png
```

- **Per-class folder** keeps things organized in-repo; the **code prefix** keeps the basename
  meaningful out of context. Belt and suspenders.
- `<description>` is kebab-case and describes what's drawn, e.g.
  `icons/classes/brute/emblems/brt-spiked-maces.png`,
  `icons/classes/rapscallion/emblems/rap-joker-cards.png`.
- Emblems live under `emblems/` so they never mix with the **feature** icons that already sit
  at the class-folder root (e.g. `rapscallion/card-joker.png`, `rapscallion/beer-stein.png`
  are feature art, not class emblems).

## Manifest — `icons/classes/emblems.json`

The manifest is the allowlist and default index. Consumers read it instead of globbing the
folder, so only blessed files ever appear in the UI and each class has one canonical default.

```json
{
  "<class>": {
    "default": "<code>-<description>",
    "options": ["<code>-<description>", "..."]
  }
}
```

Example:

```json
{
  "brute": { "default": "brt-spiked-maces", "options": ["brt-spiked-maces", "brt-horned-chains"] },
  "rapscallion": { "default": "rap-joker-cards", "options": ["rap-joker-cards", "rap-random-cards", "rap-card-fan"] },
  "zealot": { "default": "zel-crossed-croziers", "options": ["zel-crossed-croziers", "zel-single-crozier"] }
}
```

Rules:

- Keys are class slugs (the `class-<slug>` pack name without the `class-` prefix).
- `default` **must** be one of `options`; it's the emblem used when nothing overrides it.
- Values are filename **stems** (no `emblems/` path, no `.png`). Resolve a stem to a file as
  `icons/classes/<class>/emblems/<stem>.png`.
- A class appears in the manifest only once it has at least one emblem. Absent = "no emblem,
  keep the class's existing token art."

## How it's consumed

- **Class item `img`** — points at the default:
  `systems/pirateborg/icons/classes/<class>/emblems/<default>.png`.
- **Emblem picker / on-off toggle** (see `tools/` + the class icon setting) — reads the
  manifest to list a class's `options`, and swaps the class item `img` to the chosen stem.
  Turning the feature off reverts to the original `tokens/<class>.png` art.

## Adding an emblem or alternate

1. Build it in `tools/dev/emblem-builder/` and export the PNG (all art must be repo-sourced).
2. Save it as `icons/classes/<class>/emblems/<code>-<description>.png`.
3. Add the stem to that class's `options` in `emblems.json` (and set `default` if it should be
   the primary).
4. If it's the new default, repoint the class item's `img` in
   `packs/_source/class-<class>/<classitem>.json` and recompile the pack.
