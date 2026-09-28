// src/platforms/memberFace.jsx
//
// Her face, and her wallpaper, in one place.
//
// Six surfaces show a member: the game top bar, the tab strip inside every
// overlay, and the four overlays themselves. Before step 8 each drew its own
// `emoji` over its own `linear-gradient(color, accent)` circle, which was
// survivable while there was nothing else to draw. With photos it is not: the
// same person must be the same face everywhere, and six copies of "photo if
// there is one, gradient if there is not" is six chances for one of them to be
// the copy that still shows the emoji.
//
// This is the `extractStoryText` lesson applied before the drift rather than
// after it — that function was two copies, they disagreed, and the guard had
// been written against the one that was still correct.

import React from "react";

/**
 * A member's avatar: her photo when she has one, otherwise the emoji on her
 * own two-colour gradient.
 *
 * `size` is the diameter. `radius` defaults to a circle; the cast screens use
 * a rounded square, so it is a parameter rather than a second component.
 */
export default function MemberFace({
  member, photo, size = 26, radius = null, border = null, style = {},
}) {
  const m = member || {};
  const r = radius == null ? "50%" : radius;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: r, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        // The gradient stays behind the photo rather than being replaced by it.
        // A WebP that fails to decode leaves an empty box otherwise, and an
        // empty box on a chat line reads as a broken app.
        background: `linear-gradient(135deg,${m.color || "#f0c8d8"},${m.accent || "#c2185b"})`,
        fontSize: Math.round(size * 0.52), lineHeight: 1, flexShrink: 0,
        border: border || undefined,
        ...style,
      }}
    >
      {photo
        ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : (m.emoji || "💗")}
    </span>
  );
}

/**
 * Style for a panel that shows her wallpaper behind content.
 *
 * Returns only the background properties, so a caller merges it into whatever
 * layout it already has. With no wallpaper it returns `{}` — the caller's own
 * background then stands, which is what keeps every overlay looking exactly as
 * it did for a member who has not been given one.
 */
export function wallStyle(wall) {
  if (!wall) return {};
  return {
    backgroundImage: `url(${wall})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}

/**
 * The scrim that has to sit between a wallpaper and text.
 *
 * A photo is arbitrary — it can be white sky or a black stage — so text laid
 * straight onto one is legible for some uploads and not others. Every wallpaper
 * surface therefore gets a fixed veil in the panel's own direction, and the
 * chat bubbles keep their opaque fills on top of it. Strength differs by
 * surface: a chat thread is mostly bubbles and needs less than a caption laid
 * directly on the image.
 */
export function wallScrim(isLight, strength = 0.55) {
  return isLight
    ? `linear-gradient(rgba(250,247,240,${strength}),rgba(250,247,240,${strength}))`
    : `linear-gradient(rgba(10,4,12,${strength}),rgba(10,4,12,${strength}))`;
}
