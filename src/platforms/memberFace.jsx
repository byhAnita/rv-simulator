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
  // THE SHAPE IS A CLIP PATH, NOT `overflow: hidden` + a radius — the second
  // hand test, and the second attempt at this bug.
  //
  // The first attempt gave the <img> its own `borderRadius: inherit` so its
  // shape did not depend on the parent clipping it. That fixed Instagram and
  // left Bubble, KakaoTalk and Weverse square, which is the whole diagnosis:
  // those three are exactly the avatars sitting inside a SCROLLING container
  // that carries a background image, and Instagram's is not. A scroller with a
  // background gets its own composited layer on iOS WebKit, and a rounded
  // `overflow` clip on a descendant is not applied at that layer boundary —
  // so both the photo AND the gradient came out square inside the ring.
  // UNVERIFIED as a cause: it is inferred from which three surfaces broke and
  // which one did not, not from a repro. The fix does not depend on it being
  // right, because `clip-path` does not clip by overflow at all.
  //
  // ONE mechanism, not two: `overflow: hidden` and `isolation: isolate` are
  // gone rather than kept beside it. A shape enforced twice is a shape neither
  // enforcement can be shown to hold — which is what `cropRect`'s double clamp
  // cost an hour of mutation testing to find. `borderRadius` stays because it
  // is what rounds the BORDER itself; the clip is what rounds everything
  // painted inside it.
  const clip = radius == null
    ? "circle(50%)"
    : `inset(0 round ${typeof r === "number" ? `${r}px` : r})`;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: r,
        clipPath: clip, WebkitClipPath: clip,
        // Explicit, not inherited from App's `*` reset: a border must eat into
        // the frame rather than growing it, or the photo inside a bordered
        // avatar is inset by a pixel on every side and reads as the wrong size.
        boxSizing: "border-box",
        position: "relative",
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
        ? (
          // Positioned, not a flex item: `inset: 0` makes the photo fill the
          // frame whatever a flex container decides about a replaced element's
          // size. Its rounding comes from the frame's clip path, not from a
          // radius of its own — see the note above.
          <img
            src={photo} alt=""
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", display: "block",
            }}
          />
        )
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
 *
 * NO `background-attachment: local` on the scroller that carries it — dropped
 * in the second hand test, for two reasons at once. With `local` the
 * background's positioning area is the whole SCROLLABLE content, so `cover`
 * sized a 2:3 wallpaper against a KakaoTalk thread that can be three panels
 * tall: the player framed one crop and the panel showed another. It also makes
 * the scroller a composited layer, which is the best available explanation for
 * the square avatars on exactly those three panels — see MemberFace. Default
 * attachment pins the image to the padding box, which is what a chat wallpaper
 * does anyway: the messages move over it, not with it.
 */
export function wallScrim(isLight, strength = 0.55) {
  return isLight
    ? `linear-gradient(rgba(250,247,240,${strength}),rgba(250,247,240,${strength}))`
    : `linear-gradient(rgba(10,4,12,${strength}),rgba(10,4,12,${strength}))`;
}
