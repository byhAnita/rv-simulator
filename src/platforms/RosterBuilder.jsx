// src/platforms/RosterBuilder.jsx
//
// The custom door: assemble a cast from any groups in the library plus members
// the player authored. docs/V140_PLAN.md §14.2.
//
// ROLE-FIRST, NOT MEMBER-FIRST. This screen is organised as three sections —
// main, then subs, then NPCs — and a member is added INTO a section. Two earlier
// generations put the roles on the MEMBER instead, and the second one is the
// instructive failure: tap-to-cycle on symbols was replaced by three NAMED
// buttons on every member card, which was legible and still wrong.
//
//   - Up to twenty-seven adjacent ~18px targets at 390px, each assigning a
//     DIFFERENT role, so a mis-tap assigned the wrong part rather than missing.
//   - It inverted the task. A player picks her main, then optionally some subs,
//     then optionally some background faces. She never walks the library asking
//     "what is Yeri for".
//
// So the sections show their members as chips with an x, and a + opens
// MemberPicker for that slot. Everything the player browses now lives in the
// sheet — which is also where the authored palette is managed — leaving this
// screen a summary of decisions already made.
//
// PICKS ARE KEYED BY MEMBER ID, NOT BY GROUP/ID. That is not a shortcut, it is
// the correctness constraint step 4 uncovered: member ids are NOT unique across
// the library — `x` is a crossover roster sharing seven ids with the groups
// those members debuted in. Affections, KKT channels and memberAppearances are
// all keyed by id, so the same id twice in one roster would silently merge two
// people's state. Keying the map by id makes that impossible to express.
//
// What this produces is a roster, which is the only thing downstream consumes —
// the classic door produces the same shape from a group id, so nothing past
// resolveRoster knows which door the player came through.

import React, { useEffect, useMemo, useState } from "react";
import { loadGroupIndex, loadGroupConfig } from "../rag/groupLoader";
import { STORAGE_KEYS, loadFromStorage, saveToStorage, displayNameIn } from "../utils";
import {
  loadCustomCast, saveCustomCast, upsertMember, removeMember, rosterFromPicks,
  overrideFrom, editorTargetFor,
  assignSlot, savedRosterEntry, newMemberId,
} from "../rag/customCast";
import {
  loadPhotos, savePhotos, loadWalls, saveWalls, putPhoto, removePhoto,
  PHOTO_LIMITS, WALL_LIMITS, WALL_MAX_COUNT,
} from "../utils/imageStore";
import CastImageSheet from "./CastImageSheet";
import { castTokens, scaleFont, safeInset, Z } from "./castTheme";
import { photoFill } from "./memberFace";
import MemberEditor from "./MemberEditor";
import MemberPicker from "./MemberPicker";

// The order the sections appear in, which is also the order rosterFromPicks
// emits and therefore the order member profiles reach the prompt.
const SLOT_ORDER = ["main", "sub", "npc"];

const ROSTER_MAX = 20;

