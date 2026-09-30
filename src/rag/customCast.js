// src/rag/customCast.js
//
// The custom-member palette: members the player authored, stored on this device
// and offered in the roster builder beside the shipped library.
//
// It is a PALETTE, NOT A DEPENDENCY. resolveRoster snapshots a custom profile
// inline when a roster is built (docs/V140_PLAN.md §4.2), so deleting a member
// from here can never break a running save or a saved roster — the copy that
// matters already left. That is the whole reason the two sources are treated
// differently, and it is why `removeMember` below needs no reference check.
//
// It sits next to groupLoader.js because it answers the same question for the
// other door: who can be in a cast. Everything past resolveRoster is ignorant
// of which door a member came through.

import { STORAGE_KEYS, loadFromStorage, saveToStorage } from "../utils";
// The slot order, from the one module that defines it. Re-declaring it here would
// be a second source of truth for something the prompt's member order depends on.
import { SLOTS, WORLD_FIELDS, WORLD_DETAIL_KEY } from "./rosterResolver";

// docs/V140_PLAN.md §10 budgets 20 members at ~2 KB. The cap is a quota
// guard, not a design opinion about how many characters a player may want.
export const CAST_MAX = 20;

// Required tier, docs/V140_PLAN.md §4.4. `birthday` is required and not
// optional on purpose: the entire address protocol is a birth-year comparison,
// and a member without one falls back to "2000-01-01", which makes the
// honorifics uniform across the cast. That is exactly the v1.3.6 -> v1.3.7
// failure, reintroduced one custom member at a time.
export const REQUIRED_FIELDS = ["name", "birthday", "private_personality"];

// A whitelist, matching parseGroupConfig's, and derived from the readers rather
// than from the form: every field here is consumed by buildSystemPrompt's
// profile block, by buildGroupLore, or by an overlay. A custom profile never
// passes through parseGroupConfig — resolveRoster hands it to the prompt as-is
// — so this is the only place unrecognised keys can be stopped.
//
// Note it is applied ON WRITE, not on read. Nothing unknown can reach the
// prompt anyway (the render reads named fields only), so the risk is a save
// quietly carrying whatever a future editor version happened to put in scope.
// Filtering at the boundary keeps the stored shape equal to the documented one.
export const PROFILE_FIELDS = [
  "id",
  // required
  "name", "birthday", "private_personality",
  // recommended
  "public_image", "queer_texture", "speech_style", "habit",
  // advanced
  "name_kr", "mbti", "role", "animal_plastic", "hidden_conflict",
  "emoji", "color", "accent", "tags",
  // derived at creation, read by the Instagram overlay
  "ig",
  // Her world-scoped restaging (§22.2's tab 2), as ONE stamped object rather
  // than five fields plus a stamp beside them: applyWorldDetail lays it over her
  // only for the world it names, so nothing the player wrote is overwritten and a
  // stale detail is not expressible. The only non-string value on this list.
  WORLD_DETAIL_KEY,
];

/**
 * Strip a restaging to the documented shape: the stamp plus WORLD_FIELDS.
 *
 * It is DROPPED ENTIRELY unless it carries both a world and a `world_position`. A
 * detail with no stamp would apply in every world, which is the leak the stamp
 * exists to stop; one with no position is the state isUsableDetail rejects, and
 * storing it would make a member count as restaged while rendering nothing in the
 * slot `useRole` empties.
 */
export function sanitizeWorldDetail(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const world = String(detail.world ?? "").trim();
  const out = { world };
  for (const f of WORLD_FIELDS) {
    const v = String(detail[f] ?? "").trim();
    if (v) out[f] = v;
  }
  return world && out.world_position ? out : null;
}

// Auto-assigned so the player never has to pick one. The palette is small and
// cycled by index rather than hashed: a hash collides invisibly and two members
// in the same roster then share a colour, which is the one place it shows.
// No variation selectors: every entry is a single code point, so the width is
// consistent wherever it is rendered next to a library member's emoji.
// EXPORTED since v1.4.1: the editor offers these as one-tap choices, and a
// second copy of ten glyphs in a component is the hand-maintained list this
// repo keeps losing. It is the DEFAULT set, not the allowed set - the field
// takes any glyph the player can type.
export const EMOJI_PALETTE = ["🎻", "🐦", "🦌", "🐈", "🦢", "🦔", "🐝", "🦉", "🦋"];
const COLOR_PALETTE = [
  ["#e887b0", "#f8c8d8"], ["#7fb5d5", "#c5e2f0"], ["#c9a86c", "#ecdcc0"],
  ["#9b8bc4", "#d8d0ec"], ["#7fc4a8", "#c8e8dc"], ["#d49080", "#f0d0c8"],
];

