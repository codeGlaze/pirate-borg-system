import { asyncPipe } from "../../utils.js";
import { outcome, withButton, withTarget } from "../outcome.js";
import { OUTCOME_BUTTON } from "../../automation/outcome-chat-button.js";

/**
 * Grog-poison rider on a soaked-blade hit (Grog Brewer). Pirate Borg targets are
 * creatures with no ability scores, so the "Toughness DR14" save can't be rolled by the
 * system — it's shown in the label for the GM to adjudicate, and the automatable half,
 * the −d6, rides an INFLICT_DAMAGE button that bypasses armour (poison in a wound).
 *
 * @param {PBActor} actor - the attacker
 * @param {Token} targetToken
 * @param {Object} poison - `{ saveDr, damage }` from the feature
 * @returns {Promise<Object>}
 */
export const createGrogPoisonOutcome = async ({ actor, targetToken, poison = {} } = {}) =>
  asyncPipe(
    outcome({
      type: "grog-poison",
      title: game.i18n.format("PB.GrogPoisonPrompt", { dr: poison.saveDr ?? 14, damage: poison.damage ?? "1d6" }),
      damageFormula: poison.damage ?? "1d6",
      armorFormula: "0",
    }),
    withTarget({ actor, targetToken }),
    withButton({ title: game.i18n.localize("PB.GrogPoisonButton"), type: OUTCOME_BUTTON.INFLICT_DAMAGE }),
  )();
