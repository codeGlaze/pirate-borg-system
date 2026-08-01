/**
 * Class emblems — optional per-class art (skull/head over a crossed weapon) selectable at
 * character creation. The art and the index live in the repo under
 * `icons/classes/<slug>/emblems/` and `icons/classes/emblems.json`; this module just reads
 * that manifest and resolves stems to served paths. See `icons/classes/README.md`.
 *
 * Paths are built from `game.system.id` so they resolve in both the real system and the beta
 * build (whose id differs) without hardcoding a `pirateborg.` prefix.
 */

let _manifest = null;

const manifestUrl = () => `systems/${game.system.id}/icons/classes/emblems.json`;

/** A class name → its manifest slug, e.g. "Haunted Soul" → "haunted-soul" (matches pack slug). */
export const classSlug = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Resolve an emblem stem to its served PNG path. */
export const emblemAssetPath = (slug, stem) => `systems/${game.system.id}/icons/classes/${slug}/emblems/${stem}.png`;

/** Human label for a stem: drop the 3-letter class code and prettify ("rap-joker-cards" → "Joker cards"). */
export const emblemLabel = (stem) =>
  String(stem)
    .replace(/^[a-z]{3}-/, "")
    .replace(/-/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

/** Load and cache the emblem manifest; returns `{}` if it is missing or unreadable. */
export const loadEmblemManifest = async () => {
  if (_manifest) {
    return _manifest;
  }
  try {
    const res = await fetch(manifestUrl());
    _manifest = res.ok ? await res.json() : {};
  } catch (err) {
    console.warn("pirateborg | could not load class emblem manifest", err);
    _manifest = {};
  }
  return _manifest;
};

/**
 * Resolved emblem options for a class slug, or `null` when the class has none.
 *
 * @param {String} slug
 * @returns {Promise.<?{slug: String, default: String, options: Array.<{stem, path, label, isDefault}>}>}
 */
export const getClassEmblems = async (slug) => {
  const manifest = await loadEmblemManifest();
  const entry = manifest[slug];
  if (!entry || !Array.isArray(entry.options) || entry.options.length === 0) {
    return null;
  }
  return {
    slug,
    default: entry.default,
    options: entry.options.map((stem) => ({
      stem,
      path: emblemAssetPath(slug, stem),
      label: emblemLabel(stem),
      isDefault: stem === entry.default,
    })),
  };
};

/** The default emblem path for a class slug, or "" when the class has no emblem. */
export const defaultEmblemPath = async (slug) => {
  const emblems = await getClassEmblems(slug);
  return emblems ? emblemAssetPath(slug, emblems.default) : "";
};

/**
 * Synchronous "does this class have emblems?" against the already-loaded manifest. Returns
 * false until {@link loadEmblemManifest} has run, so preload it at startup for callers that
 * can't await (e.g. a sheet's header buttons).
 *
 * @param {String} slug
 * @returns {Boolean}
 */
export const hasClassEmblemsSync = (slug) => Boolean(_manifest && _manifest[slug]?.options?.length);
