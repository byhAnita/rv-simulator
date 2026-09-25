// src/utils/imageStore.js
//
// Cast photos: one small square image per member, kept on the device.
//
// The module is split in two on purpose. `downscale` needs a canvas and can
// only run in a browser; everything else is a pure function over a plain
// object and is unit-tested offline in smoke Layer I. Putting the quota rules
// behind the canvas would make them testable only by hand, and they are the
// half that can lose a player's data.
//
// docs/V140_PLAN.md §10: photos are what make the storage budget real. A phone
// photo is 3-5 MB and base64 inflates it by about a third, so ONE of them
// stored as picked would exceed the whole ~5 MB localStorage quota. They are
// downscaled before they are ever handed to the store.

// The extension is load-bearing and the only one in src/. `src/utils.js` and
// `src/utils/` now both exist, so bare "../utils" asks the resolver to choose
// between a file and the directory this module lives in. Vite and esbuild both
// pick the file today; naming it removes the question. See the note in
// src/utils.js before adding a src/utils/index.js, which would silently
// re-point every `from "./utils"` in the app.
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils.js";

export const PHOTO_PX = 256;
export const PHOTO_QUALITY = 0.8;
export const PHOTO_MAX_COUNT = 30;

// Measured on the STORED STRING, not on the decoded image, because the string
// is what consumes the quota — a data URL is ~37% larger than the bytes it
// carries and counting the smaller number would under-report the cost of every
// photo. A 256x256 WebP at q0.8 lands near 15 KB binary, so ~20 KB of string:
// the limit is a backstop for an image that resists compression, not a target.
//
// Worst case is therefore 30 x 40 KB = 1.2 MB, above §10's 450 KB estimate,
// which assumed every photo is typical. Both fit, but quote the right one.
export const PHOTO_MAX_CHARS = 40 * 1024;

/** Read the photo map. Always an object, even if the key is absent or corrupt. */
export function loadPhotos() {
  const raw = loadFromStorage(STORAGE_KEYS.CAST_PHOTOS);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** Persist the photo map. Returns false when the browser refused the write. */
export function savePhotos(photos) {
  return saveToStorage(STORAGE_KEYS.CAST_PHOTOS, photos);
}

/**
 * Add or replace one photo. Pure — the caller persists.
 *
 * Returns {ok, photos, reason}. Like the cast palette, a refusal is a value and
 * not an exception: it is the player's own data and the UI has to be able to
 * say which rule it hit. Replacing an existing photo is never refused for count,
 * only for size — otherwise a full store would freeze every photo already in it.
 */
export function putPhoto(photos, memberId, dataUrl) {
  const map = photos && typeof photos === "object" && !Array.isArray(photos) ? photos : {};
  if (!memberId) return { ok: false, photos: map, reason: "no_member" };
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: false, photos: map, reason: "not_an_image" };
  }
  if (dataUrl.length > PHOTO_MAX_CHARS) {
    return { ok: false, photos: map, reason: "too_large", chars: dataUrl.length };
  }
  const replacing = Object.prototype.hasOwnProperty.call(map, memberId);
  if (!replacing && Object.keys(map).length >= PHOTO_MAX_COUNT) {
    return { ok: false, photos: map, reason: "full" };
  }
  return { ok: true, photos: { ...map, [memberId]: dataUrl } };
}

/** Drop one photo. */
export function removePhoto(photos, memberId) {
  const map = photos && typeof photos === "object" && !Array.isArray(photos) ? photos : {};
  if (!Object.prototype.hasOwnProperty.call(map, memberId)) return map;
  const next = { ...map };
  delete next[memberId];
  return next;
}

/** Total stored characters — what the quota actually counts. */
export function photoBytes(photos) {
  return Object.values(photos || {}).reduce((n, v) => n + String(v || "").length, 0);
}

/**
 * Drop photos belonging to nobody in `keepIds`.
 *
 * A deleted custom member leaves her photo behind otherwise, and the store has
 * a hard cap, so the orphans would eventually refuse a photo for a member who
 * exists. Called when the palette changes, never on a timer: a save in flight
 * must not have data removed underneath it.
 */
export function pruneOrphans(photos, keepIds) {
  const keep = new Set(keepIds || []);
  const next = {};
  for (const [id, url] of Object.entries(photos || {})) if (keep.has(id)) next[id] = url;
  return next;
}

/**
 * Draw a picked file to a square canvas and return a WebP data URL.
 *
 * Browser only — the one function here that cannot be tested offline.
 * Center-crops to a square before scaling so a portrait photo is not squashed;
 * a face in a cast card is the subject, and letterboxing it would waste most of
 * the 256 px on background.
 *
 * Falls back to JPEG where WebP is not encodable. Safari supported
 * canvas.toDataURL("image/webp") only from 14, and a browser that cannot encode
 * it silently returns a PNG data URL instead of failing — a PNG of a photo is
 * several times larger and would trip the size guard, so the format is checked
 * rather than assumed.
 */
export function downscale(file, px = PHOTO_PX, quality = PHOTO_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("no_file")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img,
          (img.width - side) / 2, (img.height - side) / 2, side, side,
          0, 0, px, px);
        let out = canvas.toDataURL("image/webp", quality);
        if (!out.startsWith("data:image/webp")) {
          out = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(out);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode_failed")); };
    img.src = url;
  });
}
