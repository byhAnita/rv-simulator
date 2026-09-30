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

export function buildWorldDetailPrompt(member, world, language = "zh", cast = []) {
  const lang = LANGUAGE_NAME[language] || LANGUAGE_NAME.zh;
  const places = (world?.places || []).slice(0, 6).map((pl) => pl.name).filter(Boolean).join(", ");
  const was = (label, v) => (String(v || "").trim() ? `- ${label}: ${v}` : null);
  // THE CAST BLOCK, and it is the fix for a defect only a live read found: five
  // members restaged CONCURRENTLY from five prompts that each showed one member
  // produced two second daughters of one family, and a hierarchy nobody assigned.
  // The model was not ignoring a rule - the prompt never said she was one of
  // several, so there was no rule it could apply. Carry the fact, state the rule,
  // and point the rule at the fact: the shape [KKT Channels] and [Rounds Absent]
  // already use one layer down.
  const ladder = seniorityLadder(cast);
  const meIdx = ladder.findIndex((r) => (member?.id && r.id === member.id) || r.name === member?.name);
  const castBlock = ladder.length > 1 && meIdx !== -1 ? `

THE REST OF THE CAST, oldest first. She is ONE OF THESE PEOPLE, not the only one:
${ladder.map((r, i) => `${i + 1}. ${r.name}${r.year ? ` (b.${r.year})` : ""}${i === meIdx ? "  <- the one you are writing" : ""}`).join(String.fromCharCode(10))}

Her position must be DISTINCT from every other member's - two of them holding the
same place in the same organisation is the one thing that cannot be true of this
list - and it must sit consistently on the order above, where an older member is
not the junior of a younger one. Write only her; the others are named so that you
do not collide with them.` : "";
  return `You are restaging one cast member of a dating sim into a different setting.

THE SETTING
- What these people do all day: ${world?.castLife?.theirs || ""}
- The kind of organisation they belong to: ${world?.castLore?.orgNoun || ""}
- Where the story opens: ${world?.scenario || ""}
- Places that exist in it: ${places}${castBlock}

HER, AS SHE WAS WRITTEN FOR A DIFFERENT SETTING
- Name: ${member?.name || ""}
${[was("Private personality", member?.private_personality),
  was("Public image", member?.public_image),
  was("Queer texture", member?.queer_texture),
  was("Speech style", member?.speech_style),
  was("Hidden conflict", member?.hidden_conflict),
  was("Habit", member?.habit)].filter(Boolean).join("\n")}

KEEP WHO SHE IS AND CHANGE ONLY THE CIRCUMSTANCES. Her temperament, what she shows
and what she hides, how she behaves while she is watched - all of that survives.
What must go is every fact that only holds for a performing idol: no stage, no
debut, no comeback, no fandom, no album, no variety show, and no rank in a
performing group such as leader, main vocal or maknae. Restage each trait inside
the setting above instead.

Do not invent a real company, school or family name. Do not contradict the opening
scene. Write every field in ${lang} and add no field that is not listed.

Output ONLY valid JSON, no markdown fences, with exactly these keys:

{
  "world_position": "what she does in THIS setting - a short noun phrase, the way a role in a group would be written, e.g. a position, a year, a job",
  "public_image": "the persona the people around her see, 1-2 sentences",
  "queer_texture": "how attraction to a woman surfaces in her specifically, 1-2 sentences",
  "speech_style": "how she talks - register, rhythm, verbal tics, 1 sentence",
  "hidden_conflict": "the tension she carries and hides, 1 sentence"
}`;
}

/** Pull a world-detail object out of whatever the model returned. */
export function parseWorldDetail(text) {
  const obj = parseJsonish(text);
  if (!obj) return {};
  const out = {};
  for (const f of WORLD_FIELDS) {
    const v = obj[f];
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    // One line per field: the profile block renders each as one line, and a
    // newline inside would break the line-per-field shape the prompt relies on.
    if (str) out[f] = str.replace(/\s*[\r\n]+\s*/g, " ");
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
 * Restage a whole cast, concurrently, and never fail the run.
 *
 * CONCURRENT because the wait is what decision A costs the player: run in series,
 * nine members is nine round-trips in front of a Start button; run together, it is
 * roughly one. PER-MEMBER FALLBACK because a dead provider must not block character
 * creation - a member who fails is simply absent from the map, which is exactly the
 * state §22.1's narrowed rule still covers.
 *
 * Members who ALREADY carry a detail are skipped, so the Start-boundary sweep does
 * not re-pay for anyone the editor already generated - and so it cannot overwrite a
 * line the player reviewed and corrected.
 */
export async function generateCastDetail({
  members = [], world, language = "zh", apiKey, modelId = "deepseek",
  aliyun = null, onProgress = null,
} = {}) {
  const todo = members.filter((m) => m?.name && !isUsableDetail(m));
  let done = 0;
  const results = await Promise.all(todo.map(async (m) => {
    // Every call gets the WHOLE cast, so each one knows the others exist and where
    // she sits among them. Concurrency survives because the ladder is derived from
    // data fixed at setup rather than from what another call happened to return - a
    // sweep that waited to read its own output would be N round-trips in front of a
    // Start button, which is the cost decision A was taken to avoid.
    const res = await generateWorldDetail({
      member: m, world, language, apiKey, modelId, aliyun, cast: members,
    });
    onProgress?.(++done, todo.length);
    return [m.id, res];
  }));
  const detailById = {};
  let failed = 0;
  for (const [id, res] of results) {
    if (res.ok) detailById[id] = res.detail; else failed += 1;
  }
  return { detailById, asked: todo.length, failed };
}
