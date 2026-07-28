import { findCompendiumItem } from "../api/compendium.js";
import { reconcileFeatureGrant } from "./feature-grants.js";
import { readEquipGate } from "./equip-gate.js";

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
  { pack: "pirateborg.class-tall-tale", name: "Sea Turtle", syncEffects: true }, // armorTierModifier AE (extra -d2)
  { pack: "pirateborg.class-buccaneer", name: "Treasure Hunter", fields: ["drTestReduction"] },
  { pack: "pirateborg.class-buccaneer", name: "Survivalist", fields: ["onGain", "actionMacro", "actionMacroLabel"], reconcileGrant: true },
  { pack: "pirateborg.class-buccaneer", name: "Buccan Cook", fields: ["actionMacro", "actionMacroLabel", "stockOnGain"] },
  {
    pack: "pirateborg.class-buccaneer",
    name: "Fix Bayonets!",
    fields: ["grantsItems", "maxQuantity", "actionMacro", "actionMacroLabel"],
    reconcileGrant: true,
  },
  { pack: "pirateborg.class-buccaneer", name: "Exquisite smoked meat", fields: ["actionMacro", "actionMacroLabel", "description"] },
  // Attack-DR features: sync the attackDr spec so existing characters gain the toggle.
  { pack: "pirateborg.class-buccaneer", name: "Crack Shot", fields: ["attackDr"] },
  { pack: "pirateborg.class-buccaneer", name: "Focused Aim", fields: ["attackDr"] },
  { pack: "pirateborg.class-swashbuckler", name: "Sword Master", fields: ["attackDr"] },
  { pack: "pirateborg.class-swashbuckler", name: "Scurvy Scallywag", fields: ["attackDr"] },
  { pack: "pirateborg.class-rapscallion", name: "Back Stabber", fields: ["attackDr"] },
  // Ostentatious Fencer: attack DR gate + swap the legacy inert effects for the
  // equip-gated defense effect.
  { pack: "pirateborg.class-swashbuckler", name: "Ostentatious Fencer", fields: ["attackDr"], replaceEffects: true },
  // Starting-gear grants (stockOnGain fires on gain, not migration — this just syncs the field).
  { pack: "pirateborg.class-swashbuckler", name: "Knife Knave", fields: ["stockOnGain"] },
  { pack: "pirateborg.class-rapscallion", name: "Burglar", fields: ["stockOnGain"] },
];

const FIX_BAYONET_FLAG = "fixBayonetWeapon";
const GRANTED_BY_FLAG = "grantedBy";

const normalizeName = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase();

const isLegacyPluralBayonetsName = (name) => normalizeName(name) === "bayonets";

const backfillLegacyBayonetMarkers = async (actor) => {
  const featureType = CONFIG.PB.itemTypes.feature;
  const weaponType = CONFIG.PB.itemTypes.weapon;
  const fixBayonetsFeature = actor.items.find((entry) => entry.type === featureType && entry.name === "Fix Bayonets!");
  if (!fixBayonetsFeature) {
    return 0;
  }

  const scope = CONFIG.PB.flagScope;
  const legacyBayonets = actor.items.filter((entry) => {
    if (entry.type !== weaponType) return false;
    if (entry.getFlag(scope, FIX_BAYONET_FLAG)) return false;
    const grantedBy = entry.getFlag(scope, GRANTED_BY_FLAG);
    const grantedByFixBayonets = grantedBy === fixBayonetsFeature.id;
    // Only backfill clear legacy/orphan grant copies, not every generic bayonet.
    return grantedByFixBayonets || Boolean(grantedBy) || isLegacyPluralBayonetsName(entry.name);
  });

  for (const bayonet of legacyBayonets) {
    await bayonet.setFlag(scope, FIX_BAYONET_FLAG, true);
  }
  return legacyBayonets.length;
};

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
  // Replace legacy effects wholesale (used when an effect's *shape* changed, not just
  // its keys — e.g. Ostentatious Fencer's inert transfer:false effects becoming a
  // single equip-gated transfer effect, which key-based syncEffects can't detect).
  // Idempotent: once the item carries the equip-gated effect, it's left alone.
  if (entry.replaceEffects) {
    // Sweep orphaned actor-level copies of this feature's effect (Source "None" —
    // no origin item), left behind by an earlier non-idempotent migration run.
    const actor = item.parent;
    const orphanIds = [...(actor?.effects ?? [])].filter((effect) => effect.name === item.name && !effect.origin).map((effect) => effect.id);
    if (orphanIds.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", orphanIds);
      changed.push("removed orphan effect");
    }

    const alreadyMigrated = [...item.effects].some((effect) => readEquipGate(effect));
    if (!alreadyMigrated) {
      const existingIds = item.effects.map((effect) => effect.id);
      if (existingIds.length) {
        await item.deleteEmbeddedDocuments("ActiveEffect", existingIds);
      }
      const replacement = [...(compendium.effects ?? [])].map((effect) => {
        const data = effect.toObject ? effect.toObject() : { ...effect };
        delete data._id;
        return data;
      });
      if (replacement.length) {
        await item.createEmbeddedDocuments("ActiveEffect", replacement);
      }
      changed.push("effects replaced");
    }
  }
  if (entry.reconcileGrant) {
    await reconcileFeatureGrant(item, { silent: true });
    if ("system.onGain" in patch || "system.grantsItems" in patch) {
      changed.push("grant applied");
    }
  }
  return changed;
};

