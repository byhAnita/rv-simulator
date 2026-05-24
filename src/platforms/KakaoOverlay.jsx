import React, { useState } from "react";
import MemberSelector from "./MemberSelector";
import { KKT_THRESHOLD } from "../config/constants";

export default function KakaoOverlay({ memberId, members, kktMessages, kktUnlocked, allTargetMembers, onClose, t }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const msgs = kktMessages[viewingId] || [];
  const unlocked = kktUnlocked[viewingId];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: "#b2c7d9", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: "#3c1e1e", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{t.social.kakao.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="kakao" kktUnlocked={kktUnlocked} />
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!unlocked ? (
            <div style={{ textAlign: "center", color: "#888", padding: "30px 0", fontSize: 12 }}>
              {t.social.kakao.locked(m?.name)}<br />
              <span style={{ fontSize: 10 }}>{t.social.kakao.unlockHint(KKT_THRESHOLD)}</span>
            </div>
          ) : !Array.isArray(msgs) || msgs.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: "30px 0", fontSize: 12 }}>{t.social.kakao.noMessages}</div>
          ) : (
            msgs.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-end", gap: 5 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg,${m?.color},${m?.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{m?.emoji}</div>
                <div style={{ maxWidth: "70%", background: "#fff", color: "#1a1a1a", padding: "7px 10px", borderRadius: "3px 12px 12px 12px", fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>{typeof msg === "string" ? msg : msg.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}