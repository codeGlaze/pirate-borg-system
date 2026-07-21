import { buildCharacter, buildRollItems, findStartingBonusItems, findStartingBonusRollsItems } from "./character-generator.js";
import { classItemFromPack, compendiumInfoFromString, drawTableItem, findClassPacks, findItemsFromCompendiumString, resolveTableRow } from "../compendium.js";
import { isCharacterGeneratorClassAllowed } from "../../system/settings.js";

/**
 * "Overlay" classes (Haunted Soul, Tall Tale) are not self-contained: they are
 * layered on top of a base class (or, for a Tall Tale Sentient Animal, replace
 * the class' statline). This module ports the composition that used to live only
 * in the packed character-creation macros into parameterized builders so both
 * the randomizer ("The Tavern") and the manual creator can drive them, and so an
 * existing character can be converted in place.
 *
 * Every builder takes a `choices` object: any field left unset is rolled
 * randomly, so passing `{}` reproduces the original random behaviour exactly.
 */

const TALL_TALE_ROLL_PACK = "pirateborg.rolls-tall-tale";
const TALL_TALE_TABLE = "Tall Tale";
const AQUATIC_MUTANT_TABLE = "Aquatic Mutant";
const SENTIENT_ANIMAL_TABLE = "Sentient Animal";

const HAUNTED_SOUL_MACRO_PACK = "pirateborg.macros-haunted-soul";
const TALL_TALE_MACRO_PACK = "pirateborg.macros-tall-tale";

/**
 * @param {any} value
 * @returns {Boolean}
 */
const isRowChoice = (value) => value !== undefined && value !== null && value !== "";

/**
 * @param {Array} array
 * @returns {*}
 */
const pickRandom = (array) => array[Math.floor(Math.random() * array.length)];

/**
 * Resolves a single item from a table row choice, or draws one at random.
 *
 * @param {String} compendium
 * @param {String} table
 * @param {Number} [value]
 * @returns {Promise.<PBItem|undefined>}
 */
const resolveOrDrawOne = async (compendium, table, value) => {
  const items = isRowChoice(value) ? await resolveTableRow(compendium, table, Number(value)) : await drawTableItem(compendium, table);
  return items[0];
};

/**
 * The standard (non-overlay) classes that can serve as a base class.
 *
 * @returns {Promise.<Array.<PBItem>>}
 */
export const getBaseClassItems = async () => {
  const items = [];
  for (const pack of findClassPacks()) {
    if (!isCharacterGeneratorClassAllowed(pack)) {
      continue;
    }
    const cls = await classItemFromPack(pack);
    if (!cls || cls.requireBaseClass || cls.characterGeneratorMacro) {
      continue;
    }
    items.push(cls);
  }
  return items;
};

/**
 * Resolves the base class item to compose with, from an explicit choice or at random.
 *
 * @param {Object} choices
 * @returns {Promise.<PBItem>}
 */
const resolveBaseClass = async (choices) => {
  if (choices.baseClass) {
    return choices.baseClass;
  }
  if (choices.baseClassPack) {
    return classItemFromPack(choices.baseClassPack);
  }
  const candidates = choices.baseClasses?.length ? choices.baseClasses : await getBaseClassItems();
  return pickRandom(candidates);
};

/**
 * Layers an overlay class onto an already-built base-class character: the base
 * class item is flagged as the base, the overlay's extra items are added, and
 * both class items are appended. Mirrors the original macro composition.
 *
 * @param {Object} pirateData Character data from {@link buildCharacter}.
 * @param {Object} params
 * @param {PBItem} params.baseClass
 * @param {PBItem} params.overlayClass
 * @param {Array.<PBItem>} [params.extraItems]
 * @returns {Object}
 */
const layerOverlayOntoBase = (pirateData, { baseClass, overlayClass, extraItems = [] }) => {
  baseClass.getData().isBaseClass = true;
  pirateData.items = pirateData.items
    .filter((item) => item.type !== "class")
    .concat(extraItems)
    .concat([baseClass])
    .concat([overlayClass]);
  return pirateData;
};

/**
 * Builds a Haunted Soul: a base-class character with the Haunted Soul overlay
 * (ailment + items) layered on top.
 *
 * @param {PBItem} hauntedSoulClass
 * @param {Object} [choices]
 * @param {PBItem} [choices.baseClass] Explicit base class item.
 * @param {String} [choices.baseClassPack] Base class pack (resolved to an item).
 * @param {Array.<PBItem>} [choices.baseClasses] Candidate pool for the random pick.
 * @param {Object} [choices.baseChoices] Manual choices forwarded to the base-class builder.
 * @param {Array.<Number>} [choices.ailmentValues] Chosen rows for the Haunted Soul roll(s).
 * @returns {Promise.<Object>}
 */
