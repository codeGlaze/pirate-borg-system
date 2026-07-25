import { PBActor } from "../../actor/actor.js";
import {
  compendiumInfoFromString,
  drawTableItem,
  drawTableItems,
  drawTableText,
  executeCompendiumMacro,
  findCompendiumItem,
  findItemsFromCompendiumString,
  findTableItems,
  resolveTablePath,
  rollTableItems,
} from "../compendium.js";
import { PB } from "../../config.js";
import { evaluateFormula } from "../utils.js";
import { chooseGettingBetterFeatureValue } from "../../dialog/get-better-feature-dialog.js";
import { normalizeItemEffectDurations } from "../effect-duration.js";

/**
 * @param {PBItem} cls
 * @returns {Promise.<PBActor>}
 */
export const createCharacter = async (cls) => createActorWithCharacter(await rollCharacterForClass(cls));

/**
 * @param {PBActor} actor
 * @param {PBItem} cls
 * @returns {Promise.<PBActor>}
 */
export const regenerateActor = async (actor, cls) => {
  await updateActorWithCharacter(actor, await rollCharacterForClass(cls));

  return actor;
};

/**
 * @param {Object} characterData
 * @returns {Promise.<PBActor>}
 */
export const createActorWithCharacter = async (characterData) => {
  const data = characterToActorData(characterData);
  const actor = await PBActor.create(data);
  await invokeStartingMacro(actor);

  Hooks.call("createCharacter", actor);

  return actor;
};

/**
 * @param {PBActor} actor
 * @param {Object} characterData
 * @returns {Promise.<PBActor>}
 */
export const updateActorWithCharacter = async (actor, characterData) => {
  const data = characterToActorData(characterData);
  await actor.deleteEmbeddedDocuments("Item", [], {
    deleteAll: true,
    render: false,
  });

  const dataAndProto = {
    ...data,
    prototypeToken: {
      name: data.name,
      texture: {
        src: data.img,
      },
    },
  };

  await actor.update(dataAndProto);
  for (const token of actor.getActiveTokens()) {
    await token.document.update({
      img: actor.img,
      name: actor.name,
    });
  }

  Hooks.call("updateCharacter", actor);

  await invokeStartingMacro(actor);

  return actor;
};

/**
 * @param {PBActor} actor
 * @returns {Promise.<PBActor>}
 */
export const invokeStartingMacro = async (actor) => {
  // Guard against a failed actor creation upstream so we surface the real error
  // instead of a misleading "cannot read characterClass of undefined" cascade.
  if (!actor) {
    return actor;
  }
  const cls = actor.characterClass;
  if (cls) {
    await executeCompendiumMacro(cls.getData().startingMacro, {
      actor,
      item: cls,
    });
  }
  const baseClass = actor.characterBaseClass;
  if (baseClass) {
    await executeCompendiumMacro(baseClass.getData().startingMacro, {
      actor,
      item: baseClass,
    });
  }

  return actor;
};

/**
 * @param {String} formula
 * @param {String} bonus
 * @returns {Promise.<Number>}
 */
export const rollAbility = async (formula, bonus) => {
  const abilityRoll = await evaluateFormula(formula);
  const ability = abilityBonus(abilityRoll.total);
  const abilityWithBonus = bonus ? ability + parseInt(bonus, 10) : ability;
  return abilityWithBonus < -3 ? -3 : abilityWithBonus;
};

/**
 * @returns {Promise.<String>}
 */
export const rollName = async () => {
  const firstName = await drawTableText(...compendiumInfoFromString(PB.characterGenerator.firstNamesPack));
  const nickName = await drawTableText(...compendiumInfoFromString(PB.characterGenerator.nickNamesPack));
  const lastName = await drawTableText(...compendiumInfoFromString(PB.characterGenerator.lastNamesPack));
  return `${firstName} “${nickName}” ${lastName}`;
};

/**
 * @param {Object} data
 * @returns {Promise.<Object>}
 */
export const rollAbilities = async (data) => ({
  strength: await rollAbility(data.startingAbilityScoreFormula, data.startingStrengthBonus),
  agility: await rollAbility(data.startingAbilityScoreFormula, data.startingAgilityBonus),
  presence: await rollAbility(data.startingAbilityScoreFormula, data.startingPresenceBonus),
  toughness: await rollAbility(data.startingAbilityScoreFormula, data.startingToughnessBonus),
  spirit: await rollAbility(data.startingAbilityScoreFormula, data.startingSpiritBonus),
});