export default function RosterBuilder({
  language = "zh", theme = "dark", t, world, fontScale = 1,
  apiKey, modelId, aliyun,
  onStart, onBack, notify,
}) {
  const isLight = theme === "light";
  const k = castTokens(isLight);
  const fs = (px) => scaleFont(px, fontScale);
  const c = t?.cast || {};

  const [groups, setGroups] = useState([]);
  // groupId -> parsed config. Cached per language; cleared when language changes
  // so a cast never sits in the previous one.
  const [configs, setConfigs] = useState({});
  const [picks, setPicks] = useState({});
  const [cast, setCast] = useState(() => loadCustomCast());
  const [photos, setPhotos] = useState(() => loadPhotos());
  const [walls, setWalls] = useState(() => loadWalls());
  const [showImages, setShowImages] = useState(false);
  const [editing, setEditing] = useState(null);   // {id, profile} | {} for new
  const [saved, setSaved] = useState(() => loadFromStorage(STORAGE_KEYS.ROSTERS) || []);
  // Which section's picker sheet is open, or null.
  const [pickerSlot, setPickerSlot] = useState(null);
  // Deleting an authored member throws away work that cannot be recovered, so it
  // asks first. Holds the member id awaiting confirmation.
  // {kind: "member" | "roster", id} - one dialog, two things it can be asked
  // about. A saved cast had no way to be deleted at all; giving it one means
  // the confirm stops being member-specific, which is cheaper than a second
  // dialog that would drift from this one.
  const [confirmDelete, setConfirmDelete] = useState(null);
  // The save-roster naming prompt: null when closed, a draft string when open.
  const [castLabel, setCastLabel] = useState(null);

  useEffect(() => {
    loadGroupIndex().then(setGroups).catch(console.error);
  }, []);

  // Language changed: every cached cast is in the old language.
  useEffect(() => { setConfigs({}); }, [language]);

  const needGroup = (id) => {
    if (!id || configs[id]) return;
    loadGroupConfig(id, language)
      .then((cfg) => setConfigs((m) => (m[id] ? m : { ...m, [id]: cfg })))
      .catch(console.error);
  };

  // The whole cast, in the order it will reach the prompt. Derived from
  // rosterFromPicks rather than from the picks object, so what the player sees
  // listed IS what the roster carries — within-slot order reaches the prompt and
  // prompt order is a cache boundary, so two answers to "what order" is one
  // answer too many.
  const roster = useMemo(
    () => rosterFromPicks(picks), [picks]);
  const idsIn = (slot) => roster.entries.filter((e) => e.slot === slot).map((e) => e.memberId);

  // MAIN AND SUBS ONLY, and this is the images sheet's whole population as
  // well as its denominator. An NPC's photo and wallpaper have no reader
  // anywhere in the running game: every surface that draws a face - the top
  // bar and all four social overlays' member strips - is built from
  // `allTargetMembers`, which is main plus subs, and an NPC produces no
  // social post and no Kakao to put a face beside. So an NPC upload could
  // never be looked at, while still spending one of the 30 photo or 8
  // wallpaper slots. Reported from hand play, 2026-09-29.
  const facedIds = roster.entries.filter((e) => e.slot !== "npc").map((e) => e.memberId);

  const chosen = useMemo(
    () => Object.entries(picks).map(([id, p]) => ({ id, ...p })), [picks]);
  const mainPick = chosen.find((p) => p.slot === "main");
  const canStart = Boolean(mainPick);

  // HER LIBRARY RECORD, unmodified. The base an override is diffed against has to
  // be this and never the overridden copy, or a second edit compounds: a field
  // changed and then typed back to its original text would keep an override entry
  // saying it equals itself, and the entry stops being byte-identical for a cast
  // nobody meaningfully edited. See customCast.js#overrideFrom.
  const libraryBase = (id) => {
    for (const cfg of Object.values(configs)) {
      const m = cfg.members.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  };

  // What this member IS for this run - the library record with her edits applied, so
  // every chip, avatar and name on this screen shows what the prompt will carry.
  const memberOf = (id) => {
    const p = picks[id];
    if (p?.profile) return p.profile;
    const base = libraryBase(id);
    if (base) return p?.override ? { ...base, ...p.override } : base;
    return cast.find((m) => m.id === id)?.profile || null;
  };
  const nameOf = (id) => displayNameIn(memberOf(id) || {}, language) || id;
  // The group's own display name, never its id. `red_velvet` and `gnz` are
  // storage keys; the index already carries what the player calls them, and every
  // other surface in the app uses that. Same defect as [Stage Changes] printing a
  // raw member id beside an [Affections] line printing a name.
  const groupNameOf = (id) => groups.find((g) => g.id === id)?.name || id;

  /**
   * Put a member in a named slot, or take her out by naming the slot she is
   * already in. The rule itself is `assignSlot` in customCast.js, tested as
   * behaviour; what lives here is only the palette lookup and the notice.
   */
  const assign = (member, slot) => {
    const entry = cast.find((m) => m.id === member.id);
    setPicks((prev) => assignSlot(prev, member, slot, {
      lang: entry?.lang || language,
      profile: entry?.profile,
    }));
    // Moving someone between sections is the one assignment whose effect is not
    // visible where the tap happened — she leaves a section the sheet is covering.
    if (picks[member.id] && picks[member.id].slot !== slot) {
      notify?.(c.moved?.(displayNameIn(member, language), c.roles?.[slot]), "info");
    }
  };

  const unassign = (id) => setPicks((prev) => {
    const out = { ...prev }; delete out[id]; return out;
  });

  /**
   * Open the profile editor for a member who is already in the cast, from EITHER
   * source - §22.2's one editor, reached by tapping her face.
   *
   * The two sources differ in what the editor is handed and in where a save lands,
   * and both differences are here rather than in the component: a custom member is
   * edited as her palette entry and saved as a new snapshot; a library member is
   * edited as her library record with this run's override applied on top, and saved
   * as a diff.
   */
  const editChosen = (id) => {
    const pick = picks[id];
    const target = editorTargetFor(id, pick, {
      paletteEntry: cast.find((m) => m.id === id),
      libraryBase: libraryBase(id),
      language,
    });
    // Null for a library member means her group config has not arrived - they are
    // fetched per tab. Asking for it and saying so beats opening an editor over an
    // empty profile, which would read as data loss and would diff every field as a
    // change, snapshotting her by the back door.
    if (!target) {
      if (pick && pick.src !== "custom") { needGroup(pick.groupId); notify?.(c.loadingMembers, "info"); }
      return;
    }
    setEditing(target);
  };

  // Shaped by rosterFromPicks (customCast.js) rather than here: entry order is
  // prompt order and prompt order is a cache boundary, so that logic is unit
  // tested as behaviour instead of asserted as a regex.
  const buildRoster = () => rosterFromPicks(picks);

  /**
   * An edit to a LIBRARY member lands on the roster entry as a diff.
   *
   * NOT a snapshot, which is what makes this worth its own function: resolveRoster
   * applies `entry.override` over the member it fetched, so every field the player
   * did not touch keeps arriving by reference and a corrected library profile still
   * reaches a game in progress (§4.2). Snapshotting her would give that up and gain
   * nothing - and it would pass any structural check, which is why the guard for it
   * is behavioural, through resolveRoster.
   *
   * It writes NOTHING to the palette. The palette is the player's authored members;
   * copying Irene into it would be a second Irene with the same id, and every
   * per-member map in the save is keyed by id.
   */
  const saveLibraryEdit = (entry) => {
    const base = libraryBase(entry.id);
    // Her group is fetched per tab, so a base we cannot see means the config has not
    // arrived. Refusing is right: diffing against {} would record every field as a
    // change and snapshot her by the back door.
    if (!base) { notify?.(c.saveFailed, "error"); return; }
    const override = overrideFrom(base, entry.profile);
    setPicks((prev) => {
      const pick = prev[entry.id];
      if (!pick) return prev;
      const next = { ...pick };
      // An EMPTY diff removes the key rather than storing {}: an entry for a member
      // nobody changed must be what it was before this editor existed.
      if (Object.keys(override).length) next.override = override; else delete next.override;
      return { ...prev, [entry.id]: next };
    });
    setEditing(null);
  };

  const saveMember = (entry) => {
    // The editor forwards which copy it was editing, rather than this branch reading
    // ambient state to work it out - see MemberEditor#submit.
    if (entry.src === "library") { saveLibraryEdit(entry); return; }
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
    // Drop HER images, by id — not `pruneOrphans(photos, paletteIds)`, which is
    // what this was and which step 8 turns into data loss. That call keeps only
    // ids in the custom palette, so now that a LIBRARY member can have a photo,
    // deleting one authored member would have deleted every library photo in the
    // store. It was harmless only because nothing could put one there.
    //
    // An id is all this site needs: exactly one member stopped existing, and
    // reconciling the whole store against a set of ids requires knowing every
    // id, which this screen does not — group configs are fetched per tab, so the
    // groups the player has not opened are indistinguishable from groups that
    // are gone.
    if (photos[id]) { const p = removePhoto(photos, id); savePhotos(p); setPhotos(p); }
    if (walls[id]) { const w = removePhoto(walls, id); saveWalls(w); setWalls(w); }
  };

  const setPhotoFor = (id, dataUrl) => {
    const res = dataUrl === null
      ? { ok: true, photos: removePhoto(photos, id) }
      : putPhoto(photos, id, dataUrl, PHOTO_LIMITS);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.photoFull : c.photoTooLarge, "error");
      return;
    }
    if (!savePhotos(res.photos)) { notify?.(c.saveFailed, "error"); return; }
    setPhotos(res.photos);
  };

  // Her wallpaper. Same refusal rules through the same function, different caps
  // and a different key — a second copy of the rules is what `extractStoryText`
  // is a warning about.
  const setWallFor = (id, dataUrl) => {
    const res = dataUrl === null
      ? { ok: true, photos: removePhoto(walls, id) }
      : putPhoto(walls, id, dataUrl, WALL_LIMITS);
    if (!res.ok) {
      notify?.(res.reason === "full" ? c.wallFull?.(WALL_MAX_COUNT) : c.photoTooLarge, "error");
      return;
    }
    if (!saveWalls(res.photos)) { notify?.(c.saveFailed, "error"); return; }
    setWalls(res.photos);
  };

  // `setPhotoFor` / `setWallFor` are what the sheet and the editor both call, and
  // they take a data URL rather than a File: the cropper produced it, because the
  // player chose the region. This used to be two `take*` wrappers doing a
  // `downscale` here — the sheet does not own either store, so the conversion sat
  // on this side — and the conversion itself is gone with the automatic crop.

  // Commit the saved roster under the name the player just typed. The entry's
  // shape — and specifically the rule that this label never reaches
  // `roster.name`, which IS sent to the model — is `savedRosterEntry`.
  // A saved cast is deletable. It is player data, so it goes through the same
  // confirm the palette uses rather than dying to one mis-tap on a 20px target
  // sitting on the control that APPLIES it.
  const deleteRoster = (id) => {
    const next = saved.filter((s) => s.id !== id);
    if (!saveToStorage(STORAGE_KEYS.ROSTERS, next)) { notify?.(c.saveFailed, "error"); return; }
    setSaved(next);
    setConfirmDelete(null);
  };

  const commitRoster = () => {
    const entry = savedRosterEntry({
      label: castLabel, roster: buildRoster(), fallbackName: nameOf(mainPick.id),
    });
    const next = [entry, ...saved].slice(0, ROSTER_MAX);
    if (!saveToStorage(STORAGE_KEYS.ROSTERS, next)) { notify?.(c.saveFailed, "error"); return; }
    setSaved(next);
    setCastLabel(null);
    notify?.(c.rosterSaved, "info");
  };

  // Applying a saved roster has to reconstruct the picks, not just the entries,
  // or the sections show nothing selected and the next tap starts from `none`.
  const applyRoster = (r) => {
    const next = {};
    for (const e of r?.entries || []) {
      next[e.memberId] = e.src === "custom"
        ? { slot: e.slot, src: "custom", lang: e.lang, profile: e.profile }
        // The OVERRIDE comes back too. A saved cast that dropped it would lose every
        // edit the moment it was applied, which is the shape of loss this screen has
        // already had once: the value is in the saved data and the reconstruction
        // does not read it.
        : { slot: e.slot, src: "library", groupId: e.groupId, ...(e.override ? { override: e.override } : {}) };
      if (e.src === "library") needGroup(e.groupId);
    }
    setPicks(next);
  };

  // A cast drawn from more than one group, or holding anyone authored, becomes
  // its own group in section 4 — so say so here, where the player is assembling
  // it, rather than letting the group-name field at Setup be the first mention.
  const composed = useMemo(() => {
    const libGroups = new Set(chosen.filter((p) => p.src === "library").map((p) => p.groupId));
    return chosen.some((p) => p.src === "custom") || libGroups.size > 1;
  }, [chosen]);

  // Members who already have a face, over the members who can show one.
  const withPhoto = facedIds.filter((id) => photos[id]).length;

  const chipStyle = {
    display: "flex", alignItems: "center", gap: 5, padding: "7px 9px", minHeight: 36,
    borderRadius: 18, border: `1px solid ${k.border}`, background: k.cardBg,
    color: k.textMain, fontSize: fs(11.5), cursor: "pointer",
  };
  const addStyle = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
    padding: "7px 13px", minHeight: 36, borderRadius: 18,
    border: `1px dashed ${k.accent}`, background: "transparent",
    color: k.accent, fontSize: fs(11.5), cursor: "pointer",
  };

  // Her photo is this span's OWN background rather than a child to be clipped
  // — see photoFill in memberFace.
  const avatar = (id, size) => {
    const m = memberOf(id) || {};
    return (
      <span style={{ width: size, height: size, borderRadius: size / 3.5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.6), lineHeight: 1, background: k.inputBg, ...photoFill(photos[id]), flexShrink: 0 }}>
        {photos[id] ? null : (m.emoji || "✨")}
      </span>
    );
  };

  return (
    <div className="rv-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", background: k.pageBg }}>
      <div className="rv-card" style={{ width: "100%", maxWidth: 390, maxHeight: 844, background: k.pageBg, fontFamily: "'Georgia','Noto Serif SC',serif", color: k.textMain, display: "flex", flexDirection: "column", borderRadius: 20, boxShadow: "0 0 40px rgba(0,0,0,.3)", overflow: "hidden" }}>

        <div style={{ padding: "12px 13px 10px", borderBottom: `1px solid ${k.border}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onBack} aria-label={c.back}
            style={{ background: "none", border: "none", color: k.textDim, fontSize: fs(15), cursor: "pointer", padding: "4px 6px", minHeight: 32 }}>
            {"←"}
          </button>
          <span style={{ fontSize: fs(13), fontWeight: 700, color: k.accent }}>
            {world?.emoji} {c.buildCast}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 13 }}>
          {/* saved rosters, only when there are any */}
          {saved.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: fs(11), color: k.textFaint, marginBottom: 5 }}>{c.savedRosters}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {/* Two controls, not one with a decorative x: tapping the bubble
                    APPLIES the cast, so the delete has to be its own target. The
                    member chips put the x inside the button because there the
                    whole chip is the unassign control and the glyph is a label. */}
                {saved.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", borderRadius: 16, border: `1px solid ${k.border}`, background: k.cardBg, overflow: "hidden" }}>
                    <button onClick={() => applyRoster(s.roster)}
                      style={{ padding: "7px 4px 7px 10px", minHeight: 34, border: "none", background: "transparent", color: k.textDim, fontSize: fs(11), cursor: "pointer" }}>
                      {s.name} ({s.roster?.entries?.length || 0})
                    </button>
                    <button aria-label="delete" onClick={() => setConfirmDelete({ kind: "roster", id: s.id })}
                      style={{ padding: "7px 9px 7px 4px", minHeight: 34, border: "none", background: "transparent", color: k.textFaint, fontSize: fs(12), cursor: "pointer" }}>
                      {"×"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* One section per role. The hint is always present, not only while the
              cast is empty — the NPC decision is made last, and the old legend
              had disappeared by the time the player got there. */}
          {SLOT_ORDER.map((s) => {
            const ids = idsIn(s);
            return (
              <div key={s} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 6 }}>
                  <span style={{ fontSize: fs(12), fontWeight: 700, color: k.textMain, letterSpacing: .3 }}>
                    {c.roles?.[s] || s}
                  </span>
                  <span style={{ fontSize: fs(11), color: k.textFaint, lineHeight: 1.35 }}>
                    {c.roleHints?.[s]}
                  </span>
                </div>

                {s === "main" ? (
                  // The main member is a card, not a chip: she is required, she is
                  // the romance line, and while the slot is empty she should be the
                  // only thing on the screen asking to be tapped.
                  ids.length === 0 ? (
                    <button onClick={() => setPickerSlot("main")}
                      style={{ ...addStyle, width: "100%", padding: "16px 13px", minHeight: 62, borderRadius: 12, fontSize: fs(12) }}>
                      + {c.pickFor?.main}
                    </button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 11, borderRadius: 12, border: `1px solid ${k.accent}`, background: k.tint }}>
                      {/* HER FACE IS THE WAY INTO HER PROFILE (§22.2), for a library
                          member exactly as for an authored one - one editor, so the
                          player never has to know which door a member came through. */}
                      <button onClick={() => editChosen(ids[0])}
                        aria-label={`${c.editShort} ${nameOf(ids[0])}`}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0, lineHeight: 0 }}>
                        {avatar(ids[0], 46)}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: fs(13), color: k.textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {nameOf(ids[0])}
                        </div>
                        <div style={{ fontSize: fs(11), color: k.textFaint, marginTop: 2 }}>
                          {picks[ids[0]]?.src === "custom"
                            ? c.myCast
                            : groupNameOf(picks[ids[0]]?.groupId)}
                        </div>
                      </div>
                      <button onClick={() => setPickerSlot("main")}
                        style={{ padding: "7px 11px", minHeight: 34, borderRadius: 16, border: `1px solid ${k.border}`, background: "transparent", color: k.textDim, fontSize: fs(11), cursor: "pointer" }}>
                        {c.change}
                      </button>
                      <button onClick={() => unassign(ids[0])}
                        aria-label={`${c.remove} ${nameOf(ids[0])}`}
                        style={{ padding: "7px 9px", minHeight: 34, borderRadius: 16, border: "none", background: "transparent", color: k.textFaint, fontSize: fs(13), cursor: "pointer" }}>
                        {"×"}
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* TWO TARGETS, NOT ONE. The chip used to be a single button whose
                        whole area unassigned, with the x as a label. §22.2 makes her face
                        the way into her profile, and a nested button is not expressible -
                        so this takes the shape the saved-roster chips above already have:
                        the body does the thing you came for, the x is its own target. */}
                    {ids.map((id) => (
                      <div key={id} style={{ ...chipStyle, padding: 0, gap: 0, overflow: "hidden" }}>
                        <button onClick={() => editChosen(id)}
                          aria-label={`${c.editShort} ${nameOf(id)}`}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 4px 7px 9px", minHeight: 36, border: "none", background: "transparent", color: k.textMain, fontSize: fs(11.5), cursor: "pointer", fontFamily: "inherit" }}>
                          {avatar(id, 22)}
                          <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {nameOf(id)}
                          </span>
                        </button>
                        <button onClick={() => unassign(id)}
                          aria-label={`${c.remove} ${nameOf(id)}`}
                          style={{ padding: "7px 9px 7px 4px", minHeight: 36, border: "none", background: "transparent", color: k.textFaint, fontSize: fs(12), cursor: "pointer" }}>
                          {"×"}
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setPickerSlot(s)} style={addStyle}>
                      + {c.addMore}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {composed && (
            <div style={{ fontSize: fs(11), color: k.textFaint, lineHeight: 1.5, padding: "9px 11px", borderRadius: 10, background: k.cardBg, border: `1px solid ${k.border}` }}>
              {c.composedHint}
            </div>
          )}

          {/* ONE entry point for every image in the cast, rather than a camera
              badge per member in the picker grid — see CastImageSheet.jsx. It
              sits below the three sections because a photo is something you give
              a member you have already chosen. */}
          {chosen.length > 0 && (
            <>
              {/* A CARD, THE SIZE OF THE MAIN-MEMBER SLOT, not a pill beside Clear.
                  Giving the cast faces is the single biggest thing a player can do
                  to how the game reads - every overlay, the top bar and the chat
                  wallpapers all draw from it - and it was a 34px chip in a row of
                  two, the smaller-looking of which wipes the cast. A destructive
                  control and the best thing on the screen should not be the same
                  shape. Reported from hand play, 2026-09-29.

                  It carries the count for the reason the save slots and the
                  palette both had to learn: a number the player can see beats a
                  cap that only speaks when it refuses. */}
              <button onClick={() => setShowImages(true)}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", marginTop: 14, padding: 11, minHeight: 62, borderRadius: 12, border: `1px solid ${k.accent}`, background: k.tint, color: k.textMain, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: fs(24), lineHeight: 1, flexShrink: 0 }}>{"📷"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: fs(13), color: k.accent, fontWeight: 700 }}>{c.castImages}</span>
                  <span style={{ display: "block", fontSize: fs(11), color: k.textFaint, marginTop: 2, lineHeight: 1.35 }}>
                    {c.photo} {c.castCount?.(withPhoto, facedIds.length)}
                  </span>
                </span>
                <span aria-hidden style={{ color: k.textFaint, fontSize: fs(14), flexShrink: 0 }}>{"›"}</span>
              </button>
              <div style={{ display: "flex", marginTop: 8 }}>
                <button onClick={() => setPicks({})}
                  style={{ padding: "8px 12px", minHeight: 34, borderRadius: 16, border: `1px solid ${k.border}`, background: "transparent", color: k.textFaint, fontSize: fs(11), cursor: "pointer" }}>
                  {c.clearCast}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "10px 13px 13px", borderTop: `1px solid ${k.border}`, flexShrink: 0, display: "flex", gap: 7 }}>
          <button onClick={() => { if (!canStart) { notify?.(c.needMain, "error"); return; } setCastLabel(nameOf(mainPick.id)); }}
            disabled={!canStart}
            style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 40, border: `1px solid ${k.border}`, background: "transparent", color: canStart ? k.textDim : k.textFaint, fontSize: fs(11.5), cursor: canStart ? "pointer" : "default" }}>
            {c.saveRoster}
          </button>
          <button onClick={() => onStart?.(buildRoster())} disabled={!canStart}
            style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 40, border: "none", cursor: canStart ? "pointer" : "not-allowed", background: canStart ? k.accentGrad : (isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.08)"), color: canStart ? k.onAccent : k.textFaint, fontSize: fs(12.5), fontWeight: 700 }}>
            {canStart ? c.startWith(nameOf(mainPick.id)) : c.needMain}
          </button>
        </div>
      </div>

      {pickerSlot && (
        <MemberPicker
          slot={pickerSlot}
          language={language} theme={theme} t={t} fontScale={fontScale}
          groups={groups} configs={configs} onNeedGroup={needGroup}
          cast={cast} photos={photos} picks={picks}
          onAssign={assign}
          onClose={() => setPickerSlot(null)}
          onCreate={() => setEditing({ id: newMemberId(), profile: {}, isNew: true, src: "custom" })}
          onEdit={(id) => setEditing({ ...cast.find((x) => x.id === id), src: "custom" })}
          onDelete={(id) => setConfirmDelete({ kind: "member", id })}
        />
      )}

      {showImages && (
        <CastImageSheet
          // Roster order, not picks order — the same derivation the chips use, so
          // the sheet lists the cast in the order the player sees it. NPCs are
          // absent: see facedIds.
          rows={facedIds.map((id) => ({
            id, name: nameOf(id), member: memberOf(id) || {},
          }))}
          photos={photos} walls={walls}
          onPickPhoto={setPhotoFor} onPickWall={setWallFor}
          onClearPhoto={(id) => setPhotoFor(id, null)}
          onClearWall={(id) => setWallFor(id, null)}
          language={language} theme={theme} t={t} fontScale={fontScale}
          notify={notify}
          onClose={() => setShowImages(false)}
        />
      )}

      {editing && (
        <MemberEditor
          member={editing} isNew={Boolean(editing.isNew)}
          language={language} theme={theme} t={t} fontScale={fontScale}
          apiKey={apiKey} modelId={modelId} aliyun={aliyun} world={world}
          photo={photos[editing.id]}
          onPhotoChange={(d) => setPhotoFor(editing.id, d)}
          wall={walls[editing.id]}
          onWallChange={(d) => setWallFor(editing.id, d)}
          onSave={saveMember}
          onCancel={() => setEditing(null)}
          notify={notify}
        />
      )}

      {/* Naming a saved roster. It is LOCAL ONLY - see savedRosterEntry for why
          that has to be said out loud. Defaulted to the main member's name so the
          fast path is one tap. */}
      {castLabel !== null && (
        <div className="rv-fixed" style={{ position: "fixed", inset: 0, zIndex: Z.dialog, display: "flex", alignItems: "center", justifyContent: "center", background: k.scrim, padding: safeInset(24) }}>
          <div style={{ width: "100%", maxWidth: 310, background: k.panelBg, border: `1px solid ${k.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: fs(12), color: k.textMain, marginBottom: 4 }}>{c.nameCast}</div>
            <div style={{ fontSize: fs(11), color: k.textFaint, lineHeight: 1.45, marginBottom: 9 }}>{c.nameCastHint}</div>
            <input value={castLabel} onChange={(e) => setCastLabel(e.target.value.slice(0, 32))}
              placeholder={c.nameCastPlaceholder} maxLength={32}
              style={{ width: "100%", padding: "10px 11px", minHeight: 40, borderRadius: 8, background: k.inputBg, border: `1px solid ${k.inputBorder}`, color: k.textMain, fontSize: fs(12), fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => setCastLabel(null)}
                style={{ flex: 1, padding: 11, minHeight: 42, borderRadius: 9, border: `1px solid ${k.border}`, background: "transparent", color: k.textDim, fontSize: fs(11.5), cursor: "pointer" }}>
                {c.cancel}
              </button>
              <button onClick={commitRoster}
                style={{ flex: 1, padding: 11, minHeight: 42, borderRadius: 9, border: "none", background: k.accentGrad, color: k.onAccent, fontSize: fs(11.5), fontWeight: 700, cursor: "pointer" }}>
                {c.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deleting an authored member is not undoable and the button sits beside
          Edit on a small card, so it asks first. It names her, because "are you
          sure" next to a grid of twelve faces is not a question you can answer. */}
      {confirmDelete && (
        <div className="rv-fixed" style={{ position: "fixed", inset: 0, zIndex: Z.confirm, display: "flex", alignItems: "center", justifyContent: "center", background: k.scrim, padding: safeInset(24) }}>
          <div style={{ width: "100%", maxWidth: 300, background: k.panelBg, border: `1px solid ${k.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: fs(12), color: k.textMain, lineHeight: 1.6, marginBottom: 14 }}>
              {confirmDelete.kind === "roster"
                ? c.confirmDeleteRoster?.(saved.find((x) => x.id === confirmDelete.id)?.name || "")
                : c.confirmDelete?.(nameOf(confirmDelete.id))}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 11, minHeight: 42, borderRadius: 9, border: `1px solid ${k.border}`, background: "transparent", color: k.textDim, fontSize: fs(11.5), cursor: "pointer" }}>
                {c.cancel}
              </button>
              <button onClick={() => (confirmDelete.kind === "roster"
                ? deleteRoster(confirmDelete.id) : deleteMember(confirmDelete.id))}
                style={{ flex: 1, padding: 11, minHeight: 42, borderRadius: 9, border: "none", background: k.dangerBg, color: "#fff", fontSize: fs(11.5), fontWeight: 700, cursor: "pointer" }}>
                {c.deleteShort}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
