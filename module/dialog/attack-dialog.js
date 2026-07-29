import { findTargettedToken, hasTargets, isTargetSelectionValid, registerTargetAutomationHook, unregisterTargetAutomationHook } from "../api/targeting.js";
import { isEnforceTargetEnabled } from "../system/settings.js";
import { getSystemFlag, setSystemFlag } from "../api/utils.js";

const ATTACK_DIALOG_TEMPLATE = "systems/pirateborg/templates/dialog/attack-dialog.html";

class AttackDialog extends Application {
  constructor({ actor, weapon, callback } = {}) {
    super();
    this.actor = actor;
    this.weapon = weapon;
    this.callback = callback;

    this.enforceTargetSelection = isEnforceTargetEnabled() && this.actor.isInCombat;
    this.isTargetSelectionValid = isTargetSelectionValid();
    this.hasTargets = hasTargets();
    this.targetToken = findTargettedToken();
    this.shouldIgnoreArmor = this._shouldIgnoreArmor();
    this._ontargetChangedHook = registerTargetAutomationHook(this._onTargetChanged.bind(this));
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["attack-dialog"],
      template: ATTACK_DIALOG_TEMPLATE,
      title: game.i18n.localize("PB.Attack"),
      width: 460,
      height: "auto",
    });
  }

  /** @override */
  async getData(options) {
    const data = super.getData(options);
    const attackDR = (await getSystemFlag(this.actor, CONFIG.PB.flags.ATTACK_DR)) ?? 12;
    const targetArmor = this.shouldIgnoreArmor ? "0" : await this._getTargetArmor();

    // Attack-DR features applicable to this weapon. Auto ones (weapon requirement met)
    // are always-on and shown as a passive tally under the DR; situational ones are
    // opt-in toggles the player taps per swing.
    const attackFeatures = this.actor.getAttackDrFeatures?.(this.weapon) ?? [];
    const autoFeatures = attackFeatures.filter((feature) => feature.auto);
    const situationalFeatures = attackFeatures.filter((feature) => !feature.auto);
    const autoReduction = autoFeatures.reduce((sum, feature) => sum + feature.dr, 0);

    // Damage riders (Back Stabber +d2, Focused Aim +d4, OF +1 dueling). Same auto-vs-
    // situational split as the DR features, shown as their own toggles/tally.
    const damageRiders = this.actor.getDamageRiderFeatures?.(this.weapon) ?? [];
    const autoDamageRiders = damageRiders.filter((rider) => rider.auto);
    const situationalDamageRiders = damageRiders.filter((rider) => !rider.auto);

    return {
      ...data,
      config: CONFIG.pirateborg,
      attackDR,
      targetArmor,
      autoFeatures,
      situationalFeatures,
      autoReduction,
      effectiveAttackDR: Math.max(0, Number(attackDR) - autoReduction),
      hasAttackFeatures: attackFeatures.length > 0,
      autoDamageRiders,
      situationalDamageRiders,
      hasDamageRiders: damageRiders.length > 0,
      target: this.targetToken?.actor,
      shouldIgnoreArmor: this.shouldIgnoreArmor,
      isTargetSelectionValid: this.isTargetSelectionValid,
      shouldShowTarget: this._shouldShowTarget(),
      hasTargetWarning: this._hasTargetWarning(),
    };
  }

  _hasTargetWarning() {
    return !!(this.enforceTargetSelection && !this.isTargetSelectionValid);
  }

  _shouldShowTarget() {
    if (this.enforceTargetSelection) {
      return true;
    }
    return this.hasTargets;
  }

  _shouldIgnoreArmor() {
    if (this.targetToken?.actor.isAnyVehicle) {
      return false;
    }
    if (this.weapon.isGunpowderWeapon) {
      return true;
    }
  }

  _onTargetChanged() {
    this.targetToken = findTargettedToken();
    this.isTargetSelectionValid = isTargetSelectionValid();
    this.hasTargets = hasTargets();
    this.shouldIgnoreArmor = this._shouldIgnoreArmor();
    this.render();
  }

  async _getTargetArmor() {
    if (this.targetToken) {
      return this.targetToken.actor.getActorArmorFormula();
    }
    return (await getSystemFlag(this.actor, CONFIG.PB.flags.TARGET_ARMOR)) ?? 0;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".ok-button").on("click", this._onSubmit.bind(this));
    html.find(".cancel-button").on("click", this._onCancel.bind(this));

    html.find(".attack-dr .radio-input").on("change", this._onAttackDrRadioInputChanged.bind(this));
    html.find("#attackDr").on("change", this._onAttackDrInputChanged.bind(this));

    html.find(".armor-tier .radio-input").on("change", this._onArmorTierRadioInputChanged.bind(this));
    html.find("#targetArmor").on("change", this._onTargetArmorInputChanged.bind(this));

    html.find(".attack-feature.situational").on("click", this._onAttackFeatureToggled.bind(this));
    // Any change to the base DR (input or quick-pick) also moves the effective DR.
    html.find("#attackDr, .attack-dr .radio-input").on("change", () => this._recomputeEffectiveDr(html));
    this._recomputeEffectiveDr(html);
  }

  /**
   * Sum of the DR reductions currently in effect: every auto feature plus each
   * situational toggle that's active.
   */
  _activeAttackDrReduction(html) {
    let total = 0;
    html.find(".attack-feature[data-dr]").each((_i, element) => {
      const el = $(element);
      const active = el.hasClass("auto") || el.hasClass("active");
      if (active) {
        total += Number(el.data("dr")) || 0;
      }
    });
    return total;
  }

  /**
   * Updates the live "base → effective" DR readout so the net going into the roll is
   * always visible (an accidentally-on toggle can't hide).
   */
  _recomputeEffectiveDr(html) {
    const base = parseInt(html.find("#attackDr").val(), 10) || 0;
    const effective = Math.max(0, base - this._activeAttackDrReduction(html));
    html.find(".base-attack-dr").text(base);
    html.find(".effective-attack-dr").text(effective);
    html.find(".effective-attack-dr-wrap").toggleClass("changed", effective !== base);
  }

  _onAttackFeatureToggled(event) {
    event.preventDefault();
    $(event.currentTarget).toggleClass("active");
    this._recomputeEffectiveDr($(event.currentTarget).closest("form"));
  }

  _onArmorTierRadioInputChanged(event) {
    event.preventDefault();
    const input = $(event.currentTarget);
    this.element.find("#targetArmor").val(input.val());
    this.element.find("#targetArmor").trigger("change");
  }

  async _onTargetArmorInputChanged(event) {
    event.preventDefault();
    const input = $(event.currentTarget);
    await setSystemFlag(this.actor, CONFIG.PB.flags.TARGET_ARMOR, input.val());
    $(".armor-tier .radio-input").val([input.val()]);
  }

  _onAttackDrRadioInputChanged(event) {
    event.preventDefault();
    const input = $(event.currentTarget);
    this.element.find("#attackDr").val(input.val());
    this.element.find("#attackDr").trigger("change");
  }

  async _onAttackDrInputChanged(event) {
    event.preventDefault();
    const input = $(event.currentTarget);
    await setSystemFlag(this.actor, CONFIG.PB.flags.ATTACK_DR, input.val());
    $(".attack-dr .radio-input").val([input.val()]);
  }

  async _onCancel(event) {
    event.preventDefault();
    await this.close();
  }

  _validate({ targetArmor, attackDR }) {
    return !!(targetArmor && attackDR && (this.enforceTargetSelection ? this.isTargetSelectionValid : true));
  }

  /**
   * @override
   * @param [options]
   */
  async close(options) {
    unregisterTargetAutomationHook(this._ontargetChangedHook);
    await super.close(options);
  }

  async _onSubmit(event) {
    event.preventDefault();
    const form = $(event.currentTarget).parents("form")[0];
    const targetArmor = $(form).find("#targetArmor").val();
    const attackDR = $(form).find("#attackDr").val();

    if (!this._validate({ targetArmor, attackDR })) {
      return;
    }

    // Apply the feature reductions (auto + active toggles) to the base DR, and report
    // which were applied so the attack card can show them.
    const baseDR = parseInt(attackDR, 10);
    const appliedFeatures = [];
    $(form)
      .find(".attack-feature[data-dr]")
      .each((_i, element) => {
        const el = $(element);
        if (el.hasClass("auto") || el.hasClass("active")) {
          appliedFeatures.push({ name: String(el.data("name")), dr: Number(el.data("dr")) || 0 });
        }
      });
    const reduction = appliedFeatures.reduce((sum, feature) => sum + feature.dr, 0);

    // Damage riders in effect (auto + active toggles), for the roll and the card note.
    const appliedDamageRiders = [];
    $(form)
      .find(".damage-rider[data-damage]")
      .each((_i, element) => {
        const el = $(element);
        if (el.hasClass("auto") || el.hasClass("active")) {
          appliedDamageRiders.push({ name: String(el.data("name")), damage: String(el.data("damage")) });
        }
      });

    this.callback({
      targetArmor,
      attackDR: Math.max(0, baseDR - reduction),
      appliedFeatures,
      appliedDamageRiders,
      targetToken: this.targetToken,
    });
    await this.close();
  }
}

/**
 * @param {Object} data
 * @param {Actor} data.actor
 * @returns {Promise.<{targetArmor: String, attackDR: Number, appliedFeatures: Array.<{name: String, dr: Number}>, targetToken: Token}>}
 */
export const showAttackDialog = (data = {}) =>
  new Promise((resolve) => {
    new AttackDialog({
      ...data,
      callback: resolve,
    }).render(true);
  });
