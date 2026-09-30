// src/platforms/CastImageSheet.jsx
//
// One sheet for both of a member's images: her photo, and her wallpaper.
//
// WHY ONE SHEET AND NOT A CONTROL PER MEMBER. The obvious place for "give her a
// photo" is a small camera badge on each card in the picker grid. That grid is
// three columns at 390px and the card itself is the assign target — a 20px badge
// beside a 40px target is exactly the adjacency that made the previous builder
// untappable, where a mis-tap did not miss but assigned the wrong role. One
// entry point costs one tap to reach and reintroduces nothing.
//
// It also gives the two caps and the byte total somewhere to live. The photo
// store holds 30 and the wallpaper store 8, and BOTH ARE VISIBLE AT ALL TIMES
// here rather than at the moment they refuse — which is the lesson the save
// slots cost a run to learn, and the member palette repeated one screen over.
//
// It lists the CHOSEN cast rather than the library. A photo can only ever be
// seen for a member who is in the run, so a library of 57 faces to scroll would
// be 57 rows offering something 52 of them cannot show.

import React, { useRef, useState } from "react";
import MemberFace from "./memberFace";
import ImageCropper from "./ImageCropper";
import { castTokens, scaleFont } from "./castTheme";
import {
  PHOTO_MAX_COUNT, WALL_MAX_COUNT, photoBytes,
} from "../utils/imageStore";

export default function CastImageSheet({
  rows = [],                 // [{id, name, member}]
  photos = {}, walls = {},
  onPickPhoto, onPickWall,   // (id, dataUrl) — already cropped, see ImageCropper
  onClearPhoto, onClearWall, // (id)
  language = "zh", theme = "dark", t, fontScale = 1,
  notify,
  onClose,
}) {
  const isLight = theme === "light";
  const k = castTokens(isLight);
  const fs = (px) => scaleFont(px, fontScale);
  const c = t?.cast || {};

  // One hidden input, retargeted per tap. One per row would be 2N inputs in the
  // DOM for a control used once.
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);   // {id, kind}

  // The picked file, waiting to be framed. A file never becomes a stored image
  // without passing through the cropper: an automatic crop plus a chosen one is
  // two answers to one question, and the automatic one is the bug this fixed.
  const [cropping, setCropping] = useState(null);   // {id, kind, file}

  const ask = (id, kind) => {
    setPending({ id, kind });
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  };
  const took = (e) => {
    const file = e.target.files?.[0];
    const p = pending;
    setPending(null);
    if (!file || !p) return;
    setCropping({ ...p, file });
  };
  const cropped = (dataUrl) => {
    const p = cropping;
    setCropping(null);
    if (!p) return;
    if (p.kind === "photo") onPickPhoto?.(p.id, dataUrl);
    else onPickWall?.(p.id, dataUrl);
  };

  const kb = Math.round((photoBytes(photos) + photoBytes(walls)) / 1024);

  const pill = (label, onClick, tone = "dim") => (
    <button onClick={onClick}
      style={{
        padding: "6px 10px", minHeight: 32, borderRadius: 15, cursor: "pointer",
        border: `1px solid ${tone === "danger" ? "rgba(180,60,20,.28)" : k.border}`,
        background: "transparent",
        color: tone === "danger" ? k.danger : (tone === "accent" ? k.accent : k.textDim),
        fontSize: fs(11), whiteSpace: "nowrap",
      }}>
      {label}
    </button>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "flex-end", justifyContent: "center", background: k.scrim, backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 390, maxHeight: "88%", background: k.panelBg, borderRadius: "18px 18px 0 0", border: `1px solid ${k.border}`, borderBottom: "none", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -12px 40px rgba(0,0,0,.45)" }}
      >
        <div style={{ padding: "12px 13px 9px", borderBottom: `1px solid ${k.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: fs(13), fontWeight: 700, color: k.accent }}>{c.castImages}</span>
            <button onClick={onClose} aria-label={c.cancel}
              style={{ background: "none", border: "none", color: k.textDim, fontSize: fs(15), cursor: "pointer", padding: "4px 6px", minHeight: 32 }}>
              {"✕"}
            </button>
          </div>
          <div style={{ fontSize: fs(11), color: k.textFaint, marginTop: 2, lineHeight: 1.45 }}>
            {c.castImagesHint}
          </div>
          {/* Both caps and the bytes in use, always. */}
          <div style={{ display: "flex", gap: 10, marginTop: 7, flexWrap: "wrap", fontSize: fs(11) }}>
            <span style={{ color: Object.keys(photos).length >= PHOTO_MAX_COUNT ? k.danger : k.textFaint }}>
              {c.photo} {c.castCount?.(Object.keys(photos).length, PHOTO_MAX_COUNT)}
            </span>
            <span style={{ color: Object.keys(walls).length >= WALL_MAX_COUNT ? k.danger : k.textFaint }}>
              {c.wall} {c.castCount?.(Object.keys(walls).length, WALL_MAX_COUNT)}
            </span>
            <span style={{ color: k.textFaint }}>{c.imagesUsed?.(kb)}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 13 }}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", color: k.textFaint, fontSize: fs(11), padding: 20, lineHeight: 1.6 }}>
              {c.needMain}
            </div>
          ) : rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${k.inputBorder}` }}>
              {/* Her wallpaper behind her photo, so one glance says what she has.
                  An empty strip is how "no wallpaper yet" reads. */}
              <div style={{ position: "relative", flexShrink: 0, width: 46, height: 46, borderRadius: 12, overflow: "hidden", background: walls[r.id] ? undefined : k.inputBg, backgroundImage: walls[r.id] ? `url(${walls[r.id]})` : undefined, backgroundSize: "cover", backgroundPosition: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MemberFace member={r.member} photo={photos[r.id]} size={34} radius={9} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs(12), color: k.textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5 }}>
                  {r.name}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {pill(photos[r.id] ? c.photoReplace : `${c.photo} +`, () => ask(r.id, "photo"), photos[r.id] ? "dim" : "accent")}
                  {photos[r.id] && pill(c.photoRemove, () => onClearPhoto?.(r.id), "danger")}
                  {pill(walls[r.id] ? c.wallReplace : `${c.wall} +`, () => ask(r.id, "wall"), walls[r.id] ? "dim" : "accent")}
                  {walls[r.id] && pill(c.wallRemove, () => onClearWall?.(r.id), "danger")}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Opened by `ask` through the ref, never by a <label> wrapping it. A
            `display:none` file input inside a label does not reliably open the
            picker on iOS Safari, which is how the member editor's own uploader
            shipped untappable — see MemberEditor.jsx. */}
        <input ref={fileRef} type="file" accept="image/*" onChange={took} style={{ display: "none" }} />

        <div style={{ padding: "10px 13px 13px", borderTop: `1px solid ${k.border}`, flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ width: "100%", padding: 13, minHeight: 44, borderRadius: 40, border: "none", background: k.accentGrad, color: k.onAccent, fontSize: fs(12.5), fontWeight: 700, cursor: "pointer" }}>
            {c.done?.(rows.length)}
          </button>
        </div>
      </div>

      {/* Inside the sheet's backdrop, which closes the sheet on click — so the
          cropper's own taps have to be stopped here or framing a photo would
          dismiss the screen underneath it. */}
      {cropping && (
        <div onClick={(e) => e.stopPropagation()}>
        <ImageCropper
          file={cropping.file} kind={cropping.kind}
          theme={theme} t={t} fontScale={fontScale} notify={notify}
          onConfirm={cropped}
          onCancel={() => setCropping(null)}
        />
        </div>
      )}
    </div>
  );
}
