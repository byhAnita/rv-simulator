import React, { useState } from "react";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, addSaveSlot, SAVE_SLOT_MAX } from "../utils";
import { SAVE_SCHEMA } from "../rag/saveMigrator";
import { DEFAULT_WORLD_ID } from "../rag/worldLoader";

export default function SaveOverlay({ stats, member, form, groupId, worldId, worldLabel, roster, messages, currentOptions, socialFeeds, kktMessages, kktUnlocked, memory, triggeredAchievements, onLoad, onClose, t, theme }) {
  const [saves, setSaves] = useState(() => loadFromStorage(STORAGE_KEYS.SAVES) || []);
  // Set when localStorage refuses the write. The list must keep showing what is
  // actually stored, so this is the only signal the player gets that the slot
  // they just asked for does not exist.
  const [quotaFailed, setQuotaFailed] = useState(false);
  // Distinct from quotaFailed: the disk would take this write, the game's own
  // ten-slot cap will not. Different cause, different advice, so a separate
  // notice rather than one vague "could not save".
  const [slotsFull, setSlotsFull] = useState(false);
  const isLight = theme === "light";
  // A save that cannot be written is a save the player must not be invited to
  // make. `>=` rather than `===` because a list written before the cap existed
  // could hold more, and truncating it here would be the very loss being fixed.
  const atCapacity = saves.length >= SAVE_SLOT_MAX;

  const handleSave = () => {
    const newSave = {
      id: Date.now(),
      // The world leads, because it is what tells two runs of the same cast
       // apart - and it is prefixed rather than appended so it survives the
       // ellipsis when a slot name is too long for the row.
      name: `${worldLabel ? worldLabel + " " : ""}${t.stats.week.label} ${stats?.week || 1} - ${member?.name || "RV"}`,
      date: new Date().toLocaleDateString("zh-CN"),
      // A save slot recorded who the player chose but never where they came
      // from, so loading a TWICE save while Red Velvet was selected produced
      // Red Velvet's cast under TWICE member ids — no crash, just a prompt
      // whose main member was undefined. These four fields close that, and are
      // what saveMigrator backfills for every slot written before v1.4.0.
      schema: SAVE_SCHEMA,
      // THE WORLD THE RUN IS BEING PLAYED IN, handed down from the loaded
      // `world` object every prompt this round was built from - not read back
      // off the roster. The roster used to carry a `worldId` and it was stamped
      // one screen before the player picks a world, so a chaebol run saved
      // `kpop_idol` and loading it brought back the idol world's places,
      // platforms and prompt. A save records what was played, and only the run
      // knows that.
      groupId, worldId: worldId || DEFAULT_WORLD_ID, roster,
      stats, form, messages, currentOptions, socialFeeds, kktMessages, kktUnlocked, memory,
      triggeredAchievements: triggeredAchievements ? [...triggeredAchievements] : [],
    };
    // The cap REFUSES; it does not evict. `.slice(0, 10)` here used to drop the
    // oldest slot silently, and since ids are timestamps nothing ever replaced
    // anything — so the eleventh save deleted a run the player never agreed to
    // give up. The button below is disabled at the cap as well; this is the check
    // that actually enforces it.
    const res = addSaveSlot(saves, newSave);
    if (!res.ok) { setSlotsFull(res.reason === "slots_full"); return; }
    // Write first, render second. Updating state before checking the result is
    // what made a failed save invisible: the slot appeared in the list, the
    // player closed the overlay believing they were safe, and the save was never
    // on disk. On failure the list is left showing exactly what is stored.
    if (!saveToStorage(STORAGE_KEYS.SAVES, res.saves)) {
      setQuotaFailed(true);
      return;
    }
    setSaves(res.saves);
    setQuotaFailed(false);
    setSlotsFull(false);
  };

  const handleDelete = (id) => {
    const updated = saves.filter(s => s.id !== id);
    // A delete shrinks the payload, so it should not hit quota - but if the
    // write fails the slot is still on disk, and showing it as gone would be the
    // same lie in the other direction.
    if (!saveToStorage(STORAGE_KEYS.SAVES, updated)) return;
    setSaves(updated);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "75%", background: isLight ? "#faf7f0" : "#1a0a20", border: `1px solid ${isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)"}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#4a2e14)" : "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${isLight ? "rgba(100,65,20,.2)" : "rgba(232,135,176,.15)"}`, flexShrink: 0 }}>
          <span style={{ color: isLight ? "#f5e8d0" : "#f8c8d8", fontSize: 14, fontWeight: 700 }}>{t.save.title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: isLight ? "#c8a870" : "#a07090", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
          {/* Slot count, always visible. The cap used to be invisible until it
              destroyed something; seeing 9/10 is what stops a player reaching it
              unaware. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ color: isLight ? "#8a6840" : "#a07090", fontSize: 10 }}>
              {t.save.slotCount ? t.save.slotCount(saves.length, SAVE_SLOT_MAX) : `${saves.length}/${SAVE_SLOT_MAX}`}
            </span>
          </div>
          <button onClick={handleSave} disabled={atCapacity}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600, marginBottom: 12,
              background: atCapacity ? (isLight ? "rgba(100,65,20,.12)" : "rgba(255,255,255,.07)")
                : (isLight ? "linear-gradient(135deg,#c8a84b,#a0522d)" : "linear-gradient(135deg,#e887b0,#c86dd0)"),
              color: atCapacity ? (isLight ? "#a8845a" : "#7a5a78") : "#fff",
              cursor: atCapacity ? "not-allowed" : "pointer" }}>
            {t.save.saveBtn}
          </button>
          {(atCapacity || slotsFull) && (
            // Not a toast, for the same reason as the quota notice: this is the
            // player being told her progress is NOT being kept, and it must stay
            // on screen until she has done something about it.
            <div style={{ padding: "9px 11px", marginBottom: 12, borderRadius: 8, background: "rgba(180,120,20,.10)", border: "1px solid rgba(180,120,20,.35)", color: isLight ? "#8a5a10" : "#f0c070", fontSize: 11, lineHeight: 1.5 }}>
              {t.save.slotsFull ? t.save.slotsFull(SAVE_SLOT_MAX) : ""}
            </div>
          )}
          {quotaFailed && (
            // Deliberately not a toast: a toast is gone in three seconds and this
            // is the player being told their progress was not written. It stays
            // until the next save attempt succeeds. Which advice applies depends
            // on whether there is anything left to delete.
            <div style={{ padding: "9px 11px", marginBottom: 12, borderRadius: 8, background: "rgba(180,60,20,.10)", border: "1px solid rgba(180,60,20,.35)", color: isLight ? "#a03010" : "#f09090", fontSize: 11, lineHeight: 1.5 }}>
              {saves.length > 0 ? t.save.quotaFull : t.save.quotaRetry}
            </div>
          )}
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