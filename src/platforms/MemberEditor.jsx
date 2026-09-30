// src/platforms/MemberEditor.jsx
//
// Author one custom cast member. docs/V140_PLAN.md §14.3.
//
// TWO TABS SINCE §22.2's COMMIT 4b, AND THE SPLIT IS THE STORAGE RULE: tab 1 is
// true of the PERSON, tab 2 is true of the person IN A WORLD. §22.2's test for
// which tab a field is in is *would this sentence still be true if she were cast
// in a different world?* - her MBTI, her habit and her birth year survive the
// move; her position here and the three ★ texture fields do not.
//
// It was three steps (who she is / how she reads / details) and the reason for
// splitting at all is unchanged: sixteen fields plus a photo plus the generate box
// is unreadable as one page at 390px. What changed is WHERE the seam goes, and it
// now goes where the data's own boundary is rather than where the reading got
// long.
//
// SAVE IS LIVE THE MOMENT THE THREE REQUIRED FIELDS ARE FILLED, from either tab.
// Walking to the end to commit is the thing that makes a wizard feel worse than a
// form, and tab 2 is entirely optional - and generated. Generate on tab 1 fills
// both, so the fast path is: type a line, generate, glance, save.
//
// The component owns no storage. It hands a finished profile to `onSave` and the
// caller decides what to do with it, which is what lets the palette enforce its
// own cap and report a refusal (customCast.js#upsertMember).

import React, { useEffect, useRef, useState } from "react";
import {
  REQUIRED_FIELDS, missingRequired, sanitizeProfile,
  birthYearOf, birthdayFromYear, validBirthYear, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX,
  EMOJI_PALETTE, normalizeEmoji,
} from "../rag/customCast";
import {
  generateCard, generateWorldDetail, MIN_DESCRIPTION_CHARS, MAX_DESCRIPTION_CHARS,
} from "../agent/cardGenerator";
// The restaging's own vocabulary, from the module that lays it back over a member.
import { WORLD_FIELDS, WORLD_DETAIL_KEY } from "../rag/rosterResolver";
import { castTokens, scaleFont } from "./castTheme";
import YearWheel, { DEFAULT_YEAR } from "./YearWheel";
import ImageCropper from "./ImageCropper";
import MemberFace from "./memberFace";

// Which fields live on which tab. All three required fields are on tab 1 now,
// which is what makes tab 2 skippable in fact and not only in principle: a
// complete card never needs the second tab opened.
//
// EVERY FIELD A GENERATION CAN FILL APPEARS HERE, which is the invariant that
// matters - the player must be able to correct anything the model wrote, and there
// are two generations now (the card on tab 1, the restaging on tab 2). Some boxes
// are rendered explicitly rather than by the loop - birthday is collected as a
// YEAR, the emoji has a palette beside it, and the position box's FIELD depends on
// the world - so they are declared here for completeness and their markup is its
// own.
//
// `role` is not listed and is not gone: in an idol world it IS the position box,
// because memberLine reads `useRole ? role : world_position` and the box writes
// whichever of the two the prompt will read. Deleting the box outright, which
// §22.3.2 reads as, would leave a custom member in an idol world with no way to
// say what she does - the filtered-slot-left-empty defect commit 4 exists to
// close, one door over.
export const STEP_FIELDS = [
  ["name", "birthday", "private_personality", "mbti", "habit", "emoji"],
  ["name_kr", "world_position", "public_image", "queer_texture", "speech_style", "hidden_conflict"],
];

// `animal_plastic` is NOT here, and it is not deleted either (§22.3.3): it renders
// as `Animal` in the profile block for all 57 library members, so removing the field
// would move every golden. What §22.2 removes is the BOX - one fewer thing to fill -
// and cardGenerator drops it from CARD_FIELDS in the same commit, because a field the
// model fills and the player cannot correct is the invariant below inverted.

// Long prose gets a textarea; the rest a single line. `queer_texture` and
// `private_personality` routinely run two sentences in the shipped library, so a
// one-line input would hide most of what the player typed.
const MULTILINE = new Set([
  "private_personality", "public_image", "queer_texture", "hidden_conflict",
]);

