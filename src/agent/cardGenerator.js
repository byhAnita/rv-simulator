// src/agent/cardGenerator.js
//
// One LLM call that turns a one-line description into a member card the player
// then edits. docs/V140_PLAN.md §4.5.
//
// Placement: the member editor is reached from Setup, and the page order is
// Cover -> KeyInput -> Setup, so the key and the model choice already exist. It
// goes through callLLM like every other call in this app, which means it
// inherits the per-kind retry policy, the free-route walk, the timeout rules and
// the error layer without knowing any of them exist.
//
// THE CALL IS AN ACCELERATOR, NEVER A GATE. Any LLMError resolves to an empty
// profile and the player types the card by hand. A dead provider, an exhausted
// free route or a missing key must not be able to block character creation —
// that is the difference between a feature and a dependency.

import { callLLM } from "../tools/llmTool";
import { LLMError } from "../tools/llmErrors";
// What a restaging is allowed to write, from the module that APPLIES it. Asking
// for a field the overlay does not lay down would spend tokens on text nothing
// renders, and a second hand-kept copy of the list is how that happens.
import { WORLD_FIELDS } from "../rag/rosterResolver";

// The fields the call is allowed to fill. `name` and `birthday` are here
// because without them the player still has to supply two required fields by
// hand, and the whole point of the box is a fast path to a complete card.
//
// Deliberately absent: emoji, color and accent are auto-assigned from a palette
// (customCast.js#withDefaults) so the player never has to care; `tags` is
// v1.4.2; `name_kr`, `mbti` and `role` reach no prompt for a custom member —
// buildGroupLore renders those only for the primary group's own members, and
// the profile block does not read them at all. Generating dead fields would
// spend tokens on text nothing renders.
// `animal_plastic` LEFT this list in v1.4.1 §22.2, together with the editor's box
// for it. The field itself stays - it is on PROFILE_FIELDS, it is in all 30 group
// files, and the profile block still renders it for all 57 library members, which
// is what keeps the goldens fixed. What it may not do is be GENERATED while being
// uneditable: the invariant one guard holds is that the player can correct anything
// the model wrote, and §22.2's editor does not offer this one. So a custom member
// simply has none, and an absent optional field renders nothing.
export const CARD_FIELDS = [
  "name", "birthday",
  "private_personality", "public_image", "queer_texture",
  "speech_style", "habit", "hidden_conflict",
];

// Long enough that the model has something to work from. Below this the card is
// generic and the player would have been faster typing it.
export const MIN_DESCRIPTION_CHARS = 4;
export const MAX_DESCRIPTION_CHARS = 300;

const LANGUAGE_NAME = { zh: "Chinese", en: "English", ko: "Korean" };

/**
 * The card prompt.
 *
 * Two constraints in it are not stylistic:
 *
 *  - ORIGINAL CHARACTER, NOT A REAL PERSON. A player can type a real idol's
 *    name into the box, and the fields being asked for are private personality,
 *    queer texture and hidden conflict — so without this the feature becomes a
 *    generator of invented claims about a real person's private life. That is
 *    the exact thing the habit sourcing rule forbids (CLAUDE.md, Group JSON
 *    Structure), and a custom member is fiction by construction anyway.
 *  - ONE LANGUAGE, THE PLAYER'S. Custom profiles are authored in one language
 *    and never translated (§5); the prompt carries the cross-lingual
 *    instruction at render time instead.
 */
export function buildCardPrompt(description, world, language = "zh") {
  const lang = LANGUAGE_NAME[language] || LANGUAGE_NAME.zh;
  // `world.setting` is the v1.4.1 field §4.5 names; the v1.4.0 world shape
  // carries only name/emoji/color, so fall back to the name and prefer the
  // richer field automatically once it exists.
  const setting = world?.setting || world?.name || "";

  return `You are writing a character card for a fictional dating-sim cast member.

SETTING: ${setting}
DESCRIPTION FROM THE PLAYER: ${description}

She is an ORIGINAL FICTIONAL CHARACTER. Even if the description resembles a real
public figure, do not write about that person: invent someone new and make no
claim about any real individual's health, body, relationships or private life.

Write every field in ${lang}. Do not translate the fields into any other
language and do not add fields that are not listed.

Output ONLY valid JSON, no markdown fences, with exactly these keys:

{
  "name": "her stage name, 1-3 words, in ${lang}",
  "birthday": "YYYY-MM-DD, a plausible birth date for an idol active in 2026",
  "private_personality": "who she is when no one is watching, 1-2 sentences",
  "public_image": "the persona the public sees, 1-2 sentences",
  "queer_texture": "how attraction to a woman surfaces in her specifically, 1-2 sentences",
  "speech_style": "how she talks - register, rhythm, verbal tics, 1 sentence",
  "habit": "ONE concrete, observable, repeatable physical behaviour a scene can stage. Not a feeling and not a trait: something she does with her hands, her posture or an object",
  "hidden_conflict": "the tension she carries and hides, 1 sentence"
}`;
}

