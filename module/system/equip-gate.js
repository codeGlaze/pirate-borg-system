/**
 * Shared "is the required weapon in hand?" logic for equip-gated features — e.g. the
 * Swashbuckler's Ostentatious Fencer, whose bonuses apply only while wielding a rapier
 * or cutlass. Used both by the equip-gated Active Effect (which suppresses itself when
 * the weapon isn't equipped) and by the attack-DR resolver (which gates on the attack
 * weapon's name). Weapons carry no subtype, so matching is by name keyword.
 */

/**
 * @param {PBItem|{name: String}} weapon
 * @param {String[]} [keywords]
 * @returns {Boolean} true when the weapon's name contains any of the keywords.
 */
export const weaponNameMatches = (weapon, keywords = []) => {
  const name = String(weapon?.name ?? "").toLowerCase();
  return Boolean(name) && keywords.some((keyword) => name.includes(String(keyword).toLowerCase()));
};

/**
 * @param {PBActor} actor
 * @param {String[]} [keywords]
 * @returns {Boolean} true when the actor has an equipped weapon matching the keywords.
 */
export const isWieldingGatedWeapon = (actor, keywords = []) =>
  (actor?.items ?? []).some((item) => item.type === CONFIG.PB.itemTypes.weapon && item.system?.equipped && weaponNameMatches(item, keywords));
