// src/utils.js

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