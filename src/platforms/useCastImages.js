// src/platforms/useCastImages.js
//
// The photo and wallpaper stores as React state, plus the ONE writer for each.
//
// Two screens give a member her images: the custom door's cast builder, and the
// classic door's one-page setup. They were going to be two copies of the same
// refuse-or-save-or-notify sequence, which is the `extractStoryText` failure this
// repo keeps a standing warning about - two copies drift, and the guard gets
// written against the one that is still correct. So the sequence lives here and
// both screens call it.
//
// The refusal RULES are not here either: they are `putPhoto` in imageStore.js,
// parameterised by PHOTO_LIMITS / WALL_LIMITS. This file owns only what happens
// around a refusal - which message, and that nothing is shown that is not on disk.

import { useState } from "react";
import {
  loadPhotos, savePhotos, loadWalls, saveWalls, putPhoto, removePhoto,
  PHOTO_LIMITS, WALL_LIMITS, WALL_MAX_COUNT,
} from "../utils/imageStore";

// `c` is `t.cast`, read at call time so a language switch reaches the messages.
export function useCastImages({ notify, c = {} } = {}) {
  const [photos, setPhotos] = useState(() => loadPhotos());
  const [walls, setWalls] = useState(() => loadWalls());

  // Her photo. `dataUrl === null` removes it. Writes to disk FIRST and renders
  // second, so a refused write never shows a photo that does not exist.
  const setPhotoFor = (id, dataUrl) => {
    const res = dataUrl === null
      ? { ok: true, photos: removePhoto(photos, id) }
      : putPhoto(photos, id, dataUrl, PHOTO_LIMITS);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.photoFull : c.photoTooLarge, "error");
      return;
    }
    if (!savePhotos(res.photos)) { notify?.(c.saveFailed, "error"); return; }
    setPhotos(res.photos);
  };

  // Her wallpaper. Same refusal rules through the same function, different caps
  // and a different key.
  const setWallFor = (id, dataUrl) => {
    const res = dataUrl === null
      ? { ok: true, photos: removePhoto(walls, id) }
      : putPhoto(walls, id, dataUrl, WALL_LIMITS);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.wallFull?.(WALL_MAX_COUNT) : c.photoTooLarge, "error");
      return;
    }
    if (!saveWalls(res.photos)) { notify?.(c.saveFailed, "error"); return; }
    setWalls(res.photos);
  };

  // Another screen wrote the stores (both doors write them synchronously), so
  // re-read rather than trust this instance's copy.
  const refresh = () => { setPhotos(loadPhotos()); setWalls(loadWalls()); };

  return { photos, walls, setPhotoFor, setWallFor, refresh };
}
