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
 * Her photo painted as an element's OWN background, ready to spread into a
 * style object. `under` is an optional layer to sit beneath it.
 *
 * This exists because "show her photo in a rounded box" was three components
 * clipping an `<img>` child, and clipping a child is the thing that keeps
 * failing on iOS — see the note in MemberFace. An element's own background is
 * clipped by its own `border-radius`, which is the most basic rounding in CSS
 * and has no layer-boundary case to get wrong.
 *
 * `background-size: cover` is `object-fit: cover` by another name, and
 * `background-origin: border-box` is what makes the photo fill the frame right
 * up under the border instead of being inset by it.
 *
 * Returns `{}` for no photo and no under-layer, so a caller's own background
 * stands untouched.
 */
export function photoFill(photo, under = null) {
  const layers = [photo ? `url(${photo})` : null, under].filter(Boolean);
  if (layers.length === 0) return {};
  return {
    backgroundImage: layers.join(","),
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "border-box",
  };
}

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
  const gradient = `linear-gradient(135deg,${m.color || "#f0c8d8"},${m.accent || "#c2185b"})`;
  // THE PHOTO IS THE FRAME'S OWN BACKGROUND. There is no child element, so
  // there is nothing to clip, so no clipping mechanism can fail.
  //
  // This is the THIRD attempt at one bug and the first that does not depend on
  // clipping a descendant. Attempt one gave the <img> `borderRadius: inherit`
  // and fixed Instagram, which was never broken. Attempt two moved the frame to
  // `clip-path` and removed `overflow: hidden` — and the avatars were still
  // square on Bubble, KakaoTalk and Weverse.
  //
  // Attempt two is the one worth recording, because REMOVING `overflow: hidden`
  // made the failure worse rather than safer. Measured in Chromium with
  // clip-path forced off: the frame still draws as a circle, because
  // `border-radius` always clips an element's OWN background — but the <img>
  // child renders as a full, unclipped square on top of it. That is exactly the
  // reported symptom, "a square edge inside the circle". So whatever iOS is
  // doing to the clip on those three panels, a component with a child to clip
  // has a failure mode and this one does not.
  //
  // `border-radius` clipping an element's own background is the most basic
  // rounding in CSS and has no layer-boundary case to get wrong: the element
  // paints its own background into its own border box. `background-size: cover`
  // is `object-fit: cover` by another name, and `background-origin: border-box`
  // is what makes the photo fill the frame right up under the border instead of
  // being inset by it.
  //
  // ONE mechanism: no `clip-path`, no `overflow: hidden`, no `isolation`. A
  // shape enforced twice is a shape neither enforcement can be shown to hold —
  // which is what `cropRect`'s double clamp cost an hour of mutation testing to
  // find one release ago.
  //
  // The gradient stays UNDER the photo rather than being replaced by it: a WebP
  // that fails to decode leaves an empty box otherwise, and an empty box on a
  // chat line reads as a broken app.
  return (
    <span
      style={{
        width: size, height: size, borderRadius: r,
        // Explicit, not inherited: a border must eat into the frame rather than
        // growing it, or a bordered avatar is the wrong size on its row.
        boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "center",
        ...photoFill(photo, gradient),
        fontSize: Math.round(size * 0.52), lineHeight: 1, flexShrink: 0,
        border: border || undefined,
        ...style,
      }}
    >
      {/* The emoji is the fallback, so it is rendered only when there is no
          photo to cover it. A text node never reaches a circle's corners, which
          is why losing the clip costs nothing here. */}
      {photo ? null : (m.emoji || "💗")}
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
 *
 * NO `background-attachment: local` on the scroller that carries it — dropped
 * in the second hand test. With `local` the background's positioning area is
 * the whole SCROLLABLE content, so `cover` sized a 2:3 wallpaper against a
 * KakaoTalk thread that can be three panels tall: the player framed one crop and
 * the panel showed another. Default attachment pins the image to the padding
 * box, which is what a chat wallpaper does anyway: the messages move over it,
 * not with it.
 */
export function wallScrim(isLight, strength = 0.55) {
  return isLight
    ? `linear-gradient(rgba(250,247,240,${strength}),rgba(250,247,240,${strength}))`
    : `linear-gradient(rgba(10,4,12,${strength}),rgba(10,4,12,${strength}))`;
}