/** Read the palette. Always an array, even if the key is absent or corrupt. */
export function loadCustomCast() {
  const raw = loadFromStorage(STORAGE_KEYS.CAST_CUSTOM);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Strip a profile to the documented shape.
 * Blank and whitespace-only values are dropped rather than stored as "": the
 * prompt suppresses an empty field either way (step 6 commit 1), so keeping
 * them would only bloat the save with keys that render nothing.
 */
export function sanitizeProfile(profile = {}) {
  const out = {};
  for (const f of PROFILE_FIELDS) {
    const v = profile[f];
    if (v === undefined || v === null) continue;
    if (f === WORLD_DETAIL_KEY) {
      const d = sanitizeWorldDetail(v);
      if (d) out[f] = d;
      continue;
    }
    if (Array.isArray(v)) { if (v.length) out[f] = v.slice(); continue; }
    const s = String(v).trim();
    if (s) out[f] = s;
  }
  return out;
}

/**
 * The fields an edited profile changes, against the library's own copy of her.
 *
 * A LIBRARY EDIT IS A DIFF, NEVER A SNAPSHOT (docs/V140_PLAN.md §22.3). resolveRoster
 * applies `entry.override` over the member it fetched, so every field the player did
 * not touch keeps arriving BY REFERENCE and a corrected library profile still reaches
 * a game in progress - §4.2's rule. Snapshotting her would give that up for nothing.
 *
 * A field the player CLEARED is recorded as "", not dropped. Object.assign cannot
 * delete, so a dropped key means the library's value comes back and the edit is
 * silently discarded. "" works because the profile block tests every optional field
 * for CONTENT rather than presence, and memberLine uses filter(Boolean) - so an
 * emptied field renders nothing, which is what clearing it means.
 *
 * THE BASE MUST BE THE LIBRARY'S MEMBER, never an already-overridden copy: diffing
 * against the overridden one compounds, and a field edited and then typed back to its
 * original text would keep an entry saying it equals itself. That entry is the
 * difference between a cast nobody edited and a byte-identical prompt.
 *
 * An EMPTY result is {} and the caller stores no override key at all, which is what
 * makes "no golden moves if nothing is edited" a property of the data.
 */
export function overrideFrom(base = {}, edited = {}) {
  const out = {};
  // A restaging compares as its SANITIZED shape, in WORLD_FIELDS order, so the
  // comparison is stable and an unedited one diffs to nothing. String(obj) would
  // flatten every detail to the same "[object Object]" and record no change at
  // all - a generation that never reached the roster.
  const flat = (v) => {
    if (Array.isArray(v)) return v.join(String.fromCharCode(0));
    if (v && typeof v === "object") return JSON.stringify(sanitizeWorldDetail(v) || {});
    return String(v ?? "").trim();
  };
  for (const f of PROFILE_FIELDS) {
    // The id is authoritative and is not a field anyone may edit: every
    // per-member map in the save is keyed by it.
    if (f === "id") continue;
    const was = flat(base[f]);
    const now = flat(edited[f]);
    if (was === now) continue;
    out[f] = edited[f] === undefined || edited[f] === null ? "" : edited[f];
  }
  return out;
}

/** Which required fields a profile is still missing. Empty array means valid. */
export function missingRequired(profile = {}) {
  return REQUIRED_FIELDS.filter((f) => !String(profile?.[f] ?? "").trim());
}

// A player supplies a YEAR; the prompt needs a DATE. buildSystemPrompt reads the
// year with `(m.birthday || "2000-01-01").split('-')[0]`, so a bare year would
// parse but a missing one silently becomes 2000 and flattens the cast's
// honorifics. These two functions are the whole conversion, and they are here
// rather than inline in the editor because the BUG WAS IN THE ROUND TRIP, not in
// either direction alone: the editor stored "1-01-01" after one keystroke and fed
// `"1-01-01".slice(0, 4)` — "1-01" — back into a `type="number"` input, which
// cannot render that, so the field blanked and looked broken.
export const BIRTH_YEAR_MIN = 1980;
export const BIRTH_YEAR_MAX = 2012;

/** The year digits a birthday carries, for display. "" when there is none. */
export function birthYearOf(birthday) {
  const m = String(birthday || "").match(/^(\d{1,4})/);
  return m ? m[1] : "";
}

/**
 * A birthday from year digits — or "" while the year is still incomplete.
 *
 * Returning "" for a partial year is the point: a half-typed year must leave the
 * profile INVALID so Save stays disabled, rather than storing "19-01-01" and
 * letting a two-digit year reach the address protocol.
 */
export function birthdayFromYear(year) {
  const digits = String(year ?? "").replace(/\D/g, "").slice(0, 4);
  return digits.length === 4 ? `${digits}-01-01` : "";
}

/** Is this year one an idol active in 2026 could plausibly have? */
export function validBirthYear(year) {
  const n = Number(String(year ?? "").replace(/\D/g, ""));
  return n >= BIRTH_YEAR_MIN && n <= BIRTH_YEAR_MAX;
}

/**
 * A stable id for a new member.
 *
 * Prefixed `c_` so a custom member can never collide with a library id, which
 * matters more here than it looks: step 4 found that library ids are not even
 * unique ACROSS the library (`x` shares seven with the groups those members
 * debuted in), and affections, KKT channels and memberAppearances are all keyed
 * by id. A collision would merge two people's state silently.
 */
export function newMemberId(now = Date.now(), rand = Math.random) {
  return `c_${now.toString(36)}${Math.floor(rand() * 1296).toString(36).padStart(2, "0")}`;
}

/**
 * One glyph, from whatever the player typed or pasted.
 *
 * A GRAPHEME, not a code point: a flag is two code points, a skin tone is two,
 * and a family is up to seven joined by ZWJ - so slicing by code point stores
 * half an emoji and renders a stray modifier beside it. Intl.Segmenter is the
 * only thing that gets that right and every browser this app targets has it.
 *
 * The LAST grapheme wins, not the first, and that is a UI rule rather than a
 * taste: this field is never empty once she has one, so typing into it means
 * "use this instead" - keeping the first would make the box ignore every key
 * pressed after the glyph already sitting in it.
 */
export function normalizeEmoji(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)];
    return parts.length ? parts[parts.length - 1].segment : "";
  }
  // No segmenter: hand back what was typed rather than half a glyph. Visibly
  // wrong beats plausibly wrong, and this branch is unreachable in practice.
  return s;
}

