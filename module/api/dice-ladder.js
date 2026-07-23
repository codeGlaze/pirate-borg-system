/**
 * Pirate Borg dice ladder — the single source of truth for stepping a die up or
 * down a tier. Armor already works this way (a numeric tier indexes
 * `CONFIG.PB.armorTiers` to derive its die); this generalises the same idea so
 * any die-valued effect can be driven by a numeric step that an Active Effect
 * can ADD/UPGRADE/DOWNGRADE.
 *
 * Note: Pirate Borg has no d3 — the rungs are 0, d2, d4, d6, d8, d10, d12.
 *
 * @type {Array.<String>}
 */
export const DICE_LADDER = ["0", "1d2", "1d4", "1d6", "1d8", "1d10", "1d12"];

/**
 * Normalises a die string to the ladder's canonical form: "d4" -> "1d4",
 * "1D4" -> "1d4", "0"/"" -> "0". Whitespace is ignored.
 *
 * @param {String} die
 * @returns {String}
 */
export const normalizeDie = (die) => {
  const trimmed = String(die ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (trimmed === "" || trimmed === "0") {
    return "0";
  }
  const match = trimmed.match(/^(\d*)d(\d+)$/);
  if (!match) {
    return trimmed;
  }
  const count = match[1] === "" ? "1" : match[1];
  return `${count}d${match[2]}`;
};

/**
 * The ladder index (step) of a die, or -1 when it is not a ladder rung.
 *
 * @param {String} die
 * @returns {Number}
 */
export const dieToStep = (die) => DICE_LADDER.indexOf(normalizeDie(die));

/**
 * The die at a ladder step, clamped to the ends of the ladder.
 *
 * @param {Number} step
 * @returns {String}
 */
export const stepToDie = (step) => {
  const clamped = Math.max(0, Math.min(DICE_LADDER.length - 1, Math.trunc(Number(step) || 0)));
  return DICE_LADDER[clamped];
};

/**
 * Steps a die up (+) or down (-) the ladder by `delta` rungs, clamped to the
 * ladder's ends. A die that is not on the ladder is returned unchanged.
 *
 * @param {String} die
 * @param {Number} delta
 * @returns {String}
 */
export const stepDie = (die, delta) => {
  const step = dieToStep(die);
  if (step === -1) {
    return normalizeDie(die);
  }
  return stepToDie(step + delta);
};
