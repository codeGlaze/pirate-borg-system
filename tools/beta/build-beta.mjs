#!/usr/bin/env node
/**
 * Builds a side-by-side "PIRATE BORG (Beta)" system from this repo.
 *
 * It re-ids everything that Foundry ties to the system id — the install folder,
 * the `id`, the compendium package prefix (`pirateborg.<pack>` baked into pack
 * data), the settings namespace, flag scope, and socket channel — to
 * `pirateborg-beta`, while deliberately keeping the runtime `game.pirateborg`
 * API namespace and the `.pirateborg` CSS hooks. It then repacks the compendiums
 * from the rewritten source and zips the result for import.
 *
 * Usage:  node tools/beta/build-beta.mjs [version]
 * Output: dist/pirateborg-beta-b<build>-<sha>.zip
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BETA_ID = "pirateborg-beta";

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT }).toString().trim();
  } catch {
    return "";
  }
};

const BASE_VERSION = process.argv[2] || "v1.8.0-beta";
const BUILD_NUM = git("rev-list", "--count", "HEAD") || "0";
const SHORT_SHA = git("rev-parse", "--short", "HEAD") || "nogit";
const DIRTY = git("status", "--porcelain", "--untracked-files=no") ? "-dirty" : "";
const VERSION = `${BASE_VERSION}.${BUILD_NUM}`;
const BETA_TITLE = `PIRATE BORG (Beta b${BUILD_NUM} - ${SHORT_SHA}${DIRTY})`;
const DIST = path.join(ROOT, "dist");
const STAGE_ROOT = path.join(DIST, "stage");
const STAGE = path.join(STAGE_ROOT, "systems", BETA_ID);

const SHIP = [
  "system.json",
  "template.json",
  "CHANGELOG.md",
  "LICENSE.MB3PL",
  "LICENSE.MIT",
  "how-to-use-this-system.md",
  "README.md",
  "css",
  "fonts",
  "icons",
  "lang",
  "module",
  "templates",
  "tokens",
  "ui",
];
const TEXT_EXT = new Set([".js", ".json", ".html", ".hbs", ".css", ".md"]);

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });

function transform(text, ext) {
  text = text.replaceAll('"system.pirateborg"', `"system.${BETA_ID}"`);
  text = text.replaceAll("systems/pirateborg/", `systems/${BETA_ID}/`);

  for (const call of [
    'settings.register("pirateborg"',
    'settings.registerMenu("pirateborg"',
    'settings.get("pirateborg"',
    'settings.set("pirateborg"',
    'registerSystem("pirateborg"',
  ]) {
    text = text.replaceAll(call, call.replace('"pirateborg"', `"${BETA_ID}"`));
  }

  text = text.replaceAll('PB.flagScope = "pirateborg"', `PB.flagScope = "${BETA_ID}"`);
  text = text.replaceAll('=== "pirateborg"', `=== "${BETA_ID}"`);

  if (ext !== ".css") {
    text = text.replace(/(?<!game\.)(?<!\/)pirateborg\./g, `${BETA_ID}.`);
  }
  return text;
}

function walk(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

const zipDirectory = async (sourceDir, outputZip) =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, "systems");
    archive.finalize();
  });

async function main() {
  rmrf(STAGE_ROOT);
  fs.mkdirSync(STAGE, { recursive: true });
  for (const item of SHIP) {
    fs.cpSync(path.join(ROOT, item), path.join(STAGE, item), { recursive: true });
  }
  fs.cpSync(path.join(ROOT, "packs", "_source"), path.join(STAGE, "packs", "_source"), { recursive: true });

  const sysJsonPath = path.join(STAGE, "system.json");
  walk(STAGE, (p) => {
    if (p === sysJsonPath || !TEXT_EXT.has(path.extname(p))) return;
    const before = fs.readFileSync(p, "utf8");
    const after = transform(before, path.extname(p));
    if (after !== before) fs.writeFileSync(p, after);
  });

  const sj = JSON.parse(fs.readFileSync(sysJsonPath, "utf8"));
  sj.id = BETA_ID;
  sj.title = BETA_TITLE;
  sj.version = VERSION;
  for (const pack of sj.packs || []) {
    if (pack.system === "pirateborg") pack.system = BETA_ID;
  }
  delete sj.manifest;
  delete sj.download;
  fs.writeFileSync(sysJsonPath, `${JSON.stringify(sj, null, 2)}\n`);

  const srcRoot = path.join(STAGE, "packs", "_source");
  const packDirs = fs.readdirSync(srcRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of packDirs) {
    await compilePack(path.join(srcRoot, d.name), path.join(STAGE, "packs", d.name), { recursive: true, log: false });
  }
  rmrf(srcRoot);

  fs.mkdirSync(DIST, { recursive: true });
  for (const f of fs.readdirSync(DIST)) {
    if (f.startsWith(`${BETA_ID}-`) && f.endsWith(".zip")) rmrf(path.join(DIST, f));
  }

  const zipPath = path.join(DIST, `${BETA_ID}-b${BUILD_NUM}-${SHORT_SHA}${DIRTY ? "-dirty" : ""}.zip`);
  await zipDirectory(path.join(STAGE_ROOT, "systems"), zipPath);

  console.log(`Built ${path.relative(ROOT, zipPath)}`);
  console.log(`  title:   ${BETA_TITLE}`);
  console.log(`  version: ${VERSION}`);
  console.log(`  packs:   ${packDirs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
