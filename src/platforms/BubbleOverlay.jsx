import React, { useState } from "react";
import MemberSelector from "./MemberSelector";

export default function BubbleOverlay({ memberId, members, socialFeeds, allTargetMembers, kktUnlocked, onClose }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const feed = socialFeeds[viewingId]?.bubble || [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: "#f5f0ff", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: "linear-gradient(135deg,#9747ff,#c44dff)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>bubble</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="bubble" kktUnlocked={kktUnlocked} />
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8, background: "#f5f0ff" }}>
          {feed.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: "30px 0", fontSize: 12 }}>{m?.name} 暂无消息</div>
          ) : (
            feed.map((p, i) => (
              <div key={p.id || i} style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ maxWidth: "80%", background: "#fff", borderRadius: "3px 14px 14px 14px", padding: "10px 12px", color: "#1a1a1a", fontSize: 12, lineHeight: 1.6 }}>
                  {p.hasPhoto && <div style={{ width: "100%", height: 80, background: "linear-gradient(135deg,#e8d5f5,#d4b8e8)", borderRadius: 6, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#9747ff", fontSize: 12 }}>📸 {p.photoDesc}</div>}
                  <div>{p.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ background: "#f0e8ff", padding: "8px 12px", color: "#9747ff", fontSize: 10, textAlign: "center", borderTop: "1px solid rgba(151,71,255,.1)" }}>💜 订阅者专属</div>
      </div>
    </div>
  );
}