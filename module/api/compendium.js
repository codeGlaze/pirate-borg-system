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
 * Clones a cached compendium document so callers can safely mutate it (table
 * description/quantity overrides, base-class renaming, ...) without corrupting
 * the shared cache — while preserving the source's compendium uuid.
 *
 * A bare `clone()` loses its uuid, which makes `item.link` enrich to a broken
 * content-link (the pills seen in get-better / loot chat cards). Re-pointing the
 * clone's uuid at its source keeps `.link` / `.uuid` resolving to the real pack
 * entry.
 *
 * @param {Document} document
 * @returns {Document}
 */
const cloneWithSourceUuid = (document) => {
  const clone = document.clone();
  Object.defineProperty(clone, "uuid", { value: document.uuid, configurable: true });
  return clone;
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
  return cloneWithSourceUuid(item);
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
 * True when a table result points at another RollTable (a nested sub-table),
 * rather than an Item — e.g. the "d10 Pets" row inside "d12 Cheap gear".
 *
 * @param {TableResult} result
 * @returns {Boolean}
 */
const isSubTableResult = (result) => {
  if (getResultType(result) === CONST.TABLE_RESULT_TYPES.TEXT) {
    return false;
  }
  const collection = getResultCollection(result);
  return game.packs.get(collection)?.documentName === "RollTable";
};

/**
 * Collapses a table's results into one entry per distinct row (keyed by the low
 * end of its range), recording the row's label and, when the row points at a
 * nested sub-table, the coordinates of that sub-table.
 *
 * @param {RollTable} table
 * @returns {Array.<{low: Number, high: Number, itemLabel: ?String, textLabel: ?String, subCompendium: ?String, subTable: ?String}>}
 */
const distinctTableRows = (table) => {
  const rowsByLow = new Map();
  for (const result of table.results) {
    const [low = 0, high = low] = result.range || [];
    if (!rowsByLow.has(low)) {
      rowsByLow.set(low, { low, high, itemLabel: null, textLabel: null, subCompendium: null, subTable: null });
    }
    const row = rowsByLow.get(low);
    row.high = Math.max(row.high, high);
    const text = getResultText(result);
    if (getResultType(result) === CONST.TABLE_RESULT_TYPES.TEXT) {
      row.textLabel = row.textLabel || text;
    } else {
      row.itemLabel = row.itemLabel || text;
      if (!row.subTable && isSubTableResult(result)) {
        row.subCompendium = getResultCollection(result);
        row.subTable = text;
      }
    }
  }
  return [...rowsByLow.values()].sort((a, b) => a.low - b.low);
};

/**
 * Lists the selectable rows of a roll table for manual selection menus. Each row
 * is labelled with its primary result and carries a `value` that identifies it.
 *
 * Nested sub-tables (a row that points at another table, e.g. "d10 Pets" or the
 * "Marlinspike or Belaying Pin" weapon choice) are flattened inline: the parent
 * row becomes a "… (random)" entry plus one indented entry per leaf, so a player
 * can pick the *exact* result (e.g. that specific parrot) instead of only being
 * able to roll it randomly. A leaf's `value` is a ">"-separated path of row
 * values (e.g. "12>3") that {@link resolveTablePath} walks back down.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @param {Object} [options]
 * @param {Number} [options.depth] Current recursion depth (internal).
 * @param {String} [options.prefix] Accumulated path prefix (internal).
 * @param {String} [options.indent] Accumulated label indent (internal).
 * @returns {Promise.<Array.<{value: String, low: Number, high: Number, label: String}>>}
 */
export const getTableRows = async (compendium, tableName, { depth = 0, prefix = "", indent = "" } = {}) => {
  const table = await findCompendiumItem(compendium, tableName);
  if (!table || !table.results) {
    return [];
  }
  const rows = [];
  for (const row of distinctTableRows(table)) {
    const baseLabel = row.itemLabel || row.textLabel || `${row.low}`;
    const value = prefix ? `${prefix}>${row.low}` : `${row.low}`;
    // Guard the recursion so malformed self-referential data can never loop.
    if (row.subTable && depth < 4) {
      rows.push({ value, low: row.low, high: row.high, label: `${indent}${baseLabel} (random)` });
      const children = await getTableRows(row.subCompendium, row.subTable, {
        depth: depth + 1,
        prefix: value,
        indent: `${indent}\u00A0\u00A0↳ `,
      });
      rows.push(...children);
    } else {
      rows.push({ value, low: row.low, high: row.high, label: `${indent}${baseLabel}` });
    }
  }
  return rows;
};

/**
 * Finds the nested sub-table that a given row of a table points at, if any.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @param {Number} value
 * @returns {Promise.<{compendium: String, table: String}|null>}
 */
const getRowSubTable = async (compendium, tableName, value) => {
  const table = await findCompendiumItem(compendium, tableName);
  if (!table || !table.results) {
    return null;
  }
  for (const result of table.results) {
    const [low = 0, high = low] = result.range || [];
    if (value >= low && value <= high && isSubTableResult(result)) {
      return { compendium: getResultCollection(result), table: getResultText(result) };
    }
  }
  return null;
};

/**
 * Resolves the items produced by a specific row of a roll table, exactly as a
 * random draw landing on `value` would.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @param {Number} value
 * @returns {Promise.<Array.<PBItem>>}
 */
export const resolveTableRow = async (compendium, tableName, value) => {
  const table = await findCompendiumItem(compendium, tableName);
  if (!table) {
    return [];
  }
  // Force the roll to `value` so the exact same resolution path as a random draw
  // runs: nested sub-tables (e.g. "d10 Pets", "d10 Instruments") recurse into
  // their leaf items instead of leaking the sub-table RollTable document as a
  // bogus item (which fails PBActor validation with "type may not be undefined").
  const draw = await table.roll({ roll: new Roll(String(value)) });
  return findTableItems(draw.results);
};

/**
 * Resolves a manual table selection expressed as a ">"-separated path of row
 * values produced by {@link getTableRows}. A plain "12" resolves row 12
 * directly (rolling any nested sub-table randomly); "12>3" descends into the
 * sub-table that row 12 points at and resolves *its* row 3 — letting a player
 * pick a specific leaf (that parrot) rather than a random one.
 *
 * @param {String} compendium
 * @param {String} tableName
 * @param {String|Number} path
 * @returns {Promise.<Array.<PBItem>>}
 */
export const resolveTablePath = async (compendium, tableName, path) => {
  const steps = String(path)
    .split(">")
    .map((step) => step.trim())
    .filter((step) => step !== "");
  if (!steps.length) {
    return [];
  }
  let currentCompendium = compendium;
  let currentTable = tableName;
  for (let i = 0; i < steps.length - 1; i++) {
    const sub = await getRowSubTable(currentCompendium, currentTable, Number(steps[i]));
    if (!sub) {
      // Path drifted from the current data (table changed); resolve what we can.
      return resolveTableRow(currentCompendium, currentTable, Number(steps[i]));
    }
    currentCompendium = sub.compendium;
    currentTable = sub.table;
  }
  return resolveTableRow(currentCompendium, currentTable, Number(steps[steps.length - 1]));
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
    // Skip missing references (renamed/absent packs) rather than leaking an
    // `undefined` into the results, which downstream code would dereference.
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

      if (documentUuid) {
        item = await fromUuid(documentUuid);
      } else if (source.documentCollection && source.documentId) {
        // v12 fallback: read the deprecated fields from raw `_source` only. Touching
        // them via the data model's getters (data.*) logs a V13 deprecation each draw.
        item = await game.packs.get(source.documentCollection)?.getDocument(source.documentId);
      }

      if (!item) {
        const fallbackName = source.name ?? data.name ?? source.text ?? data.text ?? source.description ?? data.description ?? getResultText(result);
        item = await findCompendiumItem(getResultCollection(result), fallbackName);
      }

      if (item) {
        items.push(item);
      }
    } else if (isTextResult(type) && item) {
      // A TEXT result that follows a document result carries an override, e.g.
      // "quantity: 10" or "description: ...". Read it through getResultText so the
      // v12 `text` / v13 `description` field difference is handled in one place.
      const resultText = getResultText(result) ?? "";
      const [property, value] = resultText.split(": ");
      if (!property || value === undefined) continue;

      const enrichHtml = await textEditor.enrichHTML(value, {
        rollData: {},
      });
      if (property === "description") {
        item.getData().description = enrichHtml;
      } else if (property === "quantity") {
        const quantity = parseInt($(`<span>${enrichHtml}</span>`).text().trim(), 10);
        // Only apply a real number — never overwrite the item's own quantity with
        // NaN, which the data model would store as null and render as "(null)".
        if (Number.isFinite(quantity)) {
          item.getData().quantity = quantity;
        }
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
  // Clone (cache-safe, uuid-preserving) so callers/macros that mutate the class
  // (e.g. renaming for a base class) never corrupt the shared cached instance,
  // while `.link` / `.uuid` still resolve to the source pack entry.
  return cls ? cloneWithSourceUuid(cls) : undefined;
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
