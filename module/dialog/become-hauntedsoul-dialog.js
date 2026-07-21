import { convertToHauntedSoul } from "../api/generator/hybrid-character-generator.js";
import { getTableRows } from "../api/compendium.js";

const HAUNTED_SOUL_ROLL_PACK = "pirateborg.rolls-haunted-soul";

/**
 * Prompts for an ailment (or Random) and non-destructively turns an existing
 * character into a Haunted Soul.
 *
 * @param {PBActor} actor
 */
export const showBecomeHauntedSoulDialog = async (actor) => {
  const rows = await getTableRows(HAUNTED_SOUL_ROLL_PACK, "Ailments");
  const options = [`<option value="">${game.i18n.localize("PB.ManualCharacterRandom")}</option>`]
    .concat(rows.map((row) => `<option value="${row.value}">${row.label}</option>`))
    .join("");

  const content = `
    <form class="pirateborg custom-dialog">
      <div class="section">
        <div class="manual-field">
          <label>${game.i18n.localize("PB.ManualCharacterAilment")}</label>
          <select name="ailment">${options}</select>
        </div>
        <p class="description">${game.i18n.localize("PB.BecomeHauntedSoulHint")}</p>
      </div>
    </form>`;

  new Dialog({
    title: game.i18n.localize("PB.BecomeHauntedSoul"),
    content,
    buttons: {
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("PB.Cancel"),
      },
      convert: {
        icon: '<i class="fas fa-skull"></i>',
        label: game.i18n.localize("PB.BecomeHauntedSoul"),
        callback: async (html) => {
          const value = html.find("[name=ailment]").val();
          try {
            await convertToHauntedSoul(actor, { ailmentValues: value ? [value] : [] });
            actor.sheet.render(true);
            ui.notifications.info(game.i18n.format("PB.BecomeHauntedSoulDone", { name: actor.name }));
          } catch (err) {
            console.error(err);
            ui.notifications.error(game.i18n.localize("PB.BecomeHauntedSoulError"));
          }
        },
      },
    },
    default: "convert",
  }).render(true);
};
