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
export const CARD_FIELDS = [
  "name", "birthday",
  "private_personality", "public_image", "queer_texture",
  "speech_style", "habit", "animal_plastic", "hidden_conflict",
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
  "animal_plastic": "an animal comparison plus the twist, e.g. 'white rabbit - looks aloof, fiercely protective'",
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
  if (typeof text !== "string" || !text.trim()) return {};

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
    try { obj = JSON.parse(fixed); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const out = {};
  for (const f of CARD_FIELDS) {
    const v = obj[f];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    // A habit must be one line — the profile block renders it as one, and a
    // newline inside it would break the line-per-field shape the prompt relies
    // on. Same reason smoke rejects a multi-line habit in the group library.
    if (s) out[f] = s.replace(/\s*[\r\n]+\s*/g, " ");
  }
  return out;
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
