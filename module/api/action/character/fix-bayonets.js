/**
 * Predicates and finders for the Buccaneer's "Fix Bayonets" feature, which lets a
 * character attack with a bayonet on the same turn they reload a black-powder
 * weapon. These are pure helpers (no side effects) consumed by the reload action,
 * the reload chat button, and the attack outcome to decide when to surface the
 * "attack while reloading" follow-up.
 *
 * Every accessor reads both the prepared shape (`item.equipped`) and the raw source
 * shape (`item.system.equipped`) so the helpers work equally against live Foundry
 * documents and the plain objects used in tests.
 */

// A granted bayonet is recognised either by the fixBayonetWeapon flag (stamped by
// feature-grants) or by name, so legacy/hand-added bayonets still count.
const BAYONET_NAMES = new Set(["bayonet", "bayonets"]);
const FIX_BAYONET_FLAG = "fixBayonetWeapon";

// Normalises the actor's item store to a plain array. `actor.items` may be a
// Foundry EmbeddedCollection (has .filter/.values), a plain array (tests), or
// absent — return [] rather than throwing in any of those cases.
const getActorItems = (actor) => {
  if (!actor?.items) {
    return [];
  }
  if (Array.isArray(actor.items)) {
    return actor.items;
  }
  if (typeof actor.items.filter === "function") {
    return actor.items.filter(() => true);
  }
  if (typeof actor.items.values === "function") {
    return Array.from(actor.items.values());
  }
  return [];
};

const isEquipped = (item) => Boolean(item?.equipped ?? item?.system?.equipped);

const isWeapon = (item) => {
  const weaponType = CONFIG?.PB?.itemTypes?.weapon;
  return item?.type === (weaponType || "weapon");
};

const normalizedName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase();

const needsReloading = (item) => Boolean(item?.needsReloading ?? item?.system?.needsReloading);

const getLoadingCount = (item) => Number(item?.loadingCount ?? item?.system?.loadingCount ?? 0);

const isGunpowderWeapon = (item) => Boolean(item?.isGunpowderWeapon ?? item?.system?.isGunpowderWeapon);

const isFlaggedFixBayonetWeapon = (item) => Boolean(item?.getFlag?.(CONFIG?.PB?.flagScope, FIX_BAYONET_FLAG));

/** True when the item is a weapon that counts as a bayonet (by flag or by name). */
export const isBayonetWeapon = (item) => isWeapon(item) && (isFlaggedFixBayonetWeapon(item) || BAYONET_NAMES.has(normalizedName(item.name)));

/** The actor's equipped bayonet, if any — the weapon Fix Bayonets lets them swing. */
export const findEquippedBayonet = (actor) => getActorItems(actor).find((item) => isBayonetWeapon(item) && isEquipped(item));

/**
 * Every equipped black-powder weapon that still has ammo to load (loadingCount > 0),
 * i.e. the reloads a bayonet attack can accompany. `excludeItemId` drops the weapon
 * being attacked with so it isn't offered as its own reload target.
 */
export const findReloadableGunpowderWeapons = (actor, { excludeItemId } = {}) =>
  getActorItems(actor).filter(
    (item) => isWeapon(item) && item.id !== excludeItemId && isEquipped(item) && isGunpowderWeapon(item) && needsReloading(item) && getLoadingCount(item) > 0,
  );

/** The first reloadable black-powder weapon (see findReloadableGunpowderWeapons). */
export const findReloadableGunpowderWeapon = (actor, { excludeItemId } = {}) => findReloadableGunpowderWeapons(actor, { excludeItemId })[0];
