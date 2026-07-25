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

const migrateItem = async (item, entry) => {
  const compendium = await findCompendiumItem(entry.pack, entry.name);
  if (!compendium) {
    return;
  }
  const patch = computeSystemPatch(item, compendium, entry.fields);
  if (Object.keys(patch).length) {
    await item.update(patch, { pbMigration: true });
  }
  if (entry.syncEffects) {
    const missing = missingEffects(item, compendium);
    if (missing.length) {
      await item.createEmbeddedDocuments("ActiveEffect", missing);
    }
  }
  if (entry.reconcileGrant) {
    await reconcileFeatureGrant(item, { silent: true });
  }
};

const migrateItems = async (items) => {
  for (const item of items ?? []) {
    const entry = ENHANCED.find((e) => e.name === item.name);
    if (entry) {
      await migrateItem(item, entry);
    }
  }
};

/**
 * Runs the re-sync across world items and every actor's embedded items. GM-only and
 * idempotent, so it can run on every load and self-heals imported actors.
 */
export const migrateFeatureMechanics = async () => {
  if (!game.user?.isGM) {
    return;
  }
  await migrateItems(game.items);
  for (const actor of game.actors) {
    await migrateItems(actor.items);
  }
};
