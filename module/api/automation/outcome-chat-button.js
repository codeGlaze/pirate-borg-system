import { diceSound } from "../dice.js";
import { getMessageContent, getMessageSpeaker, getSystemFlag, setSystemFlag } from "../utils.js";

export const OUTCOME_BUTTON = {
  ANCIENT_RELIC: "button-ancient-relic",
  MYSTICAL_MISHAP: "button-mystical-mishap",
  REPAIR_CREW_ACTION: "button-repair-crew-action",
  TAKE_DAMAGE: "button-take-damage",
  INFLICT_DAMAGE: "button-inflict-damage",
  ATTACK_ITEM: "button-attack-item",
  DEFEND: "button-defend",
  RELOAD_ITEM: "button-reload-item",
  CONSUME_LUCK: "button-consume-luck",
  APPLY_JOKER_TABLE: "button-apply-joker-table",
};

const flattenOutcomes = (outcomes = []) => {
  const flat = [];
  for (const outcome of outcomes) {
    if (!outcome) continue;
    flat.push(outcome);
    if (outcome.secondaryOutcome) {
      flat.push(...flattenOutcomes([outcome.secondaryOutcome]));
    }
  }
  return flat;
};

const findOutcomeById = (outcomes = [], outcomeId) => {
  for (const outcome of outcomes) {
    if (!outcome) continue;
    if (outcome.id === outcomeId) return outcome;
    if (outcome.secondaryOutcome?.id === outcomeId) return outcome.secondaryOutcome;
    const nested = findOutcomeById(outcome.secondaryOutcome ? [outcome.secondaryOutcome] : [], outcomeId);
    if (nested) return nested;
  }
  return null;
};

export class OutcomeChatButton {
  static buttons = [];
  static TEMPLATE = "systems/pirateborg/templates/chat/generic-button-outcome.html";

  /**
   * @param {String} type
   * @param {function(*)} execute
   */
  static register({ type, execute }) {
    const alreadyRegistered = OutcomeChatButton.buttons.find((automation) => automation.type === type);
    if (!alreadyRegistered) {
      OutcomeChatButton.buttons.push({ type, execute });
    }
  }

  /**
   * @param {ChatMessage} message
   * @param {HTMLButtonElement} htmlButton
   * @return {Promise<void>}
   */
  static async handleChatMessage(message, htmlButton) {
    const actor = ChatMessage.getSpeakerActor(getMessageSpeaker(message));
    if (!actor) {
      return;
    }

    const outcomes = getSystemFlag(message, CONFIG.PB.flags.OUTCOMES) ?? [];
    const outcomeId = htmlButton.dataset.outcomeId ?? htmlButton.dataset.outcome;
    if (!outcomeId) return;

    const outcome = outcomes.find((entry) => entry.id === outcomeId) ?? findOutcomeById(outcomes, outcomeId);
    if (!outcome?.button?.data?.type) return;

    const button = OutcomeChatButton.buttons.find((entry) => outcome.button?.data.type === entry.type);
    if (!button?.execute) return;

    const actionOutcomes = await button.execute(outcome);
    if (!Array.isArray(actionOutcomes)) return;

    await OutcomeChatButton.updateMessageCard(message, outcome, actionOutcomes);

    await setSystemFlag(message, CONFIG.PB.flags.OUTCOMES, [...flattenOutcomes(outcomes), ...flattenOutcomes(actionOutcomes)]);
  }

  /**
   * @param {ChatMessage} message
   * @param {Object} outcome
   * @param {Object[]} outcomes
   * @return {Promise<void>}
   */
  static async updateMessageCard(message, outcome, outcomes) {
    const messageContent = $(getMessageContent(message));
    let content;
    if (game.release.generation >= 13) {
      content = await foundry.applications.handlebars.renderTemplate(OutcomeChatButton.TEMPLATE, { outcomes });
    } else {
      content = await renderTemplate(OutcomeChatButton.TEMPLATE, { outcomes });
    }

    // Remove the entire outcome tray row by canonical identity attribute.
    messageContent.find(`[data-outcome-id='${outcome.id}']`).closest("outcome-tray").remove();
    // Legacy fallback: old cards may only have data-outcome on the button.
    messageContent.find(`[data-outcome='${outcome.id}']`).remove();

    await message.update({
      content: messageContent.append($(content)).prop("outerHTML"),
      sound: diceSound(),
    });
  }
}
