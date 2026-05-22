// src/utils.js

export const nowTime = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const STORAGE_KEYS = {
  SAVES: "rv_sim_saves_v11",
  API_KEY: "rv_sim_api_key_v11",
  FORM: "rv_sim_form_v11",
  SOCIAL_FEEDS: "rv_sim_social_v11",
  SELECTED_MODEL: "rv_sim_model_v11",
};

export const loadFromStorage = (key) => {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch { return null; }
};

export const saveToStorage = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};