import { getTableRows } from "../api/compendium.js";
import { getBetterFeatureMode } from "../system/settings.js";

/**
 * Shows a picker of a class feature table's rows and resolves to the chosen row's
 * path value (what {@link resolveTablePath} expects). Returns null if the player
 * cancels, so the caller falls back to a random roll.
 *
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<String|null>}
 */
const promptChooseFeature = async (compendium, table) => {
  const rows = await getTableRows(compendium, table);
  if (!rows.length) {
    return null;
  }
  const options = rows.map((row) => `<option value="${row.value}">${row.label}</option>`).join("");
  const content = `
    <form>
      <p>${game.i18n.localize("PB.GetBetterChooseFeatureHint")}</p>
      <div class="form-group">
        <select name="feature" style="width: 100%;">${options}</select>
      </div>
    </form>`;
  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("PB.GetBetterChooseFeatureTitle"),
      content,
      buttons: {
        choose: {
          label: game.i18n.localize("PB.GetBetterFeatureModeChoose"),
          callback: (html) => resolve(html.find('select[name="feature"]').val()),
        },
      },
      default: "choose",
      close: () => resolve(null),
    }).render(true);
  });
};

/**
 * Resolves how a class feature should be gained on "Get Better", honoring the
 * `getBetterFeatureMode` world setting:
 *   - "roll"   → null (caller rolls randomly, RAW).
 *   - "choose" → the picked row value.
 *   - "ask"    → a Roll/Choose prompt, then either of the above.
 *
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<String|null>} A row value to resolve, or null to roll.
 */
export const chooseGettingBetterFeatureValue = async (compendium, table) => {
  const mode = getBetterFeatureMode();
  if (mode === "choose") {
    return promptChooseFeature(compendium, table);
  }
  if (mode === "ask") {
    const wantsChoose = await new Promise((resolve) => {
      new Dialog({
        title: game.i18n.localize("PB.GetBetterRollOrChooseTitle"),
        content: `<p>${game.i18n.localize("PB.GetBetterRollOrChooseHint")}</p>`,
        buttons: {
          roll: { label: game.i18n.localize("PB.Roll"), callback: () => resolve(false) },
          choose: { label: game.i18n.localize("PB.GetBetterFeatureModeChoose"), callback: () => resolve(true) },
        },
        default: "roll",
        close: () => resolve(false),
      }).render(true);
    });
    return wantsChoose ? promptChooseFeature(compendium, table) : null;
  }
  return null;
};
