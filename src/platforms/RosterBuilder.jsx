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

// The order roles are offered in, and the order the cast summary groups them in.
// Same sequence as SLOTS in rosterResolver, which is also prompt order.
const SLOT_ORDER = ["main", "sub", "npc"];

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
  // Deleting an authored member throws away work that cannot be recovered, so it
  // asks first. Holds the member id awaiting confirmation.
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  /**
   * Put a member in a named slot, or take her out by naming the slot she is
   * already in.
   *
   * This replaces a tap-to-cycle control (none -> main -> sub -> npc -> none).
   * Cycling was fewer pixels and worse: the roles were shown as symbols, so the
   * player could not tell WHAT they were assigning, and removing someone meant
   * tapping forward through every remaining state to get back to none. Reported
   * as confusing on the first phone test, which is the only place it shows.
   */
  const assign = (member, slot) => {
    setPicks((prev) => {
      const cur = prev[member.id]?.slot || null;
      const out = { ...prev };
      // Naming the slot she already holds is how you remove her — the control is
      // a toggle per role, so there is always one tap that undoes one tap.
      if (cur === slot) { delete out[member.id]; return out; }
      // Exactly one main. Promoting a second demotes the first to sub rather than
      // dropping her, which is what a player almost always means, and resolveRoster
      // reads only the first main so a second would otherwise be ignored silently.
      if (slot === "main") {
        for (const [id, p] of Object.entries(out)) {
          if (p.slot === "main") out[id] = { ...p, slot: "sub" };
        }
      }
      out[member.id] = member.__custom
        ? { slot, src: "custom", lang: cast.find((m) => m.id === member.id)?.lang || language,
            profile: cast.find((m) => m.id === member.id)?.profile }
        : { slot, src: "library", groupId: tab };
      return out;
    });
  };

  const unassign = (id) => setPicks((prev) => {
    const out = { ...prev }; delete out[id]; return out;
  });

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
    setConfirmDelete(null);
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
            // Two columns, not three: each card now carries three NAMED role
            // buttons, and the words are what make the control legible. Symbols in
            // a tighter grid is what the first version did, and a player could not
            // tell what they were assigning.
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {tabMembers.map((m) => {
                const slot = picks[m.id]?.slot || null;
                const fromElsewhere = slot && picks[m.id].src === "library"
                  && picks[m.id].groupId !== tab;
                return (
                  <div key={m.id} style={{ padding: 7, borderRadius: 10, border: `1px solid ${slot ? (m.accent || accent) : border}`, background: slot ? (m.accent || accent) + "14" : cardBg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
                        {photos[m.id]
                          ? <img src={photos[m.id]} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover", display: "block" }} />
                          : (m.emoji || "✨")}
                      </span>
                      <span style={{ fontSize: 11, color: textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name}
                      </span>
                    </div>
                    {/* One button per role. Tapping the active one removes her, so
                        there is always a single tap that undoes a single tap. */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {SLOT_ORDER.map((s) => {
                        const on = slot === s;
                        return (
                          <button key={s} onClick={() => assign(m, s)}
                            aria-pressed={on}
                            style={{ flex: 1, padding: "4px 0", borderRadius: 6, cursor: "pointer", fontSize: 9, whiteSpace: "nowrap", border: `1px solid ${on ? accent : border}`, background: on ? accent : "transparent", color: on ? (isLight ? "#fff" : "#200c1a") : textDim, fontWeight: on ? 700 : 400 }}>
                            {c.roles?.[s] || s}
                          </button>
                        );
                      })}
                    </div>
                    {/* She is in the cast from a DIFFERENT group's tab. Shown
                        because ids are shared across groups and a silent
                        selection here reads as a bug. */}
                    {fromElsewhere && (
                      <div style={{ fontSize: 8, color: textFaint, marginTop: 3 }}>
                        {c.viaGroup} {picks[m.id].groupId}
                      </div>
                    )}
                    {m.__custom && (
                      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                        <button onClick={() => setEditing(cast.find((x) => x.id === m.id))}
                          style={{ flex: 1, padding: "3px 0", borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: textDim, fontSize: 9, cursor: "pointer" }}>
                          {c.editShort}
                        </button>
                        <button onClick={() => setConfirmDelete(m.id)}
                          style={{ flex: 1, padding: "3px 0", borderRadius: 5, border: "1px solid rgba(180,60,20,.25)", background: "transparent", color: isLight ? "#a03010" : "#f07070", fontSize: 9, cursor: "pointer" }}>
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
          {chosen.length === 0 ? (
            // The legend only shows while the cast is empty, which is exactly when
            // the player does not yet know what the three roles mean. Once they
            // have picked someone it is the cast itself that is worth the space.
            <div style={{ fontSize: 9.5, color: textFaint, marginBottom: 8, lineHeight: 1.6 }}>
              {SLOT_ORDER.map((s) => (
                <div key={s}>
                  <b style={{ color: textDim }}>{c.roles?.[s]}</b> — {c.roleHints?.[s]}
                </div>
              ))}
            </div>
          ) : (
            // Grouped by role and named, with an x per member: removing someone
            // must not require finding her tab again.
            <div style={{ marginBottom: 8, maxHeight: 78, overflowY: "auto" }}>
              {SLOT_ORDER.filter((s) => chosen.some((p) => p.slot === s)).map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: textFaint, minWidth: 34, flexShrink: 0 }}>
                    {c.roles?.[s]}
                  </span>
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {chosen.filter((p) => p.slot === s).map((p) => (
                      <button key={p.id} onClick={() => unassign(p.id)}
                        aria-label={`${c.remove} ${nameOf(p.id)}`}
                        style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: textDim, fontSize: 9.5, cursor: "pointer" }}>
                        {nameOf(p.id)}
                        <span style={{ color: textFaint, fontSize: 10 }}>{"×"}</span>
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              <button onClick={() => setPicks({})}
                style={{ marginTop: 2, padding: "2px 7px", borderRadius: 9, border: `1px solid ${border}`, background: "transparent", color: textFaint, fontSize: 9, cursor: "pointer" }}>
                {c.clearCast}
              </button>
            </div>
          )}
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

      {/* Deleting an authored member is not undoable and the button sits beside
          Edit on a small card, so it asks first. It names her, because "are you
          sure" next to a grid of twelve faces is not a question you can answer. */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 300, background: pageBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, color: textMain, lineHeight: 1.6, marginBottom: 14 }}>
              {c.confirmDelete?.(nameOf(confirmDelete))}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 9, borderRadius: 9, border: `1px solid ${border}`, background: "transparent", color: textDim, fontSize: 11.5, cursor: "pointer" }}>
                {c.cancel}
              </button>
              <button onClick={() => deleteMember(confirmDelete)}
                style={{ flex: 1, padding: 9, borderRadius: 9, border: "none", background: isLight ? "#a03010" : "#8a2020", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                {c.deleteShort}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
