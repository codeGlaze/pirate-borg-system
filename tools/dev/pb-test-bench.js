/**
 * PB Test Bench — a DEV/TEST macro (not shipped in any pack).
 *
 * Usage in Foundry: create a Script macro, paste this in, select a token, run it.
 * Opens a button panel so you can set up automation test scenarios without diving
 * through compendiums / dragging / opening sheets:
 *   - grant any test feature (fires the real gain hooks: stock, grants, effects)
 *   - grant + equip a test weapon (rapier/cutlass/dagger/knife/musket)
 *   - toggle equip on a weapon (to test equip-gated effects like Ostentatious Fencer)
 *   - clear everything the bench added
 * The panel stays open, so you can chain actions. Pair it with the Automation
 * Inspector macro to read the resulting state.
 */
(() => {
  const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!actor) {
    ui.notifications.warn("Select a token (or assign a character) first.");
    return;
  }
  const scope = CONFIG.PB.flagScope;

  // [label, compendium-pack] — refs resolve as pirateborg.<pack>;<label>.
  const FEATURES = [
    ["Ostentatious Fencer", "class-swashbuckler"],
    ["Sword Master", "class-swashbuckler"],
    ["Scurvy Scallywag", "class-swashbuckler"],
    ["Knife Knave", "class-swashbuckler"],
    ["Crack Shot", "class-buccaneer"],
    ["Focused Aim", "class-buccaneer"],
    ["Buccan Cook", "class-buccaneer"],
    ["Fix Bayonets!", "class-buccaneer"],
    ["Treasure Hunter", "class-buccaneer"],
    ["Survivalist", "class-buccaneer"],
    ["Back Stabber", "class-rapscallion"],
    ["Burglar", "class-rapscallion"],
    ["Sea Turtle", "class-tall-tale"],
    ["Thick Skinned", "class-brute"],
  ];
  const WEAPONS = [
    ["Rapier", "equipment-melee-weapons"],
    ["Cutlass", "equipment-melee-weapons"],
    ["Dagger", "equipment-melee-weapons"],
    ["Knife", "equipment-melee-weapons"],
    ["Musket", "equipment-ranged-weapons"],
  ];

  const add = async (name, pack, { equip = false } = {}) => {
    // Use the live system id so this works in the beta build too (pirate-borg-beta.*).
    const doc = await game.pirateborg.api.compendium.findCompendiumItem(`${game.system.id}.${pack}`, name);
    if (!doc) return ui.notifications.warn(`Not found: ${name}`);
    const data = doc.toObject(false);
    foundry.utils.setProperty(data, `flags.${scope}.testBench`, true);
    if (equip) {
      data.system.equipped = true;
    }
    await actor.createEmbeddedDocuments("Item", [data]); // fires gain hooks (stock/grants/effects)
    ui.notifications.info(`+ ${name}`);
  };

  const toggleEquip = async (keyword) => {
    const w = actor.items.find((i) => i.type === CONFIG.PB.itemTypes.weapon && i.name.toLowerCase().includes(keyword));
    if (!w) return ui.notifications.warn(`No "${keyword}" weapon on ${actor.name}`);
    const now = !w.system.equipped;
    await w.update({ "system.equipped": now });
    ui.notifications.info(`${w.name} ${now ? "equipped" : "unequipped"}`);
  };

  const clear = async () => {
    const ids = actor.items.filter((i) => i.getFlag(scope, "testBench")).map((i) => i.id);
    if (ids.length) {
      await actor.deleteEmbeddedDocuments("Item", ids);
    }
    ui.notifications.info(`Removed ${ids.length} bench item(s). (Granted consumables like rations/knives may remain.)`);
  };

  const listTokens = () => {
    const rows = (canvas.tokens?.placeables ?? []).map((t) => `${t.name}${t.actor ? ` — ${t.actor.type}` : ""}${t.controlled ? " (selected)" : ""}`);
    const report = rows.length ? rows.map((r, i) => `${i + 1}. ${r}`).join("\n") : "(no tokens on this scene)";
    console.log(`=== Tokens on "${canvas.scene?.name}" (${rows.length}) ===\n${report}`);
    ChatMessage.create({
      content: `<b>Tokens on ${foundry.utils.escapeHTML?.(canvas.scene?.name ?? "scene") ?? canvas.scene?.name} (${rows.length}):</b><br>${rows
        .map((r) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(r) : r))
        .join("<br>")}`,
      whisper: [game.user.id],
    });
  };

  const btn = (action, arg, label) => `<button type="button" data-action="${action}" data-arg="${arg}" style="flex:0 0 auto;margin:2px;">${label}</button>`;
  const content = `
    <div style="font-size:12px">
      <p><b>${actor.name}</b> — grant fires the real gain hooks (stock/grants/effects).</p>
      <p><b>Features</b></p>
      <div style="display:flex;flex-wrap:wrap">${FEATURES.map(([n, p]) => btn("feat", `${p}|${n}`, `+ ${n}`)).join("")}</div>
      <p style="margin-top:8px"><b>Weapons (grant + equip)</b></p>
      <div style="display:flex;flex-wrap:wrap">${WEAPONS.map(([n, p]) => btn("weap", `${p}|${n}`, `+ ${n}`)).join("")}</div>
      <p style="margin-top:8px"><b>Toggle equip</b></p>
      <div style="display:flex;flex-wrap:wrap">${["rapier", "cutlass", "dagger", "knife", "musket"].map((k) => btn("equip", k, `⇄ ${k}`)).join("")}</div>
      <p style="margin-top:8px">${btn("tokens", "", "📋 List token names")} ${btn("clear", "", "🗑 Clear bench items")}</p>
    </div>`;

  new Dialog(
    {
      title: `PB Test Bench — ${actor.name}`,
      content,
      buttons: { close: { label: "Close" } },
      default: "close",
      render: (html) => {
        html.on("click", "button[data-action]", async (ev) => {
          ev.preventDefault();
          const { action, arg } = ev.currentTarget.dataset;
          if (action === "feat" || action === "weap") {
            const [pack, name] = arg.split("|");
            await add(name, pack, { equip: action === "weap" });
          } else if (action === "equip") {
            await toggleEquip(arg);
          } else if (action === "tokens") {
            listTokens();
          } else if (action === "clear") {
            await clear();
          }
        });
      },
    },
    { width: 460 },
  ).render(true);
})();
