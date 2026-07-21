import { executeMacro } from "./macros.js";
import { getResultCollection, getResultText, getResultType } from "./utils.js";

/**
 * @param {String} compendiumString
 * @returns {Array.<String>}
 */
export const compendiumInfoFromString = (compendiumString) => compendiumString.split(";");

/**
 * Caches the (expensive) `pack.getDocuments()` call per compendium.
 *
 * Character generation resolves dozens of items across a handful of packs, and
 * every lookup used to re-load and re-instantiate the *entire* pack. Loading
 * each pack once and reusing the result turns that O(lookups × packSize) work
 * into a single load per pack, which is what made "The Tavern" appear to freeze.
 *
 * @type {Map.<String, Promise.<Document[]>>}
 */
const compendiumDocumentsCache = new Map();

/**
 * Loads (and caches) every document for a compendium.
 *
 * @param {String} compendiumName
 * @returns {Promise.<Document[]|undefined>}
 */
export const loadCompendiumDocuments = async (compendiumName) => {
  const compendium = game.packs.get(compendiumName);
  if (!compendium) {
    console.warn(`loadCompendiumDocuments: Could not find compendium (${compendiumName})`);
    return undefined;
  }
  if (!compendiumDocumentsCache.has(compendiumName)) {
    // Store the promise (not the resolved value) so concurrent callers share a single load.
    compendiumDocumentsCache.set(compendiumName, compendium.getDocuments());
  }
  return compendiumDocumentsCache.get(compendiumName);
};

/**
 * Clears the cached compendium documents. Called whenever pack contents change
 * so we never hand out stale data.
 *
 * @param {String} [compendiumName] When omitted, clears every cached pack.
 */
export const clearCompendiumDocumentsCache = (compendiumName) => {
  if (compendiumName) {
    compendiumDocumentsCache.delete(compendiumName);
  } else {
    compendiumDocumentsCache.clear();
  }
};

/**
 * @param {String} compendiumName
 * @param {String} itemName
 * @returns {Promise.<PBItem|RollTable|undefined>}
 */
export const findCompendiumItem = async (compendiumName, itemName) => {
  const documents = await loadCompendiumDocuments(compendiumName);
  if (!documents) {
    return undefined;
  }
  const item = documents.find((i) => i.name === itemName);
  if (!item) {
    console.warn(`findCompendiumItem: Could not find item (${itemName}) in compendium (${compendiumName})`);
    return undefined;
  }
  // Return a fresh in-memory clone so callers that mutate the result (e.g. table
  // description/quantity overrides in findTableItems) never corrupt the cache.
  return item.clone();
};

/**
 * @param {String} compendiumName
 * @param {String} tableName
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawTable = async (compendiumName, tableName, options = {}) => {
  const table = await findCompendiumItem(compendiumName, tableName);
  if (!table) {
    throw new Error(`drawTable: Could not resolve roll table "${tableName}" from compendium "${compendiumName}"`);
  }
  return table.draw({ displayChat: false, ...options });
};

/**
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<String>}
 */
export const drawTableText = async (compendium, table) => {
  const result = (await drawTable(compendium, table)).results?.[0];
  if (!result) {
    return "";
  }

  if (game.release.generation >= 13) {
    return result.description;
  }
  return result.getChatText();
};

/**
 * @param {String} compendium
 * @param {String} table
 * @returns {Promise.<PBItem[]>}
 */
export const drawTableItem = async (compendium, table) => {
  const draw = await drawTable(compendium, table);
  return findTableItems(draw.results);
};

/**
 * @param {String} compendium
 * @param {String} table
 * @param {Number} amount
 * @returns {Promise.<Array.<PBItem>>}
 */
export const drawTableItems = async (compendium, table, amount) => {
  let results = [];
  for (let i = 0; i < amount; i++) {
    results = results.concat(await drawTableItem(compendium, table));
  }
  return results;
};

