/**
 * PB Test Bench — a DEV/TEST macro (not shipped in any pack).
 *
 * Usage in Foundry: create a Script macro, paste this in, run it. Opens a button
 * panel so you can set up automation test scenarios without diving through
 * compendiums / dragging / opening sheets.
 *
 * Two ways to work:
 *   1. SCENARIOS (top) — one click builds a fresh character with a ready loadout
 *      (feature + equipped weapon, etc.), then you click the map to drop its
 *      token and the sheet opens. Fast way to reach a testable actor.
 *   2. MANUAL (bottom) — grant a single feature/weapon onto the *selected* token,
 *      toggle equip, etc. (the original bench).
 *
 * Why building an actor is a faithful test: the sheet's real drag-drop reaches
 * item creation through core's `super._onDropItem` → `createEmbeddedDocuments`,
 * which is the *same* call used here — so the `createItem` gain hooks
 * (`_transferEffectsToActor`, stock/grants, grog-poison upgrade) fire identically
 * to a hand-drag. We deliberately DON'T add the class item: the feature
 * automation under test is self-contained on the feature, and a class-gain would
 * fire HP rolls / starting-gear noise.
 *
 * Everything the bench creates is flagged `<scope>.testBench` so "Clear" can
 * remove bench items, bench actors, and their tokens in one go.
 */
