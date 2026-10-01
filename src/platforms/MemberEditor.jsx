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
import { castTokens, scaleFont, Z } from "./castTheme";
import YearWheel, { DEFAULT_YEAR } from "./YearWheel";
import ImageCropper from "./ImageCropper";
import { photoFill } from "./memberFace";

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

  // ONE CONTROL, BOTH GENERATIONS (docs/V140_PLAN.md 22.6.3). The card from the
  // sentence on tab 1, and - in a world the library was not written for - her
  // restaging. They used to be two buttons on two tabs, which meant the fast path
  // crossed a tab boundary and tab 2 auto-ran a call the player had not asked for.
  //
  // `force` is the difference between the two buttons and not a second code path:
  // GENERATE fills what is blank and never overwrites a word the player typed,
  // which is what makes it safe to press twice; REGENERATE drops the current
  // restaging first, which is the only way to get a different answer once one
  // exists. A generation with no way to a different answer gets routed around
  // exactly as a prohibition with no substitute does.
  const [generating, setGenerating] = useState(false);
  const busy = generating;

  const runGenerate = async (force = false) => {
    const wantCard = !fromLibrary && description.trim().length >= MIN_DESCRIPTION_CHARS;
    const wantDetail = restageable && (force || !detailActive);
    if (!wantCard && !wantDetail) {
      // Nothing to do, and WHICH nothing depends on why: a member with no sentence
      // needs one, and a member whose restaging already exists needs Regenerate.
      notify?.(restageable ? c.detailNeedName : c.generateEmpty, "error");
      return;
    }
    setGenerating(true);
    try {
      // THE MERGED CARD IS THREADED THROUGH A LOCAL, not read back off state:
      // `setProfile` has not flushed when the restaging call is built, and that
      // call needs her name and her own lines as its SOURCE. A brand-new member
      // has none until this moment.
      let next = profile;
      if (wantCard) {
        const res = await generateCard({
          description, world, language, apiKey, modelId, aliyun,
        });
        if (!res.ok) {
          // An accelerator, never a gate: the form stays exactly as it was and the
          // player carries on by hand. The localized line for the underlying kind is
          // the game's own, so a dead provider reads the same here as in a round.
          notify?.(t?.errors?.[res.reason] || c.generateFailed, "error");
        } else {
          // Merge UNDER what the player already typed - a generated value must never
          // overwrite something they wrote themselves.
          next = { ...res.profile, ...profile };
          for (const [k, v] of Object.entries(profile)) {
            if (!String(v ?? "").trim()) next[k] = res.profile[k] ?? v;
          }
          setProfile(next);
          // The wheel renders its own draft, so a generated birthday has to be pushed
          // into it or the profile holds a year the player cannot see or correct.
          setYearDraft(birthYearOf(next.birthday));
        }
      }
      if (wantDetail) {
        // Her OWN lines, with no restaging over them. Restaging a restaging compounds:
        // the second pass would describe a chaebol heiress as if she had been one.
        const base = { ...next }; delete base[WORLD_DETAIL_KEY];
        if (!String(base.name || "").trim()) { notify?.(c.detailNeedName, "error"); return; }
        const res = await generateWorldDetail({
          member: base, world, language, apiKey, modelId, aliyun,
        });
        if (!res.ok) {
          // The tab stays exactly as it was, her own lines are still what the prompt
          // sends, and 22.1's narrowed rule is what covers her until a retry works.
          notify?.(t?.errors?.[res.reason] || c.detailFailed, "error");
          return;
        }
        setProfile((prev) => ({ ...prev, [WORLD_DETAIL_KEY]: { world: worldId, ...res.detail } }));
        // There is something new to read on the other tab, which is what that tab
        // is now for.
        setStep(1);
      }
    } finally {
      setGenerating(false);
    }
  };

  // USE HER OWN LINES AGAIN. Because the overlay never overwrote anything,
  // dropping it is all it takes to get her text back.
  const dropDetail = () => setProfile((p) => {
    const o = { ...p }; delete o[WORLD_DETAIL_KEY]; return o;
  });
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

  // A FUNCTION RETURNING JSX, NOT A COMPONENT. Declaring `const Field = ...`
  // inside the render body creates a new component TYPE on every render, so
  // React unmounts and remounts the input on each keystroke and the field loses
  // focus after one character. Plain calls have no component identity, so the
  // elements reconcile as the inputs they are.
  const renderField = (f) => {
    const required = REQUIRED_FIELDS.includes(f);
    const hint = c.hints?.[f];
    return (
      <div key={f} style={{ marginBottom: 8 }}>
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

  // ── THE RESUME: ONE image column, and the five fields beside it ─────────────
  //
  // Yuhan's design, 2026-09-30 (22.8.1): photo, wallpaper and the emoji palette
  // stacked on the left; name, birth year, private personality, MBTI and habit on
  // the right, one per line.
  //
  // IT IS ONE ROW BECAUSE TWO ROWS EACH PAY FOR THEIR OWN MISMATCH. 22.7.2 gave
  // the wallpaper a narrower column than the photo, which shortened that tile and
  // left the shape of the defect alone: a row is as tall as its taller column, so
  // the slack shows up under the shorter one - the space between the two photos,
  // reported twice. With ONE image column the mismatch is paid once for the whole
  // tab, and the wallpaper sits directly under the photo, which is what was asked.
  //
  // THE SHARE IS MEASURED, NOT CHOSEN, and it trades two heights against each
  // other: the wallpaper is 2:3, so a wider column is a TALLER tile, while the
  // palette wraps, so a narrower column is a TALLER palette. Neither tile's ratio
  // is negotiable - each is a preview of the crop the player chose - so the column
  // width is the only lever, and it is set where the two curves cross.
  const IMAGE_COL = "30%";
  const resumeBlock = (images, fields) => (
    <div style={{ display: "flex", gap: 9, marginBottom: 6, alignItems: "flex-start" }}>
      <div style={{ flex: `0 0 ${IMAGE_COL}`, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {images}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {fields.map(renderCompact)}
      </div>
    </div>
  );

  // ── ONE SIZE FOR BOTH TABS (22.8.3) ─────────────────────────────────────────
  //
  // The panel has no height of its own - it is content-sized - so switching tabs
  // resized the window under the player's thumb. BOTH PANES OCCUPY THE SAME GRID
  // CELL, so the row is as tall as the taller of them whatever either one holds:
  // true by construction, where a pinned height would be a number to re-measure
  // every time a field moves, and wrong by a little on every phone.
  //
  // `visibility: hidden` and not `display: none`, which would take the pane out of
  // the layout and defeat the whole thing; and not `opacity: 0`, which leaves the
  // hidden pane clickable on top of the visible one. Hidden visibility also takes
  // it out of the tab order and out of the accessibility tree, which is why the
  // panes need no other guard against a stray focus.
  const pane = (i) => ({
    gridArea: "1 / 1", minWidth: 0,
    visibility: i === step ? "visible" : "hidden",
  });

  // HER PHOTO IS THIS TILE'S OWN BACKGROUND, never a child for something else to
  // clip - three fixes were spent learning that, and `photoFill` is the one
  // definition of it. A real <button>, not a styled <label>: the iOS file-input
  // failure is what made the only uploader for an authored member untappable.
  const photoTile = (kind, dataUrl, fallback, label) => (
    <div>
      <button onClick={() => ask(kind)} aria-label={label}
        style={{ width: "100%", aspectRatio: kind === "wall" ? "2 / 3" : "1 / 1", padding: 0, borderRadius: 12, cursor: "pointer", border: `1px solid ${dataUrl ? accent : inputBorder}`, background: inputBg, ...photoFill(dataUrl), display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(30), lineHeight: 1, color: textFaint, boxSizing: "border-box" }}>
        {dataUrl ? null : fallback}
      </button>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4, marginTop: 3 }}>
        <span style={{ fontSize: fs(9), color: textFaint }}>{label}</span>
        {dataUrl && (
          <button onClick={() => (kind === "wall" ? onWallChange?.(null) : onPhotoChange?.(null))}
            style={{ padding: 0, border: "none", background: "none", cursor: "pointer", color: isLight ? "#a03010" : "#f07070", fontSize: fs(9) }}>
            {kind === "wall" ? c.wallRemove : c.photoRemove}
          </button>
        )}
      </div>
    </div>
  );

  // The right-hand column's fields: label above, control below, no hint line - a
  // half-width column has no room for one and the three required fields need none.
  // Two of the six are not boxes at all, which is why this branches rather than
  // calling renderField: the birth year is a wheel (a text box can hold "19", which
  // is a year the address protocol must never see) and the emoji has its palette.
  const renderCompact = (f) => {
    const required = REQUIRED_FIELDS.includes(f) || f === "birthYear";
    const label = (
      <label style={{ display: "block", fontSize: fs(9.5), color: textDim, marginBottom: 2 }}>
        {fieldLabel(f)}{required ? <span style={{ color: accent, marginLeft: 3 }}>*</span> : null}
      </label>
    );
    if (f === "birthYear") return (
      <div key={f}>
        {label}
        <YearWheel value={yearDraft || DEFAULT_YEAR} onChange={setBirthYear}
          min={BIRTH_YEAR_MIN} max={BIRTH_YEAR_MAX}
          fontScale={fontScale} ariaLabel={c.fields?.birthYear}
          colors={{ text: textMain, textDim, accent, tint: isLight ? "rgba(139,105,20,.12)" : "rgba(232,135,176,.14)", border: inputBorder, fieldBg: inputBg }} />
        {!birthYearValid && (
          <div style={{ fontSize: fs(9), color: isLight ? "#a03010" : "#f07070", marginTop: 2 }}>{c.badYear}</div>
        )}
      </div>
    );
    if (f === "emoji") return (
      <div key={f}>
        {label}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <input value={profile.emoji || ""}
            onChange={(e) => set("emoji", normalizeEmoji(e.target.value))}
            aria-label={fieldLabel("emoji")} inputMode="text" maxLength={24}
            style={{ width: 36, flexShrink: 0, textAlign: "center", padding: "3px 0", borderRadius: 8, background: inputBg, border: `1px solid ${inputBorder}`, color: textMain, fontSize: fs(15), lineHeight: 1.2, outline: "none", fontFamily: "inherit" }} />
          {EMOJI_PALETTE.map((g) => (
            <button key={g} onClick={() => set("emoji", g)}
              aria-label={g} aria-pressed={profile.emoji === g}
              style={{ width: 22, height: 22, padding: 0, borderRadius: 6, cursor: "pointer", fontSize: fs(12), lineHeight: 1, background: profile.emoji === g ? k.tint : "transparent", border: `1px solid ${profile.emoji === g ? accent : border}` }}>
              {g}
            </button>
          ))}
        </div>
      </div>
    );
    return (
      <div key={f}>
        {label}
        {MULTILINE.has(f) ? (
          <textarea value={valueOf(f)} onChange={(e) => setField(f, e.target.value)}
            rows={2} style={{ ...inputStyle, minHeight: 0, padding: "7px 9px", resize: "vertical", lineHeight: 1.45 }} />
        ) : (
          <input value={valueOf(f)} onChange={(e) => setField(f, e.target.value)}
            style={{ ...inputStyle, minHeight: 0, padding: "7px 9px" }} />
        )}
      </div>
    );
  };

  // TAB 2 IS NAMED FOR THE WORLD (22.7.3), and that is what let the status block
  // above tab 2 go. The block's only job was to say which setting the text was
  // written for; a tab reading `在校园世界` says the same thing in the place the
  // player is already looking, and it costs no vertical space at all. It renders
  // `world.name`, which is the string section 6 of the prompt prints, so the two
  // cannot disagree about which world she was written for.
  //
  // It falls back to the neutral label rather than to a blank: the world is null
  // for the width of a world fetch, and a tab with no name is worse than a tab
  // that does not name the world.
  const tabLabels = (c.steps || []).map((label, i) => (
    i === 1 && world?.name && c.stepWorld ? c.stepWorld(world.name) : label
  ));

  return (
    <div className="rv-fixed" style={{ position: "fixed", inset: 0, zIndex: Z.editor, display: "flex", alignItems: "center", justifyContent: "center", background: isLight ? "rgba(40,25,5,.55)" : "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "100%", background: panelBg, border: `1px solid ${border}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>

        {/* header: title + step dots */}
        <div style={{ background: isLight ? "linear-gradient(135deg,#5c3820,#4a2e14)" : "linear-gradient(135deg,rgba(232,135,176,.15),rgba(200,109,208,.15))", padding: "8px 12px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: isLight ? "#f5e8d0" : "#f8c8d8", fontSize: fs(13), fontWeight: 700 }}>
              {editing ? c.editorEdit : c.editorNew}
            </span>
            <button onClick={onCancel} aria-label={c.cancel} style={{ background: "none", border: "none", color: isLight ? "#c8a870" : "#a07090", cursor: "pointer", fontSize: fs(16) }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 6, alignItems: "center" }}>
            {tabLabels.map((label, i) => (
              <button key={i} onClick={() => setStep(i)}
                style={{ flex: 1, padding: "3px 2px", borderRadius: 7, border: "none", cursor: "pointer", background: i === step ? (isLight ? "rgba(245,232,208,.9)" : "rgba(248,200,216,.18)") : "transparent", color: i === step ? (isLight ? "#4a2e14" : "#f8c8d8") : (isLight ? "#c8a870" : "#8a6080"), fontSize: fs(9.5), fontWeight: i === step ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i + 1}. {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "9px 12px", overflowY: "auto", flex: 1, display: "grid" }}>

          {/* TAB 1 */}
          <div style={pane(0)} aria-hidden={step !== 0}>
              {/* An edit to a prebuilt member is THIS RUN's, not the library's. Saying so
                  is not reassurance - it is the difference between a player expecting her
                  change to follow Irene into the next game and a player who knows it will
                  not. */}
              {fromLibrary && (
                <div style={{ padding: "8px 10px", borderRadius: 9, marginBottom: 11, fontSize: fs(9.5), lineHeight: 1.45, color: textDim, background: inputBg, border: `1px solid ${inputBorder}` }}>
                  {c.editRunOnly}
                </div>
              )}

              {/* A RESUME, NOT A FORM - Yuhan's design, 2026-09-30, and
                  docs/V140_PLAN.md 22.6.3. Nine stacked full-width boxes is one and a
                  half screens of scrolling to answer three required fields. Two blocks
                  instead, each an image on the LEFT at half width and its fields on the
                  RIGHT, one per line - a line break in that design starts a new row and
                  a comma does not.

                  `alignItems: flex-start`, not stretch: a stretched square stops being
                  a square, and the right column is taller than the left because the
                  birth year is a WHEEL rather than a box. */}
              {resumeBlock(
                <>
                  {photoTile("photo", photo, profile.emoji || "📷", c.photo)}
                  {photoTile("wall", wall, "🖼", c.wall)}
                  {renderCompact("emoji")}
                </>,
                ["name", "birthYear", "private_personality", "mbti", "habit"],
              )}

              {/* THE ONE THING ON THIS SCREEN THAT WANTS THE WIDTH. A sentence is not a
                  field, and it is hidden for a library member because her card is
                  already written - runGenerate merges UNDER what is filled, deliberately,
                  so for her the box would describe somebody the generator cannot touch.
                  What it CAN do for her is the restaging, and that is the button pair
                  below, which she keeps. */}
              {!fromLibrary && (
                <>
                  <div style={{ fontSize: fs(10.5), color: accent, marginBottom: 3, fontWeight: 600 }}>{c.describe}</div>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
                    rows={2} placeholder={c.describePlaceholder}
                    style={{ ...inputStyle, minHeight: 0, padding: "7px 9px", resize: "vertical", lineHeight: 1.45 }} />
                </>
              )}

              {/* GENERATE AND REGENERATE, one line, half each - the design's comma.
                  ONE control now does BOTH generations: the card from the sentence above
                  and, in a world the library was not written for, her restaging. They
                  were two buttons on two tabs, which meant the fast path crossed a tab
                  boundary and tab 2 auto-ran a call the player had not asked for.

                  The pair is not one button twice. GENERATE fills what is blank and
                  never overwrites a word the player typed, which is what makes it safe
                  to press again; REGENERATE drops the current restaging first, which is
                  the only way to get a different answer once one exists. */}
              <div style={{ display: "flex", gap: 7, marginTop: 6, marginBottom: 3 }}>
                <button onClick={() => runGenerate(false)} disabled={busy}
                  style={{ flex: 1, padding: 8, minHeight: 34, borderRadius: 9, border: "none", cursor: busy ? "default" : "pointer", background: busy ? (isLight ? "rgba(100,65,20,.2)" : "rgba(255,255,255,.1)") : accentGrad, color: "#fff", fontSize: fs(11.5), fontWeight: 600 }}>
                  {busy ? c.generating : (restageable ? c.detailGenerate : c.generate)}
                </button>
                {/* AN ICON, AND IT KEEPS THE LABEL IT LOSES (22.8.2). The two buttons
                    split the row in half, so the label carrying the whole meaning of
                    the control was the one being truncated. The glyph is the one the
                    story panel already uses for exactly this act; `aria-label` and
                    `title` carry `detailRetry`, because an icon-only control with no
                    accessible name is one a screen reader cannot announce. */}
                <button onClick={() => runGenerate(true)} disabled={busy}
                  aria-label={c.detailRetry} title={c.detailRetry}
                  style={{ flex: "0 0 auto", width: 34, minHeight: 34, padding: 0, borderRadius: 9, cursor: busy ? "default" : "pointer", background: "transparent", border: `1px solid ${inputBorder}`, color: textDim, fontSize: fs(16), lineHeight: 1 }}>
                  ↺
                </button>
              </div>
              <div style={{ fontSize: fs(9), color: textFaint, lineHeight: 1.4 }}>
                {restageable ? c.detailHint : c.generateHint}
              </div>

            <input ref={fileRef} type="file" accept="image/*" onChange={took} style={{ display: "none" }} />
          </div>

          {/* TAB 2 */}
          <div style={pane(1)} aria-hidden={step !== 1}>
              {/* THE GENERATE PAIR MOVED TO TAB 1, so this tab is what it is for:
                  reading the result and correcting it.

                  THE STATUS BLOCK IS GONE and the WAY BACK IS NOT (22.7.3). The block
                  said which world the text was written for, in 69px of a 602px tab;
                  the tab's own name says it now. `detailRevert` is the control that
                  makes a generation the player dislikes reversible, and a generation
                  with no way to a different answer gets routed around exactly as a
                  prohibition with no substitute does - so it survives as one line, and
                  only when there IS a restaging to revert, which is also the only time
                  it means anything.

                  The empty state needs no words at all: the boxes below show her own
                  lines, and a tab named for the world already says nothing has been
                  written for it. */}
              {restageable && detailActive && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button onClick={dropDetail}
                    style={{ padding: "4px 9px", borderRadius: 7, cursor: "pointer", background: "transparent", border: `1px solid ${inputBorder}`, color: textDim, fontSize: fs(9.5) }}>
                    ↩ {c.detailRevert}
                  </button>
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
          </div>
        </div>

        {/* footer: Back / Next, and Save whenever the card is complete */}
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${border}`, display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)}
              style={{ padding: "8px 12px", borderRadius: 9, background: "transparent", border: `1px solid ${border}`, color: textDim, fontSize: fs(11.5), cursor: "pointer" }}>
              ← {c.back}
            </button>
          )}
          {step < 1 && (
            <button onClick={() => setStep((s) => s + 1)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 9, background: "transparent", border: `1px solid ${border}`, color: textDim, fontSize: fs(11.5), cursor: "pointer" }}>
              {c.next} →
            </button>
          )}
          {/* Live from either tab. A wizard that makes you walk to the end to commit
              is worse than the form it replaced, and tab 2 is optional and generated. */}
          <button onClick={submit} disabled={!canSave}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 9, border: "none", cursor: canSave ? "pointer" : "not-allowed", background: canSave ? accentGrad : (isLight ? "rgba(100,65,20,.15)" : "rgba(255,255,255,.08)"), color: canSave ? "#fff" : textFaint, fontSize: fs(11.5), fontWeight: 700 }}>
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