/**
 * Pull a card object out of whatever the model returned.
 *
 * Tolerant in the same spirit as the round parser, but not a copy of it: a card
 * has no long escaped prose field, so none of parseLLMOutput's story-specific
 * repair applies. MISSING FIELDS STAY EMPTY RATHER THAN FAILING THE CALL (§4.5)
 * — a card with six of nine fields is still a head start, and refusing it would
 * hand the player a blank form for no reason.
 */
export function parseCard(text) {
  const obj = parseJsonish(text);
  if (!obj) return {};
  const out = {};
  for (const f of CARD_FIELDS) {
    const v = obj[f];
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    // A habit must be one line - the profile block renders it as one, and a
    // newline inside it would break the line-per-field shape the prompt relies
    // on. Same reason smoke rejects a multi-line habit in the group library.
    if (str) out[f] = str.replace(/\s*[\r\n]+\s*/g, " ");
  }
  return out;
}

/**
 * The JSON recovery both parsers need, written once.
 *
 * It was parseCard's body, and §22.2 needed the identical tolerance for the
 * world-detail response - a second copy is what `extractStoryText` is a standing
 * warning about in this repo, where two copies drifted and the guard had been
 * written against the one that was still correct. Returns null rather than {} so a
 * caller can tell *nothing parsed* from *parsed, no recognised field*.
 */
