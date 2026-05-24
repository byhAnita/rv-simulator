import React, { useState } from "react";
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils";

export default function SaveOverlay({ stats, member, form, messages, socialFeeds, kktMessages, kktUnlocked, memory, onLoad, onClose, t }) {
  const [saves, setSaves] = useState(() => loadFromStorage(STORAGE_KEYS.SAVES) || []);

  const handleSave = () => {
    const newSave = {
      id: Date.now(),
      name: `${t.stats.week.label} ${stats?.week || 1} - ${member?.name || "RV"}`,
      date: new Date().toLocaleDateString("zh-CN"),
      stats, form, messages, socialFeeds, kktMessages, kktUnlocked, memory,
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
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "75vh", background: "#1a0a20", border: "1px solid rgba(232,135,176,.3)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ background: "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(232,135,176,.15)", flexShrink: 0 }}>
          <span style={{ color: "#f8c8d8", fontSize: 14, fontWeight: 700 }}>{t.save.title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#a07090", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
          <button onClick={handleSave} style={{ width: "100%", padding: 10, borderRadius: 10, background: "linear-gradient(135deg,#e887b0,#c86dd0)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600, marginBottom: 12 }}>{t.save.saveBtn}</button>
          {saves.length === 0 ? (
            <div style={{ textAlign: "center", color: "#604060", padding: 20, fontSize: 12 }}>{t.save.noSaves}</div>
          ) : (
            saves.map(s => (
              <div key={s.id} style={{ padding: "8px 10px", background: "rgba(255,255,255,.04)", borderRadius: 8, border: "1px solid rgba(232,120,176,.1)", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#f0dce8", fontSize: 12, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ color: "#a07090", fontSize: 10 }}>{s.date} · 💗{s.stats?.affection || 0} · {t.stats.week.label}{s.stats?.week || 1}</div>
                </div>
                <button onClick={() => { onLoad(s); onClose(); }} style={{ padding: "4px 8px", borderRadius: 5, background: "rgba(232,135,176,.15)", border: "1px solid rgba(232,135,176,.3)", color: "#e887b0", fontSize: 10, cursor: "pointer" }}>{t.save.load}</button>
                <button onClick={() => handleDelete(s.id)} style={{ padding: "4px 6px", borderRadius: 5, background: "rgba(255,100,100,.1)", border: "1px solid rgba(255,100,100,.2)", color: "#f07070", fontSize: 10, cursor: "pointer" }}>{t.save.delete}</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}