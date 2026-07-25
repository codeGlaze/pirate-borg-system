import { evaluateFormula } from "../api/utils.js";
import { showGenericCard } from "../chat-message/generic-card.js";

/**
 * "Apply on gain" numeric grants for features (e.g. the Buccaneer's Survivalist:
 * +1 Toughness and +d4 max HP per time taken). The grant is declared on the
 * feature as `system.onGain`:
 *
 *   { "abilities": { "toughness": 1 }, "maxHp": "1d4" }
 *
 * Reversal is handled by a single transfer Active Effect on the feature item —
 * deleting the feature removes the effect and reverts the actor automatically. The
 * random part (maxHp) is rolled once per application and the individual rolls are
 * kept in an item flag, so the effect can be reconciled exactly when the feature's
 * quantity changes (take it twice → two rolls; drop back to one → the newest roll
 * is removed, not a re-rolled guess).
 */

const ADD = 2; // CONST.ACTIVE_EFFECT_MODES.ADD
const ROLLS_FLAG = "onGainHpRolls";
const GRANT_EFFECT_FLAG = "featureGrant";

/**
 * Brings the per-application HP rolls in line with how many times the feature is
 * now held: truncates extras when the count drops, rolls the shortfall when it
 * rises. Pure — the roller is injected so it's testable.
 *
 * @param {Number[]} existingRolls
 * @param {Number} targetCount
 * @param {function(): Number} rollOne
 * @returns {Number[]}
 */
export const reconcileRolls = (existingRolls, targetCount, rollOne) => {
  const rolls = existingRolls.slice(0, Math.max(0, targetCount));
  while (rolls.length < targetCount) {
    rolls.push(rollOne());
  }
  return rolls;
};

/**
 * The Active Effect changes a grant produces: fixed abilities scale with how many
 * times the feature is held; maxHp is the sum of the per-application rolls.
 *
 * @param {Object} spec `system.onGain`
 * @param {Number[]} rolls per-application maxHp rolls
 * @param {Number} quantity times the feature is held
 * @returns {Array.<{key: String, mode: Number, value: String, priority: Number}>}
 */
export const buildGrantChanges = (spec, rolls, quantity) => {
  const changes = [];
  for (const [ability, per] of Object.entries(spec?.abilities ?? {})) {
    changes.push({ key: `system.abilities.${ability}.value`, mode: ADD, value: String(Number(per) * quantity), priority: 20 });
  }
  if (spec?.maxHp) {
    changes.push({ key: "system.attributes.hp.max", mode: ADD, value: String(rolls.reduce((sum, r) => sum + Number(r), 0)), priority: 20 });
  }
  return changes;
};

const hasGrant = (item) => {
  const spec = item?.system?.onGain;
  return !!spec && (Object.keys(spec.abilities ?? {}).length > 0 || !!spec.maxHp);
};

// Reconcile writes the item's flag + AE, which re-fire the update hook. Track
// in-flight items so those nested calls bail instead of racing (e.g. creating a
// second effect before the first write lands).
const reconciling = new Set();

const sameChanges = (a = [], b = []) =>
  a.length === b.length && a.every((c, i) => c.key === b[i]?.key && String(c.value) === String(b[i]?.value) && c.mode === b[i]?.mode);

/**
 * Syncs a feature's grant effect to its current quantity: rolls any new maxHp,
 * drops removed ones, and creates/updates/leaves the single transfer AE. No-ops
 * when already in sync, so it's safe to call on every create/update.
 *
 * @param {PBItem} item
 */
export const reconcileFeatureGrant = async (item, { silent = false } = {}) => {
  if (!hasGrant(item) || !item.parent || reconciling.has(item.id)) {
    return;
  }
  reconciling.add(item.id);
  try {
    await reconcileGrantInner(item, silent);
  } finally {
    reconciling.delete(item.id);
  }
};