function parseJsonish(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  let body = text.trim();
  // Fenced output, with or without a language tag.
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) body = fenced[1].trim();
  // Prose before or after the object.
  const open = body.indexOf("{"), close = body.lastIndexOf("}");
  if (open !== -1 && close > open) body = body.slice(open, close + 1);
  else if (open !== -1) body = body.slice(open) + "}";   // truncated mid-object

  let obj = null;
  try { obj = JSON.parse(body); }
  catch {
    // One repair attempt, matching the round's tolerance: close whatever the
    // model left open. Anything still unparseable yields {} and the editor
    // opens blank.
    let fixed = body;
    const opens = (fixed.match(/\{/g) || []).length;
    const closes = (fixed.match(/\}/g) || []).length;
    for (let i = closes; i < opens; i++) fixed += "}";
    try { obj = JSON.parse(fixed); } catch { return null; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return obj;
}

/** A card is worth showing if it filled anything the player would have typed. */
export function isUsableCard(card) {
  return Boolean(card && Object.keys(card).length > 0);
}

/**
 * Generate a card. Never throws.
 *
 * Returns {ok, profile, reason}. `reason` is an LLMError kind on failure, so the
 * caller can render the same localized line the game uses for that kind
 * (t.errors[kind]) rather than inventing a second vocabulary for the same
 * failures.
 */
export async function generateCard({
  description, world, language = "zh", apiKey, modelId = "deepseek",
  aliyun = null, reasoningEnabled = false,
} = {}) {
  const desc = String(description || "").trim().slice(0, MAX_DESCRIPTION_CHARS);
  if (desc.length < MIN_DESCRIPTION_CHARS) {
    return { ok: false, profile: {}, reason: "no_description" };
  }

  const prompt = buildCardPrompt(desc, world, language);
  // A response carrying no recognisable field is unusable, so say so and let
  // the client retry and, in free mode, walk to another model — the same
  // mechanism that stops a degenerate round reaching the player.
  const usable = (content) => {
    try { return isUsableCard(parseCard(content)); } catch { return false; }
  };

  try {
    // reasoningEnabled defaults to false and the player's Deep Thinking setting
    // is NOT threaded in by default: this is one short creative generation, not
    // a round, and the setting exists to buy quality in the story. The caller
    // can still pass it if that judgement changes.
    const raw = await callLLM(
      prompt, [], "", apiKey, modelId, null, reasoningEnabled, aliyun, usable);
    const profile = parseCard(raw);
    return isUsableCard(profile)
      ? { ok: true, profile }
      : { ok: false, profile: {}, reason: "bad_response" };
  } catch (e) {
    // Every failure lands here as a blank form. Logged, because a player
    // reporting "generate does nothing" needs something in the console, and
    // console.error is how the rest of the app surfaces a kind.
    const kind = e instanceof LLMError ? e.kind : "unknown";
    console.error("[cardGenerator] generation failed:", kind, e?.message || e);
    return { ok: false, profile: {}, reason: kind };
  }
}

// ── her world-scoped detail (docs/V140_PLAN.md §22.2, tab 2) ───────────────────
//
// THE FIELDS THAT ARE TRUE OF HER IN A WORLD, rather than true of her. The test
// §22.2 states is *would this sentence still be true if she were cast in a
// different world?* - and the three ★ texture fields fail it: the library's are
// authored for a performing-idol setting and reach all four worlds, 57 of 57
// members, 80 field instances (§22.1). `world_position` is the fourth, and it is
// what fills the slot `castLore.useRole` empties. The list itself is WORLD_FIELDS,
// imported from the module that lays it back over a member.

/**
 * The prompt that restages one member in one world.
 *
 * IT NEEDS NO NEW WORLD FIELD, which is why §4.5's `world.setting` is still not
 * shipped. The world already carries what a world-scoped generation wants:
 * `castLife.theirs` answers *what do these people do all day*, `castLore.orgNoun`
 * names the kind of organisation, `scenario` is the opening scene and `places` is
 * the canon list. Generating from those costs ZERO world-file edits against twelve
 * documents - and because they are the same fields the ROLE CONTRACT and section 11
 * already render, the generated detail cannot contradict the rest of the prompt.
 *
 * HER EXISTING LINES GO IN AS THE SOURCE, not as an example to match. The job is a
 * restaging: keep who she is, change the circumstances it is described through -
 * which is exactly what §22.1's interim prompt rule asks the MODEL to do at read
 * time, done once at setup instead, where it can be reviewed and costs no tokens
 * per round.
 */
// Who else is in this cast, oldest first. EXPORTED and pure because the whole
// point of it is determinism: five concurrent calls each get the same ladder and
// a different rank in it, which is what makes their positions differ without
// serialising the sweep into five round-trips.
//
// Birth year is the axis, and it is the axis the ADDRESS PROTOCOL already uses -
// so a restaged position cannot contradict the honorifics the same prompt sends.
// Any other ordering would be a second seniority axis, which is the thing this
// prompt spends the most words keeping singular.
//
// A member with no birthday sorts LAST and keeps her input order: she cannot be
// placed on a ladder built out of a fact she does not carry, and a custom member
// is allowed to carry only three fields.
export function seniorityLadder(cast = []) {
  const rows = (cast || [])
    .filter((m) => m && m.name)
    .map((m, i) => ({ id: m.id, name: m.name, year: Number(String(m.birthday || "").slice(0, 4)) || 0, i }));
  return rows.sort((a, b) => (b.year ? 1 : 0) - (a.year ? 1 : 0)
    || (a.year - b.year) || (a.i - b.i));
}

// THE RANKS ARE NAMED IN THE SCRIPT THE SOURCE IS AUTHORED IN - zh - and NOT in
// Korean. A live ko campus run came back with \ub9c9\ub0b4 beside \uc120\ubc30, which is
// the ordinary Korean word for the youngest of any group and has no neutral
// substitute, so forbidding it would ban correct Korean. In zh the same concept has
// an everyday word (\u6700\u5e74\u5e7c), which is what makes \u5fd9\u5185 a loanword
// worth refusing. Same shape as \u5440 in the address table: a rule about a borrowed
// word holds only where the target language has its own word for the thing.
//
// THE RANKS ARE NAMED IN THE SCRIPT THE SOURCE USES, not only in English. Measured
// live on a chaebol run, 2026-10-01: Yeri came back as "...the \u5fd9\u5185", the word
// carried over from the library line this call was restaging - and across the zh
// library the ONE field where that word stands alone with no other idol word beside
// it is hers, which is why the scan catches her and nobody else. A rule written in
// English about a token the model is copying in Chinese is a rule it can follow and
// still break. Same reason section 6's address table bans the native substitutes BY
// NAME rather than saying "keep it Korean".
//
// The substitute is supplied, because a prohibition with nothing behind it gets
// routed around: in a family, an office or a cohort the youngest member really is
// the \ub9c9\ub0b4, so the rule says to use plain words rather than pretending the
// fact does not exist.
//
// THE RESTAGING LAW, and the five-field schema, written ONCE and rendered by both
// prompts. The whole-cast call and the single-member fallback forbid the same list
// because they are one rule - and two copies of one rule is what extractStoryText
// is this repo's standing warning about, where the copies drifted and the guard
// had been written against the one that was still correct.
function restageLaw(lang) {
  return `KEEP WHO SHE IS AND CHANGE ONLY THE CIRCUMSTANCES. Her temperament, what she shows
and what she hides, how she behaves while she is watched - all of that survives.
What must go is every fact that only holds for a performing idol: no stage, no
debut, no comeback, no fandom, no album, no variety show, and no rank in a
performing group such as leader, main vocal, visual or maknae - IN ANY LANGUAGE OR
TRANSLITERATION, including \u961f\u957f, \u4e3b\u5531, \u95e8\u9762, \u5fd9\u5185. If she is simply the
youngest or the most senior of this cast, say that in plain words; do not reach for
the group-rank word. Restage each trait inside the setting above instead.

Do not invent a real company, school or family name. Do not contradict the opening
scene. Write every field in ${lang} and add no field that is not listed.`;
}

const DETAIL_SCHEMA = `{
  "world_position": "what she does in THIS setting - a short noun phrase, the way a role in a group would be written, e.g. a position, a year, a job",
  "public_image": "the persona the people around her see, 1-2 sentences",
  "queer_texture": "how attraction to a woman surfaces in her specifically, 1-2 sentences",
  "speech_style": "how she talks - register, rhythm, verbal tics, 1 sentence",
  "hidden_conflict": "the tension she carries and hides, 1 sentence"
}`;

// NO NEW WORLD FIELD, which is why §4.5's `world.setting` is still not shipped: the
// world already answers what a restaging wants, and because these are the same
// fields the ROLE CONTRACT and section 11 render, the generated detail cannot
// contradict the rest of the prompt.
function settingBlock(world) {
  const places = (world?.places || []).slice(0, 6).map((pl) => pl.name).filter(Boolean).join(", ");
  return `THE SETTING
- What these people do all day: ${world?.castLife?.theirs || ""}
- The kind of organisation they belong to: ${world?.castLore?.orgNoun || ""}
- Where the story opens: ${world?.scenario || ""}
- Places that exist in it: ${places}`;
}

// Her existing lines go in as the SOURCE, not as an example: a restaging with
// nothing to restage invents a stranger.
function sourceLines(member) {
  const was = (label, v) => (String(v || "").trim() ? `- ${label}: ${v}` : null);
  return [was("Private personality", member?.private_personality),
    was("Public image", member?.public_image),
    was("Queer texture", member?.queer_texture),
    was("Speech style", member?.speech_style),
    was("Hidden conflict", member?.hidden_conflict),
    was("Habit", member?.habit)].filter(Boolean).join("\n");
}

// ONE renderer for the ladder rows, so the whole-cast prompt and the single-member
// one cannot come to disagree about what the order is, or about how a position that
// is already taken reads. A member the editor already restaged is never a target,
// and her position is exactly the one the others must not collide with - so it is
// printed rather than left implicit.
function ladderRows(ladder, byId, isTarget, keyed) {
  return ladder.map((r, i) => {
    const year = r.year ? ` (b.${r.year})` : "";
    if (isTarget(r.id)) {
      const mark = keyed ? `WRITE HER, key "${i + 1}"` : "the one you are writing";
      return `${i + 1}. ${r.name}${year}  <- ${mark}`;
    }
    const taken = String(byId.get(String(r.id))?.world_position || "").trim();
    return `${i + 1}. ${r.name}${year}${taken ? `  <- already placed as: ${taken}. Do not reuse her position.` : ""}`;
  }).join("\n");
}

function castById(members) {
  return new Map((members || []).filter((m) => m && m.id != null).map((m) => [String(m.id), m]));
}

export function buildWorldDetailPrompt(member, world, language = "zh", cast = []) {
  const lang = LANGUAGE_NAME[language] || LANGUAGE_NAME.zh;
  // THE CAST BLOCK, and it is the fix for a defect only a live read found: five
  // members restaged CONCURRENTLY from five prompts that each showed one member
  // produced two second daughters of one family, and a hierarchy nobody assigned.
  // The model was not ignoring a rule - the prompt never said she was one of
  // several, so there was no rule it could apply. Carry the fact, state the rule,
  // and point the rule at the fact: the shape [KKT Channels] and [Rounds Absent]
  // already use one layer down.
  //
  // It REDUCES the collision and cannot close it, which is why buildCastDetailPrompt
  // exists. This prompt is now the FALLBACK path: the member nobody placed in the
  // one whole-cast call, and the editor's single-member restaging, which runs from a
  // screen where the roster may not exist yet.
  const ladder = seniorityLadder(cast);
  const meIdx = ladder.findIndex((r) => (member?.id && r.id === member.id) || r.name === member?.name);
  const meId = meIdx === -1 ? null : String(ladder[meIdx].id);
  const castBlock = ladder.length > 1 && meIdx !== -1 ? `

THE REST OF THE CAST, oldest first. She is ONE OF THESE PEOPLE, not the only one:
${ladderRows(ladder, castById(cast), (id) => String(id) === meId, false)}

Her position must be DISTINCT from every other member's - two of them holding the
same place in the same organisation is the one thing that cannot be true of this
list - and it must sit consistently on the order above, where an older member is
not the junior of a younger one. Write only her; the others are named so that you
do not collide with them.` : "";
  return `You are restaging one cast member of a dating sim into a different setting.

${settingBlock(world)}${castBlock}

HER, AS SHE WAS WRITTEN FOR A DIFFERENT SETTING
- Name: ${member?.name || ""}
${sourceLines(member)}

${restageLaw(lang)}

Output ONLY valid JSON, no markdown fences, with exactly these keys:

${DETAIL_SCHEMA}`;
}

/**
 * ONE call that places the WHOLE cast.
 *
 * The birth-year ladder lets each of N concurrent calls INFER what the others will
 * avoid, and inference is not agreement - measured, it took the collision from two
 * of five to one of five and could not close it. Only a call that sees every member
 * at once can hold their positions apart, because they are then in one context, next
 * to each other.
 *
 * It costs LESS TO SEND and MORE TO WAIT FOR, and both halves are measured. The
 * setting, the ladder and the law go once instead of N times: 3,741 characters for
 * five members against 12,179 for five separate prompts, and 4.2x at nine. But the
 * five answers are written one after another inside ONE response where N calls
 * write in parallel, so the wall clock went the other way - 5.2s against 2.2s for
 * the same cast, back to back on deepseek-flash. It scales the wrong way with cast
 * size, and that is the price of the only thing that can hold the positions apart.
 *
 * KEYED BY LADDER POSITION, never by member id. A custom member's id is a timestamp,
 * so keying on ids asks the model to echo a 13-digit number per member - a
 * transcription task beside a writing one, and the one place a single wrong digit
 * silently hands one member's profile to another. The numbers are already printed.
 */
export function buildCastDetailPrompt(members = [], world, language = "zh", targetIds = null) {
  const lang = LANGUAGE_NAME[language] || LANGUAGE_NAME.zh;
  const ladder = seniorityLadder(members);
  const byId = castById(members);
  const wanted = new Set((targetIds
    ? targetIds
    : ladder.filter((r) => !isUsableDetail(byId.get(String(r.id)))).map((r) => r.id)
  ).map(String));
  const isTarget = (id) => wanted.has(String(id));
  const keys = ladder.map((r, i) => (isTarget(r.id) ? String(i + 1) : null)).filter(Boolean);
  const blocks = ladder
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => isTarget(r.id))
    .map(({ r, i }) => `[${i + 1}] ${r.name}\n${sourceLines(byId.get(String(r.id)) || {})}`)
    .join("\n\n");

  return `You are restaging the cast of a dating sim into a different setting.

${settingBlock(world)}

THE WHOLE CAST, oldest first. The number in front of a member is her key in your answer:
${ladderRows(ladder, byId, isTarget, true)}

EVERY POSITION YOU WRITE MUST BE DIFFERENT from every other position in that list,
including the ones already placed - two of them holding the same place in the same
organisation is the one thing that cannot be true of this list - and they must sit
consistently on the order above, where an older member is not the junior of a
younger one.

EACH MEMBER YOU ARE WRITING, AS SHE WAS WRITTEN FOR A DIFFERENT SETTING

${blocks}

${restageLaw(lang)}

Output ONLY valid JSON, no markdown fences. The top level is an object whose keys are
exactly these numbers and no others: ${keys.join(", ")}. Each value is an object with
exactly these keys:

${DETAIL_SCHEMA}`;
}

