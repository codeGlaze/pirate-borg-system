#!/usr/bin/env node
/**
 * Static content-integrity validator for a built PIRATE BORG system.
 *
 * Catches the class of breakage that lint/tests/build-structure checks miss and that only
 * surfaces once Foundry loads the content: missing asset files, dangling references
 * (macros / items / tables / compendium links), and malformed documents. It cannot do strict
 * Foundry DataModel validation (that needs the app) — the goal is to shrink the pile of stuff
 * that reaches Foundry unchecked, not to replace running it.
 *
 * Runs against any system root (a folder containing system.json + packs/…). Works on both the
 * main tree and a betaified beta build, so it also verifies betaify rewrote asset paths and
 * `<id>.<pack>` references to the beta id correctly (a wrong rescope shows up as a dangling ref).
 *
 *   node tools/validate-content.mjs [--root <dir>]     # default: repo root
 *
 * Exit code 0 = clean, 1 = problems found (prints every one).
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

const ROOT = (() => {
  const i = process.argv.indexOf("--root");
  return i >= 0 ? process.argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), "..");
})();

const sys = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
const SYSTEM_ID = sys.id;
// Item/Actor subtypes from template.json, plus the core embedded-doc types that show up in
// packs (Macros are script/chat; RollTables/JournalEntries carry no meaningful subtype).
const TYPES = new Set([...Object.keys(sys.documentTypes?.Item ?? {}), ...loadTemplateTypes(), "script", "chat", "base"]);

// String fields that hold `pack;name` references (one per line). grants/stock/relic refs live
// under a `ref` key and are picked up separately.
const REF_FIELDS = new Set([
  "actionMacro",
  "startingMacro",
  "characterGeneratorMacro",
  "startingItems",
  "startingRolls",
  "startingBonusItems",
  "startingBonusRolls",
]);

const problems = [];
const flag = (pack, doc, msg) => problems.push(`[${pack}] "${doc}": ${msg}`);

function loadTemplateTypes() {
  try {
    const t = JSON.parse(readFileSync(join(ROOT, "template.json"), "utf8"));
    return [...(t.Item?.types ?? []), ...(t.Actor?.types ?? [])];
  } catch {
    return [];
  }
}

/** Extract every declared pack to JSON and return { packName -> [docs] }. */
async function loadAllDocs() {
  const work = mkdtempSync(join(tmpdir(), "pb-validate-"));
  const byPack = {};
  for (const p of sys.packs ?? []) {
    const name = p.path.replace(/\/+$/, "").split("/").pop();
    const src = join(ROOT, "packs", name);
    if (!existsSync(src)) {
      problems.push(`[${name}] declared pack directory is missing from the build`);
      continue;
    }
    // Copy to temp before extracting: opening a LevelDB rewrites its log/manifest, and a
    // validator must never mutate the tree it's checking (especially in CI).
    const copy = join(work, "_read", name);
    cpSync(src, copy, { recursive: true });
    const dst = join(work, name);
    try {
      await extractPack(copy, dst, { log: false });
    } catch (e) {
      problems.push(`[${name}] pack could not be read (corrupt LevelDB): ${e.message.split("\n")[0]}`);
      continue;
    }
    const docs = [];
    if (existsSync(dst)) {
      for (const f of readdirSync(dst)) {
        if (f.endsWith(".json")) {
          try {
            docs.push(JSON.parse(readFileSync(join(dst, f), "utf8")));
          } catch (e) {
            problems.push(`[${name}] document ${f} is not valid JSON: ${e.message}`);
          }
        }
      }
    }
    byPack[name] = docs;
  }
  rmSync(work, { recursive: true, force: true });
  return byPack;
}

/**
 * Resolve a `pack;name` (or `<id>.<pack>;name;qty`) ref against the loaded index. Only refs into
 * THIS system are validated — refs to other packages (e.g. `pirate-borg-premium.…`) are external
 * content we can't and shouldn't check here.
 */