export default function MemberEditor({
  member, isNew = false, language = "zh", theme = "dark", t, fontScale = 1,
  apiKey, modelId, aliyun, world,
  photo, onPhotoChange,
  wall, onWallChange,
  onSave, onCancel, notify,
}) {
  const isLight = theme === "light";
  // The CALLER owns the id and always supplies one, including for a new member.
  // A photo can be picked on step 1, before anything is saved, and the photo
  // store is keyed by member id - so an id minted here at submit time would
  // store the image under one id and the member under another. `isNew` carries
  // what the title needs instead of inferring it from the id's presence.
  const editing = !isNew;
  // WHICH COPY THIS EDITS. A custom member is her palette entry, so an edit is a new
  // snapshot; a LIBRARY member is not ours to rewrite, so an edit is a diff the roster
  // carries as `entry.override` (§22.3, customCast.js#overrideFrom). The component does
  // not implement either rule - it forwards `src` and the caller branches - but it does
  // have to render differently, because one of these two cannot be generated into.
  const fromLibrary = member?.src === "library";

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => ({ ...(member?.profile || {}) }));
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const c = t?.cast || {};
  const fieldLabel = (f) => c.fields?.[f] || f;
  const missing = missingRequired(profile);
  const canSave = missing.length === 0;

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

  // ── which copy tab 2 is showing, and therefore which copy an edit lands on ──
  //
  // A restaging is an OVERLAY stamped with the world it was written for
  // (rosterResolver.js#applyWorldDetail), so tab 2 may be looking at her own lines
  // or at a generated set laid over them. ONE RULE, no world branch: an edit goes
  // where the text she is looking at came from.
  //
  // `world_position` is the exception and it is not a special case so much as the
  // same rule: it has no home in the base profile at all - it is not on
  // PROFILE_FIELDS, because a base copy would apply in every world and leak one -
  // so typing a position CREATES the overlay, stamped for this world. A stamp for
  // another world is replaced rather than added to, or her campus lines would
  // arrive in a chaebol compound under a chaebol stamp.
  const detail = profile[WORLD_DETAIL_KEY] || null;
  const worldId = world?.id || "";
  const detailActive = Boolean(worldId && detail && detail.world === worldId);
  // The world the library was authored for needs no restaging: there the prose is
  // already about this world, so the block is hidden rather than offered - a
  // control that provably does nothing is worse than no control, which is the same
  // argument that hides tab 1's generate box for a library member.
  const restageable = Boolean(world && !world?.castLore?.useRole);
  const positionField = world?.castLore?.useRole ? "role" : "world_position";
  const writesOverlay = (f) =>
    WORLD_FIELDS.includes(f) && (detailActive || f === "world_position");
  const valueOf = (f) => (writesOverlay(f)
    // An overlaid field the generation did not fill leaves her own line showing,
    // which is exactly what applyWorldDetail renders - the box and the prompt agree.
    ? String(detail?.[f] ?? profile[f] ?? "")
    : String(profile[f] ?? ""));
  const setField = (f, v) => {
    if (!writesOverlay(f)) { set(f, v); return; }
    setProfile((p) => {
      const had = p[WORLD_DETAIL_KEY];
      const keep = had && had.world === worldId ? had : { world: worldId };
      return { ...p, [WORLD_DETAIL_KEY]: { ...keep, [f]: v } };
    });
  };
  // Her own lines, with no restaging over them. A REGENERATION RESTAGES FROM THESE
  // rather than from the previous restaging: restaging a restaging compounds, and
  // the second pass would be describing a chaebol heiress as if she had been one.
  const baseProfile = () => { const o = { ...profile }; delete o[WORLD_DETAIL_KEY]; return o; };

  // The form asks for a YEAR and stores a date: a player does not know an
  // original character's exact birthday, and the address protocol only ever reads
  // the year. Month and day are pinned to 01-01 because buildSystemPrompt parses
  // the year off a date string.
  //
  // THE DRAFT IS SEPARATE STATE, and that is the fix for a real bug. Deriving the
  // displayed year from `profile.birthday` meant one keystroke stored "1-01-01"
  // and fed "1-01" back into the input, which a type="number" field cannot render
  // — so the box blanked on every keypress and the field was simply unfillable.
  // The draft holds what the player typed; `birthday` is written only once the
  // year is complete, which also keeps Save disabled until it is.
  //
  // Step 8 replaced the input with a wheel, and that changes what an empty draft
  // means. A wheel always displays a value, so displaying DEFAULT_YEAR while
  // `birthday` is still empty would be a lie the player cannot act on — the
  // field looks filled and Save stays disabled with nothing to point at. So a
  // new member is SEEDED at the year the wheel opens on, and the displayed value
  // is true from the first frame. Scrolling is how she changes it, not how she
  // supplies it.
  const seedYear = birthYearOf(member?.profile?.birthday) || String(DEFAULT_YEAR);
  const [yearDraft, setYearDraft] = useState(seedYear);
  useEffect(() => {
    if (!profile.birthday) set("birthday", birthdayFromYear(seedYear));
    // Runs once per editor: the seed is derived from the member this editor was
    // opened for, and the editor is remounted for a different one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setBirthYear = (raw) => {
    const digits = String(raw).replace(/\D/g, "").slice(0, 4);
    setYearDraft(digits);
    set("birthday", birthdayFromYear(digits));
  };
  // Complete but implausible is worth flagging; still being typed is not.
  const birthYearValid = yearDraft.length < 4 || validBirthYear(yearDraft);

  const runGenerate = async () => {
    if (description.trim().length < MIN_DESCRIPTION_CHARS) {
      notify?.(c.generateEmpty, "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await generateCard({
        description, world, language, apiKey, modelId, aliyun,
      });
      if (!res.ok) {
        // An accelerator, never a gate: the form stays exactly as it was and the
        // player carries on by hand. The localized line for the underlying kind
        // is the game's own, so a dead provider reads the same here as in a round.
        notify?.(t?.errors?.[res.reason] || c.generateFailed, "error");
        return;
      }
      // Merge UNDER what the player already typed — a generated value must never
      // overwrite something they wrote themselves, which is the whole reason
      // Generate stays available after the first run.
      setProfile((p) => {
        const next = { ...res.profile, ...p };
        for (const [k, v] of Object.entries(p)) if (!String(v ?? "").trim()) next[k] = res.profile[k] ?? v;
        // The year input renders its own draft, so a generated birthday has to be
        // pushed into it too — otherwise the profile holds a year the player
        // cannot see and cannot correct.
        setYearDraft(birthYearOf(next.birthday));
        return next;
      });
      setStep(1);
    } finally {
      setGenerating(false);
    }
  };

  // ── her restaging (tab 2) ──────────────────────────────────────────
  const [detailing, setDetailing] = useState(false);

  const runDetail = async () => {
    if (!String(profile.name || "").trim()) { notify?.(c.detailNeedName, "error"); return; }
    setDetailing(true);
    try {
      const res = await generateWorldDetail({
        member: baseProfile(), world, language, apiKey, modelId, aliyun,
      });
      if (!res.ok) {
        // An accelerator, never a gate - cardGenerator's own law. The tab stays
        // exactly as it was, her own lines are still what the prompt sends, and
        // §22.1's narrowed rule is what covers her until a retry works.
        notify?.(t?.errors?.[res.reason] || c.detailFailed, "error");
        return;
      }
      setProfile((p) => ({ ...p, [WORLD_DETAIL_KEY]: { world: worldId, ...res.detail } }));
    } finally {
      setDetailing(false);
    }
  };

  // USE HER OWN LINES AGAIN. A generation with no way back gets routed around
  // exactly as a prohibition with no substitute does - and because the overlay
  // never overwrote anything, dropping it is all it takes to get her text back.
  const dropDetail = () => setProfile((p) => {
    const o = { ...p }; delete o[WORLD_DETAIL_KEY]; return o;
  });

  // ONE AUTOMATIC RUN, when the tab is opened with nothing for this world. The
  // alternative is a tab that opens empty beside a retry button with nothing to
  // retry, which is what §22.2's own sketch would have shipped; and it is not extra
  // spend, because the Start-boundary sweep skips whoever the editor restaged.
  // Gated on a key and a name because both are inputs the call cannot do without.
  const autoRan = useRef(false);
  useEffect(() => {
    if (step !== 1 || autoRan.current) return;
    if (!restageable || detailActive || detailing) return;
    if (!String(profile.name || "").trim() || !String(apiKey || "").trim()) return;
    autoRan.current = true;
    runDetail();
    // Fires on reaching the tab, and the ref is what makes it once per editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── her images ────────────────────────────────────────────────────────────
  // ONE HIDDEN INPUT, OPENED THROUGH A REF. It was a <label> wrapping an
  // <input type="file" style={{display:"none"}}>, which is the standard trick and
  // does not work: iOS Safari declines to open the picker for a file input that
  // is `display:none`, so the only way to give a custom member a photo was
  // untappable on the device this app is built for. The sheet one screen over
  // (CastImageSheet.jsx) had always used a ref and a click, so the pattern that
  // works was already in the repo — reported from hand play.
  //
  // The cropper, and NOT a downscale, is what turns the file into a data URL:
  // one path for every upload in the app, so a custom member frames her photo
  // the same way a library member does.
  const fileRef = useRef(null);
  const [pendingKind, setPendingKind] = useState(null);   // "photo" | "wall"
  const [cropping, setCropping] = useState(null);         // {kind, file}

  const ask = (kind) => {
    setPendingKind(kind);
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  };
  const took = (e) => {
    const file = e.target.files?.[0];
    const kind = pendingKind;
    setPendingKind(null);
    if (!file || !kind) return;
    setCropping({ kind, file });
  };
  const cropped = (dataUrl) => {
    const kind = cropping?.kind;
    setCropping(null);
    // The caller owns both stores and reports its own refusals — a cap belongs
    // to the store, not to this form. It is also the only side that knows how
    // many other members already have one.
    if (kind === "wall") onWallChange?.(dataUrl);
    else if (kind === "photo") onPhotoChange?.(dataUrl);
  };

  const submit = () => {
    if (!canSave) {
      notify?.(c.missing?.(missing.map(fieldLabel).join(", ")), "error");
      return;
    }
    const id = member?.id;
    // `src` is FORWARDED rather than left for the caller to remember which state it
    // opened this from: the two save paths write to different places, and inferring
    // which from ambient state is how one of two call sites comes to be wrong.
    onSave?.({
      id, src: member?.src || "custom", lang: language,
      profile: sanitizeProfile({ ...profile, id }),
    });
  };

  // ── styling tokens, shared with the builder and the picker (castTheme.js) ──
  // These were a local copy of the same fifteen literals. Three copies of one
  // palette across three screens the player walks through in one sitting is the
  // drift that makes the sheet look like a different app.
  const k = castTokens(isLight);
  const fs = (px) => scaleFont(px, fontScale);
  const {
    panelBg, border, textMain, textDim, textFaint, accent, accentGrad,
    inputBg, inputBorder,
  } = k;

  const inputStyle = {
    width: "100%", padding: "9px 10px", minHeight: 38, borderRadius: 8, background: inputBg,
    border: `1px solid ${inputBorder}`,
    color: textMain, fontSize: fs(12), fontFamily: "inherit", boxSizing: "border-box",
  };

  // The image buttons, in the shape the image sheet uses — same job, same look,
  // and a real <button> rather than a styled <label>, which is what the iOS
  // failure above cost.
  const imgBtn = (label, onClick, danger = false) => (
    <button key={label} onClick={onClick}
      style={{
        padding: "6px 10px", minHeight: 32, borderRadius: 15, cursor: "pointer",
        border: `1px solid ${danger ? "rgba(180,60,20,.28)" : inputBorder}`,
        background: "transparent",
        color: danger ? (isLight ? "#a03010" : "#f07070") : accent,
        fontSize: fs(10.5), whiteSpace: "nowrap",
      }}>
      {label}
    </button>
  );

  // A FUNCTION RETURNING JSX, NOT A COMPONENT. Declaring `const Field = ...`
  // inside the render body creates a new component TYPE on every render, so
  // React unmounts and remounts the input on each keystroke and the field loses
  // focus after one character. Plain calls have no component identity, so the
  // elements reconcile as the inputs they are.
  const renderField = (f) => {
    const required = REQUIRED_FIELDS.includes(f);
    const hint = c.hints?.[f];
    return (
      <div key={f} style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: fs(10), color: textDim, marginBottom: 3 }}>
          {fieldLabel(f)}
          <span style={{ color: required ? accent : textFaint, marginLeft: 4 }}>
            {required ? `* ${c.required || ""}` : ""}
          </span>
        </label>
        {MULTILINE.has(f) ? (
          <textarea value={valueOf(f)} onChange={(e) => setField(f, e.target.value)}
            rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        ) : (
          <input value={valueOf(f)} onChange={(e) => setField(f, e.target.value)}
            style={inputStyle} />
        )}
        {hint && (
          <div style={{ fontSize: fs(9), color: textFaint, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "88%", background: panelBg, border: `1px solid ${border}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>

        {/* header: title + step dots */}
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#4a2e14)" : "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "11px 14px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: isLight ? "#f5e8d0" : "#f8c8d8", fontSize: fs(13), fontWeight: 700 }}>
              {editing ? c.editorEdit : c.editorNew}
            </span>
            <button onClick={onCancel} aria-label={c.cancel} style={{ background: "none", border: "none", color: isLight ? "#c8a870" : "#a07090", cursor: "pointer", fontSize: fs(16) }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center" }}>
            {(c.steps || []).map((label, i) => (
              <button key={i} onClick={() => setStep(i)}
                style={{ flex: 1, padding: "4px 2px", borderRadius: 7, border: "none", cursor: "pointer", background: i === step ? (isLight ? "rgba(245,232,208,.9)" : "rgba(248,200,216,.18)") : "transparent", color: i === step ? (isLight ? "#4a2e14" : "#f8c8d8") : (isLight ? "#c8a870" : "#8a6080"), fontSize: fs(9.5), fontWeight: i === step ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i + 1}. {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>

          {step === 0 && (
            <>
              {/* THE FAST PATH: one line in, a full card out - and it is hidden for a
                  library member, because for her it provably does nothing. runGenerate
                  merges UNDER what is already filled, deliberately, so a generated value
                  can never overwrite the player's own words; a library member arrives
                  with every field filled, so the button would spend a call and change
                  nothing. A control that cannot act is worse than no control. §22.2's
                  commit 4 gives her the generation that IS about her: world-scoped
                  tab 2, which is a different call with a different input. */}
              {!fromLibrary && (
              <div style={{ padding: 11, borderRadius: 10, background: isLight ? "rgba(139,105,20,.07)" : "rgba(232,135,176,.07)", border: `1px solid ${isLight ? "rgba(139,105,20,.18)" : "rgba(232,135,176,.18)"}`, marginBottom: 14 }}>
                <div style={{ fontSize: fs(11), color: accent, marginBottom: 6, fontWeight: 600 }}>{c.describe}</div>
                <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
                  rows={2} placeholder={c.describePlaceholder}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
                <button onClick={runGenerate} disabled={generating}
                  style={{ width: "100%", marginTop: 7, padding: 9, borderRadius: 8, border: "none", cursor: generating ? "default" : "pointer", background: generating ? (isLight ? "rgba(100,65,20,.2)" : "rgba(255,255,255,.1)") : accentGrad, color: "#fff", fontSize: fs(12), fontWeight: 600 }}>
                  {generating ? c.generating : c.generate}
                </button>
                <div style={{ fontSize: fs(9), color: textFaint, marginTop: 5, lineHeight: 1.4 }}>{c.generateHint}</div>
              </div>
              )}

              {/* An edit to a prebuilt member is THIS RUN's, not the library's. Saying so
                  is not reassurance - it is the difference between a player expecting her
                  change to follow Irene into the next game and a player who knows it will
                  not. */}
              {fromLibrary && (
                <div style={{ padding: "9px 11px", borderRadius: 9, marginBottom: 12, fontSize: fs(10), lineHeight: 1.5, color: textDim, background: inputBg, border: `1px solid ${inputBorder}` }}>
                  {c.editRunOnly}
                </div>
              )}

              {renderField("name")}

              {/* A YEAR, not a date - see setBirthYear. */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: fs(10), color: textDim, marginBottom: 3 }}>
                  {fieldLabel("birthYear")}
                  <span style={{ color: accent, marginLeft: 4 }}>* {c.required}</span>
                </label>
                {/* A wheel, not a text field — step 8. The typed version needed
                    a separate draft and a partial-year guard because "19" is a
                    state a keyboard can produce and the profile must reject; a
                    wheel's every value is a year in range, so both go away. The
                    draft state stays as the single writer of `birthday`. */}
                <YearWheel value={yearDraft || DEFAULT_YEAR} onChange={setBirthYear}
                  min={BIRTH_YEAR_MIN} max={BIRTH_YEAR_MAX}
                  fontScale={fontScale} ariaLabel={c.fields?.birthYear}
                  colors={{ text: textMain, textDim, accent, tint: isLight ? "rgba(139,105,20,.12)" : "rgba(232,135,176,.14)", border: inputBorder, fieldBg: inputBg }} />
                <div style={{ fontSize: fs(9), color: birthYearValid ? textFaint : (isLight ? "#a03010" : "#f07070"), marginTop: 3, lineHeight: 1.4 }}>
                  {birthYearValid ? c.hints?.birthday : c.badYear}
                </div>
              </div>

              {/* WHO SHE IS WHEN NOBODY IS WATCHING, and two traits that travel with
                  her: MBTI and a habit are true of the person, so §22.2's test puts
                  them here rather than in the tab a world can rewrite. */}
              {["private_personality", "mbti", "habit"].map(renderField)}

              {/* HER GLYPH, and it is not decoration: with no photo it is what the
                  top bar, the stats box, the Setup chips and every social tab strip
                  draw for her - and a photo is optional, so for most custom members
                  it is the only face she has. It was auto-assigned by palette index
                  and there was NOWHERE to change it, so she was a violin for the
                  life of the save. Reported from hand play, 2026-09-29.

                  The palette is offered rather than enforced: ten taps for the
                  common case, and the box takes anything the emoji keyboard can
                  produce. It is the same array withDefaults falls back to, imported
                  rather than retyped. */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: fs(10), color: textDim, marginBottom: 4 }}>
                  {fieldLabel("emoji")}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <input value={profile.emoji || ""}
                    onChange={(e) => set("emoji", normalizeEmoji(e.target.value))}
                    aria-label={fieldLabel("emoji")} inputMode="text" maxLength={24}
                    style={{ width: 46, flexShrink: 0, textAlign: "center", padding: "5px 0", borderRadius: 9, background: inputBg, border: `1px solid ${inputBorder}`, color: textMain, fontSize: fs(20), lineHeight: 1.2, outline: "none", fontFamily: "inherit" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0 }}>
                    {EMOJI_PALETTE.map((g) => (
                      <button key={g} onClick={() => set("emoji", g)}
                        aria-label={g} aria-pressed={profile.emoji === g}
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 8, cursor: "pointer", fontSize: fs(15), lineHeight: 1, background: profile.emoji === g ? k.tint : "transparent", border: `1px solid ${profile.emoji === g ? accent : border}` }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: fs(9), color: textFaint, marginTop: 3, lineHeight: 1.4 }}>
                  {c.hints?.emoji}
                </div>
              </div>

              {/* her photo, and her wallpaper — both, because she is a member
                  like any other. A custom member could be given a photo here and
                  a wallpaper NOWHERE: the image sheet lists the chosen cast, and
                  she is authored before she is chosen. */}
              <div style={{ marginBottom: 4 }}>
                <label style={{ display: "block", fontSize: fs(10), color: textDim, marginBottom: 4 }}>{c.castImages}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {/* Her wallpaper behind her photo, the same preview the image
                      sheet shows, so one glance says what she has. */}
                  <div style={{ position: "relative", width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: wall ? undefined : inputBg, backgroundImage: wall ? `url(${wall})` : undefined, backgroundSize: "cover", backgroundPosition: "center", border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <MemberFace member={{ ...profile, emoji: profile.emoji || "📷" }} photo={photo} size={38} radius={9} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {imgBtn(photo ? c.photoReplace : `${c.photo} +`, () => ask("photo"))}
                    {photo && imgBtn(c.photoRemove, () => onPhotoChange?.(null), true)}
                    {imgBtn(wall ? c.wallReplace : `${c.wall} +`, () => ask("wall"))}
                    {wall && imgBtn(c.wallRemove, () => onWallChange?.(null), true)}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={took} style={{ display: "none" }} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {/* THE RESTAGING. It is the whole subject of this tab, so it sits above
                  the boxes it fills rather than under them - and it is hidden in the
                  world the library was authored for, where there is nothing to
                  restage. The status line names the world, because a generated
                  paragraph is only reviewable if the player can see which setting it
                  was written for. */}
              {restageable && (
                <div style={{ padding: 11, borderRadius: 10, background: isLight ? "rgba(139,105,20,.07)" : "rgba(232,135,176,.07)", border: `1px solid ${isLight ? "rgba(139,105,20,.18)" : "rgba(232,135,176,.18)"}`, marginBottom: 13 }}>
                  <div style={{ fontSize: fs(11), color: accent, fontWeight: 600, marginBottom: 5 }}>
                    {c.detailTitle?.(world?.name || "")}
                  </div>
                  <div style={{ fontSize: fs(9.5), color: textDim, lineHeight: 1.5, marginBottom: 7 }}>
                    {detailActive ? c.detailFor?.(world?.name || "") : c.detailNone}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={runDetail} disabled={detailing}
                      style={{ flex: 1, padding: 9, borderRadius: 8, border: "none", cursor: detailing ? "default" : "pointer", background: detailing ? (isLight ? "rgba(100,65,20,.2)" : "rgba(255,255,255,.1)") : accentGrad, color: "#fff", fontSize: fs(11.5), fontWeight: 600 }}>
                      {detailing ? c.detailGenerating : (detailActive ? c.detailRetry : c.detailGenerate)}
                    </button>
                    {detailActive && (
                      <button onClick={dropDetail}
                        style={{ padding: "9px 11px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${inputBorder}`, color: textDim, fontSize: fs(11) }}>
                        {c.detailRevert}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: fs(9), color: textFaint, marginTop: 5, lineHeight: 1.4 }}>{c.detailHint}</div>
                </div>
              )}

              {/* `name_kr` is drawn on this tab and writes the BASE, which is not a
                  contradiction: the tabs are how the player reads the form, and the
                  storage rule is per field. A Korean name is her name in a lecture
                  hall as much as on a stage (§22.3.1), so it is not restaged and not
                  stamped. */}
              {renderField("name_kr")}
              {/* ONE BOX, and the WORLD picks which field it writes - the same
                  expression memberLine renders. */}
              {renderField(positionField)}
              {["public_image", "queer_texture", "speech_style", "hidden_conflict"].map(renderField)}

              <div style={{ fontSize: fs(9.5), color: textFaint, marginTop: 4, lineHeight: 1.5 }}>
                {c.optional} — {c.fictionNote}
              </div>
            </>
          )}
        </div>

        {/* footer: Back / Next, and Save whenever the card is complete */}
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${border}`, display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)}
              style={{ padding: "9px 13px", borderRadius: 9, background: "transparent", border: `1px solid ${border}`, color: textDim, fontSize: fs(11.5), cursor: "pointer" }}>
              ← {c.back}
            </button>
          )}
          {step < 1 && (
            <button onClick={() => setStep((s) => s + 1)}
              style={{ flex: 1, padding: "9px 13px", borderRadius: 9, background: "transparent", border: `1px solid ${border}`, color: textDim, fontSize: fs(11.5), cursor: "pointer" }}>
              {c.next} →
            </button>
          )}
          {/* Live from either tab. A wizard that makes you walk to the end to commit
              is worse than the form it replaced, and tab 2 is optional and generated. */}
          <button onClick={submit} disabled={!canSave}
            style={{ flex: 1, padding: "9px 13px", borderRadius: 9, border: "none", cursor: canSave ? "pointer" : "not-allowed", background: canSave ? accentGrad : (isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.08)"), color: canSave ? "#fff" : textFaint, fontSize: fs(11.5), fontWeight: 700 }}>
            {c.save}
          </button>
        </div>
      </div>

      {cropping && (
        <ImageCropper
          file={cropping.file} kind={cropping.kind}
          theme={theme} t={t} fontScale={fontScale} notify={notify}
          onConfirm={cropped}
          onCancel={() => setCropping(null)}
        />
      )}
    </div>
  );
}
