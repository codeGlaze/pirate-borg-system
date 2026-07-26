const BAYONET_NAMES = new Set(["bayonet", "bayonets"]);

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

export const isBayonetWeapon = (item) => isWeapon(item) && BAYONET_NAMES.has(normalizedName(item.name));

export const findEquippedBayonet = (actor) => getActorItems(actor).find((item) => isBayonetWeapon(item) && isEquipped(item));

export const findReloadableGunpowderWeapons = (actor, { excludeItemId } = {}) =>
  getActorItems(actor).filter(
    (item) => isWeapon(item) && item.id !== excludeItemId && isEquipped(item) && isGunpowderWeapon(item) && needsReloading(item) && getLoadingCount(item) > 0,
  );

export const findReloadableGunpowderWeapon = (actor, { excludeItemId } = {}) => findReloadableGunpowderWeapons(actor, { excludeItemId })[0];
