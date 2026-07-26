import { showGenericCard } from "../../../chat-message/generic-card.js";
import { createReloadingOutcome } from "../../outcome/character/reloading-outcome.js";
import { OUTCOME_BUTTON } from "../../automation/outcome-chat-button.js";
import { findEquippedBayonet } from "./fix-bayonets.js";
import { trackAmmo } from "../../../system/settings.js";

const localizeWithFallback = (key, data, fallback) => {
  const text = game.i18n.format(key, data);
  return text === key ? fallback : text;
};

/**
 * @param {PBActor} actor
 * @param {PBItem} item
 * @returns {Promise<Object>}
 */
export const characterReloadAction = async (actor, item) => {
  const reloadTime = actor.getEffectiveReloadTime(item);
  if (!item.needsReloading) {
    return;
  }

  if (item.usesAmmo && trackAmmo()) {
    const ammo = actor.items.get(item.ammoId);
    if (!ammo?.quantity) {
      Dialog.prompt({
        title: game.i18n.localize("PB.OutOfAmmoTitle"),
        content: `<p>${game.i18n.localize("PB.OutOfAmmo")}</p>`,
      });

      await showGenericCard({
        actor,
        title: game.i18n.localize("PB.OutOfAmmoTitle"),
        description: game.i18n.format("PB.OutOfAmmoReloaded", {
          item: item.name,
        }),
      });

      return;
    }
  }

  const loadingCount = Math.max((item.loadingCount || 0) - 1, 0);

  await item.setLoadingCount(loadingCount);

  const outcome = await createReloadingOutcome({ actor });
  const bayonet = item?.isGunpowderWeapon ? findEquippedBayonet(actor) : null;
  if (bayonet) {
    outcome.actionItemId = bayonet.id;
    outcome.actionItemName = bayonet.name;
    outcome.button = {
      title: localizeWithFallback("PB.FixBayonetsAttackButton", { item: bayonet.name }, `Attack with ${bayonet.name}`),
      data: {
        type: OUTCOME_BUTTON.ATTACK_ITEM,
        id: foundry.utils.randomID(),
        outcome: outcome.id,
      },
    };
  }

  await showGenericCard({
    actor,
    title: game.i18n.format("PB.ReloadingTitle", { item: item.name }),
    description: game.i18n.format("PB.Reloading", {
      current: reloadTime - loadingCount || 1,
      max: reloadTime || 1,
    }),
    outcomes: [outcome],
  });

  return outcome;
};
