// src/platforms/MemberPicker.jsx
//
// The sheet that fills one roster slot. Opened from a section of RosterBuilder,
// and it knows WHICH section opened it — that is the whole reason it exists.
//
// The builder used to put the roles on the member: a grid of every member in the
// library, each card carrying three small role buttons. With nine groups that is
// up to twenty-seven adjacent targets on a 390px screen, all assigning different
// things, so a mis-tap does not miss — it assigns the wrong role. And it inverted
// the task: a player decides "who is my main" and then "who else is around",
// never "what is Yeri for".
//
// So the role is the subject now, and this sheet is how a role gets filled.
//
// THE SHEET'S BEHAVIOUR FOLLOWS THE SLOT'S CARDINALITY. There is exactly one
// main, so choosing her closes the sheet — anything else leaves the player
// looking at a list with nothing left to do. Subs and NPCs are "as many as you
// like", so those stay open and toggle, because adding four subs should not mean
// opening this four times.
//
// A MEMBER HOLDS EXACTLY ONE SLOT, which is the id-uniqueness constraint step 4
// uncovered — affections, KKT channels and memberAppearances are all keyed by
// member id, so the same person in two slots would silently merge her own state.
// She therefore shows her current role here, and tapping her MOVES her. The
// alternatives are a silent no-op (reads as a broken button) or a duplicate
// (corrupts the run), so moving is the only honest answer.

import React, { useEffect, useMemo, useState } from "react";
import { displayNameIn } from "../utils";
import { castTokens, scaleFont } from "./castTheme";
import { photoFill } from "./memberFace";
import { CAST_MAX } from "../rag/customCast";

export const CUSTOM_TAB = "__custom__";

