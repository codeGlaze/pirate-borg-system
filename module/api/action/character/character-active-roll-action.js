import { showGenericCard } from "../../../chat-message/generic-card.js";
import { rollOutcome } from "../../outcome/outcome.js";
import { setSystemFlag } from "../../utils.js";

/**
 * "Active roll" features (e.g. Inspiring Leader: once per combat, roll a d4 that allies
 * may add or subtract from a roll). Clicking the feature's action button rolls the
 * declared formula, posts it to chat for everyone, and stores the result — with a
 * timestamp — as an `activeRoll` flag on the feature. The character sheet surfaces that
 * stored value as a dismissible chip in the header so it's easy to see and reference for
 * the rest of the fight, and clears it on dismiss.
 *
 * Feature spec: `system.activeRoll: { formula: "1d4", label: "Inspiring Leader", signed: true }`.
 *
 * @param {PBActor} actor
 * @param {PBItem} item
 * @returns {Promise<Object>}
 */
export const characterActiveRollAction = async (actor, item) => {
  const spec = item.system?.activeRoll ?? {};
  const formula = spec.formula || "1d4";
  const label = spec.label || item.name;

  const outcome = await rollOutcome({ type: "active-roll", title: label, formula, formulaLabel: formula, data: actor.getRollData?.() ?? {} })();

  await showGenericCard({ actor, title: label, outcomes: [outcome] });
  await setSystemFlag(item, "activeRoll", { value: outcome.roll.total, at: Date.now(), signed: Boolean(spec.signed) });

  return outcome;
};