/** Fill in the cosmetic fields the form does not ask for. */
export function withDefaults(profile, index = 0) {
  const [color, accent] = COLOR_PALETTE[index % COLOR_PALETTE.length];
  return {
    ...profile,
    // What the player picks wins; the palette is only what she gets for not
    // making one. Until v1.4.1 there was no way to make one at all, so a custom
    // member was whichever glyph her index landed on for the life of the save.
    emoji: profile.emoji || EMOJI_PALETTE[index % EMOJI_PALETTE.length],
    color: profile.color || color,
    accent: profile.accent || accent,
    ig: profile.ig || `${profile.id}_official`,
  };
}

/**
 * Insert or replace one member in a palette array. Pure — the caller persists.
 *
 * Returns {ok, cast, reason}. Player data, so a refusal is reported rather than
 * swallowed: this is the saveToStorage lesson (utils.js) applied one layer up.
 * `reason` is a code, never a sentence — the caller renders it through i18n.
 */
export function upsertMember(cast, entry) {
  const list = Array.isArray(cast) ? cast : [];
  const missing = missingRequired(entry?.profile);
  if (missing.length) return { ok: false, cast: list, reason: "missing", missing };

  const at = list.findIndex((m) => m.id === entry.id);
  if (at === -1 && list.length >= CAST_MAX) {
    return { ok: false, cast: list, reason: "full" };
  }
  const clean = {
    id: entry.id,
    lang: entry.lang || "zh",
    createdAt: at === -1 ? (entry.createdAt || Date.now()) : list[at].createdAt,
    // The id is authoritative and comes from the entry, never from the profile
    // body — an edited profile must not be able to rename itself out from under
    // the affection map. resolveRoster makes the same guarantee on its side.
    profile: withDefaults({ ...sanitizeProfile(entry.profile), id: entry.id },
      at === -1 ? list.length : at),
  };
  const next = list.slice();
  if (at === -1) next.push(clean); else next[at] = clean;
  return { ok: true, cast: next };
}

