// src/platforms/RosterBuilder.jsx
//
// The custom door: assemble a cast from any groups in the library plus members
// the player authored. docs/V140_PLAN.md §14.2.
//
// PICKS ARE KEYED BY MEMBER ID, NOT BY GROUP/ID. That is not a shortcut, it is
// the correctness constraint step 4 uncovered: member ids are NOT unique across
// the library — `x` is a crossover roster sharing seven ids with the groups
// those members debuted in. Affections, KKT channels and memberAppearances are
// all keyed by id, so the same id twice in one roster would silently merge two
// people's state. Keying the map by id makes that impossible to express, and
// tapping Irene in a second group simply moves which group she is sourced from.
//
// What this produces is a roster, which is the only thing downstream consumes —
// the classic door produces the same shape from a group id, so nothing past
// resolveRoster knows which door the player came through.

import React, { useEffect, useMemo, useState } from "react";
import { loadGroupIndex, loadGroupConfig } from "../rag/groupLoader";
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils";
import {
  loadCustomCast, saveCustomCast, upsertMember, removeMember, rosterFromPicks, newMemberId, CAST_MAX,
} from "../rag/customCast";
import { loadPhotos, savePhotos, putPhoto, removePhoto, pruneOrphans } from "../utils/imageStore";
import MemberEditor from "./MemberEditor";

const CUSTOM_TAB = "__custom__";

// none -> main -> sub -> npc -> none. One tap per step, because a long-press or a
// second control would need explaining and this does not.
const CYCLE = [null, "main", "sub", "npc"];
const MARK = { main: "★", sub: "●", npc: "○" };

