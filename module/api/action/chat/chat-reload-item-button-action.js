import { characterReloadAction } from "../character/character-reload-action.js";

const resolveActor = (originalOutcome) => {
  const initiatorToken = canvas.ready ? canvas.tokens?.get(originalOutcome.initiatorToken) : null;
  return initiatorToken?.actor ?? game.actors.get(originalOutcome.initiatorActor);
};

/**
 * Executes a reload for the item embedded in the button outcome data.
 *
 * @param {Object} originalOutcome
 * @returns {Promise.<Array.<Object>>}
 */
export const chatReloadItemButtonAction = async (originalOutcome) => {
  const actor = resolveActor(originalOutcome);
  const item = actor?.items?.get(originalOutcome.actionItemId) ?? actor?.items?.find?.((entry) => entry.name === originalOutcome.actionItemName);
  if (!actor || !item) {
    ui.notifications?.warn?.(game.i18n.localize("PB.ActionItemMissing"));
    return [];
  }
  await characterReloadAction(actor, item);
  return [];
};
