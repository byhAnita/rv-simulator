import React, { useState } from "react";
import MemberSelector from "./MemberSelector";
import MemberFace, { wallStyle, wallScrim } from "./memberFace";
import { KKT_THRESHOLD } from "../config/constants";

export default function KakaoOverlay({ memberId, members, kktMessages, kktUnlocked, allTargetMembers, onClose, t, theme, fontScale = 1, photos = {}, walls = {} }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const msgs = kktMessages[viewingId] || [];
  const unlocked = kktUnlocked[viewingId];
  const isLight = theme === "light";
  const wall = walls[viewingId];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.5)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: isLight ? "#e8d9c0" : "#b2c7d9", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: isLight ? "#4a3018" : "#3c1e1e", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{t.social.kakao.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="kakao" kktUnlocked={kktUnlocked} theme={theme} photos={photos} />
        {/* Her wallpaper behind the thread. The scrim is a layer of the same
            `background` shorthand rather than a positioned overlay, so the
            scrolling content above it needs no stacking context of its own. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, ...(wall ? { backgroundImage: `${wallScrim(isLight, 0.45)},url(${wall})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : {}) }}>
          {!unlocked ? (
            <div style={{ textAlign: "center", color: isLight ? "#8a6840" : "#888", padding: "30px 0", fontSize: 12 }}>
              {t.social.kakao.locked(m?.name)}<br />
              <span style={{ fontSize: 10 }}>{t.social.kakao.unlockHint(KKT_THRESHOLD)}</span>
            </div>
          ) : !Array.isArray(msgs) || msgs.length === 0 ? (
            <div style={{ textAlign: "center", color: isLight ? "#8a6840" : "#888", padding: "30px 0", fontSize: 12 }}>{t.social.kakao.noMessages}</div>
          ) : (
            msgs.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-end", gap: 5 }}>
                <MemberFace member={m} photo={photos[viewingId]} size={26}
                  border={`1px solid ${isLight ? "#a08060" : "rgba(232,120,176,.15)"}`} />
                <div style={{ maxWidth: "70%", background: isLight ? "#fff8f0" : "#fff", color: "#1a1a1a", padding: "7px 10px", borderRadius: "3px 12px 12px 12px", fontSize: Math.round(12 * fontScale), lineHeight: 1.5, wordBreak: "break-word" }}>{typeof msg === "string" ? msg : msg.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}