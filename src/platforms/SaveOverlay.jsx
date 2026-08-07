import React, { useState } from "react";
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils";

export default function SaveOverlay({ stats, member, form, messages, currentOptions, socialFeeds, kktMessages, kktUnlocked, memory, triggeredAchievements, onLoad, onClose, t, theme }) {
  const [saves, setSaves] = useState(() => loadFromStorage(STORAGE_KEYS.SAVES) || []);
  const isLight = theme === "light";

  const handleSave = () => {
    const newSave = {
      id: Date.now(),
      name: `${t.stats.week.label} ${stats?.week || 1} - ${member?.name || "RV"}`,
      date: new Date().toLocaleDateString("zh-CN"),
      stats, form, messages, currentOptions, socialFeeds, kktMessages, kktUnlocked, memory,
      triggeredAchievements: triggeredAchievements ? [...triggeredAchievements] : [],
    };
    const updated = [newSave, ...saves.filter(s => s.id !== newSave.id)].slice(0, 10);
    setSaves(updated);
    saveToStorage(STORAGE_KEYS.SAVES, updated);
  };

  const handleDelete = (id) => {
    const updated = saves.filter(s => s.id !== id);
    setSaves(updated);
    saveToStorage(STORAGE_KEYS.SAVES, updated);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "75vh", background: isLight ? "#faf7f0" : "#1a0a20", border: `1px solid ${isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)"}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#4a2e14)" : "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.2)" : "rgba(232,135,176,.15)"}`, flexShrink: 0 }}>
          <span style={{ color: isLight ? "#f5e8d0" : "#f8c8d8", fontSize: 14, fontWeight: 700 }}>{t.save.title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: isLight ? "#c8a870" : "#a07090", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
          <button onClick={handleSave} style={{ width: "100%", padding: 10, borderRadius: 10, background: isLight ? "linear-gradient(135deg,#c8a84b,#a0522d)" : "linear-gradient(135deg,#e887b0,#c86dd0)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600, marginBottom: 12 }}>{t.save.saveBtn}</button>
          {saves.length === 0 ? (
            <div style={{ textAlign: "center", color: isLight ? "#a8845a" : "#604060", padding: 20, fontSize: 12 }}>{t.save.noSaves}</div>
          ) : (
            saves.map(s => (
              <div key={s.id} style={{ padding: "8px 10px", background: isLight ? "rgba(100,65,20,.06)" : "rgba(255,255,255,.04)", borderRadius: 8, border: `1px solid ${isLight ? "rgba(100,65,20,.15)" : "rgba(232,120,176,.1)"}`, display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isLight ? "#3a2510" : "#f0dce8", fontSize: 12, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ color: isLight ? "#8a6840" : "#a07090", fontSize: 10 }}>{s.date} · 💗{s.stats?.affection || 0} · {t.stats.week.label}{s.stats?.week || 1}</div>
                </div>
                <button onClick={() => { onLoad(s); onClose(); }} style={{ padding: "4px 8px", borderRadius: 5, background: isLight ? "rgba(139,105,20,.15)" : "rgba(232,135,176,.15)", border: `1px solid ${isLight ? "rgba(139,105,20,.35)" : "rgba(232,135,176,.3)"}`, color: isLight ? "#8b6914" : "#e887b0", fontSize: 10, cursor: "pointer" }}>{t.save.load}</button>
                <button onClick={() => handleDelete(s.id)} style={{ padding: "4px 6px", borderRadius: 5, background: "rgba(180,60,20,.08)", border: "1px solid rgba(180,60,20,.2)", color: isLight ? "#a03010" : "#f07070", fontSize: 10, cursor: "pointer" }}>{t.save.delete}</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}