/**
 * @param {String} luckDie
 * @returns {Promise.<Number>}
 */
export const rollLuck = async (luckDie) => (await evaluateFormula(luckDie)).total;

/**
 * @param {String} startingHitPoints
 * @param {Number} toughness
 * @returns {Promise.<Number>}
 */
export const rollHitPoints = async (startingHitPoints, toughness) => {
  const roll = await evaluateFormula(startingHitPoints);
  const hp = roll.total + toughness;
  return hp <= 0 ? 1 : hp;
};

/**
 * @param {PBItem} background
 * @returns {Promise.<Number>}
 */
export const rollSilver = async (background) => (await evaluateFormula(background.startingGold)).total;

/**
 * @param {String} formula
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollArmor = async (formula) => {
  const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.armorsRollTable);
  return rollTableItems(compendium, table, formula);
};

/**
 * @param {String} formula
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollHat = async (formula) => {
  const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.hatsRollTable);
  return rollTableItems(compendium, table, formula);
};

/**
 * @param {String} formula
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollWeapon = async (formula) => {
  const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.weaponsRollTable);
  return rollTableItems(compendium, table, formula);
};

/**
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollBaseTables = async () => {
  let items = [];
  for (const compendiumTable of PB.characterGenerator.baseTables) {
    const [compendium, table, quantity = 1] = compendiumInfoFromString(compendiumTable);
    items = items.concat(await drawTableItems(compendium, table, quantity));
  }
  return items;
};

/**
 * @param {String} rollString
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollRollItems = async (rollString) => {
  const compendiumTables = rollString.split("\n").filter((item) => item);
  let results = [];
  for (const compendiumTable of compendiumTables) {
    const [compendium, table, quantity = 1] = compendiumInfoFromString(compendiumTable);
    results = results.concat(await drawTableItems(compendium, table, quantity));
  }
  return results;
};

/**
 * @param {Array.<PBItem>} items
 * @returns {Promise.<Array.<PBItem>>}
 */
export const findStartingBonusItems = async (items) => {
  let results = [];
  for (const feature of items) {
    if (feature?.startingBonusItems) {
      results = results.concat(await findItemsFromCompendiumString(feature.startingBonusItems));
    }
  }
  return results;
};

/**
 * @param {Array.<PBItem>} items
 * @returns {Promise.<Array.<PBItem>>}
 */
export const findStartingBonusRollsItems = async (items) => {
  let results = [];
  for (const feature of items) {
    if (feature?.startingBonusRolls) {
      results = results.concat(await rollRollItems(feature.startingBonusRolls));
    }
  }
  return results;
};

/**
 * @param {Actor} actor
 * @returns {Promise.<Array.<PBItem>>}
 */
export const handleActorGettingBetterItems = async (actor) => {
  const actorClass = actor.characterClass;
  const baseClass = actor.characterBaseClass;
  let items = [];
  if (actorClass.getData().gettingBetterRolls) {
    items = items.concat(await handleClassGettingBetterItems(actor, actorClass.getData().gettingBetterRolls));
  }
  if (baseClass && baseClass.getData().gettingBetterRolls) {
    items = items.concat(await handleClassGettingBetterItems(actor, baseClass.getData().gettingBetterRolls));
  }
  return items;
};

/**
 * @param {Actor} actor
 * @param {String} compendiumTable
 * @returns {Promise.<Array.<PBItem>>}
 */
export const handleClassGettingBetterItems = async (actor, compendiumTable) => {
  const items = await resolveGettingBetterItems(actor, compendiumTable);
  await updateOrCreateActorItems(actor, items);
  return items;
};

/**
 * Gains the class feature either by rolling (RAW) or by letting the player choose,
 * per the `getBetterFeatureMode` setting. Choosing falls back to a roll if the
 * player cancels or the table has no listable rows.
 *
 * @param {Actor} actor
 * @param {String} compendiumTable
 * @returns {Promise.<Array.<PBItem>>}
 */
const resolveGettingBetterItems = async (actor, compendiumTable) => {
  const [compendium, table] = compendiumInfoFromString(compendiumTable);
  const chosenValue = await chooseGettingBetterFeatureValue(actor, compendium, table);
  if (chosenValue != null) {
    const items = await resolveTablePath(compendium, table, chosenValue);
    if (items.length) {
      return items;
    }
  }
  return drawGettingBetterRollTable(actor, compendiumTable);
};

/**
 * @param {Actor} actor
 * @param {Array.<PBItem>} items
 */
