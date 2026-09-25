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