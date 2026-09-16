// src/tools/aliyunRoute.js
// Free-credit route state, scoped to one API key. Persisted so a model that
// ran dry stays skipped across reloads; reset when the key changes.

import { ALIYUN_FREE_ROUTE, ALIYUN_PAID_MODELS, ALIYUN_DEFAULT_PAID_MODEL } from "../config/modelConfigs";
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils";

const UNAVAILABLE_TTL_MS = 24 * 60 * 60 * 1000;
// A model that timed out or returned unusable output gets a short rest, not a
// permanent mark: both are usually transient load, not a property of the model.
const DEGRADED_TTL_MS = 60 * 60 * 1000;
// Free credits do not come back for an account, so `exhausted` is permanent --
// except that a top-up makes every model answer again. When the route is empty
// we probe once an hour to notice that, rather than stranding the player.
const PROBE_INTERVAL_MS = 60 * 60 * 1000;

// Models whose request params were rejected (bad_request). Session-only: the
// fix is a config change, not something that should survive a reload.
const sessionSkipped = new Set();

// FNV-1a, so the stored state is tied to a key without storing the key twice.
export function hashKey(apiKey) {
  let h = 0x811c9dc5;
  for (const ch of (apiKey || "").trim()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Stored state may be missing, from an older build, or hand-edited; anything
// that is not a plain object is treated as empty rather than crashing a round.
const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function loadRouteState(apiKey) {
  const keyHash = hashKey(apiKey);
  const stored = asMap(loadFromStorage(STORAGE_KEYS.ALIYUN_ROUTE));
  if (stored.keyHash === keyHash) {
    return {
      keyHash,
      exhausted: asMap(stored.exhausted),
      unavailable: asMap(stored.unavailable),
      degraded: asMap(stored.degraded),
      lastProbe: typeof stored.lastProbe === "number" ? stored.lastProbe : 0,
      lastModel: typeof stored.lastModel === "string" ? stored.lastModel : null,
    };
  }
  // A different key: a new account starts from a full route. A rotated key on
  // the same account also resets and then re-learns its marks, which the
  // caller's per-round budget keeps cheap.
  return { keyHash, exhausted: {}, unavailable: {}, degraded: {}, lastProbe: 0, lastModel: null };
}

export function getFreeCandidates(apiKey, now = Date.now()) {
  const state = loadRouteState(apiKey);
  return ALIYUN_FREE_ROUTE.filter(id =>
    !state.exhausted[id]
    && !(state.unavailable[id] && now - state.unavailable[id] < UNAVAILABLE_TTL_MS)
    && !(state.degraded[id] && now - state.degraded[id] < DEGRADED_TTL_MS)
    && !sessionSkipped.has(id));
}

export function markModel(apiKey, modelId, kind) {
  if (kind === "bad_request") { sessionSkipped.add(modelId); return; }
  const state = loadRouteState(apiKey);
  if (kind === "free_exhausted") state.exhausted[modelId] = Date.now();
  else if (kind === "model_unavailable") state.unavailable[modelId] = Date.now();
  else if (kind === "timeout" || kind === "bad_response") state.degraded[modelId] = Date.now();
  else return;
  saveToStorage(STORAGE_KEYS.ALIYUN_ROUTE, state);
}

// True at most once per PROBE_INTERVAL_MS. Records the attempt immediately so a
// failing probe cannot repeat every round.
export function shouldProbeForRecovery(apiKey, now = Date.now()) {
  const state = loadRouteState(apiKey);
  if (now - state.lastProbe < PROBE_INTERVAL_MS) return false;
  state.lastProbe = now;
  saveToStorage(STORAGE_KEYS.ALIYUN_ROUTE, state);
  return true;
}

// The probe answered, so the account has balance again (a top-up). Everything
// marked used-up is stale; unavailable/degraded marks age out on their own.
export function clearExhausted(apiKey) {
  const state = loadRouteState(apiKey);
  state.exhausted = {};
  saveToStorage(STORAGE_KEYS.ALIYUN_ROUTE, state);
}

// Player-facing reset behind the key page control: forget everything we learned
// about this key and start the route over.
export function resetFreeRoute(apiKey) {
  sessionSkipped.clear();
  saveToStorage(STORAGE_KEYS.ALIYUN_ROUTE, {
    keyHash: hashKey(apiKey), exhausted: {}, unavailable: {}, degraded: {}, lastProbe: 0, lastModel: null,
  });
}

// Returns the model that served the previous round, so the caller can tell
// whether this round switched.
export function recordServedModel(apiKey, modelId) {
  const state = loadRouteState(apiKey);
  const previous = state.lastModel;
  if (previous !== modelId) {
    state.lastModel = modelId;
    saveToStorage(STORAGE_KEYS.ALIYUN_ROUTE, state);
  }
  return previous;
}

export function getFreeRouteStatus(apiKey) {
  const candidates = getFreeCandidates(apiKey);
  return { current: candidates[0] || null, available: candidates.length, total: ALIYUN_FREE_ROUTE.length };
}

export function resolvePaidModel(modelId) {
  return ALIYUN_PAID_MODELS.some(m => m.id === modelId) ? modelId : ALIYUN_DEFAULT_PAID_MODEL;
}

export function resetSessionSkips() {
  sessionSkipped.clear();
}
