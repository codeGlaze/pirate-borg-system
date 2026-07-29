import { showGenericCard } from "../../../chat-message/generic-card.js";
import { findTargettedToken } from "../../targeting.js";
import { createCreatureAttackOutcome } from "../../outcome/creature/attack-outcome.js";

/**
 * GM-facing creature attack: with a player token targeted, posts a chat card announcing
 * the attack (description + damage die) and a Defend button the targeted player clicks to
 * roll their own defense. Requires a target — Pirate Borg attacks are resolved by the
 * defender, so there's nothing to announce without one.
 *
 * @param {PBActor} actor - the attacking creature
 * @returns {Promise<Object|null>}
 */
export const creatureAttackAction = async (actor) => {
  const targetToken = findTargettedToken();
  if (!targetToken) {
    ui.notifications.warn(game.i18n.localize("PB.CreatureAttackNoTarget"));
    return null;
  }

  const outcome = await createCreatureAttackOutcome({ actor, targetToken });

  await showGenericCard({
    actor,
    title: game.i18n.localize("PB.Attack"),
    outcomes: [outcome],
    target: targetToken,
  });

  return outcome;
};
