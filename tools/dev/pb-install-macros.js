/**
 * PB Dev Macros — installer / updater (a DEV/TEST macro, not shipped in a pack).
 *
 * PASTE THIS ONE macro by hand, once. Running it pulls the sibling dev macros
 * (test bench, checklist, inspector, and itself) straight from the *served*
 * system folder and creates/updates matching world macros in a "PB Dev" folder,
 * then whispers you draggable links so you can drop each onto your hotbar.
 *
 * Because it re-reads the files every run, just run it again after a rebuild /
 * `git pull` to refresh every dev macro to the latest source — no re-paste.
 *
 * How it can read the files: Foundry serves the whole system directory
 * statically, so `systems/<system.id>/tools/dev/<file>.js` is fetchable at
 * runtime. `<system.id>` resolves to `pirateborg` or `pirate-borg-beta`
 * automatically. `tools/dev/` is deliberately EXCLUDED from the public release
 * zip (`npm run pack`) and included only in the QA build (`npm run pack:dev`) —
 * dev tooling ships to testers, not end users. So this installer works on a
 * `pack:dev` build (e.g. what you upload to The Forge for testing); on a plain
 * public build the fetches 404 and each macro is skipped with a warning.
 */
(async () => {
  const scope = CONFIG.PB.flagScope;

  // [flag id, world-macro name, source file, hotbar icon]
  const MANIFEST = [
    ["install", "PB Dev — Install/Update Macros", "pb-install-macros.js", "icons/svg/upgrade.svg"],
    ["bench", "PB Test Bench", "pb-test-bench.js", "icons/svg/anchor.svg"],
    ["checklist", "PB Test Checklist", "pb-test-checklist.js", "icons/svg/book.svg"],
    ["inspector", "PB Automation Inspector", "pb-automation-inspector.js", "icons/svg/eye.svg"],
  ];

  if (!game.user.can("MACRO_SCRIPT") || !game.macros.documentClass.canUserCreate(game.user)) {
    return ui.notifications.error("You need GM / macro-create permission to install dev macros.");
  }

  // Tidy them into a dedicated Macro folder.
  let folder = game.folders.find((f) => f.type === "Macro" && f.name === "PB Dev");
  if (!folder) folder = await Folder.create({ name: "PB Dev", type: "Macro", color: "#7a1f1f" });

  const base = `systems/${game.system.id}/tools/dev`;
  const installed = [];
  const failed = [];

  for (const [id, name, file, img] of MANIFEST) {
    let command;
    try {
      const res = await fetch(`${base}/${file}?t=${Date.now()}`); // cache-bust so updates land
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      command = await res.text();
    } catch (e) {
      console.warn(`PB Dev Macros — could not fetch ${file}:`, e);
      failed.push(`${name} (${file}: ${e.message})`);
      continue;
    }

    // Upsert by our own flag id (rename-safe), falling back to name match once.
    const existing =
      game.macros.find((m) => m.getFlag(scope, "devMacroId") === id) ?? game.macros.find((m) => m.name === name && !m.getFlag(scope, "devMacroId"));

    const data = {
      name,
      type: "script",
      img,
      command,
      folder: folder.id,
      flags: { [scope]: { devMacroId: id } },
    };

    if (existing) {
      await existing.update(data);
      installed.push(existing);
    } else {
      installed.push(await Macro.create(data));
    }
  }

  // Whisper draggable links — drag any onto the hotbar to pin it.
  const links = installed.map((m) => `<li>@UUID[${m.uuid}]{${m.name}}</li>`).join("");
  const warn = failed.length ? `<p style="color:#a33"><b>Skipped:</b> ${failed.map((f) => foundry.utils.escapeHTML?.(f) ?? f).join("; ")}</p>` : "";
  await ChatMessage.create({
    whisper: [game.user.id],
    content:
      `<div><b>PB Dev Macros installed/updated (${installed.length}).</b>` +
      `<p style="font-size:12px;margin:4px 0">Drag any link onto your hotbar to pin it:</p>` +
      `<ul style="margin:2px 0 4px 16px;padding:0">${links}</ul>${warn}` +
      `<p style="font-size:11px;color:#666">Re-run "Install/Update Macros" after a rebuild to refresh them all.</p></div>`,
  });

  ui.notifications.info(`PB Dev Macros: ${installed.length} ready${failed.length ? `, ${failed.length} skipped` : ""}. See chat to drag to hotbar.`);
})();
