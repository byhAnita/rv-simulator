import React from "react";

export default function MemberSelector({ currentId, onSelect, members, platform, kktUnlocked = {}, theme }) {
  const pc = { bubble: "#9747ff", instagram: "#ff3b5c", weverse: "#00d28b", kakao: "#3c1e1e" };
  const color = pc[platform] || "#e887b0";
  const isLight = theme === "light";

  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "6px 8px", background: isLight ? "#e0d2b8" : "rgba(0,0,0,.3)", borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.2)" : color + "33"}`, flexShrink: 0 }}>
      {members.map(m => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 14,
            border: `1px solid ${m.id === currentId ? m.accent : isLight ? "rgba(100,65,20,.25)" : "rgba(255,255,255,.1)"}`,
            background: m.id === currentId ? `${m.accent}22` : isLight ? "rgba(100,65,20,.07)" : "rgba(255,255,255,.04)",
            color: m.id === currentId ? (isLight ? "#2c1f0e" : "#fff") : isLight ? "#6b4528" : "#aaa",
            fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13 }}>{m.emoji}</span>
          <span>{m.name_kr || m.name}</span>
          {platform === "kakao" && !kktUnlocked[m.id] && <span style={{ fontSize: 9, color: "#666" }}>🔒</span>}
          {platform === "kakao" && kktUnlocked[m.id] && <span style={{ fontSize: 9, color: "#6d9b6d" }}>✓</span>}
        </button>
      ))}
    </div>
  );
}