export const buildHauntedSoul = async (hauntedSoulClass, choices = {}) => {
  const baseClass = await resolveBaseClass(choices);
  const pirateData = await buildCharacter(baseClass, choices.baseChoices ?? {});

  const overlayRolls = await buildRollItems(hauntedSoulClass.startingRolls, choices.ailmentValues ?? []);
  const overlayItems = await findItemsFromCompendiumString(hauntedSoulClass.startingItems);

  layerOverlayOntoBase(pirateData, {
    baseClass,
    overlayClass: hauntedSoulClass,
    extraItems: [...overlayRolls, ...overlayItems],
  });

  const ailment = pirateData.items.find((item) => item.type === "feature" && item.featureType === "Ailment (Haunted Soul)");
  if (ailment) {
    hauntedSoulClass.name = `${hauntedSoulClass.name} - ${ailment.name}`;
  }
  pirateData.description = `${hauntedSoulClass.flavorText}${pirateData.description}`;
  pirateData.actorImg = hauntedSoulClass.img;

  return pirateData;
};

/**
 * Per-animal stat overrides for a Tall Tale Sentient Animal, keyed by the drawn
 * animal item's name. Ported verbatim from the character-creation macro.
 */
const SENTIENT_ANIMAL_DEFAULTS = {
  startingAbilityScoreFormula: "3d6",
  startingStrengthBonus: -2,
  startingAgilityBonus: -2,
  startingPresenceBonus: -2,
  startingToughnessBonus: -2,
  startingSpiritBonus: -2,
  luckDie: "1d4",
  flavorText: "",
  startingMacro: "",
};

const SENTIENT_ANIMAL_STATS = {
  "Foul Fowl": { startingSpiritBonus: +3, startingHitPoints: "1d4" },
  Jaguar: { startingAgilityBonus: +2, startingStrengthBonus: +2, startingHitPoints: "1d8" },
  Crocodile: { startingToughnessBonus: +1, startingStrengthBonus: +3, startingHitPoints: "1d10" },
  "Bilge Rat": { startingToughnessBonus: +2, startingAgilityBonus: +3, startingHitPoints: "1d2" },
  "Lucky Parrot": { startingPresenceBonus: +2, startingAgilityBonus: +1, startingHitPoints: "1d2", luckDie: "1d6" },
  "Clever Monkey": {
    startingPresenceBonus: 0,
    startingAgilityBonus: +2,
    startingStrengthBonus: -1,
    startingHitPoints: "1d6",
    startingWeaponTableFormula: "1d10",
  },
};

/**
 * Builds a Tall Tale Merfolk: a base-class character with the Tall Tale overlay.
 *
 * @param {PBItem} tallTaleClass
 * @param {PBItem} tallTaleItem The drawn/selected "Tall Tale" table item (Merfolk).
 * @param {Object} choices
 * @returns {Promise.<Object>}
 */
const buildMerfolk = async (tallTaleClass, tallTaleItem, choices) => {
  const baseClass = await resolveBaseClass(choices);
  const pirateData = await buildCharacter(baseClass, choices.baseChoices ?? {});

  const items = await findItemsFromCompendiumString(tallTaleClass.startingItems);
  const rolls = await buildRollItems(tallTaleClass.startingRolls, choices.tallTaleRollValues ?? []);
  const bonusItems = [...(await findStartingBonusItems([...items, ...rolls])), ...(await findStartingBonusRollsItems([...items, ...rolls]))];

  layerOverlayOntoBase(pirateData, {
    baseClass,
    overlayClass: tallTaleClass,
    extraItems: [...items, ...rolls, ...bonusItems],
  });

  tallTaleClass.name = `${tallTaleClass.name} - ${tallTaleItem.name}`;
  pirateData.description = `<p>${tallTaleItem.flavorText}</p>${pirateData.description}`;
  pirateData.actorImg = tallTaleItem.img;

  return pirateData;
};

/**
 * Builds a Tall Tale Aquatic Mutant: base-class character + a chosen/drawn mutant.
 *
 * @param {PBItem} tallTaleClass
 * @param {PBItem} tallTaleItem
 * @param {Object} choices
 * @returns {Promise.<Object>}
 */
const buildAquaticMutant = async (tallTaleClass, tallTaleItem, choices) => {
  const mutantItem = await resolveOrDrawOne(TALL_TALE_ROLL_PACK, AQUATIC_MUTANT_TABLE, choices.mutantValue);
  const baseClass = await resolveBaseClass(choices);
  const pirateData = await buildCharacter(baseClass, choices.baseChoices ?? {});

  const items = await findItemsFromCompendiumString(tallTaleClass.startingItems);
  const rolls = await buildRollItems(tallTaleClass.startingRolls, choices.tallTaleRollValues ?? []);
  const additionalItems = mutantItem ? [mutantItem] : [];
  const seedItems = [...items, ...rolls, ...additionalItems];
  const bonusItems = [...(await findStartingBonusItems(seedItems)), ...(await findStartingBonusRollsItems(seedItems))];

  layerOverlayOntoBase(pirateData, {
    baseClass,
    overlayClass: tallTaleClass,
    extraItems: [...items, ...rolls, ...additionalItems, ...bonusItems],
  });

  pirateData.description = `<p>${tallTaleItem.flavorText} (${mutantItem?.name})</p>${pirateData.description}`;

  if (mutantItem?.name === "Electric Eel") {
    pirateData.agility = parseInt(pirateData.agility, 10) + 1;
  }
  if (mutantItem?.img) {
    pirateData.actorImg = mutantItem.img;
  }
  tallTaleClass.name = `${tallTaleClass.name} - ${tallTaleItem.name} - ${mutantItem?.name}`;

  if (mutantItem?.name === "The Great Old One") {
    pirateData.items.filter((item) => item.type === "invokable").forEach((item) => (item.getData().isEquipment = false));
  }

  return pirateData;
};

