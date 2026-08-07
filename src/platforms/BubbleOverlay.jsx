import React, { useState } from "react";
import MemberSelector from "./MemberSelector";

export default function BubbleOverlay({ memberId, members, socialFeeds, allTargetMembers, kktUnlocked, onClose, t, theme }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const bubbleData = socialFeeds[viewingId]?.bubble;
  const feed = Array.isArray(bubbleData) ? bubbleData : [];
  const isLight = theme === "light";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.5)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: isLight ? "#faf7f0" : "#f5f0ff", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#3a2210)" : "linear-gradient(135deg,#9747ff,#c44dff)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{t.social.bubble.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="bubble" kktUnlocked={kktUnlocked} />
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8, background: isLight ? "#faf7f0" : "#f5f0ff" }}>
          {feed.length === 0 ? (
            <div style={{ textAlign: "center", color: isLight ? "#a8845a" : "#aaa", padding: "30px 0", fontSize: 12 }}>{t.social.bubble.noMessages(m?.name)}</div>
          ) : (
            feed.map((p, i) => (
              <div key={p.id || i} style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ maxWidth: "80%", background: isLight ? "#fff8f0" : "#fff", border: `1px solid ${isLight ? "#a08060" : "rgba(232,120,176,.15)"}`, borderRadius: "3px 14px 14px 14px", padding: "10px 12px", color: isLight ? "#2c1f0e" : "#1a1a1a", fontSize: 12, lineHeight: 1.6 }}>
                  {p.hasPhoto && <div style={{ width: "100%", height: 80, background: isLight ? "linear-gradient(135deg,#ede0c8,#d4c4a0)" : "linear-gradient(135deg,#e8d5f5,#d4b8e8)", borderRadius: 6, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", color: isLight ? "#8b6914" : "#9747ff", fontSize: 12 }}>📸 {p.photoDesc}</div>}
                  <div>{p.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ background: isLight ? "#f0e8d8" : "#f0e8ff", padding: "8px 12px", color: isLight ? "#8b6914" : "#9747ff", fontSize: 10, textAlign: "center", borderTop: `1px solid ${isLight ? "rgba(100,65,20,.12)" : "rgba(151,71,255,.1)"}` }}>{t.social.bubble.footer}</div>
      </div>
    </div>
  );
}