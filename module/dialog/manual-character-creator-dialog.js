import { isCharacterGeneratorClassAllowed } from "../system/settings.js";
import { buildCharacter, createActorWithCharacter, updateActorWithCharacter } from "../api/generator/character-generator.js";
import { buildHybridCharacter, getBaseClassItems, isHybridClass } from "../api/generator/hybrid-character-generator.js";
import { classItemFromPack, compendiumInfoFromString, findClassPacks, getTableRows } from "../api/compendium.js";
import { PB } from "../config.js";

const HAUNTED_SOUL_MACRO_PACK = "pirateborg.macros-haunted-soul";
const TALL_TALE_MACRO_PACK = "pirateborg.macros-tall-tale";
const TALL_TALE_ROLL_PACK = "pirateborg.rolls-tall-tale";
const HAUNTED_SOUL_ROLL_PACK = "pirateborg.rolls-haunted-soul";

/**
 * A manual counterpart to "The Tavern" (the randomized character generator).
 *
 * Instead of rolling everything, the player picks a class and then chooses the
 * exact entry from each built-in table (background, gear, weapon, armor, hat,
 * class features, ...) and types their ability scores. Any field left on
 * "Random" is rolled, so the same dialog also works as a partial randomizer.
 *
 * Overlay classes (Haunted Soul, Tall Tale) are supported too: they add a base
 * class picker (and, for Tall Tale, a sub-type / mutant / animal picker) whose
 * base character uses the normal manual fields. Under the hood everything is fed
 * through the same builders the randomizer uses, so a manually built actor is
 * identical to a rolled one.
 */
class ManualCharacterCreatorDialog extends Application {
  constructor(actor = null, options = {}) {
    super(options);
    this.actor = actor;
    this.classPacks = findClassPacks();
    this.selection = {
      classPack: null,
      name: "",
      abilities: { strength: 0, agility: 0, presence: 0, toughness: 0, spirit: 0 },
      hitPoints: "",
      luck: "",
      silver: "",
      tableValues: {},
      hybrid: {},
    };
  }