/**
 * What the profile editor is handed for a member who is already in the cast.
 *
 * ONE EDITOR, TWO SOURCES (docs/V140_PLAN.md §22.2), and they differ in both
 * directions: a custom member is edited as her PALETTE entry and saved as a new
 * snapshot, while a library member is edited as her library record with this run's
 * override laid on top and saved as a diff. `src` travels on the object so the save
 * path reads a value instead of inferring which state opened the editor.
 *
 * A custom pick can outlive its palette entry - she was deleted, or the cast came
 * from a saved roster, which snapshots her. Then the roster's own copy is the only
 * one left, and it is also the copy the run will use, so it is what gets edited.
 *
 * NULL means a library member whose group config has not arrived; group configs are
 * fetched per tab. Returning null rather than an empty profile is what stops the
 * editor opening over nothing, which would read as data loss and would diff every
 * field as a change - snapshotting her by the back door.
 *
 * Pure and here rather than in the component for the reason assignSlot is: a source
 * regex can see that a branch is WRITTEN and not that it is REACHABLE.
 */
export function editorTargetFor(id, pick, opts = {}) {
  const { paletteEntry = null, libraryBase = null, language = "zh" } = opts;
  if (!pick || !id) return null;
  if (pick.src === "custom") {
    return paletteEntry
      ? { ...paletteEntry, id, src: "custom" }
      : { id, src: "custom", lang: pick.lang || language, profile: pick.profile || {} };
  }
  if (!libraryBase) return null;
  return {
    id, src: "library", groupId: pick.groupId ?? null,
    profile: { ...libraryBase, ...(pick.override || {}) },
  };
}

/**
 * Write a swept cast's restagings into a roster, stamped with the world.
 *
 * THE ROSTER IS WHERE IT HAS TO LAND, because the roster is what the save carries
 * and buildSystemPrompt must stay a pure function of the save (§4.2). Generated
 * text fixed at setup and stored satisfies that exactly as the ex-girlfriend
 * backstory's seed does; text regenerated at round time would be that defect with
 * a network call in it.
 *
 * Each source keeps its own rule, unchanged: a CUSTOM member is snapshotted, so her
 * detail goes in `entry.profile`; a LIBRARY member is by reference, so hers goes in
 * `entry.override` beside whatever the editor already put there (§4.2, §22.3).
 *
 * A member with no detail is left BYTE-IDENTICAL - not stamped with an empty one -
 * because a failed generation must leave her in the state §22.1's narrowed rule
 * still covers, and an empty stamp would say she had been restaged.
 */
export function withCastDetail(roster, detailById = {}, worldId = "") {
  const entries = roster?.entries || [];
  if (!worldId || !Object.keys(detailById).length) return roster;
  return {
    ...roster,
    entries: entries.map((e) => {
      const detail = sanitizeWorldDetail({ ...(detailById[e.memberId] || {}), world: worldId });
      if (!detail) return e;
      return e.src === "custom"
        ? { ...e, profile: { ...(e.profile || {}), [WORLD_DETAIL_KEY]: detail } }
        : { ...e, override: { ...(e.override || {}), [WORLD_DETAIL_KEY]: detail } };
    }),
  };
}

/** Remove one member. Safe unconditionally — see the palette note at the top. */
export function removeMember(cast, id) {
  const list = Array.isArray(cast) ? cast : [];
  return list.filter((m) => m.id !== id);
}

/** Persist a palette. Returns false when the browser refused the write. */
export function saveCustomCast(cast) {
  return saveToStorage(STORAGE_KEYS.CAST_CUSTOM, cast);
}

/** The roster entry for a custom member: snapshotted inline, per §4.2. */
export function toRosterEntry(member, slot) {
  return {
    src: "custom",
    memberId: member.id,
    slot,
    lang: member.lang || "zh",
    profile: { ...member.profile, id: member.id },
  };
}

