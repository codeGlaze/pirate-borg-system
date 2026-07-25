import { actorRollAbilityAction } from "../actor/actor-roll-ability-action.js";

/**
 * Prompts the player to opt into any situational ability-test DR reductions the
 * character has (e.g. the Buccaneer's Treasure Hunter). These apply only to a
 * narrative subset of tests — mapping, navigating, treasure hunting, traps,
 * tracking — which the system can't detect, so the player elects them per roll.
 *
 * When none are available the roll proceeds with no dialog. The selected total is
 * returned both as a numeric bonus applied to the d20 (lowering the DR is
 * equivalent to raising the roll, since the system doesn't track a DR target) and
 * as reminder strings for the card.
 *
 * @param {PBActor} actor
 * @returns {Promise.<{drModifier: Number, drModifiers: Array.<String>}>}
 */
const promptDrReductions = async (actor) => {
  const available = actor.getAbilityTestDrReductions();
  if (!available.length) {
    return { drModifier: 0, drModifiers: [] };
  }
  const label = (m) => `${m.name} (${game.i18n.localize("PB.DR")} - ${m.dr})`;
  const rows = available
    .map((m) => `<div class="form-group"><label><input type="checkbox" name="${m.id}" /> ${label(m)}</label></div>`)
    .join("");
  const content = `<form><p>${game.i18n.localize("PB.AbilityCheckDrHint")}</p>${rows}</form>`;
  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("PB.AbilityCheckDrTitle"),
      content,
      buttons: {
        roll: {
          label: game.i18n.localize("PB.Roll"),
          callback: (html) => {
            const selected = available.filter((m) => html.find(`input[name="${m.id}"]`).prop("checked"));
            resolve({
              drModifier: selected.reduce((total, m) => total + m.dr, 0),
              drModifiers: selected.map(label),
            });
          },
        },
      },
      default: "roll",
      close: () => resolve({ drModifier: 0, drModifiers: [] }),
    }).render(true);
  });
};

export const characterRollAgilityAction = async (actor) => {
  const drModifiers = [];
  const armor = actor.equippedArmor;

  if (armor) {
    const armorTier = CONFIG.PB.armorTiers[armor.tier.max];
    if (armorTier.agilityModifier) {
      drModifiers.push(`${armor.name} (${game.i18n.localize("PB.DR")} + ${armorTier.agilityModifier})`);
    }
  }

  if (actor.isEncumbered) {
    drModifiers.push(`${game.i18n.localize("PB.Encumbered")} (${game.i18n.localize("PB.DR")} + 2)`);
  }

  const { drModifier, drModifiers: applied } = await promptDrReductions(actor);
  return actorRollAbilityAction(actor, CONFIG.PB.ability.agility, [...drModifiers, ...applied], drModifier);
};

export const characterRollStrengthAction = async (actor) => {
  const drModifiers = [];

  if (actor.isEncumbered) {
    drModifiers.push(`${game.i18n.localize("PB.Encumbered")} (${game.i18n.localize("PB.DR")} + 2)`);
  }

  const { drModifier, drModifiers: applied } = await promptDrReductions(actor);
  return actorRollAbilityAction(actor, CONFIG.PB.ability.strength, [...drModifiers, ...applied], drModifier);
};

export const characterRollPresenceAction = async (actor) => {
  const { drModifier, drModifiers } = await promptDrReductions(actor);
  return actorRollAbilityAction(actor, CONFIG.PB.ability.presence, drModifiers, drModifier);
};

export const characterRollToughnessAction = async (actor) => {
  const { drModifier, drModifiers } = await promptDrReductions(actor);
  return actorRollAbilityAction(actor, CONFIG.PB.ability.toughness, drModifiers, drModifier);
};

export const characterRollSpiritAction = async (actor) => {
  const { drModifier, drModifiers } = await promptDrReductions(actor);
  return actorRollAbilityAction(actor, CONFIG.PB.ability.spirit, drModifiers, drModifier);
};
