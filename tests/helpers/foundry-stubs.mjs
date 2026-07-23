// Minimal Foundry VTT stubs so the system's pure logic modules (table
// resolution, character assembly helpers, ...) can be imported and exercised
// under plain Node — no Foundry, no browser, no world.
//
// The stubs are deliberately small: they implement only what the code touches
// at call time, and they build "compendium" documents straight from the real
// packs/_source/*.json so tests run against the shipped data, not fixtures.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/**
 * Builds one fake document from a pack _source JSON entry. Documents expose just
 * enough surface (name/type/results/system + getData/toObject/clone/roll) for
 * the compendium + generator code to run.
 */
const makeDoc = (json) => {
  const results = (json.results || []).map((r) => ({
    range: r.range,
    type: r.type, // "text" | "pack" | "document"
    text: r.text,
    documentCollection: r.documentCollection || r.collection || "",
  }));
  return {
    name: json.name,
    type: json.type,
    results,
    system: json.system ? { ...json.system } : {},
    getData() {
      return this.system;
    },
    toObject() {
      return { name: this.name, type: this.type, system: { ...this.system } };
    },
    clone() {
      return makeDoc(json);
    },
    // Force-roll: pick the row(s) matching the constant roll total. Leaf rows
    // (items) are returned as-is; nested sub-tables are handled by the code under
    // test walking a path, so a non-recursive match is sufficient here.
    async roll({ roll }) {
      const value = roll.total;
      const matched = results.filter((res) => {
        const [low = 0, high = low] = res.range || [];
        return value >= low && value <= high;
      });
      return { results: matched };
    },
  };
};

const packDocsCache = new Map();
const folderForPack = (id) => path.join(REPO_ROOT, "packs", "_source", id.replace(/^[^.]+\./, ""));

const loadDocsForPack = (id) => {
  if (packDocsCache.has(id)) {
    return packDocsCache.get(id);
  }
  const folder = folderForPack(id);
  const docs = [];
  if (fs.existsSync(folder)) {
    for (const file of fs.readdirSync(folder)) {
      if (file.endsWith(".json")) {
        docs.push(makeDoc(JSON.parse(fs.readFileSync(path.join(folder, file), "utf-8"))));
      }
    }
  }
  packDocsCache.set(id, docs);
  return docs;
};

/**
 * Installs the global stubs. Call once before importing any system module.
 */
export const installFoundryStubs = () => {
  class Stub {}
  for (const name of [
    "FormApplication",
    "Application",
    "Dialog",
    "DocumentSheet",
    "ActorSheet",
    "ItemSheet",
    "Actor",
    "Item",
    "Combat",
    "Combatant",
    "TokenDocument",
  ]) {
    globalThis[name] = class extends Stub {};
  }
  globalThis.Hooks = { on() {}, once() {}, call() {}, callAll() {} };
  globalThis.CONFIG = { PB: {} };
  globalThis.CONST = { TABLE_RESULT_TYPES: { TEXT: "text", DOCUMENT: "document", COMPENDIUM: "pack" } };
  globalThis.Roll = class {
    constructor(formula) {
      this.total = Number(formula);
    }
  };
  globalThis.TextEditor = { enrichHTML: (v) => v };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: globalThis.TextEditor } } } };
  // jQuery-lite: only .text() (strip tags) is used by the quantity override.
  globalThis.$ = (html) => ({ text: () => String(html).replace(/<[^>]*>/g, "") });
  globalThis.game = {
    release: { generation: 12 },
    packs: {
      get(id) {
        // Any ".rolls-*" pack holds RollTables; everything else holds Items.
        return {
          documentName: id.includes("rolls-") ? "RollTable" : "Item",
          getDocuments: async () => loadDocsForPack(id),
        };
      },
    },
  };
};
