# Class Emblem Builder (dev tool)

An interactive, single-file HTML tool for composing per-class emblems by combining the
system's **own** skull/head and weapon art — riffing on the default `class.png` (skull over
crossed cutlasses). Swap the head, swap the weapon(s), drag/resize/rotate, outline, mirror
into a crossed pair, and export a PNG.

It is a **dev/authoring tool**, not shipped content: it lives under `tools/dev/`, so the
public `npm run pack` excludes it and `npm run pack:dev` (the Forge QA build) includes it.

## Use

Open `emblem-builder.html` directly in a browser (desktop or mobile) — it is fully
self-contained (all art inlined), works offline, and needs no server. On mobile, long-press
the exported image to save it.

## Build

`emblem-builder.html` is generated from `emblem-builder.template.html` by inlining repo
icons:

```sh
node tools/dev/emblem-builder/build.mjs
```

`build.mjs` reads the asset keys the template references, resolves each against `icons/` and
`tokens/`, and embeds it as a `data:` URI. **Everything is sourced from art already in this
repo** — no external/CDN assets, nothing invented. If the template references an icon that
isn't in the repo, the build fails loudly rather than shipping a broken or non-repo asset.

## Add a head or weapon option

Point the template's `SKULLS` (head slot) or `WEAPONS` map at another repo icon basename and
rebuild:

- `W("boarding-axe")` → looks up `boarding-axe.png` anywhere under `icons/`/`tokens/`.
- `whiteSil("ghost.png")` / `centreSkull("skull-crossed-bones.png")` for explicit filenames.

The manifest is derived from the template, so there is nothing else to keep in sync.

## Notes on the pipeline

- Heads render through a "fill holes" pass (a span-filled black backing) so eyes/nose/mouth
  read solid black over whatever weapon sits behind — no see-through.
- The outline is a cached 28-pass stroke; bboxes and strokes are memoized and paints are
  coalesced to one per animation frame, so dragging stays cheap on phones.
- Saved combos persist to `localStorage` and can be exported/imported as text.
