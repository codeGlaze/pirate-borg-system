import { characterReloadAction } from "../character/character-reload-action.js";
import { findReloadableGunpowderWeapons } from "../character/fix-bayonets.js";

const localizeWithFallback = (key, data, fallback) => {
  const text = game.i18n.format(key, data);
  return text === key ? fallback : text;
};

const resolveActor = (originalOutcome) => {
  const initiatorToken = canvas.ready ? canvas.tokens?.get(originalOutcome.initiatorToken) : null;
  return initiatorToken?.actor ?? game.actors.get(originalOutcome.initiatorActor);
};

// Prompts the player to pick which black-powder weapon to reload when more than one
// is eligible (the bayonet follow-up can only reload one). Resolves to the chosen
// item, or null if cancelled/closed.
const chooseReloadWeapon = async (reloadables, preferredId) => {
  const selectedByDefault = reloadables.find((entry) => entry.id === preferredId)?.id ?? reloadables[0]?.id;
  const options = reloadables.map((entry) => `<option value="${entry.id}" ${entry.id === selectedByDefault ? "selected" : ""}>${entry.name}</option>`).join("");

  return new Promise((resolve) => {
    // A Dialog can fire both a button callback and its close handler; `settled`
    // guarantees the promise resolves exactly once (with the choice, not a late null).
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const content = `
      <form>
        <div class="form-group">
          <label>${localizeWithFallback("PB.ReloadChooseHint", {}, "Choose which weapon to reload.")}</label>
          <select name="reload-weapon">${options}</select>
        </div>
      </form>
    `;

    const dialog = new Dialog({
      title: localizeWithFallback("PB.ReloadChooseTitle", {}, "Choose Weapon to Reload"),
      content,
      buttons: {
        confirm: {
          label: game.i18n.localize("PB.Ok"),
          callback: (html) => {
            const selectedId = html.find("[name='reload-weapon']").val();
            finish(reloadables.find((entry) => entry.id === selectedId) ?? null);
          },
        },
        cancel: {
          label: game.i18n.localize("PB.Cancel"),
          callback: () => finish(null),
        },
      },
      default: "confirm",
      close: () => finish(null),
    });

    dialog.render(true);
  });
};

/**
 * Executes a reload for the item embedded in the button outcome data.
 *
 * @param {Object} originalOutcome
 * @returns {Promise.<Array.<Object>>}
 */
export const chatReloadItemButtonAction = async (originalOutcome) => {
  const actor = resolveActor(originalOutcome);
  if (!actor) {
    return [];
  }

  const reloadables = findReloadableGunpowderWeapons(actor);
  let item = actor?.items?.get(originalOutcome.actionItemId) ?? actor?.items?.find?.((entry) => entry.name === originalOutcome.actionItemName);

  if (reloadables.length > 1) {
    item = await chooseReloadWeapon(reloadables, originalOutcome.actionItemId);
    if (!item) {
      return [];
    }
  }

  item = item ?? reloadables[0] ?? null;
  if (!actor || !item) {
    ui.notifications?.warn?.(game.i18n.localize("PB.ActionItemMissing"));
    return [];
  }
  await characterReloadAction(actor, item);
  return [];
};