/**
 * @param {String} compendium
 * @param {String} table
 * @param {String} formula
 * @returns {Promise.<RollTableDraw>}
 */
export const rollTable = async (compendium, table, formula) => {
  const rollTable = await findCompendiumItem(compendium, table);
  if (!rollTable) {
    throw new Error(`rollTable: Could not resolve roll table "${table}" from compendium "${compendium}"`);
  }
  return rollTable.roll({ roll: new Roll(formula) });
};

/**
 * @param {String} compendium
 * @param {String} table
 * @param {String} formula
 * @returns {Promise.<Array.<PBItem>>}
 */
export const rollTableItems = async (compendium, table, formula) => {
  const draw = await rollTable(compendium, table, formula);
  return findTableItems(draw.results);
};

/**
 * Lists the distinct rows of a roll table, for use in manual selection menus.
 * Each row is keyed by the low end of its range (the value that would need to be
 * rolled to select it) and labelled with the row's primary result.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @returns {Promise.<Array.<{value: Number, low: Number, high: Number, label: String}>>}
 */
export const getTableRows = async (compendium, tableName) => {
  const table = await findCompendiumItem(compendium, tableName);
  if (!table || !table.results) {
    return [];
  }
  const rowsByLow = new Map();
  for (const result of table.results) {
    const [low = 0, high = low] = result.range || [];
    if (!rowsByLow.has(low)) {
      rowsByLow.set(low, { value: low, low, high });
    }
    const row = rowsByLow.get(low);
    row.high = Math.max(row.high, high);
    const text = getResultText(result);
    if (getResultType(result) === CONST.TABLE_RESULT_TYPES.TEXT) {
      row.textLabel = row.textLabel || text;
    } else {
      row.itemLabel = row.itemLabel || text;
    }
  }
  return [...rowsByLow.values()]
    .map(({ value, low, high, itemLabel, textLabel }) => ({
      value,
      low,
      high,
      label: itemLabel || textLabel || `${low}`,
    }))
    .sort((a, b) => a.low - b.low);
};

/**
 * Resolves the items produced by a specific row of a roll table, exactly as a
 * random draw landing on `value` would. Used by manual character creation to
 * reuse the same resolution as the randomizer.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @param {Number} value
 * @returns {Promise.<Array.<PBItem>>}
 */
export const resolveTableRow = async (compendium, tableName, value) => {
  const table = await findCompendiumItem(compendium, tableName);
  if (!table || !table.results) {
    return [];
  }
  const results = table.results.filter((result) => {
    const [low = 0, high = low] = result.range || [];
    return value >= low && value <= high;
  });
  return findTableItems(results);
};

/**
 @param {String} compendiumString
 * @returns {Promise.<PBItem[]>}
 */
export const findItemsFromCompendiumString = async (compendiumString) => {
  const compendiumsItems = compendiumString.split("\n").filter((item) => item);
  const results = [];
  for (const compendiumsItem of compendiumsItems) {
    const [compendium, table] = compendiumInfoFromString(compendiumsItem);
    const item = await findCompendiumItem(compendium, table);
    if (item) {
      results.push(item);
    }
  }
  return results;
};

/**
 * @param {TableResult[]} results
 * @returns {Promise.<PBItem[]>}
 */
