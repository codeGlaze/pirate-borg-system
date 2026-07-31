/**
 * PB Test Checklist — a DEV/TEST macro (not shipped in any pack).
 *
 * Usage in Foundry: create a Script macro, paste this in, run it. Opens an interactive
 * QA checklist for the current feature-automation work: tick items as you verify them.
 * Progress is saved to this browser (localStorage), so it survives reloads and re-runs —
 * close and reopen any time to pick up where you left off. Each item shows how to test it.
 *
 * Buttons: Reset clears all ticks; the header shows live progress.
 */
(() => {
  const STORAGE_KEY = "pb-test-checklist-v1";

  // Item shape: [id, text, how, class]. `class` names the class the feature under
  // test comes from (so you know which actor to test it on); "—" for setup/UI/general
  // rows, or a slash-list when an item spans features from multiple classes.
  const SECTIONS = [
    {
      title: "0 · Setup",
      items: [
        ["setup-build", "Rebuild the beta + hard-reload", "npm run build:beta, then reload Foundry. Nothing below exists until you do.", "—"],
        ["setup-actors", "Have a Swashbuckler, Rapscallion, Buccaneer, Brute + a creature token", "They carry most of these features.", "—"],
        ["setup-migration", "Migration report whispers on load; no console (F12) errors", "Existing characters get the new fields synced.", "—"],
      ],
    },
    {
      title: "1 · Damage riders & gates (attack dialog)",
      items: [
        ["dr-backstabber", "Back Stabber shows a +1d2 damage toggle", "Attack with any weapon; tick it → +d2 in the damage roll + card note.", "Rapscallion"],
        [
          "dr-focusedaim",
          "Focused Aim (taken ×2) shows +1d4 on ranged only",
          "Melee weapon → no +d4; ranged → +d4 toggle. Taken once → no +d4 at all.",
          "Buccaneer",
        ],
        ["dr-of-duel", "Ostentatious Fencer shows +1 dueling on rapier/cutlass only", "Dagger → toggle absent.", "Swashbuckler"],
        ["dr-focusedaim-gate", "Focused Aim −4 DR shows on ranged weapons only", "Was any-weapon before; now ranged-gated.", "Buccaneer"],
      ],
    },
    {
      title: "2 · Blood Frenzy (countable)",
      items: [["bf-count", "Blood Frenzy shows a number field, applies +2×N", "Enter 3 → +6 damage + card note. Enter 0 → nothing.", "Brute"]],
    },
    {
      title: "3 · Burglar DR button",
      items: [
        ["burglar-4", "Burglar gives a −4 ability-test DR button", "Roll any ability → dialog checkbox applies −4.", "Rapscallion"],
        ["burglar-6", "Taken ×2 shows −6 (not −8)", "Uneven progression, base+increment.", "Rapscallion"],
      ],
    },
    {
      title: "4 · Crit range & immunity",
      items: [
        ["cc-crit", "Calculating Cutthroat crits on natural 19 (attack & defend)", "Roll a 19 → critical.", "Swashbuckler"],
        ["surv-immune", "Survivalist blocks Poisoned/Diseased/Infected", "Try to apply → 'immune' notice. Blind etc. still applies.", "Buccaneer"],
      ],
    },
    {
      title: "5 · Black Powder Poet",
      items: [["bpp-bombs", "Dragging BPP onto a fresh character grants d4 bombs, once", "Drawn from the Grenades & Bombs table.", "Swashbuckler"]],
    },
    {
      title: "6 · Inspiring Leader (header chip)",
      items: [
        ["il-roll", "Use button rolls d4 to chat + a header chip appears (±N)", "Features tab → Use.", "Swashbuckler"],
        ["il-dismiss", "Chip tooltip shows roll time; ✕ clears it", "Header stays clean when no active roll.", "Swashbuckler"],
      ],
    },
    {
      title: "7 · Grog Brewer (full loop)",
      items: [
        ["grog-rest", "Long Rest auto-brews d4 grog (in the rest card)", "Grog stock increases.", "Rapscallion"],
        ["grog-button", "Combat-tab Brew button; confirms if already brewed today", "No → nothing; Yes → brews again.", "Rapscallion"],
        ["grog-soak", "'Soak blade in grog' toggle on melee attack; spends a serving", "Only shows with grog in stock + melee weapon.", "Rapscallion"],
        ["grog-onhit", "On a hit: '☠ Toughness DR14 or −d6' + Roll poison damage button", "Poison d6 ignores armor.", "Rapscallion"],
        ["grog-miss", "Miss while soaked: serving spent, no poison line", "Correct behaviour.", "Rapscallion"],
        ["grog-rank2", "Taken ×2 draws a card: Red → d8 die, Black → DR 16", "Drop to ×1 → upgrade clears.", "Rapscallion"],
      ],
    },
    {
      title: "8 · Defense & sheet UI",
      items: [
        ["ui-defend", "Defend is a red torn-parchment scrap under the portrait; works", "Settings → 'Black Defend Button' flips it to black.", "—"],
        ["ui-defbonus", "Defend dialog shows OF +2 as a bold line", "", "Swashbuckler"],
        ["ui-armordr", "Header shows Armor DR (incl. Sea Turtle/Thick Skinned) + Defense", "", "Tall Tale / Brute"],
        ["ui-conditions", "Effects tab: dropdown + grid, each condition once, grid clickable", "No doubling; cells toggle.", "—"],
      ],
    },
    {
      title: "9 · Regression sanity",
      items: [
        ["reg-of", "Ostentatious Fencer = a single effect row; +2 only with rapier/cutlass", "No duplicate.", "Swashbuckler"],
        ["reg-passives", "Shakespeare (+1 dmg) and Dazzling (+2 def) actually apply", "", "Swashbuckler"],
        ["reg-equip", "Equip/unequip repeatedly: no duplicate effects, no console spam", "", "—"],
        ["reg-baseline", "Plain attacks/defends with no special features work unchanged", "", "—"],
      ],
    },
  ];

  const allIds = SECTIONS.flatMap((s) => s.items.map((i) => i[0]));
  const load = () => {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const save = (state) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  let state = load();

  const esc = (s) => foundry.utils.escapeHTML?.(String(s)) ?? String(s);
  const rows = SECTIONS.map((section) => {
    const items = section.items
      .map(([id, text, how, cls]) => {
        const checked = state[id] ? "checked" : "";
        const howHtml = how ? `<div class="pb-chk-how">${esc(how)}</div>` : "";
        const clsHtml = cls && cls !== "—" ? `<span class="pb-chk-cls" data-cls="${esc(cls)}">${esc(cls)}</span>` : "";
        return `<label class="pb-chk-item">
          <input type="checkbox" data-id="${id}" ${checked} />
          <span class="pb-chk-body"><span class="pb-chk-text">${esc(text)}${clsHtml}</span>${howHtml}</span>
        </label>`;
      })
      .join("");
    return `<div class="pb-chk-section"><h3>${esc(section.title)}</h3>${items}</div>`;
  }).join("");

  const content = `
    <style>
      .pb-chk-wrap { font-size: 13px; }
      .pb-chk-progress { position: sticky; top: 0; background: #f4e5c9; padding: 6px 4px; border-bottom: 1px solid #a29280; margin-bottom: 6px; z-index: 1; }
      .pb-chk-bar { height: 8px; background: #cdbb9a; border-radius: 4px; overflow: hidden; margin-top: 4px; }
      .pb-chk-bar > div { height: 100%; background: #8f0f0f; width: 0; transition: width .15s ease; }
      .pb-chk-section h3 { margin: 10px 0 4px; border-bottom: 1px solid #b7a68a; }
      .pb-chk-item { display: flex; align-items: flex-start; gap: 8px; padding: 3px 2px; cursor: pointer; }
      .pb-chk-item:hover { background: rgba(0,0,0,.04); }
      .pb-chk-item input { margin-top: 3px; }
      .pb-chk-body { display: flex; flex-direction: column; }
      .pb-chk-text { font-weight: 600; }
      .pb-chk-how { color: #6b5a3e; font-size: 11px; }
      .pb-chk-cls { display: inline-block; margin-left: 6px; padding: 0 6px; font-size: 10px; font-weight: 600;
        line-height: 15px; border-radius: 8px; background: #8f0f0f; color: #f4e5c9; vertical-align: middle; white-space: nowrap; }
      .pb-chk-item input:checked + .pb-chk-body .pb-chk-text { text-decoration: line-through; opacity: .6; }
    </style>
    <div class="pb-chk-wrap">
      <div class="pb-chk-progress">
        <span class="pb-chk-count"></span>
        <div class="pb-chk-bar"><div></div></div>
      </div>
      ${rows}
    </div>`;

  const refresh = (html) => {
    const done = allIds.filter((id) => state[id]).length;
    const pct = Math.round((done / allIds.length) * 100);
    html.find(".pb-chk-count").text(`${done} / ${allIds.length} tested (${pct}%)`);
    html.find(".pb-chk-bar > div").css("width", `${pct}%`);
  };

  new Dialog(
    {
      title: "PB Test Checklist",
      content,
      buttons: {
        reset: {
          label: "Reset",
          callback: () => {
            state = {};
            save(state);
            ui.notifications.info("Checklist reset.");
          },
        },
        close: { label: "Close" },
      },
      default: "close",
      render: (html) => {
        refresh(html);
        html.on("change", "input[type=checkbox]", (ev) => {
          state[ev.currentTarget.dataset.id] = ev.currentTarget.checked;
          save(state);
          refresh(html);
        });
      },
    },
    { width: 560, height: 640, resizable: true },
  ).render(true);
})();