(() => {
  const scope = CONFIG.PB.flagScope;
  const CHAR = CONFIG.PB.actorTypes.character;
  const selected = () => canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;

  // ── Scenarios: [pack, name] refs resolve as <system.id>.<pack>;<name> ───────
  const SCENARIOS = [
    {
      label: "Ostentatious Fencer + Rapier",
      hint: "Rapier is equipped. Open Defend → expect +2 DR while the rapier is held.",
      items: [
        { pack: "class-swashbuckler", name: "Ostentatious Fencer" },
        { pack: "equipment-melee-weapons", name: "Rapier", equip: true },
      ],
    },
    {
      label: "Focused Aim + Musket",
      hint: "Attack with the musket → ranged DR reduction; a melee attack gets none.",
      items: [
        { pack: "class-buccaneer", name: "Focused Aim" },
        { pack: "equipment-ranged-weapons", name: "Musket", equip: true },
      ],
    },
    {
      label: "Back Stabber + Dagger",
      hint: "Attack → a damage-rider toggle is offered in the attack box.",
      items: [
        { pack: "class-rapscallion", name: "Back Stabber" },
        { pack: "equipment-melee-weapons", name: "Dagger", equip: true },
      ],
    },
    {
      label: "Blood Frenzy + Cutlass",
      hint: "Attack box shows a countable +damage increment (set how many stacks).",
      items: [
        { pack: "class-brute", name: "Blood Frenzy" },
        { pack: "equipment-melee-weapons", name: "Cutlass", equip: true },
      ],
    },
    {
      label: "Grog Brewer + Rapier + Grog",
      hint: "Brew button (combat tab); soak in attack box. Bump feature to qty 2 for the poison card.",
      items: [
        { pack: "class-rapscallion", name: "Grog Brewer" },
        { pack: "equipment-melee-weapons", name: "Rapier", equip: true },
        { pack: "equipment-gear", name: "Grog" },
      ],
    },
    {
      label: "Calculating Cutthroat + Rapier",
      hint: "Attack → crits on 19–20.",
      items: [
        { pack: "class-swashbuckler", name: "Calculating Cutthroat" },
        { pack: "equipment-melee-weapons", name: "Rapier", equip: true },
      ],
    },
    {
      label: "Burglar",
      hint: "Header skill-DR button; stocks lockpicks; maxQuantity 2.",
      items: [{ pack: "class-rapscallion", name: "Burglar" }],
    },
    {
      label: "Black Powder Poet",
      hint: "On gain: rolls the d6 Grenades & Bombs table (1d4 draws) into inventory.",
      items: [{ pack: "class-swashbuckler", name: "Black Powder Poet" }],
    },
    {
      label: "Survivalist",
      hint: "Immune to infected / disease / poison in the condition grid.",
      items: [{ pack: "class-buccaneer", name: "Survivalist" }],
    },
    {
      label: "Inspiring Leader",
      hint: "Surface button posts 1d4 to chat + stores a header chip (✕ to dismiss).",
      items: [{ pack: "class-swashbuckler", name: "Inspiring Leader" }],
    },
  ];

  // ── Manual grant lists (act on the SELECTED token) ─────────────────────────
  const FEATURES = [
    ["Ostentatious Fencer", "class-swashbuckler"],
    ["Focused Aim", "class-buccaneer"],
    ["Back Stabber", "class-rapscallion"],
    ["Blood Frenzy", "class-brute"],
    ["Grog Brewer", "class-rapscallion"],
    ["Calculating Cutthroat", "class-swashbuckler"],
    ["Inspiring Leader", "class-swashbuckler"],
    ["Black Powder Poet", "class-swashbuckler"],
    ["Burglar", "class-rapscallion"],
    ["Survivalist", "class-buccaneer"],
  ];
  const WEAPONS = [
    ["Rapier", "equipment-melee-weapons"],
    ["Cutlass", "equipment-melee-weapons"],
    ["Dagger", "equipment-melee-weapons"],
    ["Knife", "equipment-melee-weapons"],
    ["Musket", "equipment-ranged-weapons"],
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  const findData = async (pack, name, { equip = false } = {}) => {
    // Live system id so refs resolve in the beta build too (pirate-borg-beta.*).
    const doc = await game.pirateborg.api.compendium.findCompendiumItem(`${game.system.id}.${pack}`, name);
    if (!doc) {
      ui.notifications.warn(`Not found: ${pack};${name}`);
      return null;
    }
    const data = doc.toObject(false);
    foundry.utils.setProperty(data, `flags.${scope}.testBench`, true);
    if (equip) data.system.equipped = true;
    return data;
  };

  const addToActor = async (actor, pack, name, opts) => {
    if (!actor) return ui.notifications.warn("Select a token (or assign a character) first.");
    const data = await findData(pack, name, opts);
    if (!data) return;
    await actor.createEmbeddedDocuments("Item", [data]); // fires the gain hooks
    ui.notifications.info(`+ ${name} → ${actor.name}`);
  };

  const toggleEquip = async (keyword) => {
    const actor = selected();
    if (!actor) return ui.notifications.warn("Select a token first.");
    const w = actor.items.find((i) => i.type === CONFIG.PB.itemTypes.weapon && i.name.toLowerCase().includes(keyword));
    if (!w) return ui.notifications.warn(`No "${keyword}" weapon on ${actor.name}`);
    const now = !w.system.equipped;
    await w.update({ "system.equipped": now });
    ui.notifications.info(`${w.name} ${now ? "equipped" : "unequipped"}`);
  };

  // Best-effort world position from a canvas pointer event, across v11–v13.
  const eventToWorld = (event) => {
    try {
      if (typeof event?.getLocalPosition === "function") return event.getLocalPosition(canvas.stage);
    } catch (e) {
      /* fall through */
    }
    try {
      if (event?.data?.getLocalPosition) return event.data.getLocalPosition(canvas.stage);
    } catch (e) {
      /* fall through */
    }
    return canvas.mousePosition ?? { x: canvas.scene.dimensions.width / 2, y: canvas.scene.dimensions.height / 2 };
  };

  const dropTokenAt = async (actor, pos) => {
    let { x, y } = pos;
    try {
      if (canvas.grid?.getSnappedPoint) {
        // v13 API
        const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES?.CENTER ?? 0 });
        x = snapped.x;
        y = snapped.y;
      } else if (canvas.grid?.getSnappedPosition) {
        // v11/v12 API — snaps top-left; adjust below after size math is applied
        const snapped = canvas.grid.getSnappedPosition(x, y);
        x = snapped.x;
        y = snapped.y;
      }
    } catch (e) {
      /* best-effort snapping only */
    }
    const size = canvas.scene.grid.size;
    // getSnappedPoint gives a cell CENTER; place the token's top-left half a cell up/left.
    const td = await actor.getTokenDocument({ x: Math.round(x - size / 2), y: Math.round(y - size / 2) });
    await canvas.scene.createEmbeddedDocuments("Token", [td.toObject()]);
  };

  const armDrop = (actor, label) => {
    ui.notifications.info(`Click the map to drop "${label}"…`);
    canvas.stage.once("pointerdown", async (event) => {
      try {
        await dropTokenAt(actor, eventToWorld(event));
        actor.sheet.render(true);
        ui.notifications.info(`Dropped "${label}". Sheet opened.`);
      } catch (e) {
        console.error("PB Test Bench — drop failed", e);
        ui.notifications.error(`Drop failed: ${e.message}. Sheet opened instead.`);
        actor.sheet.render(true);
      }
    });
  };

  const buildScenario = async (scn) => {
    const itemsData = [];
    for (const spec of scn.items) {
      const data = await findData(spec.pack, spec.name, { equip: spec.equip });
      if (data) itemsData.push(data);
    }
    if (!itemsData.length) return ui.notifications.error(`"${scn.label}" — no items resolved; nothing built.`);
    const actor = await Actor.create({
      name: `⚑ ${scn.label}`,
      type: CHAR,
      flags: { [scope]: { testBench: true } },
    });
    await actor.createEmbeddedDocuments("Item", itemsData); // fires the real gain hooks
    if (scn.hint) console.log(`PB Test Bench — ${scn.label}: ${scn.hint}`);
    armDrop(actor, scn.label);
  };

  const clearBench = async () => {
    let removed = 0;
    // 1) bench items on the selected actor (manual-grant cleanup)
    const actor = selected();
    if (actor) {
      const ids = actor.items.filter((i) => i.getFlag(scope, "testBench")).map((i) => i.id);
      if (ids.length) {
        await actor.deleteEmbeddedDocuments("Item", ids);
        removed += ids.length;
      }
    }
    // 2) bench-built actors + their tokens on every scene
    const benchActors = game.actors.filter((a) => a.getFlag(scope, "testBench"));
    const benchIds = new Set(benchActors.map((a) => a.id));
    for (const sc of game.scenes) {
      const tokIds = sc.tokens.filter((t) => benchIds.has(t.actorId)).map((t) => t.id);
      if (tokIds.length) await sc.deleteEmbeddedDocuments("Token", tokIds);
    }
    if (benchActors.length) await Actor.deleteDocuments([...benchIds]);
    ui.notifications.info(
      `Cleared ${removed} bench item(s) and ${benchActors.length} bench actor(s). ` + `(Granted consumables like rations may remain on non-bench actors.)`,
    );
  };

  const listTokens = () => {
    const rows = (canvas.tokens?.placeables ?? []).map((t) => `${t.name}${t.actor ? ` — ${t.actor.type}` : ""}${t.controlled ? " (selected)" : ""}`);
    const report = rows.length ? rows.map((r, i) => `${i + 1}. ${r}`).join("\n") : "(no tokens on this scene)";
    console.log(`=== Tokens on "${canvas.scene?.name}" (${rows.length}) ===\n${report}`);
    const esc = (s) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(s) : s);
    ChatMessage.create({
      content: `<b>Tokens on ${esc(canvas.scene?.name ?? "scene")} (${rows.length}):</b><br>${rows.map(esc).join("<br>")}`,
      whisper: [game.user.id],
    });
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  const btn = (action, arg, label, title = "") =>
    `<button type="button" data-action="${action}" data-arg="${arg}"${title ? ` title="${title}"` : ""} style="flex:0 0 auto;margin:2px;">${label}</button>`;
  const esc = (s) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(s) : s);

  const content = `
    <div style="font-size:12px">
      <p style="margin:2px 0"><b>Scenarios</b> — build a ready actor, then click the map to drop its token.</p>
      <div style="display:flex;flex-wrap:wrap">${SCENARIOS.map((s, i) => btn("scn", String(i), `⚑ ${s.label}`, esc(s.hint))).join("")}</div>

      <hr style="margin:8px 0">
      <p style="margin:2px 0"><b>Manual</b> — act on the <i>selected</i> token. Grant fires the real gain hooks.</p>
      <p style="margin:4px 0 2px"><b>Features</b></p>
      <div style="display:flex;flex-wrap:wrap">${FEATURES.map(([n, p]) => btn("feat", `${p}|${n}`, `+ ${n}`)).join("")}</div>
      <p style="margin:8px 0 2px"><b>Weapons (grant + equip)</b></p>
      <div style="display:flex;flex-wrap:wrap">${WEAPONS.map(([n, p]) => btn("weap", `${p}|${n}`, `+ ${n}`)).join("")}</div>
      <p style="margin:8px 0 2px"><b>Toggle equip</b></p>
      <div style="display:flex;flex-wrap:wrap">${["rapier", "cutlass", "dagger", "knife", "musket"].map((k) => btn("equip", k, `⇄ ${k}`)).join("")}</div>

      <hr style="margin:8px 0">
      <p style="margin:2px 0">${btn("tokens", "", "📋 List token names")} ${btn("clear", "", "🗑 Clear bench (items + actors + tokens)")}</p>
    </div>`;

  new Dialog(
    {
      title: `PB Test Bench`,
      content,
      buttons: { close: { label: "Close" } },
      default: "close",
      render: (html) => {
        html.on("click", "button[data-action]", async (ev) => {
          ev.preventDefault();
          const { action, arg } = ev.currentTarget.dataset;
          if (action === "scn") {
            await buildScenario(SCENARIOS[Number(arg)]);
          } else if (action === "feat" || action === "weap") {
            const [pack, name] = arg.split("|");
            await addToActor(selected(), pack, name, { equip: action === "weap" });
          } else if (action === "equip") {
            await toggleEquip(arg);
          } else if (action === "tokens") {
            listTokens();
          } else if (action === "clear") {
            await clearBench();
          }
        });
      },
    },
    { width: 520 },
  ).render(true);
})();