const reconcileGrantInner = async (item, silent) => {
  const spec = item.system.onGain;
  const scope = CONFIG.PB.flagScope;
  const quantity = Math.max(1, item.system.quantity || 1);
  const existingRolls = item.getFlag(scope, ROLLS_FLAG) ?? [];

  const rolls = existingRolls.slice(0, quantity);
  if (spec.maxHp) {
    while (rolls.length < quantity) {
      rolls.push((await evaluateFormula(spec.maxHp, item.parent.getRollData?.() ?? {})).total);
    }
  }

  const changes = buildGrantChanges(spec, rolls, quantity);
  const effect = item.effects.find((e) => e.getFlag(scope, GRANT_EFFECT_FLAG));
  const rollsInSync = rolls.length === existingRolls.length && rolls.every((r, i) => r === existingRolls[i]);
  if (effect && rollsInSync && sameChanges(effect.changes, changes)) {
    return;
  }

  if (!rollsInSync) {
    await item.setFlag(scope, ROLLS_FLAG, rolls);
  }
  if (effect) {
    await item.updateEmbeddedDocuments("ActiveEffect", [{ _id: effect.id, changes }]);
  } else {
    await item.createEmbeddedDocuments("ActiveEffect", [
      {
        name: item.name,
        img: item.img,
        changes,
        transfer: true,
        flags: { [scope]: { [GRANT_EFFECT_FLAG]: true } },
      },
    ]);
  }

  if (!silent) {
    await postGrantFeedback(item, spec, existingRolls, rolls, quantity, !effect);
  }
};

/**
 * Posts a chat card describing what *this* application of the grant added, so the
 * player gets feedback (the original complaint: "no feedback"). Only fires when the
 * grant actually grew.
 */
const postGrantFeedback = async (item, spec, prevRolls, rolls, quantity, created) => {
  const appliedDelta = spec.maxHp ? rolls.length - prevRolls.length : created ? quantity : 0;
  if (appliedDelta <= 0) {
    return;
  }
  const parts = [];
  for (const [ability, per] of Object.entries(spec.abilities ?? {})) {
    const amount = Number(per) * appliedDelta;
    if (amount) {
      parts.push(`+${amount} ${game.i18n.localize(CONFIG.PB.abilityKey[ability])}`);
    }
  }
  const addedHp = rolls.slice(prevRolls.length).reduce((sum, r) => sum + Number(r), 0);
  if (addedHp) {
    parts.push(`+${addedHp} ${game.i18n.localize("PB.GrantMaxHp")}`);
  }
  if (parts.length) {
    await showGenericCard({ actor: item.parent, title: item.name, description: parts.join(", ") });
  }
};

/**
 * Registers the feature hooks:
 *  - `preCreateItem` stacks a same-name feature into the existing one's `quantity`
 *    (up to `maxQuantity`) instead of creating a duplicate, from any path (drag &
 *    drop, generator, macros).
 *  - `createItem`/`updateItem` keep any `onGain` grant reconciled to the current
 *    quantity. Reconcile runs only on the client that made the change, so the
 *    random rolls happen once.
 */
export const registerFeatureGrantHooks = () => {
  Hooks.on("preCreateItem", (item) => {
    const actor = item.parent;
    if (!actor || item.type !== CONFIG.PB.itemTypes.feature) {
      return true;
    }
    const existing = actor.items.find((i) => i.type === CONFIG.PB.itemTypes.feature && i.name === item.name);
    if (!existing) {
      return true;
    }
    const max = existing.maxQuantity;
    const current = existing.quantity || 1;
    if (max === 0 || current < max) {
      existing.updateData("quantity", current + 1);
    } else {
      ui.notifications?.warn?.(game.i18n.format("PB.FeatureAtMaxQuantity", { name: existing.name, max }));
    }
    return false; // cancel the duplicate — the existing feature absorbed it
  });

  const onChange = (item, _change, options, userId) => {
    if (game.user?.id !== userId || options?.pbMigration) {
      return; // migration reconciles explicitly (and silently)
    }
    if (item?.type !== CONFIG.PB.itemTypes.feature || !item.parent || !hasGrant(item)) {
      return;
    }
    reconcileFeatureGrant(item);
  };
  Hooks.on("createItem", (item, options, userId) => onChange(item, null, options, userId));
  Hooks.on("updateItem", (item, change, options, userId) => onChange(item, change, options, userId));
};
