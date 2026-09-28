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
// 360px overlay panel: the chat background in Bubble, KakaoTalk and Weverse, and
// the post image on Instagram.
//
// 2:3 AND NOT 9:16, corrected after the first hand test. The ratio has to be the
// one the wallpaper is actually SEEN at, and that is not the panel -- it is the
// panel's scrolling content area: 360 wide by ~528 tall, once the 38px title bar
// and the 34px member strip are taken off a 600px panel. At 9:16 the chat
// background lost a sixth of every upload to a crop nobody asked for. At 2:3 it
// loses almost nothing, and Instagram's square became a 4:5 portrait post -- a
// real Instagram ratio -- so that surface trims ~17% instead of the 33% a square
// would take out of a 2:3 image.
//
// Still coarser than the photo (q0.7, not q0.8): it sits behind a scrim with
// text over it, where softness is invisible in a way a face's is not. The count
// is 8 and not 30 because a wallpaper is only ever seen for a member in the
// running cast, which is one main plus subs plus NPCs.
export const WALL_W = 360;
export const WALL_H = 540;
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

// Same backstop reasoning as PHOTO_MAX_CHARS, scaled: ~46 KB is the expected
// string for a 360x540 WebP q0.7, so 90 KB catches an image that resists
// compression without rejecting an ordinary one. Worst case 8 x 90 KB = 720 KB.
//
// The cap did NOT come down with the pixels. It is a backstop for the image that
// compresses badly, and lowering it in step with the typical case is how a
// backstop starts refusing ordinary uploads.
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


// `downscaleCover(file, w, h, q)` and its two wrappers `downscale` /
// `downscaleWall` were here, and step 8's hand test deleted them. They picked
// the crop THEMSELVES — the largest centred region with the target's aspect
// ratio — which is right for an arbitrary image and wrong for a face: a portrait
// held at arm's length puts the head in the top third, so a centred square crop
// reliably cut it off, with nothing on screen to say why or any way to correct
// it. The player chooses the region now (ImageCropper.jsx), and a chosen region
// plus an automatic one is two answers to one question.
//
// Same reasoning as `pruneOrphans` one comment up: not kept "in case", because a
// function with no caller is what this repo already carries two constants as a
// standing example of. `cropRect` below reproduces the old centre crop exactly
// at zoom 1 with no offset, and smoke asserts that — so the behaviour survives
// as the cropper's starting position rather than as dead code.

/**
 * The zoom at which an image just covers a frame. Pure.
 *
 * Below it the frame would show through at one pair of edges; at it exactly one
 * axis fits and the other overflows. It is the cropper's zoom=1, which is what
 * makes "confirm immediately" produce the centred crop the old code produced.
 */
export function coverScale(iw, ih, fw, fh) {
  if (!(iw > 0 && ih > 0 && fw > 0 && fh > 0)) return 1;
  return Math.max(fw / iw, fh / ih);
}

/**
 * Hold a pan inside the image. Pure.
 *
 * `dx`/`dy` move the image's centre away from the frame's, in FRAME pixels, so
 * the bound is half the overflow on that axis. Returning the clamped pair rather
 * than rejecting it is what makes a drag feel like it stops at the edge instead
 * of snapping back — and it is the reason the frame can never show a blank
 * corner, which is a crop the player would have to notice in the game.
 */
export function clampOffset(dx, dy, iw, ih, fw, fh, zoom = 1) {
  const s = coverScale(iw, ih, fw, fh) * (zoom > 0 ? zoom : 1);
  const maxX = Math.max(0, (iw * s - fw) / 2);
  const maxY = Math.max(0, (ih * s - fh) / 2);
  return {
    dx: Math.min(maxX, Math.max(-maxX, Number(dx) || 0)),
    dy: Math.min(maxY, Math.max(-maxY, Number(dy) || 0)),
  };
}

/**
 * The region of the source image the frame is showing. Pure.
 *
 * Returns `{sx, sy, sw, sh}` in source pixels, ready for `drawImage`. The frame
 * dimensions are the ones on SCREEN, and the result is invariant to their scale
 * — only their ratio matters — so the preview can be any convenient size while
 * the output stays WALL_W x WALL_H or PHOTO_PX square.
 *
 * This is the half of the cropper that can be wrong in a way nobody sees until
 * the image is already in the game, which is why it is pure and unit-tested
 * rather than living inside the component that drags it.
 */
export function cropRect({ iw, ih, fw, fh, zoom = 1, dx = 0, dy = 0 }) {
  const s = coverScale(iw, ih, fw, fh) * (zoom > 0 ? zoom : 1);
  // ONE enforcement of "the frame stays inside the image", and this is it. The
  // first version also bounded the result into the image afterwards, and two
  // clamps of one rule is two clamps neither of which can be shown to work:
  // break either and the other silently covers for it, so the guard that is
  // supposed to catch a blank corner passes against both halves being wrong.
  const { dx: cx, dy: cy } = clampOffset(dx, dy, iw, ih, fw, fh, zoom);
  const sw = Math.min(iw, fw / s);
  const sh = Math.min(ih, fh / s);
  // The image's top-left in frame coordinates, inverted into source pixels.
  const left = (fw - iw * s) / 2 + cx;
  const top = (fh - ih * s) / 2 + cy;
  // `Math.max(0, …)` is a floating-point floor and not a bound: exactly at the
  // clamp limit the division can land on -1e-13, and drawImage would then read
  // from outside the bitmap.
  return { sx: Math.max(0, -left / s), sy: Math.max(0, -top / s), sw, sh };
}

/**
 * Decode a picked file into an <img>. Browser only.
 *
 * Split from the drawing so the cropper can show the image while the player
 * frames it: the same decoded bitmap is measured, previewed and finally cropped,
 * rather than being decoded once per attempt.
 *
 * The object URL is revoked by `releaseImage` and not here, because the element
 * this resolves with is the one the preview keeps on screen.
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("no_file")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode_failed")); };
    img.src = url;
  });
}

/** Release what `loadImageFile` held. Safe to call twice. */
export function releaseImage(img) {
  try { if (img?.src?.startsWith("blob:")) URL.revokeObjectURL(img.src); } catch { /* nothing to release */ }
}

/**
 * Draw one crop region to a w x h canvas and return a WebP data URL.
 *
 * Browser only — the one function here that cannot be tested offline, and the
 * only canvas routine in the module, so the WebP fallback has one home.
 *
 * Falls back to JPEG where WebP is not encodable. Safari supported
 * canvas.toDataURL("image/webp") only from 14, and a browser that cannot encode
 * it silently returns a PNG data URL instead of failing — a PNG of a photo is
 * several times larger and would trip the size guard, so the format is checked
 * rather than assumed.
 */
export function renderCrop(img, rect, w, h, quality = PHOTO_QUALITY) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
  let out = canvas.toDataURL("image/webp", quality);
  if (!out.startsWith("data:image/webp")) {
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}
