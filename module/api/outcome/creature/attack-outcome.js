import { asyncPipe } from "../../utils.js";
import { outcome, withButton, withTarget } from "../outcome.js";
import { OUTCOME_BUTTON } from "../../automation/outcome-chat-button.js";

/**
 * Builds the outcome for a creature's attack against a targeted token. Pirate Borg is
 * player-facing — the target defends rather than the attacker rolling to hit — so this
 * isn't a d20 test. It's an announcement carrying the attack's damage formula plus a
 * Defend button the targeted player clicks to open their own defend flow.
 *
 * @param {PBActor} actor - the attacking creature
 * @param {Token} targetToken - the token being attacked (the defender)
 * @returns {Promise<Object>}
 */
export const createCreatureAttackOutcome = async ({ actor, targetToken } = {}) =>
  asyncPipe(
    outcome({
      type: "creature-attack",
      title: game.i18n.localize("PB.Attack"),
      description: actor.system?.attributes?.attack?.description ?? "",
      // Seeds the defender's incoming-attack when they hit Defend.
      incomingAttack: actor.getActorAttackFormula(),
      // Resolve the defender even if the GM's target selection changes before the click.
      defenderActor: targetToken?.actor?.id,
    }),
    withTarget({ actor, targetToken }),
    withButton({ title: game.i18n.localize("PB.Defend"), type: OUTCOME_BUTTON.DEFEND }),
  )();