const updateOrCreateActorItems = async (actor, items) => {
  // here we assume the first item is the "feature"
  const item = items[0];
  const actorItem = actor.items.find((i) => i.name === item?.name);
  if (actorItem) {
    const actorItemQuantity = actorItem ? actorItem.quantity || 1 : 0;
    await actorItem.updateData("quantity", actorItemQuantity + 1);
  } else {
    await actor.createEmbeddedDocuments(
      "Item",
      items.map((item) => item.toObject(false)),
    );
  }
};

/**
 * @param {Actor} actor
 * @param {String} compendiumTable
 * @returns {Promise.<Array.<PBItem>>}
 */
const drawGettingBetterRollTable = async (actor, compendiumTable) => {
  const [compendium, table] = compendiumInfoFromString(compendiumTable);
  let items = [];

  if (compendium && table) {
    const compendiumRollTable = await findCompendiumItem(compendium, table);
    const rollTable = compendiumRollTable.clone({ replacement: false });

    // draw until we found a valid item
    while (true) {
      const draw = await rollTable.draw({ displayChat: false });
      items = await findTableItems(draw.results);

      if (!items.length) {
        break;
      }

      const item = items[0];
      const actorItem = actor.items.find((i) => i.name === item.name);
      const noLimits = item.maxQuantity === 0;
      const actorItemQuantity = actorItem ? actorItem.quantity || 1 : 0;
      const itemMaxQuantity = item.maxQuantity || 1;

      if (noLimits || actorItemQuantity < itemMaxQuantity) {
        break;
      }
      draw.results.forEach((result) => {
        //V10
        if (result.drawn === false) {
          result.drawn = true;
        } else {
          result.data.drawn = true;
        }
      });
    }
  }
  return items;
};

/**
 * @param {PBItem} cls
 * @param {Array.<PBItem>} items
 * @returns {String}
 */
export const generateDescription = (cls, items) => {
  const thingOfImportance = items.find((item) => item.featureType === "Thing of Importance");
  const description = items
    .filter((item) => item.type === CONFIG.PB.itemTypes.feature || item.type === CONFIG.PB.itemTypes.background)
    .filter((item) => item.featureType !== "Thing of Importance")
    .map((item) => item.name)
    .concat([
      game.i18n.format("PB.YouOwn", {
        item: thingOfImportance.name,
      }),
    ])
    .join("...");

  const flavorText = cls.flavorText ? `<p>${cls.flavorText}</p>` : "";
  return `${flavorText}<p>${description}</p>`;
};

/**
 * @param {any} value
 * @returns {Boolean} True when `value` is a usable, finite numeric choice.
 */
const isNumericChoice = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));

/**
 * @param {any} value
 * @returns {Boolean} True when `value` is a usable table-row choice.
 */
const isRowChoice = (value) => value !== undefined && value !== null && value !== "";

/** The name of the ammo item that starting ranged weapons come with. */
const ROUNDS_OF_SHOT = "Rounds of shot";

/**
 * A starting ranged weapon (Flintlock/Musket, or the Buccaneer's musket) comes
 * with "10 + Presence rounds of shot" (rulebook pg. 51). The gear table grants a
 * flat 10 and the ammo item defaults to 20, so we normalise any starting Rounds
 * of shot to the Presence-scaled amount here.
 *
 * @param {Number} presence
 * @returns {Number}
 */
export const startingRoundsOfShotQuantity = (presence) => Math.max(0, 10 + Number(presence || 0));

/**
 * Sets every "Rounds of shot" stack among freshly generated starting items to
 * the Presence-scaled starting amount.
 *
 * @param {Array.<PBItem>} items
 * @param {Number} presence
 */
const applyStartingRoundsOfShot = (items, presence) => {
  const quantity = startingRoundsOfShotQuantity(presence);
  for (const item of items) {
    if (item?.name === ROUNDS_OF_SHOT) {
      item.getData().quantity = quantity;
    }
  }
};

/**
 * Rolls the base tables, honouring any manually chosen rows.
 *
 * @param {Object.<String, Number>} [choices] Map of "compendium;table" -> chosen roll value.
 * @returns {Promise.<Array.<PBItem>>}
 */
export const buildBaseTables = async (choices = {}) => {
  let items = [];
  for (const compendiumTable of PB.characterGenerator.baseTables) {
    const [compendium, table, quantity = 1] = compendiumInfoFromString(compendiumTable);
    const chosen = choices[compendiumTable];
    if (isRowChoice(chosen)) {
      items = items.concat(await resolveTablePath(compendium, table, chosen));
    } else {
      items = items.concat(await drawTableItems(compendium, table, quantity));
    }
  }
  return items;
};