export const findTableItems = async (results) => {
  const items = [];
  let item = null;
  const textEditor = game.release.generation >= 13 ? foundry.applications.ux.TextEditor.implementation : TextEditor;
  const textType = CONST.TABLE_RESULT_TYPES?.TEXT;
  const documentType = CONST.TABLE_RESULT_TYPES?.DOCUMENT;
  const compendiumType = CONST.TABLE_RESULT_TYPES?.COMPENDIUM;
  const isTextResult = (type) => type === "text" || (textType !== undefined && type === textType);
  const isCompendiumResult = (type) =>
    type === "pack" ||
    type === "document" ||
    (documentType !== undefined && type === documentType) ||
    (compendiumType !== undefined && type === compendiumType);

  for (const result of results) {
    // Read from `_source` to avoid the deprecated `documentCollection`/`documentId`
    // getters on V13/V14 (removed in V15), which crash when `documentUuid` is null.
    const source = result?._source ?? {};
    const data = result?.toObject?.() ?? {};
    const type = getResultType(result);
    if (isCompendiumResult(type)) {
      item = null;
      const documentUuid = source.documentUuid ?? data.documentUuid;
      const documentCollection = source.documentCollection ?? data.documentCollection;
      const documentId = source.documentId ?? data.documentId;

      if (documentUuid) {
        item = await fromUuid(documentUuid);
      } else if (documentCollection && documentId) {
        item = await game.packs.get(documentCollection)?.getDocument(documentId);
      }

      if (!item) {
        const fallbackName = source.name ?? data.name ?? source.text ?? data.text ?? source.description ?? data.description ?? getResultText(result);
        item = await findCompendiumItem(getResultCollection(result), fallbackName);
      }

      if (item) {
        items.push(item);
      }
    } else if (isTextResult(type) && item) {
      const resultText = getResultText(result);
      const [property, value] = resultText.split(": ");
      if (!property || value === undefined) continue;

      const enrichHtml = await textEditor.enrichHTML(value, {
        rollData: {},
      });
      if (property === "description") {
        item.getData().description = enrichHtml;
      } else if (property === "quantity") {
        item.getData().quantity = parseInt($(`<span>${enrichHtml}</span>`).text().trim(), 10);
      }
    }
  }
  return items;
};

/**
 * @param {String} compendiumMacro
 * @param {Object} parameters
 */
export const executeCompendiumMacro = async (compendiumMacro, parameters = {}) => {
  const [compendium, macroName] = compendiumInfoFromString(compendiumMacro || "");
  if (compendium && macroName) {
    const macro = await findCompendiumItem(compendium, macroName);
    await executeMacro(macro, parameters);
  }
};

/**
 * @returns {Array.<String>}
 */
export const findClassPacks = () => [...game.packs.keys()].filter((pack) => pack.lastIndexOf(".class-") > 0);

/**
 * @param {String} compendiumName
 * @returns {Promise.<PBItem>}
 */
export const classItemFromPack = async (compendiumName) => {
  /** @type {Item[]} */
  const documents = await loadCompendiumDocuments(compendiumName);
  const cls = documents?.find((i) => i.type === "class");
  // Clone so callers/macros that mutate the class (e.g. renaming for a base
  // class) never corrupt the shared cached instance.
  return cls ? cls.clone() : undefined;
};

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawMysticalMishaps = async (options = {}) => drawTable("pirateborg.rolls-gamemaster", "Mystical Mishaps", options);

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawDerelictTakesDamage = async (options = {}) => drawTable("pirateborg.rolls-ships", "Derelict Takes Damage", options);

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawBroken = async (options = {}) => drawTable("pirateborg.rolls-gamemaster", "Broken", options);

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawReaction = async (options = {}) => drawTable("pirateborg.rolls-gamemaster", "Reaction", options);

/**
 * @returns {Promise.<String>}
 */
export const drawGunpowderFumble = async () => drawTableText("pirateborg.rolls-gamemaster", "Fumble a gunpowder weapons");

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawRelic = async (options = {}) => drawTable("pirateborg.rolls-character-creation", "d20 Ancient relics", options);

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawRitual = async (options = {}) => drawTable("pirateborg.rolls-character-creation", "d20 Arcane rituals", options);

/**
 * @param {Object} options
 * @returns {Promise.<RollTableDraw>}
 */
export const drawWeapon = async (options = {}) => drawTable("pirateborg.rolls-character-creation", "d10 Starting weapons", options);

export const drawDeckOfCards = async (options = {}) => drawTable("pirateborg.rolls-rapscallion", "Deck of Cards", options);

export const drawJokerTable = async (options = {}) => drawTable("pirateborg.rolls-rapscallion", "Joker Table", options);