/**
 * The per-field normalisation a detail gets, written once for both parsers.
 *
 * One line per field: the profile block renders each as one line, and a newline
 * inside would break the line-per-field shape the prompt relies on.
 */
function normalizeDetail(obj) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const f of WORLD_FIELDS) {
    const v = obj[f];
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    if (str) out[f] = str.replace(/\s*[\r\n]+\s*/g, " ");
  }
  return out;
}

/** Pull a world-detail object out of whatever the model returned. */
export function parseWorldDetail(text) {
  return normalizeDetail(parseJsonish(text));
}

/**
 * Pull a whole cast's details out of one response, keyed back onto member ids.
 *
 * A RETURNED KEY IS UNTRUSTED TEXT, so resolution is tolerant and then strict: a key
 * counts if it is a ladder position in range, a member id, or a member name - and
 * then only if it names a member this call actually asked for. Anything else is
 * DROPPED rather than guessed at, because the per-member pass covers whoever is left,
 * so discarding costs one small call and misattributing costs the player a member
 * wearing somebody else's life.
 */
export function parseCastDetail(text, members = [], targetIds = null) {
  const obj = parseJsonish(text);
  if (!obj) return {};
  const ladder = seniorityLadder(members);
  const allowed = new Set((targetIds ? targetIds : ladder.map((r) => r.id)).map(String));
  const byRawId = new Map(ladder.map((r) => [String(r.id), r.id]));
  const byName = new Map();
  for (const r of ladder) {
    const k = String(r.name || "").trim().toLowerCase();
    if (k && !byName.has(k)) byName.set(k, r.id);
  }

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const k = String(key).trim();
    let id;
    // Position first: the numbers are what the prompt asked for, and a member id
    // that is all digits is a custom member's timestamp, never a small integer.
    if (/^\d+$/.test(k) && Number(k) >= 1 && Number(k) <= ladder.length) id = ladder[Number(k) - 1].id;
    if (id === undefined && byRawId.has(k)) id = byRawId.get(k);
    if (id === undefined) id = byName.get(k.toLowerCase());
    if (id === undefined || !allowed.has(String(id)) || out[id] !== undefined) continue;
    const detail = normalizeDetail(value);
    if (isUsableDetail(detail)) out[id] = detail;
  }
  return out;
}

