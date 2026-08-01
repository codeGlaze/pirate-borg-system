#!/usr/bin/env node
// Build the standalone Class Emblem Builder by inlining the repo's own icon art into the
// template. Every asset the template asks for is resolved against icons/ + tokens/ and
// embedded as a data: URI, so the produced HTML is fully self-contained AND made entirely
// from art already in this repo (no external/CDN assets, nothing invented).
//
//   node tools/dev/emblem-builder/build.mjs
//
// Writes emblem-builder.html next to the template. Add a new head/weapon option by pointing
// the template's SKULLS/WEAPONS map at another repo icon and re-running this — the manifest
// is derived from the template, so there is nothing else to keep in sync.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const templatePath = join(here, "emblem-builder.template.html");
const outPath = join(here, "emblem-builder.html");

// Recursively index every icon basename (e.g. "rapier.png") under the given roots. First
// match wins; the template's keys are unique basenames so this is unambiguous in practice.
function indexIcons(roots) {
  const map = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(png|svg)$/i.test(name) && !map.has(name)) map.set(name, full);
    }
  };
  for (const r of roots) walk(join(repoRoot, r));
  return map;
}

// Pull the exact asset keys the template will look up at runtime: whiteSil("x.png"),
// centreSkull("x.png"), the W("x") helper (which appends ".png"), and any raw A["x"].
function referencedKeys(tpl) {
  const keys = new Set();
  for (const m of tpl.matchAll(/(?:whiteSil|centreSkull)\("([^"]+)"\)/g)) keys.add(m[1]);
  for (const m of tpl.matchAll(/\bW\("([^"]+)"\)/g)) keys.add(m[1] + ".png");
  for (const m of tpl.matchAll(/\bA\["([^"]+)"\]/g)) keys.add(m[1]);
  return [...keys];
}

const mime = (f) => (extname(f).toLowerCase() === ".svg" ? "image/svg+xml" : "image/png");
const dataUri = (f) => `data:${mime(f)};base64,${readFileSync(f).toString("base64")}`;

const tpl = readFileSync(templatePath, "utf8");
if (!tpl.includes("__ASSETS_JSON__")) throw new Error("template is missing the __ASSETS_JSON__ marker");

const icons = indexIcons(["icons", "tokens"]);
const assets = {};
const missing = [];
for (const key of referencedKeys(tpl)) {
  const file = icons.get(key);
  if (file) assets[key] = dataUri(file);
  else missing.push(key);
}
if (missing.length) {
  // Fail loudly: a dropdown option pointing at art that isn't in the repo would either 404
  // at runtime or (worse) smuggle in a non-repo asset. Fix the template or add the icon.
  throw new Error("assets not found under icons/ or tokens/: " + missing.join(", "));
}

const html = tpl.replace("__ASSETS_JSON__", () => JSON.stringify(assets));
writeFileSync(outPath, html);
console.log(`emblem-builder.html built — ${Object.keys(assets).length} repo assets, ${(html.length / 1024).toFixed(0)} KB`);
