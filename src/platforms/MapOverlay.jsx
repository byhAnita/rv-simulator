import React from "react";

/**
 * The place picker. It rides the existing choice channel: tapping a place submits
 * "I head to <place>" as this round's choice, so there is no new schema field, no
 * new tail entry and no second input per round. Moving costs a round, by design —
 * a scene IS a round, and the phase rules and achievements are all driven by the
 * round counter. docs/V140_PLAN.md 7.1.
 *
 * `canon` is the world's own list and is always tappable. `discovered` is what the
 * model invented, observed from its `scene` line and held in `memory.places` —
 * client-side only, and it must stay that way: a list that grows mid-game would
 * invalidate the entire cached prefix the round it changed (6.1). Nothing here is
 * greyed out, because this list holds only places that have already been found;
 * 7.2's "greyed until found" predates that decision.
 */
export default function MapOverlay({ canon = [], discovered = [], t, theme, fontScale = 1, onPick, onClose }) {
  const isLight = theme === "light";
  const f = (n) => Math.round(n * fontScale);
  const rowStyle = {
    width: "100%", display: "flex", alignItems: "baseline", gap: 8, textAlign: "left",
    padding: "9px 11px", marginBottom: 5, borderRadius: 10,
    border: `1px solid ${isLight ? "rgba(100,65,20,.18)" : "rgba(232,135,176,.18)"}`,
    background: isLight ? "rgba(100,65,20,.05)" : "rgba(255,255,255,.04)",
    color: isLight ? "#3a2a12" : "#f0dce8", cursor: "pointer",
  };

  const row = (key, emoji, name, desc) => (
    <button key={key} onClick={() => onPick(name)} style={rowStyle}>
      <span style={{ fontSize: f(15), flexShrink: 0 }}>{emoji || "\u{1F4CD}"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: f(12), fontWeight: 600, display: "block" }}>{name}</span>
        {desc && (
          <span style={{ fontSize: f(10), color: isLight ? "#7a5a34" : "#a88ca0", lineHeight: 1.4, display: "block", marginTop: 2 }}>
            {desc}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "75vh", background: isLight ? "#faf7f0" : "#1a0a20", border: `1px solid ${isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)"}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#4a2e14)" : "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.2)" : "rgba(232,135,176,.15)"}`, flexShrink: 0 }}>
          <span style={{ color: isLight ? "#f5e8d0" : "#f8c8d8", fontSize: f(14), fontWeight: 700 }}>{t.map.title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: isLight ? "#c8a870" : "#a07090", cursor: "pointer", fontSize: 16 }}>&#10005;</button>
        </div>

        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
          {/* Going somewhere spends the round. Said before she taps, not after. */}
          <div style={{ fontSize: f(10), color: isLight ? "#8a6840" : "#a07090", lineHeight: 1.5, marginBottom: 9 }}>
            {t.map.costsRound}
          </div>

          {canon.map((p) => row(p.id || p.name, p.emoji, p.name, p.desc))}

          {discovered.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "12px 0 8px" }}>
                <span style={{ flex: 1, height: 1, background: isLight ? "rgba(100,65,20,.2)" : "rgba(232,135,176,.2)" }} />
                <span style={{ fontSize: f(9), color: isLight ? "#8a6840" : "#a07090", letterSpacing: .5 }}>{t.map.discovered}</span>
                <span style={{ flex: 1, height: 1, background: isLight ? "rgba(100,65,20,.2)" : "rgba(232,135,176,.2)" }} />
              </div>
              {discovered.map((p) => row(`d-${p.name}`, "\u{1F4CD}", p.name, t.map.foundIn(p.round)))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
