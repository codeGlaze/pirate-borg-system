import { asyncPipe } from "../../utils.js";
import { rollOutcome } from "../outcome.js";

/**
 * @param {PBActor} actor
 * @param {String} ability
 * @param {Number} [drModifier] A DR reduction the player opted into (e.g. Treasure
 *   Hunter). The system doesn't track a DR target, so lowering the DR is applied as
 *   an equivalent bonus to the d20 roll.
 * @return {Promise<Object>}
 */
export const createTestAbilityOutcome = async ({ actor, ability, drModifier = 0 }) => {
  const abilityLabel = game.i18n.localize(CONFIG.PB.abilityKey[ability]);
  return asyncPipe(
    rollOutcome({
      type: "armor",
      formula: drModifier ? `1d20+@abilities.${ability}.value+${drModifier}` : `1d20+@abilities.${ability}.value`,
      formulaLabel: drModifier ? `1d20 + ${abilityLabel} + ${drModifier}` : `1d20 + ${abilityLabel}`,
      data: actor.getData(),
    }),
  )();
};