/**
 * Builds a Tall Tale Sentient Animal: the Tall Tale class is re-statted as the
 * chosen/drawn animal (no base class) and then built.
 *
 * @param {PBItem} tallTaleClass
 * @param {PBItem} tallTaleItem
 * @param {Object} choices
 * @returns {Promise.<Object>}
 */
const buildSentientAnimal = async (tallTaleClass, tallTaleItem, choices) => {
  const animalItem = await resolveOrDrawOne(TALL_TALE_ROLL_PACK, SENTIENT_ANIMAL_TABLE, choices.animalValue);
  const animalStats = { ...SENTIENT_ANIMAL_DEFAULTS, ...(SENTIENT_ANIMAL_STATS[animalItem?.name] ?? {}) };

  // Re-stat the (cloned) Tall Tale class as the animal, then build from it.
  const data = tallTaleClass.getData();
  Object.assign(data, animalStats);
  data.startingRolls = animalItem?.startingBonusRolls ?? "";
  data.startingItems = animalItem?.startingBonusItems ?? "";
  data.flavorText = `${tallTaleItem.flavorText} (${animalItem?.name})`;
  if (animalItem?.img) {
    tallTaleClass.name = `${tallTaleClass.name} - ${tallTaleItem.name} - ${animalItem.name}`;
    tallTaleClass.img = animalItem.img;
  }

  const pirateData = await buildCharacter(tallTaleClass, choices.baseChoices ?? {});

  if (animalItem?.name === "Foul Fowl") {
    pirateData.items.filter((item) => item.type === "invokable").forEach((item) => (item.getData().isEquipment = false));
  }

  if (animalItem) {
    pirateData.items = pirateData.items.concat([animalItem]);
  }
  return pirateData;
};

/**
 * Builds a Tall Tale, dispatching to the sub-type of the drawn/selected
 * "Tall Tale" table entry (Merfolk / Aquatic Mutant / Sentient Animal).
 *
 * @param {PBItem} tallTaleClass
 * @param {Object} [choices]
 * @param {Number} [choices.tallTaleValue] Chosen row of the "Tall Tale" table.
 * @returns {Promise.<Object>}
 */
export const buildTallTale = async (tallTaleClass, choices = {}) => {
  const tallTaleItem = await resolveOrDrawOne(TALL_TALE_ROLL_PACK, TALL_TALE_TABLE, choices.tallTaleValue);

  let pirateData;
  switch (tallTaleItem?.name) {
    case "Merfolk":
      pirateData = await buildMerfolk(tallTaleClass, tallTaleItem, choices);
      break;
    case "Aquatic Mutant":
      pirateData = await buildAquaticMutant(tallTaleClass, tallTaleItem, choices);
      break;
    case "Sentient Animal":
      pirateData = await buildSentientAnimal(tallTaleClass, tallTaleItem, choices);
      break;
    default:
      throw new Error(`buildTallTale: unknown Tall Tale sub-type "${tallTaleItem?.name}"`);
  }

  pirateData.items = pirateData.items.concat([tallTaleItem]);
  return pirateData;
};

/**
 * Maps a hybrid class' character-generator macro pack to its builder, so the
 * manual creator and Tavern can dispatch by class instead of hard-coding names.
 */
const HYBRID_BUILDERS = {
  [HAUNTED_SOUL_MACRO_PACK]: buildHauntedSoul,
  [TALL_TALE_MACRO_PACK]: buildTallTale,
};

/**
 * @param {PBItem} cls
 * @returns {Boolean} True when the class is a supported overlay/hybrid class.
 */
export const isHybridClass = (cls) => {
  if (!cls?.characterGeneratorMacro) {
    return false;
  }
  const [macroPack] = compendiumInfoFromString(cls.characterGeneratorMacro);
  return macroPack in HYBRID_BUILDERS;
};

/**
 * Builds a hybrid class' character data via the appropriate builder.
 *
 * @param {PBItem} cls
 * @param {Object} [choices]
 * @returns {Promise.<Object>}
 */
export const buildHybridCharacter = async (cls, choices = {}) => {
  const [macroPack] = compendiumInfoFromString(cls.characterGeneratorMacro || "");
  const builder = HYBRID_BUILDERS[macroPack];
  if (!builder) {
    throw new Error(`buildHybridCharacter: no builder for "${cls.name}"`);
  }
  return builder(cls, choices);
};
