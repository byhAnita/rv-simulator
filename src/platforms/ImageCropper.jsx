// src/platforms/ImageCropper.jsx
//
// Choose what part of a picked image is kept, then confirm it.
//
// WHY THIS EXISTS AT ALL. Step 8 shipped with `downscaleCover`, which took the
// largest centred region with the target's aspect ratio. That is the right
// default for an arbitrary image and the wrong one for a face: a photo taken at
// arm's length puts the head in the top third, so a centred square crop cut it
// off — every time, with nothing on screen to say why and no way to correct it.
// Reported from the first hand test as "the ratio is not fixed", which is what a
// crop you did not choose looks like.
//
// THE FRAME IS THE SHAPE THE IMAGE WILL ACTUALLY BE SEEN IN, which is the whole
// point of previewing it. A photo is framed in a circle, because every surface
// that draws her face draws it round (memberFace.jsx). A wallpaper is framed at
// 2:3, because that is the overlay panel's scrolling content area — see the
// WALL_W/WALL_H note in imageStore.js. A square preview of a round avatar would
// be a preview of something the player never sees.
//
// The maths is NOT in here. `coverScale`, `clampOffset` and `cropRect` are pure
// functions in imageStore.js, unit-tested offline, because a wrong crop region
// is invisible until the image is already in the game — and this component can
// only be tested by hand.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PHOTO_PX, PHOTO_QUALITY, WALL_W, WALL_H, WALL_QUALITY,
  coverScale, clampOffset, cropRect, loadImageFile, releaseImage, renderCrop,
} from "../utils/imageStore";
import { castTokens, scaleFont, safeInset } from "./castTheme";

// How far in the player may go. Beyond ~4x a phone photo is visibly soft at
// 256px, so a higher ceiling would only offer results she would reject.
export const MAX_ZOOM = 4;

// The preview frame, in screen pixels. Its RATIO is what matters — `cropRect` is
// invariant to the frame's scale — so these are chosen to fit a 390px phone
// beside a slider and two buttons, not to match the output size.
const FRAME = {
  photo: { w: 244, h: 244, out: [PHOTO_PX, PHOTO_PX], quality: PHOTO_QUALITY, round: true },
  wall: { w: 216, h: 324, out: [WALL_W, WALL_H], quality: WALL_QUALITY, round: false },
};

