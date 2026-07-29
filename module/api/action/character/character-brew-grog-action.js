import { showGenericCard } from "../../../chat-message/generic-card.js";
import { rollOutcome } from "../../outcome/outcome.js";
import { confirmDialog } from "../../utils.js";
import { grantItem } from "../../grants.js";

const BREWED_FLAG = "brewedToday";
const DEFAULT_GROG = "pirateborg.equipment-gear;Grog";

/**
 * The Grog Brewer feature: `system.brew: { formula: "1d4", ref: "pirateborg.<pack>;Grog" }`.
 * The feature is the unlock — ordinary grog is just a drink; Grog Brewer lets a character
 * *produce* it (this action) and *weaponise* it (the attack-dialog soak, later phase).
 *
 * @param {PBActor} actor
 * @returns {PBItem|undefined} the owned Grog Brewer feature, if any
 */
export const findGrogBrewerFeature = (actor) => actor.items.find((item) => item.type === CONFIG.PB.itemTypes.feature && item.system?.brew?.formula);

/**
 * Brews a day's grog: rolls the feature's formula and stacks that many servings of grog
 * onto the actor, flagging the day as brewed. Brewing is once/day (resets on rest); if
 * it's already been brewed today the player is asked to confirm rather than being hard-
 * blocked — a soft guard that fits the rules-light spirit and keeps the button usable.
 *
 * @param {PBActor} actor
 * @param {PBItem} feature - the Grog Brewer feature
 * @param {Object} [options]
 * @param {Boolean} [options.silent] - don't post a standalone card (rest folds it into its own)
 * @param {Boolean} [options.skipConfirm] - skip the "already brewed today" prompt (rest path)
 * @returns {Promise<Object|null>} the brew roll outcome, or null if cancelled
 */
export const characterBrewGrogAction = async (actor, feature, { silent = false, skipConfirm = false } = {}) => {
  if (!feature) {
    return null;
  }
  const scope = CONFIG.PB.flagScope;
  const spec = feature.system?.brew ?? {};

  if (feature.getFlag(scope, BREWED_FLAG) && !skipConfirm) {
    const proceed = await confirmDialog({ title: game.i18n.localize("PB.GrogBrew"), content: game.i18n.localize("PB.GrogBrewAgainConfirm") });
    if (!proceed) {
      return null;
    }
  }

  const outcome = await rollOutcome({
    type: "brew",
    title: game.i18n.localize("PB.GrogBrew"),
    formula: spec.formula || "1d4",
    formulaLabel: spec.formula || "1d4",
    data: actor.getRollData?.() ?? {},
  })();
  const count = outcome.roll.total;
  outcome.description = game.i18n.format("PB.GrogBrewResult", { count });

  await grantItem(actor, spec.ref || DEFAULT_GROG, { quantity: count, stack: true });
  await feature.setFlag(scope, BREWED_FLAG, true);

  if (!silent) {
    await showGenericCard({ actor, title: game.i18n.localize("PB.GrogBrew"), outcomes: [outcome] });
  }
  return outcome;
};

/**
 * Rest path: a long rest is a new day, so clear the once/day flag and auto-brew for any
 * Grog Brewer (no confirm). Returns the outcome for the rest card, or null if the actor
 * isn't a brewer.
 *
 * @param {PBActor} actor
 * @returns {Promise<Object|null>}
 */
export const brewGrogForRest = async (actor) => {
  const feature = findGrogBrewerFeature(actor);
  if (!feature) {
    return null;
  }
  await feature.setFlag(CONFIG.PB.flagScope, BREWED_FLAG, false);
  return characterBrewGrogAction(actor, feature, { silent: true, skipConfirm: true });
};