/**
 * Resolves items from a class' newline-separated roll string, honouring any
 * manually chosen rows (aligned, in order, to `values`).
 *
 * @param {String} rollString
 * @param {Array.<Number>} [values]
 * @returns {Promise.<Array.<PBItem>>}
 */
export const buildRollItems = async (rollString, values = []) => {
  const lines = (rollString || "").split("\n").filter((item) => item);
  let results = [];
  let index = 0;
  for (const line of lines) {
    const [compendium, table, quantity = 1] = compendiumInfoFromString(line);
    for (let i = 0; i < Number(quantity); i++) {
      const chosen = values[index];
      index++;
      if (isRowChoice(chosen)) {
        results = results.concat(await resolveTablePath(compendium, table, chosen));
      } else {
        results = results.concat(await drawTableItem(compendium, table));
      }
    }
  }
  return results;
};

/**
 * Resolves a starting equipment slot (weapon/armor/hat) from a chosen row, or
 * rolls it randomly against the class formula when no choice is provided.
 *
 * @param {String} formula
 * @param {String} tableString "compendium;table"
 * @param {Number} [chosenValue]
 * @returns {Promise.<Array.<PBItem>>}
 */
const buildEquipment = async (formula, tableString, chosenValue) => {
  const [compendium, table] = compendiumInfoFromString(tableString);
  if (isRowChoice(chosenValue)) {
    return resolveTablePath(compendium, table, chosenValue);
  }
  if (!formula) {
    return [];
  }
  return rollTableItems(compendium, table, formula);
};

/**
 * Backwards-compatible random character roll.
 *
 * @param {PBItem} cls
 * @returns {Promise.<Object>}
 */
export const rollCharacterForClass = async (cls) => buildCharacter(cls);

/**
 * Builds character data for a class. When `choices` supplies a value for a
 * field it is used verbatim; otherwise that field is rolled randomly. This lets
 * the randomizer ("The Tavern") and the manual creator share a single assembly
 * path.
 *
 * @param {PBItem} cls
 * @param {Object} [choices]
 * @returns {Promise.<Object>}
 */