export default function ImageCropper({
  file, kind = "photo",
  theme = "dark", t, fontScale = 1,
  onConfirm, onCancel, notify,
}) {
  const isLight = theme === "light";
  const k = castTokens(isLight);
  const fs = (px) => scaleFont(px, fontScale);
  const c = t?.cast || {};
  const frame = FRAME[kind] || FRAME.photo;

  const [img, setImg] = useState(null);
  const [view, setView] = useState({ zoom: 1, dx: 0, dy: 0 });
  // Gestures read the current view synchronously, while React's state is what
  // renders it. A mirror rather than a ref-only view: a pinch that read a stale
  // zoom would jump on every second frame.
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    let dead = false;
    let held = null;
    loadImageFile(file).then((el) => {
      if (dead) { releaseImage(el); return; }
      held = el;
      setImg(el);
      setView({ zoom: 1, dx: 0, dy: 0 });
    }).catch(() => {
      if (dead) return;
      notify?.(c.photoFailed, "error");
      onCancel?.();
    });
    return () => { dead = true; releaseImage(held); };
    // One load per picked file. The component is remounted for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const iw = img?.naturalWidth || img?.width || 0;
  const ih = img?.naturalHeight || img?.height || 0;
  const base = useMemo(
    () => coverScale(iw, ih, frame.w, frame.h),
    [iw, ih, frame.w, frame.h],
  );

  // Every write goes through the clamp, so no path can leave the frame showing a
  // blank corner — including the slider, which moves zoom without touching the
  // offset and can therefore invalidate one that was legal a moment ago.
  const apply = (fn) => setView((v) => {
    const n = fn(v);
    const zoom = Math.min(MAX_ZOOM, Math.max(1, Number(n.zoom) || 1));
    const { dx, dy } = clampOffset(n.dx, n.dy, iw, ih, frame.w, frame.h, zoom);
    return { zoom, dx, dy };
  });

  // ── drag to pan, two fingers to zoom ──────────────────────────────────────
  // Pointer events rather than touch events: one code path covers a finger, a
  // trackpad and a mouse, and `setPointerCapture` keeps a drag alive when it
  // leaves the frame — which it does constantly, the frame being 244px.
  const pts = useRef(new Map());
  const pinch = useRef(null);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;   // a new finger restarts the pinch baseline
  };
  const onPointerMove = (e) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const prev = { x: p.x, y: p.y };
    p.x = e.clientX; p.y = e.clientY;
    const all = [...pts.current.values()];
    if (all.length >= 2) {
      const [a, b] = all;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinch.current) { pinch.current = { dist, zoom: viewRef.current.zoom }; return; }
      if (pinch.current.dist > 0) {
        const z = pinch.current.zoom * (dist / pinch.current.dist);
        apply((v) => ({ ...v, zoom: z }));
      }
      return;
    }
    apply((v) => ({ ...v, dx: v.dx + (e.clientX - prev.x), dy: v.dy + (e.clientY - prev.y) }));
  };
  const onPointerUp = (e) => {
    pts.current.delete(e.pointerId);
    pinch.current = null;
  };

  const confirm = () => {
    if (!img) return;
    try {
      const rect = cropRect({ iw, ih, fw: frame.w, fh: frame.h, ...view });
      onConfirm?.(renderCrop(img, rect, frame.out[0], frame.out[1], frame.quality));
    } catch {
      notify?.(c.photoFailed, "error");
      onCancel?.();
    }
  };

  const label = kind === "wall" ? c.wall : c.photo;

  return (
    <div className="rv-fixed" style={{ position: "fixed", inset: 0, zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", background: k.scrim, backdropFilter: "blur(4px)", padding: safeInset(16) }}>
      <div style={{ width: "100%", maxWidth: 330, background: k.panelBg, border: `1px solid ${k.border}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ padding: "11px 14px 8px", borderBottom: `1px solid ${k.border}` }}>
          <div style={{ fontSize: fs(12.5), fontWeight: 700, color: k.accent }}>{c.cropTitle?.(label) || label}</div>
          <div style={{ fontSize: fs(11), color: k.textFaint, marginTop: 3, lineHeight: 1.45 }}>{c.cropHint}</div>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {/* The frame. `touchAction: none` is what stops the page scrolling
              under a drag; without it a vertical pan moves the sheet instead of
              the image and the control feels broken rather than stiff. */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              position: "relative", width: frame.w, height: frame.h,
              borderRadius: frame.round ? "50%" : 12,
              overflow: "hidden", isolation: "isolate",
              background: k.inputBg, border: `1px solid ${k.border}`,
              touchAction: "none", cursor: img ? "grab" : "default", userSelect: "none",
            }}
          >
            {img ? (
              <img
                src={img.src} alt="" draggable={false}
                style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: iw * base, height: ih * base,
                  // Right-to-left: scale, then the pan in FRAME pixels, then
                  // centre. The pan is therefore not multiplied by the zoom,
                  // which is the space `clampOffset` and `cropRect` work in.
                  transform: `translate(-50%,-50%) translate(${view.dx}px,${view.dy}px) scale(${view.zoom})`,
                  transformOrigin: "center",
                  pointerEvents: "none", display: "block", maxWidth: "none",
                }}
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: k.textFaint, fontSize: fs(11) }}>
                {c.cropLoading}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, width: "100%" }}>
            <span aria-hidden style={{ fontSize: fs(11), color: k.textFaint }}>−</span>
            <input
              type="range" min={1} max={MAX_ZOOM} step={0.02}
              value={view.zoom}
              onChange={(e) => apply((v) => ({ ...v, zoom: Number(e.target.value) }))}
              aria-label={c.cropZoom}
              style={{ flex: 1, minHeight: 32, accentColor: k.accent }}
            />
            <span aria-hidden style={{ fontSize: fs(13), color: k.textFaint }}>+</span>
          </div>
        </div>

        <div style={{ padding: "0 14px 14px", display: "flex", gap: 8 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 40, border: `1px solid ${k.border}`, background: "transparent", color: k.textDim, fontSize: fs(12), cursor: "pointer" }}>
            {c.cancel}
          </button>
          <button onClick={confirm} disabled={!img}
            style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 40, border: "none", cursor: img ? "pointer" : "default", background: img ? k.accentGrad : (isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.08)"), color: img ? k.onAccent : k.textFaint, fontSize: fs(12.5), fontWeight: 700 }}>
            {c.cropConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