// Match the default class-feature icon regardless of system id (pirateborg vs
// pirate-borg-beta), so this works in the beta build too.
const usesDefaultFeatureIcon = (img) => String(img ?? "").endsWith("icons/misc/class-feature.png");

/**
 * Builds a name → improved-icon map from the class compendia (features whose shipped
 * icon is no longer the default). Cached for the run.
 */
let featureIconMapCache = null;
const featureIconMap = async () => {
  if (featureIconMapCache) {
    return featureIconMapCache;
  }
  featureIconMapCache = new Map();
  for (const pack of game.packs) {
    if (pack.metadata?.type !== "Item" || !pack.metadata?.name?.startsWith("class-")) {
      continue;
    }
    for (const doc of await pack.getDocuments()) {
      if (doc.type === CONFIG.PB.itemTypes.feature && doc.img && !usesDefaultFeatureIcon(doc.img)) {
        featureIconMapCache.set(doc.name, doc.img);
      }
    }
  }
  return featureIconMapCache;
};

/**
 * Adopts the improved feature icon for embedded copies still on the default icon.
 * @returns {Promise<Number>} how many were updated
 */
const migrateFeatureIcons = async (items) => {
  const map = await featureIconMap();
  let updated = 0;
  for (const item of items ?? []) {
    if (item.type === CONFIG.PB.itemTypes.feature && usesDefaultFeatureIcon(item.img) && map.has(item.name)) {
      await item.update({ img: map.get(item.name) }, { pbMigration: true });
      updated += 1;
    }
  }
  return updated;
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
  const hasGrant = (item) => {
    const spec = item?.system?.onGain;
    const grantsItems = item?.system?.grantsItems ?? [];
    return (spec && (Object.keys(spec.abilities ?? {}).length > 0 || !!spec.maxHp)) || (Array.isArray(grantsItems) && grantsItems.length > 0);
  };
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
  const worldOwner = game.i18n.localize("PB.MigrationWorldItems");
  await run(worldOwner, game.items);
  const worldIcons = await migrateFeatureIcons(game.items);
  if (worldIcons) {
    report.push({ owner: worldOwner, item: `${worldIcons} feature icon(s)`, changed: ["icon"] });
  }
  for (const actor of game.actors) {
    for (const merge of await mergeDuplicateFeatures(actor)) {
      report.push({ owner: actor.name, item: merge.name, changed: [`merged ${merge.from} copies → quantity ${merge.to}`] });
    }

    await run(actor.name, actor.items);
    const actorIcons = await migrateFeatureIcons(actor.items);
    if (actorIcons) {
      report.push({ owner: actor.name, item: `${actorIcons} feature icon(s)`, changed: ["icon"] });
    }
    for (const feature of actor.items.filter((entry) => entry.type === CONFIG.PB.itemTypes.feature && hasGrant(entry))) {
      await reconcileFeatureGrant(feature, { silent: true });
    }
    const backfilled = await backfillLegacyBayonetMarkers(actor);
    if (backfilled) {
      report.push({ owner: actor.name, item: "Fix Bayonets!", changed: [`updated ${backfilled} legacy bayonet marker(s)`] });
    }
  }
  if (report.length) {
    await postMigrationReport(report);
  }
};

/**
 * Folds same-name duplicate features (an artifact of the old drag-drop bug) into a
 * single stacked item, capped at maxQuantity, and reconciles any grant. Reversal is
 * safe: the deleted copies' transfer effects revert on deletion, and the kept item's
 * grant re-rolls only the shortfall for the merged quantity.
 *
 * @param {PBActor} actor
 * @returns {Promise<Array.<{name: String, from: Number, to: Number}>>}
 */
export const mergeDuplicateFeatures = async (actor) => {
  const byName = new Map();
  for (const item of actor.items) {
    if (item.type !== CONFIG.PB.itemTypes.feature) {
      continue;
    }
    (byName.get(item.name) ?? byName.set(item.name, []).get(item.name)).push(item);
  }
  const merged = [];
  for (const [name, group] of byName) {
    if (group.length < 2) {
      continue;
    }
    const keep = group[0];
    const total = group.reduce((sum, i) => sum + (i.quantity || 1), 0);
    const capped = keep.maxQuantity === 0 ? total : Math.min(total, keep.maxQuantity);
    await keep.update({ "system.quantity": capped }, { pbMigration: true });
    await actor.deleteEmbeddedDocuments(
      "Item",
      group.slice(1).map((i) => i.id),
    );
    await reconcileFeatureGrant(keep, { silent: true });
    merged.push({ name, from: group.length, to: capped });
  }
  return merged;
};

const postMigrationReport = async (report) => {
  const lines = report.map((r) => `<li><strong>${r.owner}</strong> — ${r.item}: ${r.changed.join(", ")}</li>`).join("");
  const content = `<div class="pirateborg"><h3>${game.i18n.localize("PB.MigrationReportTitle")}</h3><ul>${lines}</ul></div>`;
  const gmIds = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
  await ChatMessage.create({ content, whisper: gmIds });
  ui.notifications?.info?.(game.i18n.format("PB.MigrationReportSummary", { count: report.length }));
};