function refTargetMissing(index, ref) {
  const [packRef, name] = String(ref).split(";");
  if (!packRef || !name) return null; // not a resolvable ref shape; ignore
  let packName = packRef;
  if (packRef.includes(".")) {
    const pkg = packRef.slice(0, packRef.indexOf("."));
    if (pkg !== SYSTEM_ID) return null; // external package — out of scope
    packName = packRef.slice(packRef.indexOf(".") + 1);
  }
  const names = index[packName];
  if (!names) return `references pack "${packRef}" which is not a pack in this system`;
  if (!names.has(name.trim())) return `references "${name.trim()}" in pack "${packName}" — no such document`;
  return null;
}

/** Recursively collect asset paths and refs from a document. */
function scanDoc(node, assets, refs) {
  if (Array.isArray(node)) {
    for (const v of node) scanDoc(v, assets, refs);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "img" || k === "src") && typeof v === "string" && v) assets.push(v);
      else if (k === "ref" && typeof v === "string" && v) refs.push(v);
      else if (REF_FIELDS.has(k) && typeof v === "string" && v) {
        for (const line of v.split("\n")) if (line.trim()) refs.push(line.trim());
      } else scanDoc(v, assets, refs);
    }
  }
}

const CORE_ASSET = /^icons\//; // Foundry core art (icons/svg/…, icons/commodities/…) — not shipped by the system
function assetMissing(path) {
  if (CORE_ASSET.test(path)) return null; // provided by Foundry
  const m = path.match(/^systems\/([^/]+)\/(.+)$/);
  if (!m) return `unknown asset path "${path}" (not systems/… or icons/… core)`;
  if (m[1] !== SYSTEM_ID) return `asset "${path}" points at system "${m[1]}", expected "${SYSTEM_ID}" (betaify miss?)`;
  return existsSync(join(ROOT, m[2])) ? null : `missing asset file: ${path}`;
}

// UUID compendium links in prose: @UUID[Compendium.<id>.<pack>.…] — verify the pack exists.
const UUID_RE = /Compendium\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\./g;

async function main() {
  const byPack = await loadAllDocs();
  const index = {};
  for (const [pack, docs] of Object.entries(byPack)) index[pack] = new Set(docs.map((d) => d.name));

  for (const [pack, docs] of Object.entries(byPack)) {
    for (const doc of docs) {
      const label = doc.name ?? doc._id ?? "(unnamed)";
      // structure / metadata
      if (!doc.name) flag(pack, label, "document has no name");
      if (doc.type && TYPES.size && !TYPES.has(doc.type)) flag(pack, label, `unknown document type "${doc.type}"`);

      const assets = [];
      const refs = [];
      scanDoc(doc, assets, refs);

      for (const a of assets) {
        const m = assetMissing(a);
        if (m) flag(pack, label, m);
      }
      for (const r of refs) {
        const m = refTargetMissing(index, r);
        if (m) flag(pack, label, m);
      }
      // @UUID compendium links in prose. Only validate links into THIS system's packs;
      // links to other packages (premium/world/core) are external and out of scope.
      for (const field of [doc.system?.description, doc.system?.details, doc.description]) {
        if (typeof field !== "string") continue;
        for (const [, pkg, packName] of field.matchAll(UUID_RE)) {
          if (pkg !== SYSTEM_ID) continue;
          if (!(packName in byPack)) flag(pack, label, `@UUID link references pack "${packName}" not in this system`);
        }
      }
    }
  }

  const totalDocs = Object.values(byPack).reduce((n, d) => n + d.length, 0);
  if (problems.length) {
    console.error(`Content validation FAILED — ${problems.length} problem(s) across ${totalDocs} docs:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`Content OK — ${totalDocs} documents across ${Object.keys(byPack).length} packs: assets resolve, references resolve, types known.`);
  void compilePack; // (imported for parity with build tooling; extract-only here)
}

main().catch((e) => {
  console.error("validator crashed:", e);
  process.exit(1);
});
