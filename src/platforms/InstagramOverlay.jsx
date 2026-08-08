import React, { useState } from "react";
import MemberSelector from "./MemberSelector";

export default function InstagramOverlay({ memberId, members, socialFeeds, allTargetMembers, onClose, t, theme }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const feed = socialFeeds[viewingId]?.instagram;
  const isLight = theme === "light";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.5)" : "rgba(0,0,0,.8)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: isLight ? "#faf7f0" : "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.15)" : "#efefef"}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: isLight ? "#3a2510" : "#262626", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: isLight ? "#3a2510" : "#262626" }}>{t.social.instagram.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="instagram" theme={theme} />
        <div style={{ flex: 1, overflowY: "auto", background: isLight ? "#faf7f0" : "#fff" }}>
          {feed && feed.caption ? (
            <>
              <div style={{ width: "100%", aspectRatio: "1/1", background: isLight ? "linear-gradient(135deg,#ede0c8,#d4c4a0)" : "linear-gradient(135deg,#f9f0f5,#e8d0e0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🖼️</div>
              <div style={{ padding: "6px 10px", display: "flex", gap: 10, fontSize: 16 }}><span>❤️</span><span>💬</span></div>
              <div style={{ padding: "0 10px", fontSize: 11, fontWeight: 700, color: isLight ? "#3a2510" : "#262626" }}>{t.social.instagram.likes((feed.likes / 10000).toFixed(0))}</div>
              <div style={{ padding: "3px 10px 14px", fontSize: 12, color: isLight ? "#2c1f0e" : "#262626" }}>
                <span style={{ fontWeight: 700, marginRight: 4 }}>{m?.ig || m?.name?.toLowerCase()}</span>{feed.caption}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "50px 0", color: isLight ? "#a8845a" : "#999", fontSize: 12 }}>{t.social.instagram.noPosts(m?.name)}</div>
          )}
        </div>
      </div>
    </div>
  );
}