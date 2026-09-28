// src/platforms/YearWheel.jsx
//
// A birth year, picked by scrolling rather than typed.
//
// THIS REMOVES A FAILURE MODE RATHER THAN RESTYLING ONE. `birthdayFromYear`
// returns "" for anything shorter than four digits on purpose: a half-typed
// "19" must leave the profile invalid so Save stays disabled, because a
// two-digit year reaching the address protocol would make every member either
// the player's senior or her junior at once. A wheel cannot emit a partial
// year at all — every value it can produce is one of the years in its range —
// so the invalid intermediate state stops existing instead of being caught.
//
// It is also the right control for the data. A year is one of ~60 ordered
// values, which is a picker; a text field invites the keyboard, and on iOS a
// numeric keyboard over a 390px page hides the field it is filling.
//
// NO LIBRARY. `scroll-snap-type: y mandatory` plus one row per year gives
// native momentum and native snapping on every phone this app targets; a
// wheel implemented in JS would have to reimplement the physics and would get
// them slightly wrong.

import React, { useCallback, useEffect, useMemo, useRef } from "react";

export const ROW_H = 34;
// THREE ROWS, NOT FIVE — corrected after the first hand test. Five rows is 180px
// of loose numbers, in Setup sitting beside a 38px name field, which made the
// wheel look like it had escaped its row rather than like one control. Three
// (the year, the one before, the one after) is 102px, is what a phone's own
// compact pickers show, and still says which direction scrolling goes.
export const VISIBLE_ROWS = 3;
// Where the wheel opens when the player has chosen nothing yet. Inside both
// ranges it is used with -- the player's (1946-2008) and a custom member's
// (1980-2012) -- so neither caller needs its own default.
export const DEFAULT_YEAR = 2000;

export default function YearWheel({
  value, onChange, min, max,
  colors = {}, fontScale = 1, ariaLabel,
}) {
  const {
    text = "#f0dce8", textDim = "#a07090", accent = "#e887b0",
    tint = "rgba(232,135,176,.14)", border = "rgba(232,135,176,.3)",
    // The control's own surface. It has to differ from the page behind it, or a
    // border alone still leaves the rows reading as page content.
    fieldBg = "rgba(255,255,255,.05)",
  } = colors;

  const years = useMemo(() => {
    const lo = Math.min(min, max), hi = Math.max(min, max);
    const out = [];
    for (let y = lo; y <= hi; y++) out.push(y);
    return out;
  }, [min, max]);

  const ref = useRef(null);
  // Set while the wheel is scrolling itself into position. Without it the
  // programmatic scroll below fires the scroll handler, which calls onChange,
  // which changes `value`, which re-runs the effect: a loop that settles on
  // whatever row the browser happened to land on rather than the one asked for.
  const selfScroll = useRef(false);
  const settle = useRef(0);

  const idxOf = useCallback((v) => {
    const i = years.indexOf(Number(v));
    return i >= 0 ? i : Math.max(0, years.indexOf(DEFAULT_YEAR));
  }, [years]);

  // Park the wheel on `value` whenever it disagrees with where the wheel is.
  // Comparing positions rather than syncing unconditionally is what lets the
  // player's own scroll finish without being yanked back a frame later.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = idxOf(value) * ROW_H;
    if (Math.abs(el.scrollTop - want) < ROW_H / 2) return;
    selfScroll.current = true;
    el.scrollTop = want;
    // One frame is not always enough: a smooth-scroll setting on the element or
    // the OS can emit scroll events for several frames after the assignment.
    const t = setTimeout(() => { selfScroll.current = false; }, 120);
    return () => clearTimeout(t);
  }, [value, idxOf]);

  const onScroll = () => {
    if (selfScroll.current) return;
    // Report the row the wheel came to rest on, not every row it passes over.
    // Reporting mid-flick would push ~50 values through onChange for one
    // gesture, and for the player's year each of those is a form write.
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.round(el.scrollTop / ROW_H);
      const y = years[Math.max(0, Math.min(years.length - 1, i))];
      if (y != null && String(y) !== String(value)) onChange?.(String(y));
    }, 90);
  };

  useEffect(() => () => clearTimeout(settle.current), []);

  const pad = ((VISIBLE_ROWS - 1) / 2) * ROW_H;
  const selected = String(value ?? "");

  return (
    // A BOUNDED CONTROL, not a bare column of numbers. The first version had no
    // frame and no background of its own, so the rows above and below the
    // selected year read as page content that happened to be numeric — on a
    // 390px Setup page, as if the wheel were sitting on top of the fields around
    // it. The box is what says where the control begins and ends; `overflow:
    // hidden` also stops the band's own border poking out at the corners.
    <div style={{
      // +2 for the border, so the scrolling viewport is an exact whole number of
      // rows. One pixel short and `scrollSnapAlign: center` disagrees with
      // `scrollTop = index * ROW_H` by that pixel, forever.
      position: "relative", height: ROW_H * VISIBLE_ROWS + 2, flexShrink: 0,
      borderRadius: 10, border: `1px solid ${border}`, background: fieldBg,
      overflow: "hidden", boxSizing: "border-box",
    }}>
      {/* The selection band. Behind the list and not interactive, so a tap
          always reaches the year under it. */}
      <div aria-hidden style={{
        position: "absolute", left: 3, right: 3, top: pad, height: ROW_H,
        background: tint, borderRadius: 8,
        pointerEvents: "none",
      }} />
      <div
        ref={ref}
        onScroll={onScroll}
        role="listbox"
        aria-label={ariaLabel}
        style={{
          height: "100%", overflowY: "auto", scrollSnapType: "y mandatory",
          // Hides the scrollbar without hiding the overflow. The band already
          // says which row is chosen, and a 63-row bar on a 180px box reads as
          // a rendering artefact.
          scrollbarWidth: "none", msOverflowStyle: "none",
          // Both ends have to be able to reach the middle band.
          paddingTop: pad, paddingBottom: pad,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {years.map((y) => {
          const isSel = String(y) === selected;
          return (
            <div
              key={y}
              role="option"
              aria-selected={isSel}
              onClick={() => onChange?.(String(y))}
              style={{
                height: ROW_H, scrollSnapAlign: "center",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: Math.round((isSel ? 16 : 13.5) * fontScale),
                fontWeight: isSel ? 700 : 400,
                color: isSel ? accent : textDim,
                opacity: isSel ? 1 : 0.72,
                cursor: "pointer", userSelect: "none",
                transition: "color .12s, font-size .12s",
              }}
            >
              {y}
            </div>
          );
        })}
      </div>
      {/* Fades top and bottom so the list reads as a wheel rather than as a
          cropped column. Transparent-to-nothing is deliberate: the panel behind
          this differs between the two callers, so a hard colour would band. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: `inset 0 ${ROW_H}px ${ROW_H}px -${ROW_H}px ${colors.fade || "transparent"}, inset 0 -${ROW_H}px ${ROW_H}px -${ROW_H}px ${colors.fade || "transparent"}` }} />
      <style>{`[role="listbox"]::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
