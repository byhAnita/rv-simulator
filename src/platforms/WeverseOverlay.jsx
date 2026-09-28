import React, { useState } from "react";
import MemberSelector from "./MemberSelector";
import MemberFace, { wallScrim } from "./memberFace";

export default function WeverseOverlay({ memberId, members, socialFeeds, allTargetMembers, onClose, t, theme, photos = {}, walls = {} }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const feed = socialFeeds[viewingId]?.weverse;
  const isLight = theme === "light";
  const wall = walls[viewingId];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.5)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: isLight ? "#faf7f0" : "#1a1a1a", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ background: "#00d28b", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{t.social.weverse.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="weverse" theme={theme} photos={photos} />
        {/* Her wallpaper behind the whole feed, exactly as in Bubble and
            KakaoTalk — corrected after the first hand test. It was the post
            card's banner, which made one upload mean four different things
            across four platforms and gave this panel the only surface where the
            wallpaper was a small strip. One wallpaper, one job: it is the
            background of the panel she is posting in. */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12, background: isLight ? "#faf7f0" : undefined, ...(wall ? { backgroundImage: `${wallScrim(isLight, 0.5)},url(${wall})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : {}) }}>
          {feed && feed.content ? (
            /* The card goes NEARLY OPAQUE over a wallpaper. Its ordinary fill is
                a 5% tint, which is invisible against a plain panel and useless
                against a photograph — the same reason the chat bubbles in Bubble
                and KakaoTalk keep opaque fills on top of the scrim. A post is a
                block of prose, not a chat line, so it is the surface that needs
                it most. */
            <div style={{ borderRadius: 10, border: `1px solid ${isLight ? "#a08060" : "rgba(232,120,176,.15)"}`, overflow: "hidden", background: wall ? (isLight ? "rgba(250,247,240,.92)" : "rgba(20,14,22,.86)") : (isLight ? "rgba(100,65,20,.05)" : "rgba(255,255,255,.05)") }}>
            {/* Artist header. Weverse posts are attributed on the post itself;
                this card showed only prose, so the member you were reading was
                named nowhere except the tab you had tapped to get here. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
              <MemberFace member={m} photo={photos[viewingId]} size={32}
                border={`1.5px solid ${isLight ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.25)"}`} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: isLight ? "#2c1f0e" : "#f0f0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m?.name_kr || m?.name}
                </div>
                <div style={{ fontSize: 9.5, color: "#00d28b", fontWeight: 600 }}>{t.social.weverse.title}</div>
              </div>
            </div>
            <div style={{ color: isLight ? "#2c1f0e" : "#e0e0e0", fontSize: 13, lineHeight: 1.7, padding: 12, borderTop: `1px solid ${isLight ? "rgba(100,65,20,.12)" : "rgba(255,255,255,.08)"}` }}>
              {feed.content}
              <div style={{ display: "flex", gap: 14, marginTop: 10, color: isLight ? "#8a6840" : "#888", fontSize: 11, borderTop: `1px solid ${isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.1)"}`, paddingTop: 8 }}>
                <span>❤️ {(feed.likes || 0).toLocaleString()}</span><span>💬 {(feed.comments || 0).toLocaleString()}</span>
              </div>
            </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: isLight ? "#a8845a" : "#666", padding: "40px 0", fontSize: 12 }}>{t.social.weverse.noPosts(m?.name)}</div>
          )}
        </div>
      </div>
    </div>
  );
}