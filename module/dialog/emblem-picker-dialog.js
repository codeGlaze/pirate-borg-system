import { classSlug, getClassEmblems } from "../api/class-emblems.js";
import { classItemFromPack, findClassPacks } from "../api/compendium.js";

/**
 * The class' canonical (unmodified) art, resolved from the class compendium by name. Offered as
 * the "Original art" option so a class item that already carries an emblem can be reverted even
 * though its own `img` has been overwritten.
 *
 * @param {PBItem} item A class item.
 * @returns {Promise.<String>}
 */
const originalClassImg = async (item) => {
  for (const pack of findClassPacks()) {
    const cls = await classItemFromPack(pack);
    if (cls?.name === item.name) {
      return cls.img;
    }
  }
  return item.img;
};

/**
 * Apply an image to a class item and, when it is owned by a character, to that character's
 * portrait, prototype token, and any placed tokens — so the class icon and the actor's art stay
 * in lock-step, exactly as they are set together at creation.
 *
 * @param {PBItem} item
 * @param {String} img
 */
const applyEmblem = async (item, img) => {
  await item.update({ img });
  const actor = item.actor;
  if (actor?.type === "character") {
    await actor.update({ img, prototypeToken: { texture: { src: img } } });
    for (const token of actor.getActiveTokens()) {
      await token.document.update({ "texture.src": img });
    }
  }
};

/**
 * Opens a thumbnail picker to (re)choose a class item's emblem after creation, including
 * "Original art" to revert. The chosen image is applied via {@link applyEmblem}.
 *
 * @param {PBItem} item A class item.
 */
export const showClassEmblemPicker = async (item) => {
  const emblems = await getClassEmblems(classSlug(item.name));
  const original = await originalClassImg(item);
  const options = [...(emblems?.options ?? []), { path: original, label: game.i18n.localize("PB.ManualCharacterEmblemOriginal") }];

  const buttons = options
    .map(
      (option) =>
        `<button type="button" class="emblem-option${item.img === option.path ? " selected" : ""}" data-img="${option.path}" title="${option.label}">` +
        `<img src="${option.path}" alt="${option.label}" /><span>${option.label}</span></button>`,
    )
    .join("");

  const dialog = new Dialog(
    {
      title: game.i18n.localize("PB.EditClassEmblem"),
      content: `<div class="emblem-field"><div class="emblem-options">${buttons}</div></div>`,
      buttons: {},
      render: (html) => {
        html.find(".emblem-option").on("click", async (event) => {
          await applyEmblem(item, event.currentTarget.dataset.img);
          dialog.close();
        });
      },
    },
    { classes: ["pirateborg"], width: 360 },
  );
  dialog.render(true);
};