export default function RosterBuilder({
  language = "zh", theme = "dark", t, world,
  apiKey, modelId, aliyun,
  onStart, onBack, notify,
}) {
  const isLight = theme === "light";
  const c = t?.cast || {};

  const [groups, setGroups] = useState([]);
  const [tab, setTab] = useState(null);
  // groupId -> parsed config. Cached per language; cleared when language changes
  // so a cast never sits in the previous one.
  const [configs, setConfigs] = useState({});
  const [picks, setPicks] = useState({});
  const [cast, setCast] = useState(() => loadCustomCast());
  const [photos, setPhotos] = useState(() => loadPhotos());
  const [editing, setEditing] = useState(null);   // {id, profile} | {} for new
  const [saved, setSaved] = useState(() => loadFromStorage(STORAGE_KEYS.ROSTERS) || []);

  useEffect(() => {
    loadGroupIndex().then((list) => {
      setGroups(list);
      setTab((cur) => cur || list[0]?.id || CUSTOM_TAB);
    }).catch(console.error);
  }, []);

  // Language changed: every cached cast is in the old language.
  useEffect(() => { setConfigs({}); }, [language]);

  useEffect(() => {
    if (!tab || tab === CUSTOM_TAB || configs[tab]) return;
    let live = true;
    loadGroupConfig(tab, language)
      .then((cfg) => { if (live) setConfigs((m) => ({ ...m, [tab]: cfg })); })
      .catch(console.error);
    return () => { live = false; };
  }, [tab, language, configs]);

  const tabMembers = tab === CUSTOM_TAB
    ? cast.map((m) => ({ ...m.profile, id: m.id, __custom: true }))
    : (configs[tab]?.members || []);

  const chosen = useMemo(
    () => Object.entries(picks).map(([id, p]) => ({ id, ...p })), [picks]);
  const mainPick = chosen.find((p) => p.slot === "main");
  const canStart = Boolean(mainPick);

  const nameOf = (id) => {
    const p = picks[id];
    if (p?.profile?.name) return p.profile.name;
    for (const cfg of Object.values(configs)) {
      const m = cfg.members.find((x) => x.id === id);
      if (m) return m.name;
    }
    return cast.find((m) => m.id === id)?.profile?.name || id;
  };

  const cycle = (member) => {
    setPicks((prev) => {
      const cur = prev[member.id]?.slot || null;
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      const out = { ...prev };
      if (!next) { delete out[member.id]; return out; }
      // Exactly one main. Promoting a second demotes the first to sub rather than
      // dropping her, which is what a player almost always means.
      if (next === "main") {
        for (const [id, p] of Object.entries(out)) {
          if (p.slot === "main") out[id] = { ...p, slot: "sub" };
        }
      }
      out[member.id] = member.__custom
        ? { slot: next, src: "custom", lang: cast.find((m) => m.id === member.id)?.lang || language,
            profile: cast.find((m) => m.id === member.id)?.profile }
        : { slot: next, src: "library", groupId: tab };
      return out;
    });
  };

  // Shaped by rosterFromPicks (customCast.js) rather than here: entry order is
  // prompt order and prompt order is a cache boundary, so that logic is unit
  // tested as behaviour instead of asserted as a regex.
  const buildRoster = () => rosterFromPicks(picks, world?.id || "kpop_idol");

  const saveMember = (entry) => {
    const res = upsertMember(cast, entry);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.castFull
        : c.missing?.((res.missing || []).map((f) => c.fields?.[f] || f).join(", ")), "error");
      return;
    }
    if (!saveCustomCast(res.cast)) { notify?.(c.saveFailed, "error"); return; }
    setCast(res.cast);
    // An edited member who is already picked must have her snapshot refreshed, or
    // the roster carries the profile as it was before the edit.
    setPicks((prev) => (prev[entry.id]
      ? { ...prev, [entry.id]: { ...prev[entry.id], profile: res.cast.find((m) => m.id === entry.id).profile } }
      : prev));
    setEditing(null);
  };

  const deleteMember = (id) => {
    const next = removeMember(cast, id);
    if (!saveCustomCast(next)) { notify?.(c.saveFailed, "error"); return; }
    setCast(next);
    // The palette is not a dependency — a roster already built keeps its
    // snapshot — but this builder's pick refers to the palette entry, so drop it.
    setPicks((prev) => { const o = { ...prev }; delete o[id]; return o; });
    // Her photo would otherwise sit in a capped store forever, eventually
    // refusing a photo for a member who exists.
    const pruned = pruneOrphans(photos, next.map((m) => m.id));
    if (Object.keys(pruned).length !== Object.keys(photos).length) {
      savePhotos(pruned); setPhotos(pruned);
    }
  };

  const setPhotoFor = (id, dataUrl) => {
    const res = dataUrl === null
      ? { ok: true, photos: removePhoto(photos, id) }
      : putPhoto(photos, id, dataUrl);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.photoFull : c.photoTooLarge, "error");
      return;
    }
    if (!savePhotos(res.photos)) { notify?.(c.saveFailed, "error"); return; }
    setPhotos(res.photos);
  };

  const saveRoster = () => {
    if (!canStart) { notify?.(c.needMain, "error"); return; }
    const entry = { id: Date.now(), name: nameOf(mainPick.id), createdAt: Date.now(), roster: buildRoster() };
    const next = [entry, ...saved].slice(0, 20);
    if (!saveToStorage(STORAGE_KEYS.ROSTERS, next)) { notify?.(c.saveFailed, "error"); return; }
    setSaved(next);
    notify?.(c.rosterSaved, "info");
  };

  // Applying a saved roster has to reconstruct the picks, not just the entries,
  // or the tabs show nothing selected and the next tap starts from `none`.
  const applyRoster = (r) => {
    const next = {};
    for (const e of r?.entries || []) {
      next[e.memberId] = e.src === "custom"
        ? { slot: e.slot, src: "custom", lang: e.lang, profile: e.profile }
        : { slot: e.slot, src: "library", groupId: e.groupId };
    }
    setPicks(next);
  };

  // ── local styling, matching the other overlays in this folder ──
  const pageBg = isLight ? "#f5f0e4" : "#150818";
  const border = isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)";
  const textMain = isLight ? "#3a2510" : "#f0dce8";
  const textDim = isLight ? "#8a6840" : "#a07090";
  const textFaint = isLight ? "#a8845a" : "#785070";
  const accent = isLight ? "#8b6914" : "#e887b0";
  const accentGrad = isLight
    ? "linear-gradient(135deg,#c8a84b,#a0522d)"
    : "linear-gradient(135deg,#e887b0,#c86dd0)";
  const cardBg = isLight ? "rgba(100,65,20,.05)" : "rgba(255,255,255,.04)";

  const tabs = [...groups.map((g) => ({ id: g.id, label: g.name, emoji: g.emoji })),
    { id: CUSTOM_TAB, label: c.myCast || "★", emoji: "✨" }];

  return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: pageBg }}>
      <div style={{ width: "100%", maxWidth: 390, height: "100vh", maxHeight: 844, background: pageBg, fontFamily: "'Georgia','Noto Serif SC',serif", color: textMain, display: "flex", flexDirection: "column", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)", overflow: "hidden" }}>

        <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: textDim, fontSize: 15, cursor: "pointer", padding: 0 }}>{"←"}</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
              {world?.emoji} {c.buildCast || "Cast"}
            </span>
          </div>
          {/* group tabs, horizontally scrollable so nine groups fit at 390px */}
          <div style={{ display: "flex", gap: 5, marginTop: 9, overflowX: "auto", paddingBottom: 3 }}>
            {tabs.map((g) => (
              <button key={g.id} onClick={() => setTab(g.id)}
                style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 12, cursor: "pointer", border: `1px solid ${tab === g.id ? accent : border}`, background: tab === g.id ? (isLight ? "rgba(139,105,20,.12)" : "rgba(232,135,176,.14)") : "transparent", color: tab === g.id ? accent : textDim, fontSize: 10, whiteSpace: "nowrap" }}>
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {/* saved rosters, only when there are any */}
          {saved.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, color: textFaint, marginBottom: 4 }}>{c.savedRosters}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {saved.map((s) => (
                  <button key={s.id} onClick={() => applyRoster(s.roster)}
                    style={{ padding: "3px 8px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: textDim, fontSize: 9.5, cursor: "pointer" }}>
                    {s.name} ({s.roster?.entries?.length || 0})
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === CUSTOM_TAB && (
            <button onClick={() => setEditing({ id: newMemberId(), profile: {}, isNew: true })}
              disabled={cast.length >= CAST_MAX}
              style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 9, border: `1px dashed ${border}`, background: "transparent", color: cast.length >= CAST_MAX ? textFaint : accent, fontSize: 11.5, cursor: cast.length >= CAST_MAX ? "default" : "pointer" }}>
              {cast.length >= CAST_MAX ? c.castFull : `+ ${c.createMember}`}
            </button>
          )}

          {tabMembers.length === 0 ? (
            <div style={{ textAlign: "center", color: textFaint, fontSize: 11, padding: 18 }}>
              {tab === CUSTOM_TAB ? c.noCustomYet : c.loadingMembers}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {tabMembers.map((m) => {
                const slot = picks[m.id]?.slot || null;
                const fromElsewhere = slot && picks[m.id].src === "library"
                  && picks[m.id].groupId !== tab;
                return (
                  <div key={m.id} style={{ position: "relative" }}>
                    <button onClick={() => cycle(m)}
                      style={{ width: "100%", padding: "8px 4px", borderRadius: 10, cursor: "pointer", border: `1px solid ${slot ? (m.accent || accent) : border}`, background: slot ? (m.accent || accent) + "20" : cardBg, color: textMain, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 19, lineHeight: 1 }}>
                        {photos[m.id]
                          ? <img src={photos[m.id]} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover", display: "block" }} />
                          : (m.emoji || "✨")}
                      </span>
                      <span style={{ fontSize: 9.5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 10, color: slot ? accent : textFaint, minHeight: 12 }}>
                        {slot ? MARK[slot] : "◌"}
                      </span>
                    </button>
                    {/* She is in the cast from a DIFFERENT group's tab. Shown
                        because ids are shared across groups and a silent
                        selection here reads as a bug. */}
                    {fromElsewhere && (
                      <span style={{ position: "absolute", top: 2, right: 3, fontSize: 8, color: textFaint }}>
                        {picks[m.id].groupId}
                      </span>
                    )}
                    {m.__custom && (
                      <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                        <button onClick={() => setEditing(cast.find((x) => x.id === m.id))}
                          style={{ flex: 1, padding: "2px 0", borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: textDim, fontSize: 8.5, cursor: "pointer" }}>
                          {c.editShort}
                        </button>
                        <button onClick={() => deleteMember(m.id)}
                          style={{ flex: 1, padding: "2px 0", borderRadius: 5, border: "1px solid rgba(180,60,20,.25)", background: "transparent", color: isLight ? "#a03010" : "#f07070", fontSize: 8.5, cursor: "pointer" }}>
                          {c.deleteShort}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* the chosen cast, and the way out */}
        <div style={{ padding: "9px 12px 12px", borderTop: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: chosen.length ? textDim : textFaint, marginBottom: 8, lineHeight: 1.5, maxHeight: 44, overflowY: "auto" }}>
            {chosen.length === 0
              ? c.pickMainHint
              : ["main", "sub", "npc"].flatMap((slot) => chosen.filter((p) => p.slot === slot)
                  .map((p) => `${MARK[p.slot]}${nameOf(p.id)}`)).join("  ")}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={saveRoster} disabled={!canStart}
              style={{ padding: "11px 13px", borderRadius: 40, border: `1px solid ${border}`, background: "transparent", color: canStart ? textDim : textFaint, fontSize: 11.5, cursor: canStart ? "pointer" : "default" }}>
              {c.saveRoster}
            </button>
            <button onClick={() => onStart?.(buildRoster())} disabled={!canStart}
              style={{ flex: 1, padding: 11, borderRadius: 40, border: "none", cursor: canStart ? "pointer" : "not-allowed", background: canStart ? accentGrad : (isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.08)"), color: canStart ? "#fff" : textFaint, fontSize: 12.5, fontWeight: 700 }}>
              {canStart ? `${c.start} →` : c.needMain}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <MemberEditor
          member={editing} isNew={Boolean(editing.isNew)}
          language={language} theme={theme} t={t}
          apiKey={apiKey} modelId={modelId} aliyun={aliyun} world={world}
          photo={photos[editing.id]}
          onPhotoChange={(d) => setPhotoFor(editing.id, d)}
          onSave={saveMember}
          onCancel={() => setEditing(null)}
          notify={notify}
        />
      )}
    </div>
  );
}
