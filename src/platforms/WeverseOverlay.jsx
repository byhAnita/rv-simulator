import React, { useState } from "react";
import MemberSelector from "./MemberSelector";

export default function WeverseOverlay({ memberId, members, socialFeeds, allTargetMembers, onClose, t }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const feed = socialFeeds[viewingId]?.weverse;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: "#1a1a1a", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: "#00d28b", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{t.social.weverse.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="weverse" />
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {feed && feed.content ? (
            <div style={{ color: "#e0e0e0", fontSize: 13, lineHeight: 1.7, padding: 12, background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
              {feed.content}
              <div style={{ display: "flex", gap: 14, marginTop: 10, color: "#888", fontSize: 11, borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 8 }}>
                <span>❤️ {(feed.likes || 0).toLocaleString()}</span><span>💬 {(feed.comments || 0).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#666", padding: "40px 0", fontSize: 12 }}>{t.social.weverse.noPosts(m?.name)}</div>
          )}
        </div>
      </div>
    </div>
  );
}