import { showAttackDialog } from "../../../dialog/attack-dialog.js";
import { PBItem } from "../../../item/item.js";
import { trackAmmo } from "../../../system/settings.js";
import { createAttackOutcome } from "../../outcome/character/attack-outcome.js";
import { showGenericCard } from "../../../chat-message/generic-card.js";

/**
 * @param {PBActor} actor
 * @param {PBItem} weapon
 * @returns {Promise.<Object>}
 */
export const characterAttackAction = async (actor, weapon) => {
  /** @type {PBItem} */
  const ammo = actor.items.get(weapon.ammoId);

  if (!isAttackValid(weapon, ammo)) return;

  const {
    attackDR,
    targetArmor,
    targetToken,
    appliedFeatures = [],
    appliedDamageRiders = [],
  } = await showAttackDialog({
    actor,
    weapon,
  });

  const outcome = await createAttackOutcome({
    actor,
    weapon,
    ammo,
    dr: attackDR,
    targetToken,
    armorFormula: targetArmor,
    damageRiders: appliedDamageRiders,
  });

  await handleWeaponReloading(actor, weapon);
  await decrementWeaponAmmo(actor, weapon);

  // Note any attack-DR features that were applied (Crack Shot, Focused Aim, …) so the
  // card shows why the DR was lowered rather than a silently different number.
  const featureNote = appliedFeatures.map((feature) => game.i18n.format("PB.AttackFeatureApplied", { name: feature.name, dr: feature.dr })).join(", ");
  const damageNote = appliedDamageRiders.map((rider) => game.i18n.format("PB.DamageFeatureApplied", { name: rider.name, damage: rider.damage })).join(", ");
  const ammoDescription = weapon.useAmmoDamage ? ammo.description : "";

  await showGenericCard({
    actor,
    title: `${game.i18n.localize(weapon.isRanged ? "PB.WeaponTypeRanged" : "PB.WeaponTypeMelee")} ${game.i18n.localize("PB.Attack")}`,
    outcomes: [outcome],
    items: await getItems(weapon, ammo),
    description: [featureNote, damageNote, ammoDescription].filter(Boolean).join("<br/>"),
    target: targetToken,
  });

  return outcome;
};

/**
 * @param {PBItem} weapon
 * @returns {Promise}
 */
const handleWeaponReloading = async (actor, weapon) => {
  if (!weapon?.needsReloading) {
    return;
  }
  await weapon.setLoadingCount(actor.getEffectiveReloadTime(weapon));
};

/**
 * @param {PBActor} actor
 * @param {PBItem} weapon
 * @returns {Promise}
 */
const decrementWeaponAmmo = async (actor, weapon) => {
  if (weapon.usesAmmo && weapon.ammoId && trackAmmo()) {
    /** @type {PBItem} */
    const ammo = actor.items.get(weapon.ammoId);
    if (ammo) {
      const quantity = ammo.quantity - 1;
      if (quantity > 0) {
        await ammo.setQuantity(quantity);
      } else {
        await actor.deleteEmbeddedDocuments("Item", [ammo.id]);
      }
    }
  }
};

const getItems = async (weapon, ammo) => {
  const items = [weapon];
  if (ammo) {
    items.push(ammo);
  } else if (weapon.usesAmmo) {
    items.push(await PBItem.create({ type: "ammo", name: game.i18n.localize("PB.NoAmmo") }, { temporary: true }));
  }
  return items;
};

/**
 * @param {PBItem} weapon
 * @param {PBItem} ammo
 * @returns {Boolean}
 */
const isAttackValid = (weapon, ammo) => {
  if (trackAmmo() && !isAmmoValid(weapon, ammo)) {
    ui.notifications.error(game.i18n.format("PB.NoAmmoEquipped"));
    return false;
  }
  return true;
};

/**
 * @param {PBItem} weapon
 * @param {PBItem} ammo
 * @returns {Boolean}
 */
const isAmmoValid = (weapon, ammo) => {
  if (!weapon.usesAmmo) {
    return true;
  }
  if (!ammo) {
    return false;
  }
  if (!weapon.useAmmoDamage) {
    return true;
  }
  if (!weapon?.hasAmmo) {
    return false;
  }

  if (!ammo?.damageDie) {
    return false;
  }
  return true;
};