/**
 * Assign one member to one slot, or take her out by naming the slot she already
 * holds. Returns the next picks map; never mutates the one passed in.
 *
 * Pure and exported for the same reason `addSaveSlot` is: this is the rule the
 * roster builder's whole control surface expresses, and three of its four
 * branches are unreachable by hand without a very specific sequence of taps.
 *
 * A MEMBER HOLDS EXACTLY ONE SLOT. Affections, KKT channels and
 * memberAppearances are all keyed by member id, so the same person in two slots
 * would silently merge her own state — the map is keyed by id so that cannot be
 * expressed, and assigning her somewhere new therefore MOVES her.
 *
 * Exactly one main, and promoting a second DEMOTES the first rather than
 * dropping her: resolveRoster reads `idsWith("main")[0]`, so a second main is
 * simply ignored and the player would watch her own tap do nothing. Demotion is
 * also what she almost always means.
 */
export function assignSlot(picks = {}, member = {}, slot = "main", opts = {}) {
  const id = member.id;
  if (!id || !SLOTS.includes(slot)) return picks;
  const out = { ...picks };
  // Naming the slot she already holds is how you remove her, so there is always
  // one tap that undoes one tap.
  if (out[id]?.slot === slot) { delete out[id]; return out; }
  if (slot === "main") {
    for (const [other, p] of Object.entries(out)) {
      if (p.slot === "main") out[other] = { ...p, slot: "sub" };
    }
  }
  out[id] = member.__custom
    ? { slot, src: "custom", lang: opts.lang || member.lang || "zh", profile: opts.profile || member.profile }
    : { slot, src: "library", groupId: member.__groupId ?? null };
  return out;
}

/**
 * One saved roster, as it goes into STORAGE_KEYS.ROSTERS.
 *
 * THE LABEL IS `entry.name` AND MUST NEVER REACH `entry.roster.name`. Those two
 * fields look interchangeable and are not: `roster.name` is the composed GROUP
 * name, which rosterResolver renders into section 4 of the prompt as
 * "<name> is an N-member group under <name> Entertainment". A cast the player
 * saved as "my Irene run" would debut under that name in the story.
 *
 * The label is for the player's own shelf and nothing else — it never reaches
 * the model. That is why this is a function with a test rather than an object
 * literal in a click handler.
 */
export function savedRosterEntry({ label, roster, fallbackName = "", now = Date.now() }) {
  const name = String(label || "").trim() || fallbackName;
  return { id: now, name, createdAt: now, roster };
}

/**
 * Turn the roster builder's picks into a roster.
 *
 * `picks` is keyed BY MEMBER ID — {id: {slot, src, groupId, lang, profile}} —
 * which is the correctness constraint rather than a convenience: step 4 found
 * that ids are not unique across the library (`x` shares seven with the groups
 * those members debuted in), and affections, KKT channels and memberAppearances
 * are all keyed by id. A map keyed by id cannot express the same person twice.
 *
 * ENTRY ORDER IS PROMPT ORDER, AND PROMPT ORDER IS A CACHE BOUNDARY. The same
 * cast in a different order is the same game and a total cache miss, so the
 * slots are walked in a fixed sequence — main, then subs, then NPCs — rather
 * than however the picks object happens to iterate.
 *
 * It takes no world, and the builder cannot supply one that would still be true:
 * the world is picked at Setup, one screen LATER. See buildClassicRoster.
 *
 * Lives here rather than in the component so it can be tested as behaviour
 * instead of asserted as a regex: it is the part of the builder that has to be
 * right.
 */
export function rosterFromPicks(picks = {}) {
  const chosen = Object.entries(picks).map(([id, p]) => ({ id, ...p }));
  const main = chosen.find((p) => p.slot === "main");
  return {
    // The group whose lore the prompt uses. The main member's group is the right
    // answer for a single-group cast and the only defensible one for a mixed
    // cast until composed lore lands in v1.4.1.
    groupId: main?.groupId || chosen.find((p) => p.groupId)?.groupId || null,
    entries: SLOTS.flatMap((slot) => chosen
      .filter((p) => p.slot === slot)
      .map((p) => (p.src === "custom"
        ? toRosterEntry({ id: p.id, lang: p.lang, profile: p.profile }, slot)
        // The override is spread in CONDITIONALLY: an entry for a member
        // nobody edited must be byte-identical to what it was before the
        // editor existed, or every saved roster and every golden moves for a
        // cast the player did not touch. A custom member needs none - her
        // profile is snapshotted inline, so an edit is already in it.
        : {
          src: "library", groupId: p.groupId, memberId: p.id, slot,
          ...(p.override && Object.keys(p.override).length ? { override: p.override } : {}),
        }))),
  };
}
