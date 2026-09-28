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

// Her wallpaper -- step 8. Portrait, because every surface it lands on is the
// 360px overlay panel: the chat background in Bubble and KakaoTalk, the post
// image on Instagram, the header banner on Weverse.
//
// 360x640 at q0.7 rather than the photo's 256x256 at q0.8: it is ~3.5x the
// pixels, so it costs ~3x the string even at the lower quality, and it sits
// behind a scrim with text over it -- softness is invisible where a face's
// would not be. The count is 8 and not 30 because a wallpaper is only ever seen
// for a member in the running cast, which is one main plus subs plus NPCs.
export const WALL_W = 360;
export const WALL_H = 640;
export const WALL_QUALITY = 0.7;
export const WALL_MAX_COUNT = 8;

// Measured on the STORED STRING, not on the decoded image, because the string
// is what consumes the quota — a data URL is ~37% larger than the bytes it
// carries and counting the smaller number would under-report the cost of every
// photo. A 256x256 WebP at q0.8 lands near 15 KB binary, so ~20 KB of string:
// the limit is a backstop for an image that resists compression, not a target.
//
// Worst case is therefore 30 x 40 KB = 1.2 MB, above §10's 450 KB estimate,
// which assumed every photo is typical. Both fit, but quote the right one.
export const PHOTO_MAX_CHARS = 40 * 1024;

// Same backstop reasoning as PHOTO_MAX_CHARS, scaled: ~55 KB is the expected
// string for a 360x640 WebP q0.7, so 90 KB catches an image that resists
// compression without rejecting an ordinary one. Worst case 8 x 90 KB = 720 KB.
export const WALL_MAX_CHARS = 90 * 1024;

/** Read one image map. Always an object, even if the key is absent or corrupt. */
export function loadImageMap(key) {
  const raw = loadFromStorage(key);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** Persist one image map. Returns false when the browser refused the write. */
export function saveImageMap(key, map) {
  return saveToStorage(key, map);
}

/** Read the photo map. */
export function loadPhotos() {
  return loadImageMap(STORAGE_KEYS.CAST_PHOTOS);
}

/** Persist the photo map. Returns false when the browser refused the write. */
export function savePhotos(photos) {
  return saveImageMap(STORAGE_KEYS.CAST_PHOTOS, photos);
}

/** Read the wallpaper map. */
export function loadWalls() {
  return loadImageMap(STORAGE_KEYS.CAST_WALLS);
}

/** Persist the wallpaper map. Returns false when the browser refused the write. */
export function saveWalls(walls) {
  return saveImageMap(STORAGE_KEYS.CAST_WALLS, walls);
}

/** The caps for each store, so a caller names the store and not three numbers. */
export const PHOTO_LIMITS = { maxCount: PHOTO_MAX_COUNT, maxChars: PHOTO_MAX_CHARS };
export const WALL_LIMITS = { maxCount: WALL_MAX_COUNT, maxChars: WALL_MAX_CHARS };

/**
 * Add or replace one photo. Pure — the caller persists.
 *
 * Returns {ok, photos, reason}. Like the cast palette, a refusal is a value and
 * not an exception: it is the player's own data and the UI has to be able to
 * say which rule it hit. Replacing an existing photo is never refused for count,
 * only for size — otherwise a full store would freeze every photo already in it.
 *
 * `limits` is an argument rather than a module constant because step 8 added a
 * second store with different caps. A second copy of these four rules is the
 * `extractStoryText` failure — two copies drift, and the guard gets written
 * against whichever one was still correct.
 */
export function putPhoto(photos, memberId, dataUrl, limits = PHOTO_LIMITS) {
  const maxCount = limits?.maxCount ?? PHOTO_MAX_COUNT;
  const maxChars = limits?.maxChars ?? PHOTO_MAX_CHARS;
  const map = photos && typeof photos === "object" && !Array.isArray(photos) ? photos : {};
  if (!memberId) return { ok: false, photos: map, reason: "no_member" };
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: false, photos: map, reason: "not_an_image" };
  }
  if (dataUrl.length > maxChars) {
    return { ok: false, photos: map, reason: "too_large", chars: dataUrl.length };
  }
  const replacing = Object.prototype.hasOwnProperty.call(map, memberId);
  if (!replacing && Object.keys(map).length >= maxCount) {
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

// `pruneOrphans(photos, keepIds)` was here, and step 8 DELETED it rather than
// leaving it unused. It kept only the ids in a list the caller supplied, and its
// one caller passed the custom palette — correct while only an authored member
// could have a photo, and data loss the moment a library member could, since
// every library photo is absent from that list. The delete site now removes the
// one id that stopped existing, which needs no id universe; this screen does not
// have one anyway, because group configs are fetched per tab.
//
// Not kept "for v1.5.0": a function with no caller is the thing this repo
// already carries two of (NPC_APPEARANCE_CHANCE, NPC_COOLDOWN_ROUNDS) as a
// standing example of what that costs, and it is eight lines to write again.

/**
 * Draw a picked file to a w x h canvas and return a WebP data URL.
 *
 * Browser only — the one function here that cannot be tested offline.
 * Center-crops to the TARGET ASPECT RATIO before scaling, so neither a portrait
 * photo in a square avatar nor a landscape one in a portrait wallpaper is
 * squashed. The subject of both is near the middle of the frame; letterboxing
 * would spend the pixels on empty bars instead.
 *
 * Falls back to JPEG where WebP is not encodable. Safari supported
 * canvas.toDataURL("image/webp") only from 14, and a browser that cannot encode
 * it silently returns a PNG data URL instead of failing — a PNG of a photo is
 * several times larger and would trip the size guard, so the format is checked
 * rather than assumed.
 */
export function downscaleCover(file, w, h, quality = PHOTO_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("no_file")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        // The largest region of the source with the target's aspect ratio.
        const want = w / h;
        const have = img.width / img.height;
        const sw = have > want ? img.height * want : img.width;
        const sh = have > want ? img.height : img.width / want;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img,
          (img.width - sw) / 2, (img.height - sh) / 2, sw, sh,
          0, 0, w, h);
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

/** A square avatar. The original call, now one aspect ratio of the general one. */
export function downscale(file, px = PHOTO_PX, quality = PHOTO_QUALITY) {
  return downscaleCover(file, px, px, quality);
}

/** Her wallpaper: portrait, to fill the 360px overlay panel. */
export function downscaleWall(file) {
  return downscaleCover(file, WALL_W, WALL_H, WALL_QUALITY);
}
