// src/utils.js
//
// CAREFUL: `src/utils/` (the directory holding imageStore.js) exists alongside
// this file. Every `from "./utils"` in src/ resolves HERE, because both resolvers
// prefer the file — but adding a `src/utils/index.js` would silently re-point
// all of them at the directory instead. Do not create one; give a new module
// its own named path, as imageStore.js does.

export const nowTime = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const STORAGE_KEYS = {
  SAVES: "rv_sim_saves_v13",
  API_KEY: "rv_sim_api_key_v11",
  FORM: "rv_sim_form_v11",
  SOCIAL_FEEDS: "rv_sim_social_v11",
  SELECTED_MODEL: "rv_sim_model_v11",
  REASONING: "rv_sim_reasoning_v13",
  ALIYUN_MODE: "rv_sim_aliyun_mode",
  ALIYUN_PAID_MODEL: "rv_sim_aliyun_paid_model",
  ALIYUN_ROUTE: "rv_sim_aliyun_route",
  // v1.4.0 step 6. New keys go here rather than into an inline string literal
  // in App.jsx — the note above this object has said so for three releases and
  // nine of the fifteen keys still ignore it.
  //
  // docs/V140_PLAN.md §4.3 lists two more, `rv_sim_worlds_custom_v14` and
  // `rv_sim_world`, and they are deliberately NOT here: custom worlds and world
  // selection are v1.4.1, and this repo already carries two constants nobody
  // imports (NPC_APPEARANCE_CHANCE, NPC_COOLDOWN_ROUNDS) as a standing example
  // of what declaring ahead of the reader costs.
  CAST_CUSTOM: "rv_sim_cast_custom_v14",   // [{id, lang, createdAt, profile}]
  ROSTERS: "rv_sim_rosters_v14",           // [{id, name, createdAt, roster}]
  CAST_PHOTOS: "rv_sim_cast_photos_v14",   // {memberId: dataUrl} - 256x256 WebP
};

// Ten save slots, and the ELEVENTH SAVE IS REFUSED rather than quietly taking
// the oldest one's place.
//
// It used to be `[newSave, ...saves].slice(0, 10)`. Because a slot id is
// `Date.now()`, no save ever replaces another — every one is a new slot — so a
// player with ten saves lost her oldest run on the next save, with no warning
// and no way to get it back. The list simply had a different first entry.
//
// That is the same failure `saveToStorage` was given a return value for: silence
// is the wrong default for the one operation whose whole purpose is durability.
// A refused save is recoverable in one tap once the player is told; a deleted run
// is not recoverable at all, so the cap must refuse rather than evict.
//
// Pure and exported so the rule is unit-tested rather than reachable only by
// filling ten slots by hand — the same reason customCast's quota rules are pure.
export const SAVE_SLOT_MAX = 10;

/**
 * @returns {{ok: boolean, saves: Array, reason: string|null}}
 *   `saves` is the list to persist on success, and the UNCHANGED list on
 *   failure, so a caller that renders the result cannot show a slot that does
 *   not exist.
 */
export function addSaveSlot(saves, newSave, max = SAVE_SLOT_MAX) {
  const list = Array.isArray(saves) ? saves : [];
  if (!newSave || newSave.id == null) return { ok: false, saves: list, reason: "no_save" };
  const rest = list.filter((s) => s && s.id !== newSave.id);
  // Overwriting an existing slot is allowed at the cap, because it frees the one
  // it takes. Nothing does that today (ids are timestamps) — it is here so that
  // adding overwrite later cannot reintroduce the eviction by accident.
  if (rest.length === list.length && rest.length >= max) {
    return { ok: false, saves: list, reason: "slots_full" };
  }
  return { ok: true, saves: [newSave, ...rest], reason: null };
}

/**
 * What to CALL a member on screen. Display only.
 *
 * DO NOT USE THIS IN A PROMPT. `member.name` — the Latin stage name — is the
 * cast's canonical identity everywhere the model can see: MEMBER PROFILES names
 * her by it, the address protocol's Address line is computed against it, and
 * `membersNamedIn` reads it back out of the prose to decide who appeared. A
 * display name reaching `buildSystemPrompt` would move all three goldens and
 * change who the model thinks is in the scene.
 *
 * The player, though, is picking people she recognises, and the name she
 * recognises is language-specific:
 *
 *   zh  裴珠泫   ko  배주현   en  Irene
 *
 * `name_kr` is the localized REAL name in every group file, so zh and ko take
 * it. English does not: `name_kr` there is a romanized Korean legal name
 * ("Bae Ju-hyun"), which is longer than the stage name and not what an English
 * reader knows her as — so en keeps `name`. This is the same split as the zh
 * address-form table, and for the same reason: the choice follows what the
 * audience actually reads, not consistency for its own sake.
 *
 * Custom members carry `name_kr` only if the player filled that optional field,
 * hence the fallback.
 */
export const displayNameIn = (member, language = "zh") => {
  const stage = member?.name || "";
  if (language === "en") return stage || member?.name_kr || "";
  return member?.name_kr || stage;
};

export const loadFromStorage = (key) => {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch { return null; }
};

// Returns true when the value is actually on disk, false when the browser
// refused it. The refusal that matters is QuotaExceededError: localStorage is
// ~5MB and a save slot carries the full message history, so ten slots of a long
// run can genuinely fill it. This used to `catch {}`, which meant a save the
// player watched appear in the list had never been written - and they found out
// only when they came back for it. Callers that hold player data must check the
// result; callers writing a preference (theme, font scale, language) ignore it
// on purpose, because a lost preference is visible and re-settable in one tap.
export const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("[storage] write failed:", key, e?.name || e);
    return false;
  }
};