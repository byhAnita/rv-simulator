// src/platforms/MemberEditor.jsx
//
// Author one custom cast member. docs/V140_PLAN.md §14.3.
//
// THREE STEPS, NOT ONE SCROLL. The card has sixteen fields plus a photo plus the
// generate box, and at 390px that is unreadable as a single page — you lose
// track of what is still required somewhere around field nine. So: who she is /
// how she reads / details, with a dot indicator.
//
// SAVE IS LIVE THE MOMENT THE THREE REQUIRED FIELDS ARE FILLED, from whatever
// step you are on. Walking to the end to commit is the thing that makes a wizard
// feel worse than a form, and step 3 is entirely optional fields — nobody should
// have to visit it. Generate on step 1 fills steps 2 and 3, so the fast path is:
// type a line, generate, glance, save.
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
import { generateCard, MIN_DESCRIPTION_CHARS, MAX_DESCRIPTION_CHARS } from "../agent/cardGenerator";
import { castTokens, scaleFont } from "./castTheme";
import YearWheel, { DEFAULT_YEAR } from "./YearWheel";
import ImageCropper from "./ImageCropper";
import MemberFace from "./memberFace";

// Which fields live on which step. Required fields are split across steps 1 and
// 2 deliberately: birthday belongs with the name, and private_personality
// belongs with the prose it sits among. The Save button does not care which step
// they were filled on.
//
// Every field cardGenerator can fill appears here, which is the invariant that
// matters: the player must be able to correct anything the model wrote. Step 1
// renders its two specially — birthday is collected as a YEAR — so it is
// declared here for completeness and the step-1 markup is explicit.
export const STEP_FIELDS = [
  ["name", "birthday"],
  ["private_personality", "public_image", "queer_texture", "speech_style", "habit"],
  ["name_kr", "mbti", "role", "animal_plastic", "hidden_conflict"],
];

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

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => ({ ...(member?.profile || {}) }));
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const c = t?.cast || {};
  const fieldLabel = (f) => c.fields?.[f] || f;
  const missing = missingRequired(profile);
  const canSave = missing.length === 0;

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

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
    onSave?.({ id, lang: language, profile: sanitizeProfile({ ...profile, id }) });
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
          <textarea value={profile[f] || ""} onChange={(e) => set(f, e.target.value)}
            rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        ) : (
          <input value={profile[f] || ""} onChange={(e) => set(f, e.target.value)}
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
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "88vh", background: panelBg, border: `1px solid ${border}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>

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
              {/* the fast path: one line in, a full card out */}
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

          {step === 1 && STEP_FIELDS[1].map(renderField)}

          {step === 2 && (
            <>
              <div style={{ fontSize: fs(10), color: textFaint, marginBottom: 10, lineHeight: 1.5 }}>
                {c.optional} — {c.fictionNote}
              </div>
              {STEP_FIELDS[2].map(renderField)}
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
          {step < 2 && (
            <button onClick={() => setStep((s) => s + 1)}
              style={{ flex: 1, padding: "9px 13px", borderRadius: 9, background: "transparent", border: `1px solid ${border}`, color: textDim, fontSize: fs(11.5), cursor: "pointer" }}>
              {c.next} →
            </button>
          )}
          {/* Live from any step. A wizard that makes you walk to the end to commit
              is worse than the form it replaced, and step 3 is optional fields. */}
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
