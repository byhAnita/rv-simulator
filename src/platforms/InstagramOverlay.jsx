import React, { useState } from "react";
import MemberSelector from "./MemberSelector";
import MemberFace, { wallStyle } from "./memberFace";

export default function InstagramOverlay({ memberId, members, socialFeeds, allTargetMembers, onClose, t, theme, photos = {}, walls = {} }) {
  const [viewingId, setViewingId] = useState(memberId);
  const m = members.find(mb => mb.id === viewingId);
  const feed = socialFeeds[viewingId]?.instagram;
  const isLight = theme === "light";
  const wall = walls[viewingId];
  const handle = m?.ig || m?.name?.toLowerCase();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.5)" : "rgba(0,0,0,.8)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, height: "80vh", maxHeight: 600, background: isLight ? "#faf7f0" : "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.15)" : "#efefef"}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: isLight ? "#3a2510" : "#262626", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: isLight ? "#3a2510" : "#262626" }}>{t.social.instagram.title}</span>
        </div>
        <MemberSelector currentId={viewingId} onSelect={setViewingId} members={allTargetMembers} platform="instagram" theme={theme} photos={photos} />
        {/* THE POST FITS THE PANEL — it does not scroll. A 4:5 image is 450px
            of a 600px panel that has already spent ~115 on its title bar, tab
            strip and post header, so the caption and the like count were below
            the fold on every single post: the player had to scroll to read the
            one thing the round actually generated.

            So the image takes what is LEFT rather than a ratio of its own —
            `flex: 1` against siblings that cannot shrink — and `cover` trims
            the rest of the wallpaper. That is the trade Yuhan picked between
            cutting the photo and scrolling. `overflowY: auto` survives as a
            backstop for an unusually long caption, which shrinks the image to
            `minHeight` first; KakaoTalk keeps its scroll on purpose, because a
            thread is history. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", background: isLight ? "#faf7f0" : "#fff" }}>
          {feed && feed.caption ? (
            <>
              {/* The post header a real feed opens with: who posted, above the
                  image rather than only beside the caption underneath it. The
                  handle was already rendered down in the caption line and is
                  kept there too — that is how Instagram itself does it. */}
              <div style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.1)" : "#efefef"}` }}>
                <MemberFace member={m} photo={photos[viewingId]} size={30}
                  border={`1.5px solid ${m?.accent || "#ff3b5c"}`} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isLight ? "#3a2510" : "#262626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</div>
                  <div style={{ fontSize: 9.5, color: isLight ? "#a8845a" : "#8e8e8e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m?.name_kr || m?.name}</div>
                </div>
                <span aria-hidden style={{ marginLeft: "auto", color: isLight ? "#8a6840" : "#262626", fontSize: 14, letterSpacing: 1 }}>{"···"}</span>
              </div>
              {/* Her wallpaper as the post image. Nothing contradicts it: the
                  schema asks for {caption, likes} and carries no description of
                  an image, so this frame has always been decorative. With no
                  wallpaper it stays exactly the gradient it has always been.

                  NO ASPECT RATIO OF ITS OWN any more. It was 1:1, then 4:5 to
                  waste less of a 2:3 upload — but any fixed ratio decides the
                  post's height before the panel's, which is what pushed the
                  caption off screen. The height is now whatever the panel has
                  left (~390px at 360 wide, so a shade taller than 4:5) and
                  `cover` takes the middle of the wallpaper. */}
              <div style={{ width: "100%", flex: "1 1 0", minHeight: 150, background: isLight ? "linear-gradient(135deg,#ede0c8,#d4c4a0)" : "linear-gradient(135deg,#f9f0f5,#e8d0e0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, ...wallStyle(wall) }}>
                {!wall && "🖼️"}
              </div>
              <div style={{ padding: "6px 10px", display: "flex", gap: 10, fontSize: 16, flexShrink: 0 }}><span>❤️</span><span>💬</span></div>
              <div style={{ padding: "0 10px", fontSize: 11, fontWeight: 700, flexShrink: 0, color: isLight ? "#3a2510" : "#262626" }}>{t.social.instagram.likes((feed.likes / 10000).toFixed(0))}</div>
              <div style={{ padding: "3px 10px 14px", fontSize: 12, flexShrink: 0, color: isLight ? "#2c1f0e" : "#262626" }}>
                <span style={{ fontWeight: 700, marginRight: 4 }}>{handle}</span>{feed.caption}
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