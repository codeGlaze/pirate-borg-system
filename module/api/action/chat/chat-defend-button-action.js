import { characterDefendAction } from "../character/character-defend-action.js";
import { setSystemFlag } from "../../utils.js";

/**
 * Defend button on a creature's attack card. Opens the targeted character's normal defend
 * flow, seeded with the attacker's damage die. Only the defender's owner (the GM owns all
 * actors, so they qualify too) may act on it — other players clicking are warned off.
 *
 * Returns nothing (not an array), so OutcomeChatButton leaves the attack card untouched:
 * the defend flow posts its own result card, and the Defend button stays available.
 *
 * @param {Object} originalOutcome
 * @returns {Promise<void>}
 */
export const chatDefendButtonAction = async (originalOutcome) => {
  const targetToken = canvas.ready ? canvas.tokens.get(originalOutcome.targetToken) : null;
  const defender = targetToken?.actor ?? game.actors.get(originalOutcome.defenderActor);
  if (!defender) {
    return;
  }
  if (!defender.isOwner) {
    ui.notifications.warn(game.i18n.localize("PB.DefendNotOwner"));
    return;
  }

  // Pre-fill the defend dialog's incoming attack with the attacker's die; the player can
  // still override it in the dialog.
  if (originalOutcome.incomingAttack) {
    await setSystemFlag(defender, CONFIG.PB.flags.INCOMING_ATTACK, originalOutcome.incomingAttack);
  }

  await characterDefendAction(defender);
};
