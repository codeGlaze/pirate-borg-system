import { isCharacterGeneratorClassAllowed } from "../system/settings.js";
import { buildCharacter, createActorWithCharacter, updateActorWithCharacter } from "../api/generator/character-generator.js";
import { classItemFromPack, compendiumInfoFromString, findClassPacks, getTableRows } from "../api/compendium.js";
import { PB } from "../config.js";

/**
 * A manual counterpart to "The Tavern" (the randomized character generator).
 *
 * Instead of rolling everything, the player picks a class and then chooses the
 * exact entry from each built-in table (background, gear, weapon, armor, hat,
 * class features, ...) and types their ability scores. Any field left on
 * "Random" is rolled, so the same dialog also works as a partial randomizer.
 * Under the hood it feeds the selections through the very same builder the
 * randomizer uses, so the resulting actor is identical to a rolled one.
 */
class ManualCharacterCreatorDialog extends Application {
  constructor(actor = null, options = {}) {
    super(options);
    this.actor = actor;
    this.classPacks = findClassPacks();
    /**
     * Persisted form state so values survive the re-render triggered by a
     * class change.
     * @type {{classPack: ?String, name: String, abilities: Object, hitPoints: String, luck: String, silver: String, tableValues: Object}}
     */
    this.selection = {
      classPack: null,
      name: "",
      abilities: { strength: 0, agility: 0, presence: 0, toughness: 0, spirit: 0 },
      hitPoints: "",
      luck: "",
      silver: "",
      tableValues: {},
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

    return foundry.utils.mergeObject(super.getData(options), {
      forActor: this.actor !== undefined && this.actor !== null,
      hasClasses: classes.length > 0,
      classes: classes.map((entry) => ({ name: entry.name, pack: entry.pack, selected: entry.pack === selectedPack })),
      name: this.selection.name,
      abilities: abilityKeys.map((key) => ({
        key,
        label: game.i18n.localize(`PB.Ability${key.charAt(0).toUpperCase()}${key.slice(1)}`),
        value: this.selection.abilities[key] ?? 0,
      })),
      hitPoints: this.selection.hitPoints,
      luck: this.selection.luck,
      silver: this.selection.silver,
      tableGroups: cls ? await this.getTableGroups(cls, selectedPack) : [],
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
      if (!cls || cls.requireBaseClass || cls.characterGeneratorMacro) {
        // Skip base-only classes and classes that use a bespoke creation macro,
        // since the standard builder cannot reproduce those.
        continue;
      }
      classes.push({ name: cls.name, pack, item: cls });
    }
    return classes.sort((a, b) => a.name.localeCompare(b.name));
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
    if (cls.startingWeaponTableFormula || this.hasTableSelection("weapon")) {
      const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.weaponsRollTable);
      equipmentFields.push(await this.buildField("weapon", "weapon", game.i18n.localize("PB.ManualCharacterWeapon"), compendium, table));
    }
    if (cls.startingArmorTableFormula || this.hasTableSelection("armor")) {
      const [compendium, table] = compendiumInfoFromString(PB.characterGenerator.armorsRollTable);
      equipmentFields.push(await this.buildField("armor", "armor", game.i18n.localize("PB.ManualCharacterArmor"), compendium, table));
    }
    if (cls.startingHatTableFormula || this.hasTableSelection("hat")) {
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
   * @param {String} key
   * @returns {Boolean} True when a table selection is remembered for `key`.
   */
  hasTableSelection(key) {
    const value = this.selection.tableValues[key];
    return value !== undefined && value !== null && value !== "";
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
    html.find(".class-select").on("change", this._onClassChange.bind(this));
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
  }

  async _onClassChange(event) {
    event.preventDefault();
    const form = $(event.currentTarget).closest(".manual-character-creator-dialog")[0];
    this._syncSelection(form);
    this.selection.classPack = event.currentTarget.value;
    this.render(false);
  }

  async _onCancel(event) {
    event.preventDefault();
    await this.close();
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

    await this.close();
    ui.notifications.info(game.i18n.format("PB.ManualCharacterCreating", { name: cls.name }));

    try {
      const characterData = await buildCharacter(cls, choices);
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
}

/**
 * @param {PBActor} [actor]
 */
export const showManualCharacterCreatorDialog = (actor) => {
  const dialog = new ManualCharacterCreatorDialog(actor);
  dialog.render(true);
};