/**
 * A detail is only usable if it carries `world_position`.
 *
 * NOT `Object.keys(...).length > 0`, which is what a card needs, and the difference
 * matters downstream: `world_position` is the ONE marker the prompt reads to decide
 * whether a member still needs §22.1's interim rule. A partial detail carrying two
 * prose fields and no position would count as translated while rendering nothing in
 * the slot `useRole` emptied - a member with no statement of what she does at all,
 * which is worse than the idol prose the rule was written for.
 */
export function isUsableDetail(detail) {
  return Boolean(detail && String(detail.world_position || "").trim());
}

/**
 * Restage one member in one world. Never throws.
 *
 * AN ACCELERATOR, NEVER A GATE - `generateCard`'s own law, and here it is what the
 * §22.1 rule's condition is built on: a failure returns no detail, the member stays
 * un-translated, and the prompt keeps telling the model to read her lines for traits
 * rather than facts. Nothing about character creation blocks on a provider.
 */
export async function generateWorldDetail({
  member, world, language = "zh", apiKey, modelId = "deepseek",
  aliyun = null, reasoningEnabled = false, cast = [],
} = {}) {
  if (!member?.name || !world) return { ok: false, detail: {}, reason: "bad_request" };
  const prompt = buildWorldDetailPrompt(member, world, language, cast);
  const usable = (content) => {
    try { return isUsableDetail(parseWorldDetail(content)); } catch { return false; }
  };
  try {
    const raw = await callLLM(
      prompt, [], "", apiKey, modelId, null, reasoningEnabled, aliyun, usable);
    const detail = parseWorldDetail(raw);
    return isUsableDetail(detail)
      ? { ok: true, detail }
      : { ok: false, detail: {}, reason: "bad_response" };
  } catch (e) {
    console.error("[worldDetail] generation failed:", e?.kind || "unknown", e?.message || e);
    return { ok: false, detail: {}, reason: e?.kind || "unknown" };
  }
}