export default function MemberPicker({
  slot = "main",
  language = "zh", theme = "dark", t, fontScale = 1,
  groups = [], configs = {}, onNeedGroup,
  cast = [], photos = {}, picks = {},
  onAssign, onClose,
  onCreate, onEdit, onDelete,
}) {
  const isLight = theme === "light";
  const k = castTokens(isLight);
  const fs = (px) => scaleFont(px, fontScale);
  const c = t?.cast || {};

  const [tab, setTab] = useState(() => groups[0]?.id || CUSTOM_TAB);

  // The parent owns the group cache: it needs the same data to name a picked
  // member who is not on the visible tab, and a cache in here would be thrown
  // away every time the sheet closes.
  useEffect(() => {
    if (tab && tab !== CUSTOM_TAB && !configs[tab]) onNeedGroup?.(tab);
  }, [tab, configs, onNeedGroup]);

  const tabs = useMemo(() => [
    ...groups.map((g) => ({ id: g.id, label: g.name, emoji: g.emoji })),
    { id: CUSTOM_TAB, label: c.myCast || "", emoji: "✨" },
  ], [groups, c.myCast]);

  const members = tab === CUSTOM_TAB
    ? cast.map((m) => ({ ...m.profile, id: m.id, __custom: true }))
    : (configs[tab]?.members || []);

  const filledHere = Object.values(picks).filter((p) => p.slot === slot).length;

  const tap = (m) => {
    // The sheet is the only place that knows which group a library member was
    // browsed from, and the pick has to record it: `src: "library"` is a
    // reference, so without the groupId resolveRoster cannot fetch her profile.
    onAssign?.(m.__custom ? m : { ...m, __groupId: tab }, slot);
    // One main, so the decision is complete the moment it is made.
    if (slot === "main") onClose?.();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 115, display: "flex", alignItems: "flex-end", justifyContent: "center", background: k.scrim, backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 390, maxHeight: "86%", background: k.panelBg, borderRadius: "18px 18px 0 0", border: `1px solid ${k.border}`, borderBottom: "none", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -12px 40px rgba(0,0,0,.45)" }}
      >
        <div style={{ padding: "12px 13px 8px", borderBottom: `1px solid ${k.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: fs(13), fontWeight: 700, color: k.accent }}>
              {c.pickFor?.[slot] || c.roles?.[slot]}
            </span>
            <button onClick={onClose} aria-label={c.cancel}
              style={{ background: "none", border: "none", color: k.textDim, fontSize: fs(15), cursor: "pointer", padding: "4px 6px", minHeight: 32 }}>
              {"✕"}
            </button>
          </div>
          <div style={{ fontSize: fs(11), color: k.textFaint, marginTop: 2, lineHeight: 1.4 }}>
            {c.roleHints?.[slot]}
          </div>
          {/* Group tabs: horizontally scrollable so nine groups plus the custom
              one fit at 390px without shrinking below the type floor. */}
          <div style={{ display: "flex", gap: 5, marginTop: 9, overflowX: "auto", paddingBottom: 3 }}>
            {tabs.map((g) => (
              <button key={g.id} onClick={() => setTab(g.id)}
                aria-pressed={tab === g.id}
                style={{ flexShrink: 0, padding: "7px 11px", minHeight: 34, borderRadius: 13, cursor: "pointer", border: `1px solid ${tab === g.id ? k.accent : k.border}`, background: tab === g.id ? k.tint : "transparent", color: tab === g.id ? k.accent : k.textDim, fontSize: fs(11), whiteSpace: "nowrap" }}>
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 13 }}>
          {tab === CUSTOM_TAB && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: fs(11), color: k.textFaint }}>{c.myCast}</span>
                {/* The cap, visible at all times. It used to appear only as the
                    button's label once it had already been reached — the same
                    mistake the save slots made, where invisibility cost a run. */}
                <span style={{ fontSize: fs(11), color: cast.length >= CAST_MAX ? k.danger : k.textFaint }}>
                  {c.castCount?.(cast.length, CAST_MAX)}
                </span>
              </div>
              <button onClick={onCreate} disabled={cast.length >= CAST_MAX}
                style={{ width: "100%", padding: 12, minHeight: 44, marginBottom: 11, borderRadius: 10, border: `1px dashed ${k.border}`, background: "transparent", color: cast.length >= CAST_MAX ? k.textFaint : k.accent, fontSize: fs(12), cursor: cast.length >= CAST_MAX ? "default" : "pointer" }}>
                {cast.length >= CAST_MAX ? c.castFull : `+ ${c.createMember}`}
              </button>
            </>
          )}

          {members.length === 0 ? (
            <div style={{ textAlign: "center", color: k.textFaint, fontSize: fs(11), padding: 20, lineHeight: 1.6 }}>
              {tab === CUSTOM_TAB ? c.noCustomYet : c.loadingMembers}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
              {members.map((m) => {
                const held = picks[m.id]?.slot || null;
                const here = held === slot;
                const name = displayNameIn(m, language);
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button onClick={() => tap(m)}
                      aria-pressed={here}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "9px 4px", minHeight: 44, borderRadius: 11, cursor: "pointer", border: `1px solid ${here ? (m.accent || k.accent) : k.border}`, background: here ? (m.accent || k.accent) + "22" : k.cardBg, color: k.textMain }}>
                      {/* Her photo is this span's OWN background rather than a
                          child to be clipped — see photoFill in memberFace. */}
                      <span style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, lineHeight: 1, background: here ? "transparent" : k.inputBg, ...photoFill(photos[m.id]), flexShrink: 0 }}>
                        {photos[m.id] ? null : (m.emoji || "✨")}
                      </span>
                      <span style={{ fontSize: fs(11), lineHeight: 1.25, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {name}
                      </span>
                      {/* Held elsewhere: naming the role is what makes the next
                          tap predictable, since it MOVES her rather than adding
                          a second copy. */}
                      <span style={{ fontSize: fs(11), lineHeight: 1, color: here ? k.accent : k.textFaint, minHeight: fs(11) }}>
                        {here ? "✓" : (held ? c.roles?.[held] : "")}
                      </span>
                    </button>
                    {m.__custom && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => onEdit?.(m.id)}
                          style={{ flex: 1, padding: "6px 0", minHeight: 30, borderRadius: 7, border: `1px solid ${k.border}`, background: "transparent", color: k.textDim, fontSize: fs(11), cursor: "pointer" }}>
                          {c.editShort}
                        </button>
                        <button onClick={() => onDelete?.(m.id)}
                          style={{ flex: 1, padding: "6px 0", minHeight: 30, borderRadius: 7, border: "1px solid rgba(180,60,20,.25)", background: "transparent", color: k.danger, fontSize: fs(11), cursor: "pointer" }}>
                          {c.deleteShort}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Main closes on choosing, so it needs no Done — showing one would
            imply there is more than one main to pick. */}
        {slot !== "main" && (
          <div style={{ padding: "10px 13px 13px", borderTop: `1px solid ${k.border}`, flexShrink: 0 }}>
            <button onClick={onClose}
              style={{ width: "100%", padding: 13, minHeight: 44, borderRadius: 40, border: "none", background: k.accentGrad, color: k.onAccent, fontSize: fs(12.5), fontWeight: 700, cursor: "pointer" }}>
              {c.done?.(filledHere)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
