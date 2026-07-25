import { getTableRows } from "../api/compendium.js";
import { getBetterFeatureMode } from "../system/settings.js";

/**
 * The names of features the actor is already at `maxQuantity` on, so the picker can
 * fade them out — mirroring the random roll, which rerolls a capped feature. A
 * `maxQuantity` of 0 means no limit and is never capped.
 *
 * @param {PBActor} actor
 * @returns {Set.<String>}
 */
export const cappedFeatureNames = (actor) =>
  new Set(
    (actor?.items ?? [])
      .filter((item) => item.type === "feature" && item.maxQuantity !== 0 && (item.quantity || 1) >= (item.maxQuantity || 1))
      .map((item) => item.name)
  );

/**
 * Shows a picker of a class feature table's rows and resolves to the chosen row's
 * path value (what {@link resolveTablePath} expects). Features already at their
 * `maxQuantity` are shown disabled ("(max)"). Returns null if the player cancels or
 * every feature is capped, so the caller falls back to a random roll.
 *
 * @param {PBActor} actor
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<String|null>}
 */
const promptChooseFeature = async (actor, compendium, table) => {
  const rows = await getTableRows(compendium, table);
  if (!rows.length) {
    return null;
  }
  const capped = cappedFeatureNames(actor);
  const isCapped = (row) => capped.has(row.label.trim());
  if (rows.every(isCapped)) {
    ui.notifications?.info?.(game.i18n.localize("PB.GetBetterAllFeaturesMaxed"));
    return null;
  }
  const maxedSuffix = ` ${game.i18n.localize("PB.GetBetterFeatureMaxed")}`;
  let defaulted = false;
  const options = rows
    .map((row) => {
      if (isCapped(row)) {
        return `<option value="${row.value}" disabled>${row.label}${maxedSuffix}</option>`;
      }
      const selected = defaulted ? "" : " selected";
      defaulted = true;
      return `<option value="${row.value}"${selected}>${row.label}</option>`;
    })
    .join("");
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
 * @param {PBActor} actor
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<String|null>} A row value to resolve, or null to roll.
 */
export const chooseGettingBetterFeatureValue = async (actor, compendium, table) => {
  const mode = getBetterFeatureMode();
  if (mode === "choose") {
    return promptChooseFeature(actor, compendium, table);
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
    return wantsChoose ? promptChooseFeature(actor, compendium, table) : null;
  }
  return null;
};