/**
 * Restage a whole cast in TWO passes, and never fail the run.
 *
 * PASS 1 is one call carrying every member, because distinctness is the one property
 * N independent calls cannot promise however well each one is briefed - the ladder
 * took the measured collision from two of five to one of five and stopped there.
 * Positions can only be held apart by something that sees them together.
 *
 * PASS 2 is the per-member concurrent sweep, for whoever pass 1 left out: a member it
 * skipped, a member whose object carried no `world_position`, or everyone if the call
 * failed outright. So each member gets TWO chances rather than one, and a provider
 * that dies halfway costs the run nothing it did not already cost - an accelerator,
 * never a gate.
 *
 * The common case is one round-trip where it used to be N. That is a smaller bill
 * and a LONGER wait - see the measurement above; it is a deliberate trade of a few
 * seconds at a one-time setup boundary for a cast that can all be true at once.
 *
 * Members who ALREADY carry a detail are asked for in neither pass, so the Start
 * boundary does not re-pay for anyone the editor generated - and cannot overwrite a
 * line the player reviewed and corrected. They are still printed in the ladder, as
 * positions that are taken.
 */
export async function generateCastDetail({
  members = [], world, language = "zh", apiKey, modelId = "deepseek",
  aliyun = null, onProgress = null,
} = {}) {
  const todo = members.filter((m) => m?.name && !isUsableDetail(m));
  if (!todo.length || !world) {
    return { detailById: {}, asked: 0, failed: 0, fromCastCall: 0, castCall: "skipped" };
  }
  const targetIds = todo.map((m) => m.id);

  // ---- pass 1: one call for all of them ------------------------------------
  const detailById = {};
  let castCall = "ok";
  try {
    const prompt = buildCastDetailPrompt(members, world, language, targetIds);
    // AT LEAST ONE member, not all of them. validateContent fires bad_response and
    // retries when it returns false, so demanding the full set would spend two
    // retries on a response that is mostly right and then fall back for everybody.
    // At one, a response covering four of five is kept and the fifth costs one call.
    const usable = (content) => {
      try { return Object.keys(parseCastDetail(content, members, targetIds)).length > 0; }
      catch { return false; }
    };
    const raw = await callLLM(prompt, [], "", apiKey, modelId, null, false, aliyun, usable);
    Object.assign(detailById, parseCastDetail(raw, members, targetIds));
    if (!Object.keys(detailById).length) castCall = "empty";
  } catch (e) {
    console.error("[castDetail] whole-cast call failed:", e?.kind || "unknown", e?.message || e);
    castCall = e?.kind || "unknown";
  }
  const fromCastCall = Object.keys(detailById).length;
  let done = fromCastCall;
  onProgress?.(done, todo.length);

  // ---- pass 2: whoever pass 1 did not place --------------------------------
  // The cast handed to the fallback carries pass 1's positions, so the member being
  // re-asked is told which places are already taken rather than guessing again.
  const placed = members.map((m) => (detailById[m.id] ? { ...m, ...detailById[m.id] } : m));
  const missing = todo.filter((m) => !detailById[m.id]);
  const results = await Promise.all(missing.map(async (m) => {
    const res = await generateWorldDetail({
      member: m, world, language, apiKey, modelId, aliyun, cast: placed,
    });
    onProgress?.(++done, todo.length);
    return [m.id, res];
  }));
  let failed = 0;
  for (const [id, res] of results) {
    if (res.ok) detailById[id] = res.detail; else failed += 1;
  }
  return { detailById, asked: todo.length, failed, fromCastCall, castCall };
}