export const buildCharacter = async (cls, choices = {}) => {
  console.log(`Creating new ${cls.name}`);

  const name = choices.name ? choices.name : await rollName();

  // Each ability is used verbatim only when a value was chosen; otherwise it is
  // rolled with the class' bonus (so a blank field behaves like the Tavern and
  // reflects the class, rather than staying a literal 0).
  const abilityChoices = choices.abilities ?? {};
  const rollOrUseAbility = async (key, bonus) =>
    isNumericChoice(abilityChoices[key]) ? Number(abilityChoices[key]) : rollAbility(cls.startingAbilityScoreFormula, bonus);
  const abilities = {
    strength: await rollOrUseAbility("strength", cls.startingStrengthBonus),
    agility: await rollOrUseAbility("agility", cls.startingAgilityBonus),
    presence: await rollOrUseAbility("presence", cls.startingPresenceBonus),
    toughness: await rollOrUseAbility("toughness", cls.startingToughnessBonus),
    spirit: await rollOrUseAbility("spirit", cls.startingSpiritBonus),
  };

  const luck = isNumericChoice(choices.luck) ? Number(choices.luck) : await rollLuck(cls.luckDie);
  const hitPoints = isNumericChoice(choices.hitPoints) ? Number(choices.hitPoints) : await rollHitPoints(cls.startingHitPoints, abilities.toughness);
  const baseTables = await buildBaseTables(choices.baseTableValues || {});

  const background = baseTables.find((item) => item.type === CONFIG.PB.itemTypes.background);
  const features = baseTables.filter((item) => item.type === CONFIG.PB.itemTypes.feature);
  const hasRelic = baseTables.some((item) => item.invokableType === "Ancient Relic");

  const silver = isNumericChoice(choices.silver) ? Number(choices.silver) : await rollSilver(background);

  // Preserve the original behaviour: only roll armor when the class defines a
  // formula, and swap to "1d6" when the character rolled an Ancient Relic.
  const armorFormula = cls.startingArmorTableFormula ? (!hasRelic ? cls.startingArmorTableFormula : "1d6") : "";
  const armor = await buildEquipment(armorFormula, PB.characterGenerator.armorsRollTable, choices.armorValue);
  const hat = await buildEquipment(cls.startingHatTableFormula, PB.characterGenerator.hatsRollTable, choices.hatValue);
  const weapon = await buildEquipment(cls.startingWeaponTableFormula, PB.characterGenerator.weaponsRollTable, choices.weaponValue);

  const startingRollItems = await buildRollItems(cls.startingRolls, choices.startingRollValues || []);
  const startingItems = await findItemsFromCompendiumString(cls.startingItems);

  // Both of the rolls should loop until nothing is returning to have a kind of recursive configuration
  const startingBonusItems = await findStartingBonusItems([...(features || []), ...(startingItems || []), ...(startingRollItems || []), background]);

  const startingBonusRollItems = await findStartingBonusRollsItems([
    ...(features || []),
    ...(startingItems || []),
    ...(startingRollItems || []),
    ...(startingBonusItems || []),
    background,
  ]);

  const description = generateDescription(cls, baseTables);

  const powerUsesRoll = isNumericChoice(choices.powerUses)
    ? Number(choices.powerUses)
    : Math.max(0, (await evaluateFormula(`1d4 + ${abilities.spirit}`)).total);
  const extraResourceFormula = (cls.system.extraResourceFormula || "0").replace("@abilities.spirit.value", abilities.spirit);
  const extraResourceRoll = isNumericChoice(choices.extraResourceUses)
    ? Number(choices.extraResourceUses)
    : Math.max(0, (await evaluateFormula(extraResourceFormula)).total);

  const allDocs = [
    ...baseTables,
    ...(armor || []),
    ...(hat || []),
    ...(weapon || []),
    ...(startingRollItems || []),
    ...(startingItems || []),
    ...(startingBonusItems || []),
    ...(startingBonusRollItems || []),
    cls,
  ];

  // Starting ranged weapons ship with 10 + Presence rounds of shot (pg. 51).
  applyStartingRoundsOfShot(allDocs, abilities.presence);

  return {
    name,
    actorImg: cls.img,
    hitPoints,
    luck,
    ...abilities,
    items: allDocs,
    description,
    silver,
    powerUses: powerUsesRoll,
    extraResourceUses: extraResourceRoll,
  };
};

/**
 * @param {Object} characterData
 * @returns {Object}
 */
const characterToActorData = (characterData) => ({
  name: characterData.name,
  system: {
    abilities: {
      strength: { value: characterData.strength },
      agility: { value: characterData.agility },
      presence: { value: characterData.presence },
      toughness: { value: characterData.toughness },
      spirit: { value: characterData.spirit },
    },
    description: characterData.description,
    attributes: {
      hp: {
        max: characterData.hitPoints,
        value: characterData.hitPoints,
      },
      luck: {
        max: characterData.luck,
        value: characterData.luck,
      },
      rituals: {
        max: characterData.powerUses,
        value: characterData.powerUses,
      },
      extraResource: {
        max: characterData.extraResourceUses,
        value: characterData.extraResourceUses,
      },
      carryingModifier: {
        value: characterData.carryingModifier ?? 8,
      },
      combat: {
        attackModifier: 0,
        defenseModifier: 0,
        initiativeModifier: 0,
        damageModifier: 0,
        armorTierModifier: 0,
        speedModifier: 0,
        luckDieModifier: 0,
      },
    },
    silver: characterData.silver,
    baseClass: characterData.baseClass || "",
  },
  img: characterData.actorImg,
  items: characterData.items.map((i) => {
    if ([CONFIG.PB.itemTypes.weapon, CONFIG.PB.itemTypes.armor, CONFIG.PB.itemTypes.hat].includes(i.type)) {
      i.getData().equipped = true;
    }
    const itemData = { ...i.toObject(false), _id: null };
    normalizeItemEffectDurations(itemData);
    return itemData;
  }),
  token: {
    img: characterData.actorImg,
    name: characterData.name,
    actorLink: true,
    vision: true,
  },
  type: "character",
});

/**
 * @param {Number} rollTotal
 * @returns {Number}
 */
export const abilityBonus = (rollTotal) => {
  if (rollTotal <= 4) {
    return -3;
  }
  if (rollTotal <= 6) {
    return -2;
  }
  if (rollTotal <= 8) {
    return -1;
  }
  if (rollTotal <= 12) {
    return 0;
  }
  if (rollTotal <= 14) {
    return 1;
  }
  if (rollTotal <= 16) {
    return 2;
  }
  // 17 - 20+
  return 3;
};
