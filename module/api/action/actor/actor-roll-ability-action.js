import { showGenericCard } from "../../../chat-message/generic-card.js";
import { createTestAbilityOutcome } from "../../outcome/actor/test-ability-outcome.js";

/**
 * @param {PBActor} actor
 * @param {String} ability
 * @param {Array.<String>} drModifiers Reminder strings shown on the card.
 * @param {Number} [drModifier] A numeric DR reduction actually applied to the roll.
 * @returns {Promise<Object>}
 */
export const actorRollAbilityAction = async (actor, ability, drModifiers = [], drModifier = 0) => {
  const outcome = await createTestAbilityOutcome({ actor, ability, drModifier });

  await showGenericCard({
    title: game.i18n.localize(CONFIG.PB.abilityKey[ability]),
    description: getDescription(drModifiers),
    actor,
    outcomes: [outcome],
  });

  return outcome;
};

/**
 * @param {Array.<String>} drModifiers
 * @returns {String}
 */
const getDescription = (drModifiers) => drModifiers.join("<br />");