  /** @override */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "manual-character-creator-dialog";
    options.classes = ["pirateborg"];
    options.title = game.i18n.localize("PB.ManualCharacterCreator");
    options.template = "systems/pirateborg/templates/dialog/manual-character-creator-dialog.html";
    options.width = 480;
    options.height = "auto";
    options.resizable = true;
    return options;
  }

  /** @override */
  async getData(options = {}) {
    const classes = await this.getManualClasses();
    const selectedPack = classes.some((cls) => cls.pack === this.selection.classPack) ? this.selection.classPack : classes[0]?.pack;
    this.selection.classPack = selectedPack;
    const selectedEntry = classes.find((cls) => cls.pack === selectedPack);
    const cls = selectedEntry?.item;

    const abilityKeys = ["strength", "agility", "presence", "toughness", "spirit"];
    const hybrid = cls && isHybridClass(cls) ? await this.getHybridContext(cls) : null;
    const effectiveClass = hybrid ? hybrid.effectiveClass : cls;
    const effectivePack = hybrid ? hybrid.effectivePack : selectedPack;

    return foundry.utils.mergeObject(super.getData(options), {
      forActor: this.actor !== undefined && this.actor !== null,
      hasClasses: classes.length > 0,
      classes: classes.map((entry) => ({ name: entry.name, pack: entry.pack, selected: entry.pack === selectedPack })),
      hybridSelects: hybrid ? hybrid.selects : [],
      name: this.selection.name,
      abilities: abilityKeys.map((key) => ({
        key,
        label: game.i18n.localize(`PB.Ability${key.charAt(0).toUpperCase()}${key.slice(1)}`),
        value: this.selection.abilities[key] ?? 0,
      })),
      hitPoints: this.selection.hitPoints,
      luck: this.selection.luck,
      silver: this.selection.silver,
      tableGroups: effectiveClass ? await this.getTableGroups(effectiveClass, effectivePack) : [],
    });
  }

  /**
   * @returns {Promise.<Array.<{name: String, pack: String, item: PBItem}>>}
   */
  async getManualClasses() {
    const classes = [];
    for (const pack of this.classPacks) {
      if (!isCharacterGeneratorClassAllowed(pack)) {
        continue;
      }
      const cls = await classItemFromPack(pack);
      if (!cls) {
        continue;
      }
      // Standard classes, plus supported overlay classes (Haunted Soul, Tall Tale).
      const isStandard = !cls.requireBaseClass && !cls.characterGeneratorMacro;
      if (!isStandard && !isHybridClass(cls)) {
        continue;
      }
      classes.push({ name: cls.name, pack, item: cls });
    }
    return classes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Builds the overlay-specific selectors (base class, sub-type, ailment/mutant/
   * animal) and determines which class' standard tables to show.
   *
   * @param {PBItem} cls
   * @returns {Promise.<{type: String, selects: Array, effectiveClass: ?PBItem, effectivePack: ?String}>}
   */
  async getHybridContext(cls) {
    const [macroPack] = compendiumInfoFromString(cls.characterGeneratorMacro);
    const selects = [];

    const baseClassItems = await getBaseClassItems();
    // Key each base class by uuid when available, else name (clones have no uuid).
    const baseOptions = baseClassItems.map((item) => ({ pack: this._baseClassKey(item), name: item.name }));
    const selectedBaseKey = baseOptions.some((o) => o.pack === this.selection.hybrid.baseClassPack)
      ? this.selection.hybrid.baseClassPack
      : baseOptions[0]?.pack;

    const buildBaseClassSelect = () =>
      selects.push({
        hkey: "baseClassPack",
        label: game.i18n.localize("PB.ManualCharacterBaseClass"),
        rerender: true,
        includeRandom: false,
        options: baseOptions.map((o) => ({ value: o.pack, label: o.name, selected: o.pack === selectedBaseKey })),
      });

    const selectedBaseItem = baseClassItems.find((item) => this._baseClassKey(item) === selectedBaseKey) ?? baseClassItems[0];

    if (macroPack === HAUNTED_SOUL_MACRO_PACK) {
      buildBaseClassSelect();
      const [ailmentPack, ailmentTable] = compendiumInfoFromString(cls.startingRolls || `${HAUNTED_SOUL_ROLL_PACK};Ailments`);
      await this._pushTableSelect(selects, "ailmentValue", game.i18n.localize("PB.ManualCharacterAilment"), ailmentPack, ailmentTable, true);
      return { type: "haunted-soul", selects, effectiveClass: selectedBaseItem, effectivePack: selectedBaseKey };
    }

    if (macroPack === TALL_TALE_MACRO_PACK) {
      const subTypeRows = await getTableRows(TALL_TALE_ROLL_PACK, "Tall Tale");
      const selectedSubType = subTypeRows.some((r) => String(r.value) === String(this.selection.hybrid.tallTaleValue))
        ? this.selection.hybrid.tallTaleValue
        : subTypeRows[0]?.value;
      selects.push({
        hkey: "tallTaleValue",
        label: game.i18n.localize("PB.ManualCharacterTallTaleType"),
        rerender: true,
        includeRandom: false,
        options: subTypeRows.map((r) => ({ value: r.value, label: r.label, selected: String(r.value) === String(selectedSubType) })),
      });
      const subTypeName = subTypeRows.find((r) => String(r.value) === String(selectedSubType))?.label;

      if (subTypeName === "Sentient Animal") {
        await this._pushTableSelect(selects, "animalValue", game.i18n.localize("PB.ManualCharacterAnimal"), TALL_TALE_ROLL_PACK, "Sentient Animal", true);
        // Sentient Animal re-stats the Tall Tale class itself (no base class).
        return { type: "tall-tale", selects, effectiveClass: cls, effectivePack: this.selection.classPack };
      }

      buildBaseClassSelect();
      if (subTypeName === "Aquatic Mutant") {
        await this._pushTableSelect(selects, "mutantValue", game.i18n.localize("PB.ManualCharacterMutant"), TALL_TALE_ROLL_PACK, "Aquatic Mutant", true);
      }
      return { type: "tall-tale", selects, effectiveClass: selectedBaseItem, effectivePack: selectedBaseKey };
    }

    return { type: null, selects, effectiveClass: cls, effectivePack: this.selection.classPack };
  }

  /**
   * @param {PBItem} item
   * @returns {String} A stable key identifying a base class item.
   */
  _baseClassKey(item) {
    return item.uuid ?? item.name;
  }

  /**
   * Pushes a table-backed selector onto the hybrid selects list.
   *
   * @param {Array} selects
   * @param {String} hkey
   * @param {String} label
   * @param {String} compendium
   * @param {String} table
   * @param {Boolean} includeRandom
   */
  async _pushTableSelect(selects, hkey, label, compendium, table, includeRandom) {
    const rows = await getTableRows(compendium, table);
    const current = this.selection.hybrid[hkey];
    selects.push({
      hkey,
      label,
      rerender: false,
      includeRandom,
      options: rows.map((row) => ({ value: row.value, label: row.label, selected: String(row.value) === String(current) })),
    });
  }

  /**
   * Builds the selectable table dropdowns for a class.
   *
   * @param {PBItem} cls
   * @param {String} classPack
   * @returns {Promise.<Array.<Object>>}
   */
  async getTableGroups(cls, classPack) {
    const groups = [];

    const baseFields = [];
    for (const compendiumTable of PB.characterGenerator.baseTables) {
      const [compendium, table] = compendiumInfoFromString(compendiumTable);
      baseFields.push(await this.buildField("base", compendiumTable, this.tableLabel(table), compendium, table));
    }
    groups.push({ title: game.i18n.localize("PB.ManualCharacterBackgroundAndGear"), fields: baseFields });

    const equipmentFields = [];
    if (cls.startingWeaponTableFormula) {
      const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.weaponsRollTable);
      equipmentFields.push(await this.buildField("weapon", "weapon", game.i18n.localize("PB.ManualCharacterWeapon"), compendium, table));
    }
    if (cls.startingArmorTableFormula) {
      const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.armorsRollTable);
      equipmentFields.push(await this.buildField("armor", "armor", game.i18n.localize("PB.ManualCharacterArmor"), compendium, table));
    }
    if (cls.startingHatTableFormula) {
      const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.hatsRollTable);
      equipmentFields.push(await this.buildField("hat", "hat", game.i18n.localize("PB.ManualCharacterHat"), compendium, table));
    }
    if (equipmentFields.length) {
      groups.push({ title: game.i18n.localize("PB.ManualCharacterStartingEquipment"), fields: equipmentFields });
    }

    const rollFields = [];
    const rollLines = (cls.startingRolls || "").split("\n").filter((line) => line);
    let index = 0;
    for (const line of rollLines) {
      const [compendium, table, quantity = 1] = compendiumInfoFromString(line);
      for (let i = 0; i < Number(quantity); i++) {
        rollFields.push(await this.buildField("startingRoll", `roll:${classPack}:${index}`, this.tableLabel(table), compendium, table, index));
        index++;
      }
    }
    if (rollFields.length) {
      groups.push({ title: game.i18n.localize("PB.ManualCharacterClassRolls"), fields: rollFields });
    }

    return groups;
  }

  /**
   * @param {String} kind One of base|weapon|armor|hat|startingRoll.
   * @param {String} key Stable key used to remember the selection.
   * @param {String} label
   * @param {String} compendium
   * @param {String} table
   * @param {Number} [index] Slot index for startingRoll fields.
   * @returns {Promise.<Object>}
   */
  async buildField(kind, key, label, compendium, table, index) {
    const rows = await getTableRows(compendium, table);
    const selectedValue = this.selection.tableValues[key];
    return {
      kind,
      key,
      label,
      table: `${compendium};${table}`,
      index: index ?? "",
      rows: rows.map((row) => ({
        value: row.value,
        label: row.label,
        selected: String(row.value) === String(selectedValue),
      })),
    };
  }

  /**
   * Turns a raw table name into a menu label ("d100 Backgrounds" -> "Backgrounds").
   *
   * @param {String} table
   * @returns {String}
   */
  tableLabel(table) {
    return table.replace(/^d\d+\s+/i, "").replace(/^\w/, (c) => c.toUpperCase());
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".class-select").on("change", this._onRerenderChange.bind(this));
    html.find(".hybrid-select.hybrid-rerender").on("change", this._onRerenderChange.bind(this));
    html.find(".cancel-button").on("click", this._onCancel.bind(this));
    html.find(".create-button").on("click", this._onCreate.bind(this));
  }

  /**
   * Reads the current form values into `this.selection` so they survive a re-render.
   *
   * @param {HTMLElement} form
   */
  _syncSelection(form) {
    const $form = $(form);
    this.selection.classPack = $form.find(".class-select").val() || this.selection.classPack;
    this.selection.name = $form.find(".name-input").val() ?? "";
    for (const key of ["strength", "agility", "presence", "toughness", "spirit"]) {
      this.selection.abilities[key] = $form.find(`.ability-input[data-ability="${key}"]`).val() ?? 0;
    }
    this.selection.hitPoints = $form.find(".hp-input").val() ?? "";
    this.selection.luck = $form.find(".luck-input").val() ?? "";
    this.selection.silver = $form.find(".silver-input").val() ?? "";
    $form.find(".table-select").each((_i, el) => {
      this.selection.tableValues[el.dataset.key] = el.value;
    });
    $form.find(".hybrid-select").each((_i, el) => {
      this.selection.hybrid[el.dataset.hkey] = el.value;
    });
  }

  async _onRerenderChange(event) {
    event.preventDefault();
    const form = $(event.currentTarget).closest(".manual-character-creator-dialog")[0];
    this._syncSelection(form);
    this.render(false);
  }

  async _onCancel(event) {
    event.preventDefault();
    await this.close();
  }

  /**
   * Assembles the base-character choices object shared by normal and hybrid builds.
   *
   * @param {HTMLElement} form
   * @returns {Object}
   */
  _collectBaseChoices(form) {
    const choices = {
      name: (this.selection.name || "").trim(),
      abilities: this.selection.abilities,
      hitPoints: this.selection.hitPoints,
      luck: this.selection.luck,
      silver: this.selection.silver,
      baseTableValues: {},
      startingRollValues: [],
    };
    $(form)
      .find(".table-select")
      .each((_i, el) => {
        const { kind, table, index } = el.dataset;
        const value = el.value;
        if (value === "" || value === undefined || value === null) {
          return; // leave as random
        }
        if (kind === "base") {
          choices.baseTableValues[table] = value;
        } else if (kind === "weapon") {
          choices.weaponValue = value;
        } else if (kind === "armor") {
          choices.armorValue = value;
        } else if (kind === "hat") {
          choices.hatValue = value;
        } else if (kind === "startingRoll") {
          choices.startingRollValues[Number(index)] = value;
        }
      });
    return choices;
  }

  async _onCreate(event) {
    event.preventDefault();
    const form = $(event.currentTarget).closest(".manual-character-creator-dialog")[0];
    this._syncSelection(form);

    const cls = await classItemFromPack(this.selection.classPack);
    if (!cls) {
      ui.notifications.error(game.i18n.localize("PB.ManualCharacterNoClass"));
      return;
    }

    const baseChoices = this._collectBaseChoices(form);
    const hybrid = this.selection.hybrid;

    await this.close();
    ui.notifications.info(game.i18n.format("PB.ManualCharacterCreating", { name: cls.name }));

    try {
      let characterData;
      if (isHybridClass(cls)) {
        const [macroPack] = compendiumInfoFromString(cls.characterGeneratorMacro);
        const choices = { baseChoices };
        if (macroPack === HAUNTED_SOUL_MACRO_PACK) {
          choices.baseClass = await this._resolveBaseClass(hybrid.baseClassPack);
          choices.ailmentValues = hybrid.ailmentValue ? [hybrid.ailmentValue] : [];
        } else if (macroPack === TALL_TALE_MACRO_PACK) {
          choices.tallTaleValue = hybrid.tallTaleValue;
          choices.baseClass = await this._resolveBaseClass(hybrid.baseClassPack);
          choices.mutantValue = hybrid.mutantValue;
          choices.animalValue = hybrid.animalValue;
        }
        characterData = await buildHybridCharacter(cls, choices);
      } else {
        characterData = await buildCharacter(cls, baseChoices);
      }

      if (this.actor) {
        await updateActorWithCharacter(this.actor, characterData);
        this.actor.sheet.render(true);
      } else {
        const actor = await createActorWithCharacter(characterData);
        actor.sheet.render(true);
      }
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("PB.ManualCharacterError", { name: cls.name }));
    }
  }

  /**
   * @param {String} baseClassKey uuid (preferred) or name of a base class.
   * @returns {Promise.<PBItem|undefined>}
   */
  async _resolveBaseClass(baseClassKey) {
    if (!baseClassKey) {
      return undefined;
    }
    const items = await getBaseClassItems();
    return items.find((item) => this._baseClassKey(item) === baseClassKey);
  }
}

/**
 * @param {PBActor} [actor]
 */
export const showManualCharacterCreatorDialog = (actor) => {
  const dialog = new ManualCharacterCreatorDialog(actor);
  dialog.render(true);
};
