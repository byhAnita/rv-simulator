// src/platforms/castTheme.js
//
// One palette for the three cast screens: the roster builder, the member picker
// sheet it opens, and the member editor.
//
// It used to be three copies of the same fifteen literals, one per component,
// following the "styling tokens are local to the overlay" convention the older
// overlays set. That convention is fine for a Kakao window that shares nothing
// with anything; it is wrong here, because these three are one flow and the
// player moves between them in a single sitting. A token edited in the builder
// and forgotten in the sheet does not fail a build — it just makes the sheet
// look like it belongs to a different app. Same argument as `extractStoryText`:
// two copies of one definition had drifted, and the guard was written against
// the copy that was already correct.
//
// It is a function of the theme flag and nothing else, so it stays pure and the
// components stay declarative.

export function castTokens(isLight) {
  return {
    pageBg: isLight ? "#f5f0e4" : "#150818",
    panelBg: isLight ? "#faf7f0" : "#1a0a20",
    border: isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)",
    inputBorder: isLight ? "rgba(100,65,20,.18)" : "rgba(232,120,176,.18)",
    textMain: isLight ? "#3a2510" : "#f0dce8",
    textDim: isLight ? "#8a6840" : "#a07090",
    textFaint: isLight ? "#a8845a" : "#785070",
    accent: isLight ? "#8b6914" : "#e887b0",
    accentGrad: isLight
      ? "linear-gradient(135deg,#c8a84b,#a0522d)"
      : "linear-gradient(135deg,#e887b0,#c86dd0)",
    // Text laid on accentGrad. Light mode's gradient is dark, dark mode's is a
    // bright pink, so this cannot be a constant "#fff".
    onAccent: isLight ? "#fff" : "#200c1a",
    cardBg: isLight ? "rgba(100,65,20,.05)" : "rgba(255,255,255,.04)",
    inputBg: isLight ? "rgba(100,65,20,.06)" : "rgba(255,255,255,.05)",
    tint: isLight ? "rgba(139,105,20,.12)" : "rgba(232,135,176,.14)",
    scrim: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)",
    danger: isLight ? "#a03010" : "#f07070",
    dangerBg: isLight ? "#a03010" : "#8a2020",
  };
}

// The smallest type any cast screen may use, before the player's font scale is
// applied. The first version of these screens ran down to 8px for a line the
// player has to read (which group a shared member came from) while the rest of
// the app sits at 11-13 — and the font-scale setting never reached them at all,
// so a player who had asked for larger text got it everywhere except here.
export const CAST_MIN_FONT = 11;

// Every cast screen sizes its type through this, so the player's setting reaches
// all of them or none of them.
export const scaleFont = (px, fontScale = 1) =>
  Math.round(Math.max(px, CAST_MIN_FONT) * fontScale);

// THE FOUR SAFE-AREA INSETS, PLUS A MARGIN OF YOUR OWN.
//
// `.rv-fixed` pays the insets for every full-screen overlay, but an inline
// `padding` shorthand overrides a class's padding ENTIRELY - so the handful of
// roots that want their own breathing room have to COMPOSE the two rather than
// layer them, or the class is silently defeated on exactly those screens.
//
// `env(..., 0px)` rather than a bare `env()`: a browser that knows the function
// but not the variable resolves it to the fallback, and one that knows neither
// drops the whole declaration - which would take the author's own margin with
// it. The fallback is what makes this a no-op on a device with no notch.
export const safeInset = (px = 0) =>
  ["top", "right", "bottom", "left"]
    .map((side) => `calc(env(safe-area-inset-${side}, 0px) + ${px}px)`)
    .join(" ");
