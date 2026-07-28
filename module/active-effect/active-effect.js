import { normalizeEffectDuration } from "../api/effect-duration.js";
import { isWieldingGatedWeapon } from "../system/equip-gate.js";

const EQUIP_GATE_FLAG = "equipGate";

/**
 * @extends {ActiveEffect}
 */
export class PBActiveEffect extends ActiveEffect {
  /** @override */
  static async createDocuments(data, context = {}) {
    for (const d of data) {
      if (!d) continue;
      d.duration = normalizeEffectDuration(d.duration);
    }
    return super.createDocuments(data, context);
  }

  /**
   * Equip-gated effects (flag `pirateborg.equipGate.weaponNameIncludes`) apply only
   * while the actor is wielding a matching weapon — e.g. Ostentatious Fencer's defense
   * bonus, active only with a rapier or cutlass in hand. Suppression is evaluated at
   * data-prep time, so it follows equip/unequip automatically (no hooks) and the effect
   * still shows on the Effects tab, greyed, when the weapon isn't equipped.
   *
   * @override
   */
  get isSuppressed() {
    const gate = this.getFlag(CONFIG.PB.flagScope, EQUIP_GATE_FLAG);
    if (gate?.weaponNameIncludes?.length) {
      const actor = this.target ?? (this.parent?.documentName === "Actor" ? this.parent : this.parent?.parent);
      if (actor?.items && !isWieldingGatedWeapon(actor, gate.weaponNameIncludes)) {
        return true;
      }
    }
    return super.isSuppressed ?? false;
  }
}
