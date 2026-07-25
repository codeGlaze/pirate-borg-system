import { findCompendiumItem } from "../api/compendium.js";
import { reconcileFeatureGrant } from "./feature-grants.js";

/**
 * Re-syncs the *mechanical* bits of features/classes that already live on existing
 * characters. A compendium edit never reaches items already embedded on an actor,
 * so every automation added this session (Active Effects, new data fields, action
 * macros) would only apply to freshly-created characters. This brings existing ones
 * up to date, idempotently.
 *
 * Only the whitelisted fields/effects below are touched — never anything the player
 * set (names, descriptions, unrelated items).
 *
 * @type {Array.<{pack: String, name: String, fields?: String[], syncEffects?: Boolean, reconcileGrant?: Boolean}>}
 */
const ENHANCED = [
  { pack: "pirateborg.class-buccaneer", name: "Buccaneer", syncEffects: true }, // reloadModifier AE
  { pack: "pirateborg.class-brute", name: "Thick Skinned", syncEffects: true }, // naturalArmorTier AE (else lost -d2)
  { pack: "pirateborg.class-buccaneer", name: "Treasure Hunter", fields: ["drTestReduction"] },
  { pack: "pirateborg.class-buccaneer", name: "Survivalist", fields: ["onGain", "actionMacro", "actionMacroLabel"], reconcileGrant: true },
  { pack: "pirateborg.class-buccaneer", name: "Buccan Cook", fields: ["actionMacro", "actionMacroLabel"] },
  { pack: "pirateborg.class-buccaneer", name: "Exquisite smoked meat", fields: ["actionMacro", "actionMacroLabel"] },
];

/**
 * The `system.<field>` updates needed to bring `embedded` in line with `compendium`
 * for the whitelisted fields. Empty when already current (idempotent).
 *
 * @returns {Object} update object (may be empty)
 */
export const computeSystemPatch = (embedded, compendium, fields = []) => {
  const patch = {};
  for (const field of fields) {
    const current = embedded.system?.[field];
    const next = compendium.system?.[field];
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      patch[`system.${field}`] = next;
    }
  }
  return patch;
};

/**
 * Compendium effects whose change keys aren't already present on the embedded item,
 * as ready-to-create transfer-effect data (source ids stripped).
 *
 * @returns {Object[]}
 */
export const missingEffects = (embedded, compendium) => {
  const haveKeys = new Set([...(embedded.effects ?? [])].flatMap((e) => (e.changes ?? []).map((c) => c.key)));
  return [...(compendium.effects ?? [])]
    .filter((ce) => (ce.changes ?? []).some((c) => !haveKeys.has(c.key)))
    .map((ce) => {
      const data = ce.toObject ? ce.toObject() : { ...ce };
      delete data._id;
      data.transfer = true;
      return data;
    });
};

/**
 * Applies the whitelisted re-sync to one embedded item and returns short labels for
 * what actually changed (empty when already current).
 *
 * @returns {Promise<String[]>}
 */
const migrateItem = async (item, entry) => {
  const changed = [];
  const compendium = await findCompendiumItem(entry.pack, entry.name);
  if (!compendium) {
    return changed;
  }
  const patch = computeSystemPatch(item, compendium, entry.fields);
  if (Object.keys(patch).length) {
    await item.update(patch, { pbMigration: true });
    changed.push(...Object.keys(patch).map((key) => key.replace("system.", "")));
  }
  if (entry.syncEffects) {
    const missing = missingEffects(item, compendium);
    if (missing.length) {
      await item.createEmbeddedDocuments("ActiveEffect", missing);
      changed.push("effect");
    }
  }
  if (entry.reconcileGrant) {
    await reconcileFeatureGrant(item, { silent: true });
    if ("system.onGain" in patch) {
      changed.push("grant applied");
    }
  }
  return changed;
};

/**
 * Runs the re-sync across world items and every actor's embedded items. GM-only and
 * idempotent, so it can run on every load and self-heals imported actors. Reports
 * once (a GM whisper) when it actually changed something.
 */
export const migrateFeatureMechanics = async () => {
  if (!game.user?.isGM) {
    return;
  }
  const report = [];
  const run = async (owner, items) => {
    for (const item of items ?? []) {
      const entry = ENHANCED.find((e) => e.name === item.name);
      if (!entry) {
        continue;
      }

      const changed = await migrateItem(item, entry);
      if (changed.length) {
        report.push({ owner, item: item.name, changed });
      }
    }
  };
  await run(game.i18n.localize("PB.MigrationWorldItems"), game.items);
  for (const actor of game.actors) {
    await run(actor.name, actor.items);
  }
  if (report.length) {
    await postMigrationReport(report);
  }
};

const postMigrationReport = async (report) => {
  const lines = report.map((r) => `<li><strong>${r.owner}</strong> — ${r.item}: ${r.changed.join(", ")}</li>`).join("");
  const content = `<div class="pirateborg"><h3>${game.i18n.localize("PB.MigrationReportTitle")}</h3><ul>${lines}</ul></div>`;
  const gmIds = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
  await ChatMessage.create({ content, whisper: gmIds });
  ui.notifications?.info?.(game.i18n.format("PB.MigrationReportSummary", { count: report.length }));
};
