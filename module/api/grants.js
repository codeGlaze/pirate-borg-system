import { findCompendiumItem } from "./compendium.js";
import { rollOutcome } from "./outcome/outcome.js";
import { showGenericCard } from "../chat-message/generic-card.js";

/**
 * Shared "grant an item" / "roll to a chat card" primitives.
 *
 * These consolidate logic that used to be copy-pasted across the buccaneer macros
 * (Cook rations, Stock rations, Eat exquisite meat, Ready bayonet): find a
 * compendium item, embed a copy on the actor, optionally stack it onto an existing
 * copy, equip it, or stamp it as granted-by another item; and roll a formula then
 * post a generic card describing the result.
 *
 * Exposed as `game.pirateborg.api.grants` so macros and other modules can call a
 * single supported entry point instead of re-implementing the compendium dance.
 */

const GRANTED_BY_FLAG = "grantedBy";

/**
 * Grant a compendium item to an actor.
 *
 * @param {PBActor} actor
 * @param {String} ref  Compendium reference in the `"pirateborg.pack-name;Item Name"`
 *                       form used by feature `grantsItems` specs.
 * @param {Object} [options]
 * @param {Boolean} [options.equip=false]   Equip the item after granting it.
 * @param {Number}  [options.quantity=null] Quantity to grant. When null, the compendium
 *                                          item's own default quantity is kept; when a
 *                                          number is given it is set exactly (including 1).
 * @param {Boolean} [options.stack=false]   When a same-name item already exists on the
 *                                          actor, add to its `system.quantity` instead
 *                                          of creating a duplicate (for consumables
 *                                          like rations). When false, always creates a
 *                                          fresh embedded copy.
 * @param {String}  [options.grantedBy]     Item id to stamp on `flags.<scope>.grantedBy`
 *                                          so deleting that item auto-reverts this grant
 *                                          (see feature-grants.js `deleteItem` hook).
 * @param {String}  [options.die]           Override `system.damageDie` (scaled weapons).
 * @returns {Promise<PBItem|null>} The created or updated item, or null if the actor /
 *                                 ref was invalid or the compendium item was not found.
 */
export const grantItem = async (actor, ref, { equip = false, quantity = null, stack = false, grantedBy = null, die = null } = {}) => {
  const [pack, name] = String(ref ?? "").split(";");
  if (!actor || !pack || !name) {
    return null;
  }

  // Stacking path: bump an existing consumable's quantity rather than duplicating it.
  if (stack) {
    const existing = actor.items.find((i) => i.name === name);
    if (existing) {
      await existing.update({ "system.quantity": (existing.system.quantity || 0) + (quantity ?? 1) });
      return existing;
    }
  }

  const compendiumItem = await findCompendiumItem(pack, name);
  if (!compendiumItem) {
    ui.notifications?.warn?.(game.i18n?.format?.("PB.CompendiumItemNotFound", { item: name }) ?? `Could not find "${name}" in the compendium.`);
    return null;
  }

  const data = compendiumItem.toObject(false);
  data.system = data.system ?? {};
  if (quantity !== null && "quantity" in data.system) {
    data.system.quantity = quantity;
  }
  if (equip) {
    data.system.equipped = true;
  }
  if (die) {
    data.system.damageDie = die;
  }
  if (grantedBy) {
    foundry.utils.setProperty(data, `flags.${CONFIG.PB.flagScope}.${GRANTED_BY_FLAG}`, grantedBy);
  }

  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created ?? null;
};

/**
 * Roll a formula and post a generic chat card describing the result, in one step.
 *
 * Returns both the rolled outcome and its numeric total so the caller can drive
 * follow-up effects (heal, grant, decrement). `title`, `outcomeTitle`, and
 * `description` may each be a string or a `(total, outcome) => string` function so
 * their text can reflect the roll — e.g. `description: (n) => `You made ${n} rations.``.
 * `title` is the card header; `outcomeTitle` is the per-roll header inside the card.
 *
 * @param {PBActor} actor
 * @param {Object} [options]
 * @param {String} options.formula        Dice formula to roll (e.g. "1d4").
 * @param {String} [options.formulaLabel] Label shown next to the roll.
 * @param {String|Function} [options.title]        Card title (card header).
 * @param {String|Function} [options.outcomeTitle] Per-roll title shown inside the card.
 * @param {String|Function} [options.description]  Card description.
 * @returns {Promise<{outcome: Object, total: Number}>}
 */
export const rollToCard = async (actor, { formula, formulaLabel, title, description, outcomeTitle } = {}) => {
  const outcome = await rollOutcome({ formula, formulaLabel, data: actor.getRollData?.() ?? {} })();
  const total = Number(outcome.roll?.total ?? 0);
  const resolve = (value) => (typeof value === "function" ? value(total, outcome) : value);
  const rollTitle = resolve(outcomeTitle);
  if (rollTitle !== undefined) {
    outcome.title = rollTitle;
  }
  await showGenericCard({ actor, title: resolve(title), description: resolve(description), outcomes: [outcome] });
  return { outcome, total };
};
