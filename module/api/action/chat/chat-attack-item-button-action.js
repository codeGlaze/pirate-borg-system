import { characterAttackAction } from "../character/character-attack-action.js";

const resolveActor = (originalOutcome) => {
  const initiatorToken = canvas.ready ? canvas.tokens?.get(originalOutcome.initiatorToken) : null;
  return initiatorToken?.actor ?? game.actors.get(originalOutcome.initiatorActor);
};

/**
 * Executes an attack for the item embedded in the button outcome data.
 *
 * @param {Object} originalOutcome
 * @returns {Promise.<Array.<Object>>}
 */
export const chatAttackItemButtonAction = async (originalOutcome) => {
  const actor = resolveActor(originalOutcome);
  const item = actor?.items?.get(originalOutcome.actionItemId) ?? actor?.items?.find?.((entry) => entry.name === originalOutcome.actionItemName);
  if (!actor || !item) {
    ui.notifications?.warn?.(game.i18n.localize("PB.ActionItemMissing"));
    return [];
  }
  await characterAttackAction(actor, item);
  return [];
};
