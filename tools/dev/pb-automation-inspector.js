/**
 * PB Automation Inspector — a DEV/TEST macro (not shipped in any pack).
 *
 * Usage in Foundry: create a Script macro, paste this in, select a token, run it.
 * It reports the state of everything the feature-automation touches, so you can verify
 * a build without clicking through sheets and dialogs:
 *   - effective armor DR + combat modifiers (with sources)
 *   - every Active Effect and whether it's active / disabled / SUPPRESSED (equip-gate)
 *   - each feature's automation spec (attackDr, onGain, stockOnGain, grantsItems, drTestReduction)
 *   - which attack-DR features apply to each equipped weapon (auto vs situational)
 *   - ability-test DR reductions (Treasure Hunter etc.)
 *
 * Output goes to the console (F12) in full, plus a self-whisper summary in chat.
 */
(() => {
  const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!actor) {
    ui.notifications.warn("Select a token (or assign a character) first.");
    return;
  }
  const scope = CONFIG.PB.flagScope;
  const featureType = CONFIG.PB.itemTypes.feature;
  const lines = [];
  const log = (s = "") => lines.push(s);

  log(`=== PB Automation Inspector — ${actor.name} ===`);
  log(`system ${game.system.version} · foundry v${game.release?.generation ?? "?"}`);

  // Armor + combat modifiers
  try {
    log("");
    log(`Armor DR die: ${actor.getCharacterArmorFormula?.()}  (naturalArmorTier=${actor.naturalArmorTier})`);
  } catch (e) {
    log(`Armor DR: <error: ${e.message}>`);
  }
  const combat = actor.system?.attributes?.combat ?? {};
  log(
    `Combat modifiers: attack ${combat.attackModifier ?? 0}, defense ${combat.defenseModifier ?? 0}, ` +
      `damage ${combat.damageModifier ?? 0}, armorTier ${combat.armorTierModifier ?? 0}`,
  );

  // Active effects (with suppression state)
  log("");
  log("Active Effects:");
  const effects = typeof actor.allApplicableEffects === "function" ? [...actor.allApplicableEffects()] : [...(actor.effects ?? [])];
  if (!effects.length) log("  (none)");
  for (const effect of effects) {
    const state = effect.disabled ? "DISABLED" : effect.isSuppressed ? "SUPPRESSED" : "active";
    const gate = effect.getFlag?.(scope, "equipGate");
    const gateNote = gate?.weaponNameIncludes ? `  [equip-gate: ${gate.weaponNameIncludes.join("/")}]` : "";
    const changes = (effect.changes ?? []).map((c) => `${c.key.split(".").pop()} ${c.mode === 2 ? "+" : "="}${c.value}`).join(", ");
    log(`  • ${effect.name} — ${state}${gateNote}  { ${changes} }`);
  }

  // Feature automation specs
  log("");
  log("Feature automation:");
  const features = actor.items.filter((i) => i.type === featureType);
  for (const f of features) {
    const s = f.system ?? {};
    const bits = [];
    if (s.attackDr && Object.keys(s.attackDr).length) bits.push(`attackDr(${JSON.stringify(s.attackDr)})`);
    if (s.onGain && Object.keys(s.onGain).length) bits.push(`onGain(${JSON.stringify(s.onGain)})`);
    if ((s.stockOnGain ?? []).length) bits.push(`stockOnGain(${JSON.stringify(s.stockOnGain)}, stocked=${!!f.getFlag(scope, "rationsStocked")})`);
    if ((s.grantsItems ?? []).length) bits.push(`grantsItems(${s.grantsItems.map((g) => g.ref).join(",")})`);
    if (Number(s.drTestReduction) > 0) bits.push(`drTestReduction=${s.drTestReduction}`);
    if (bits.length) log(`  • ${f.name} ×${s.quantity ?? 1}: ${bits.join(" · ")}`);
  }

  // Attack-DR per equipped weapon
  log("");
  log("Attack-DR by equipped weapon:");
  const weapons = actor.items.filter((i) => i.type === CONFIG.PB.itemTypes.weapon && i.system?.equipped);
  if (!weapons.length) log("  (no equipped weapons)");
  for (const w of weapons) {
    const applic = actor.getAttackDrFeatures?.(w) ?? [];
    const desc = applic.length ? applic.map((a) => `${a.name} -${a.dr} (${a.auto ? "auto" : "situational"})`).join(", ") : "(none)";
    log(`  • ${w.name} [${w.system?.weaponType}]: ${desc}`);
  }

  // Ability-test DR reductions
  const drReductions = actor.getAbilityTestDrReductions?.() ?? [];
  if (drReductions.length) {
    log("");
    log(`Ability-test DR features: ${drReductions.map((d) => `${d.name} -${d.dr}`).join(", ")}`);
  }

  const report = lines.join("\n");
  console.log(report);
  ChatMessage.create({
    content: `<pre style="white-space:pre-wrap;font-size:11px">${foundry.utils.escapeHTML?.(report) ?? report}</pre>`,
    whisper: [game.user.id],
    speaker: ChatMessage.getSpeaker({ actor }),
  });
})();
