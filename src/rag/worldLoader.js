// src/rag/worldLoader.js
//
// A world is the half of the old "group" concept that is not the cast: the
// setting's identities, paces, phase beats, NPC archetypes and — the part that
// is easy to mistake for a language concern — its address forms.
//
// Fetched at runtime from public/worlds/, exactly like group JSON, so the
// prefix comes from the build and never from the hostname. See groupLoader.js
// for why that rule exists.

const base = () => import.meta.env.BASE_URL;

export const DEFAULT_WORLD_ID = "kpop_idol";

/**
 * Load a world document.
 * @param {string} worldId - matches the folder name under public/worlds/
 * @param {string} language - zh/en/ko
 * @returns {Promise<object>} parsed world
 */
export async function loadWorld(worldId = DEFAULT_WORLD_ID, language = "zh") {
  const url = `${base()}worlds/${worldId}/${language}.json`;

  const response = await fetch(url);
  if (response.ok) return parseWorld(await response.json(), worldId, language);

  // A missing translation falls back to zh, the language every world is
  // authored in first. A missing world does not fall back to anything.
  if (language !== "zh") {
    console.warn(`worlds/${worldId}/${language}.json not found, falling back to zh.json`);
    const fallback = await fetch(`${base()}worlds/${worldId}/zh.json`);
    if (fallback.ok) return parseWorld(await fallback.json(), worldId, "zh");
  }
  throw new Error(`world load failed: ${worldId}/${language} (HTTP ${response.status})`);
}

// Required top-level keys. `parseGroupConfig` is a field whitelist and silently
// dropped `birthday` for two releases, so this validates instead of copying:
// a world missing a key fails loudly at load rather than reaching
// buildSystemPrompt as a blank section nobody notices until the writing drifts.
const REQUIRED = ["world", "identities", "paces", "phases", "addressForms", "npcArchetypes"];

export function parseWorld(config, worldId = DEFAULT_WORLD_ID, language = "zh") {
  const where = `${worldId}/${language}`;
  for (const key of REQUIRED) {
    if (config?.[key] === undefined) throw new Error(`world ${where}: missing "${key}"`);
  }
  const { world, identities, paces, phases, addressForms, npcArchetypes } = config;

  if (!Array.isArray(identities) || identities.length === 0) {
    throw new Error(`world ${where}: "identities" must be a non-empty array`);
  }
  if (!Array.isArray(paces) || paces.length === 0) {
    throw new Error(`world ${where}: "paces" must be a non-empty array`);
  }
  if (!Array.isArray(phases) || phases.length === 0) {
    throw new Error(`world ${where}: "phases" must be a non-empty array`);
  }
  // The token table is what the whole address protocol reads. An absent `ya` is
  // meaningful (zh has no usable vocative particle — see CLAUDE.md), so it is
  // checked for presence of the key set rather than for truthiness.
  const tk = addressForms?.tokens;
  if (!tk || typeof tk !== "object") {
    throw new Error(`world ${where}: "addressForms.tokens" must be an object`);
  }
  for (const k of ["unnie", "ya", "nim", "ssi", "sep"]) {
    if (!(k in tk)) throw new Error(`world ${where}: addressForms.tokens is missing "${k}"`);
  }
  if (typeof addressForms.guide !== "string") {
    throw new Error(`world ${where}: "addressForms.guide" must be a string`);
  }

  return {
    id: world?.id || worldId,
    name: world?.name || worldId,
    emoji: world?.emoji || "",
    color: world?.color || "",
    identities,
    paces,
    phases,
    addressForms,
    npcArchetypes,
  };
}

export const getIdentity = (world, id) =>
  world?.identities?.find((i) => i.id === id) || null;

export const getPaceRule = (world, id) =>
  world?.paces?.find((p) => p.id === id)?.rule || "";

/**
 * Render an identity's background text.
 *
 * `{name}` is the main member. `{reason}` and `{keepsake}` exist only on the
 * ex-girlfriend identity and are picked from `variants` by `seed` — the same
 * two-index scheme the code used before the data moved out: separate bit ranges,
 * so the keepsake is not locked to the breakup reason. The seed comes from
 * backstorySeed(), which is why this is stable for the life of a save and why
 * the static prompt can be cached at all. See CLAUDE.md, "buildSystemPrompt must
 * be a pure function of the save".
 */
export function renderIdentityBackground(world, identityId, mainMemberName, seed = 0) {
  const entry = getIdentity(world, identityId);
  if (!entry?.background) return "";
  let out = entry.background.replaceAll("{name}", mainMemberName || "her");
  const v = entry.variants;
  if (v) {
    if (Array.isArray(v.reason) && v.reason.length > 0) {
      out = out.replaceAll("{reason}", v.reason[seed % v.reason.length]);
    }
    if (Array.isArray(v.keepsake) && v.keepsake.length > 0) {
      out = out.replaceAll("{keepsake}", v.keepsake[(seed >>> 16) % v.keepsake.length]);
    }
  }
  return out;
}
