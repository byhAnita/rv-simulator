// src/rag/worldLoader.js
//
// A world is the half of the old "group" concept that is not the cast: the
// setting's identities, story modes, phase beats, NPC archetypes and — the part
// that is easy to mistake for a language concern — its address forms.
//
// Fetched at runtime from public/worlds/, exactly like group JSON, so the
// prefix comes from the build and never from the hostname. See groupLoader.js
// for why that rule exists.

// Extensionless would be fine under Vite and is what every other src module writes, but
// smoke imports this file RAW under Node - no bundler - and Node needs the extension. Same
// reason imageStore.js names its own import "../utils.js".
import { SOCIAL_PLATFORM_IDS, PRIVATE_PLATFORM_IDS } from "../config/platformConfig.js";

const base = () => import.meta.env.BASE_URL;

export const DEFAULT_WORLD_ID = "kpop_idol";

// The four story modes. The IDS are universal across every world and the RULES
// are each world's own, which is what lets the picker be one control in i18n
// instead of a per-world list coupled to it by position.
//
// `PACES` in App.jsx was that positional list — `t.paces.map((p, i) => … PACES[i])`
// — and it is deleted in v1.4.1 step 2 rather than extended per world. A campus
// world with its own pace ids would have written a kpop id into `form.pace`,
// `getPaceRule` would have resolved nothing, and the prompt would have carried a
// bare Chinese id: the dead-code bug step 3 of v1.4.0 fixed, returning through a
// different door. Universal ids delete the coupling instead of guarding it.
export const MODE_IDS = ["free", "romance", "pressure", "dramatic"];

// The prompt's per-language prose rules, in `public/worlds/_registers/<lang>.json`
// under `prose`. DERIVED FROM, not duplicated beside: parseWorld validates against
// this list and smoke asserts all three language files carry every key, so a rule
// added here without a translation fails the suite instead of going missing in one
// language — the releaseNotes.js lesson, where a hole is invisible until a Korean
// player opens the game.
export const PROSE_KEYS = [
  "length", "style", "openWith", "profileCritical",
  "socialFreshness", "tone", "sceneRule", "storyRule",
];

/**
 * Substitute `{key}` in ONE prose rule.
 *
 * Deliberately NOT `renderCastLore`, which drops a line whose value is missing.
 * That is right for optional lore (`Fandom: {fandom}.` disappears for a cast with
 * no fanbase) and WRONG here: a prose rule that vanishes because a placeholder was
 * empty is a prompt that silently stops asking for something, which is the defect
 * this whole block exists to prevent. Both an unknown placeholder and an empty
 * value throw.
 */
export function renderProse(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`prose template: unknown placeholder {${key}}`);
    const v = vars[key];
    if (v === undefined || v === null || v === "") {
      throw new Error(`prose template: empty value for {${key}}`);
    }
    return v;
  });
}

// The story mode is a live SETTING, not a save field, so it is seeded once from
// the pace the player last chose rather than migrated. Same pattern as
// `resolvePaidModel` taking `rv_sim_qwen_submodel`: read the legacy value, write
// the new key, never write the legacy one again. `form.pace` then goes dead in the
// save exactly like `starLevel` — which costs nothing and needs no schema bump,
// and keeps `backstorySeed` hashing the same value it always did.
const PACE_TO_MODE = {
  "慢热现实向": "free",
  "浪漫情感向": "romance",
  "高压舆论向": "pressure",
  "修罗海王向": "dramatic",
};

/**
 * Which story mode this player is in: the one she chose, or the one implied by
 * the pace her save was built with.
 *
 * ONE function and PURE, taking the stored value rather than reading it. Two
 * functions — "map a pace" and "decide which wins" — would be two answers to one
 * question, and reading localStorage in here would make the rule testable only by
 * driving a browser. That is the `addSaveSlot` argument: the reason it is a pure
 * exported function is that a rule reachable only through the UI is a rule nobody
 * has seen fail.
 *
 * An unknown or absent pace becomes `free`, which is also a new game's default:
 * "no authored plot events, the relationship is the plot" is what the game has
 * always been. A stored mode always wins — a player who has chosen one must never
 * be moved by a save's legacy field.
 */
export function resolveStoryMode(stored, legacyPace) {
  if (MODE_IDS.includes(stored)) return stored;
  return PACE_TO_MODE[legacyPace] || "free";
}

/**
 * Load the world index — the picker's lazy-load boundary, the same shape as
 * groups/index.json: one row per world, no world document fetched until one is
 * chosen.
 */
export async function loadWorldIndex() {
  const response = await fetch(`${base()}worlds/index.json`);
  if (!response.ok) throw new Error(`world index load failed (HTTP ${response.status})`);
  const list = await response.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error("world index is empty");
  return list;
}

// Address forms are keyed on (world, language), never on language alone: Korean
// seniority is a birth-year boundary and these honorifics are how it is spoken,
// so a Tokyo setting needs 先輩/さん/ちゃん and a different rule for who outranks
// whom. But four worlds all set in Korea must not carry four copies of one
// table — that is how the two copies of `extractStoryText` drifted, and the
// guard was written against the copy that was still correct. So a world names a
// REGISTER and the tables live together, one file per language.
async function loadRegisters(language) {
  const response = await fetch(`${base()}worlds/_registers/${language}.json`);
  if (response.ok) return response.json();
  if (language !== "zh") {
    console.warn(`worlds/_registers/${language}.json not found, falling back to zh.json`);
    const fallback = await fetch(`${base()}worlds/_registers/zh.json`);
    if (fallback.ok) return fallback.json();
  }
  throw new Error(`address register load failed: ${language} (HTTP ${response.status})`);
}

/**
 * Load a world document.
 * @param {string} worldId - matches the folder name under public/worlds/
 * @param {string} language - zh/en/ko
 * @returns {Promise<object>} parsed world
 */
export async function loadWorld(worldId = DEFAULT_WORLD_ID, language = "zh") {
  const url = `${base()}worlds/${worldId}/${language}.json`;

  const [response, registers] = await Promise.all([fetch(url), loadRegisters(language)]);
  if (response.ok) return parseWorld(await response.json(), worldId, language, registers);

  // A missing translation falls back to zh, the language every world is
  // authored in first. A missing world does not fall back to anything.
  if (language !== "zh") {
    console.warn(`worlds/${worldId}/${language}.json not found, falling back to zh.json`);
    const fallback = await fetch(`${base()}worlds/${worldId}/zh.json`);
    if (fallback.ok) {
      return parseWorld(await fallback.json(), worldId, "zh", await loadRegisters("zh"));
    }
  }
  throw new Error(`world load failed: ${worldId}/${language} (HTTP ${response.status})`);
}

// Required top-level keys. `parseGroupConfig` is a field whitelist and silently
// dropped `birthday` for two releases, so this validates instead of copying:
// a world missing a key fails loudly at load rather than reaching
// buildSystemPrompt as a blank section nobody notices until the writing drifts.
// `addressForms` is NOT on this list any more: it no longer lives in the world
// file at all, and is resolved from the register the world's country names.
// `useGroupLore` is checked for `undefined` rather than truthiness, because
// `false` is the answer for every world but this one.
// `paces` is NOT here. Step 2 replaced it with `modes`, and leaving it required
// would make the three worlds step 7 authors write four pace rules with no
// reader — the `NPC_APPEARANCE_CHANCE` shape this project tracks four times.
const REQUIRED = ["world", "country", "setting", "tone", "statNotes", "platforms",
  "castLore", "useGroupLore", "identities", "modes", "phases", "places",
  "scenario", "npcArchetypes", "addressContext", "castLife"];

export function parseWorld(config, worldId = DEFAULT_WORLD_ID, language = "zh", registers = null) {
  const where = `${worldId}/${language}`;
  for (const key of REQUIRED) {
    if (config?.[key] === undefined) throw new Error(`world ${where}: missing "${key}"`);
  }
  const { world, country, setting, tone, statNotes, platforms, castLore, useGroupLore,
    identities, modes, phases, places, scenario, npcArchetypes, addressContext, castLife } = config;

  for (const [key, value] of [["identities", identities],
    ["phases", phases], ["places", places]]) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`world ${where}: "${key}" must be a non-empty array`);
    }
  }
  for (const p of places) {
    if (!p?.id || !p?.name) throw new Error(`world ${where}: every place needs an id and a name`);
  }
  for (const id of MODE_IDS) {
    if (typeof modes?.[id] !== "string" || !modes[id]) {
      throw new Error(`world ${where}: "modes" is missing "${id}"`);
    }
  }
  // Section 4's cast framing. Hardcoded in rosterResolver.js until v1.4.1, where
  // it described every cast as an N-member group under an Entertainment agency —
  // true of this world and false of a lecture hall.
  if (!Array.isArray(castLore?.composed) || !Array.isArray(castLore?.subset)) {
    throw new Error(`world ${where}: "castLore" needs "composed" and "subset" arrays`);
  }
  // What the cast's organisation IS, in the player's language, for the one Setup
  // field that names it. `orgNoun` is a single word so the i18n templates can
  // supply the grammar around it (zh `${noun}名`, en `${noun} name`, ko
  // `${noun} 이름`) — the world owns the noun, the language owns the sentence.
  // `orgHint` cannot be derived that way: "they debut as one group" and "they
  // study at the same school" are different claims, not one sentence with a
  // different noun in it.
  //
  // `orgSuffix` MAY be empty (a university's name is already the university), so
  // it is checked for being a string and not for truthiness — the `ya` rule one
  // block down, where an absent token is meaningful.
  for (const k of ["orgNoun", "orgHint"]) {
    if (typeof castLore?.[k] !== "string" || !castLore[k]) {
      throw new Error(`world ${where}: "castLore.${k}" must be a non-empty string`);
    }
  }
  if (typeof castLore?.orgSuffix !== "string") {
    throw new Error(`world ${where}: "castLore.orgSuffix" must be a string ("" is legal)`);
  }
  if (!castLore.orgHint.includes("{org}")) {
    throw new Error(`world ${where}: "castLore.orgHint" must carry {org}`);
  }
  // Whether a member's idol `role` (`Main Vocal`, `Maknae`) reaches the prompt at
  // all. It is a position in an idol GROUP, so a campus world would otherwise
  // describe a student as a main vocal and an office world an analyst as a maknae
  // — the `[BLACKPINK Background]` shape, a specific-sounding claim two sections
  // from the rule it contradicts. `role` stays in the group library either way:
  // this filters what the model is shown, not what the app stores.
  //
  // Checked for being a boolean rather than for truthiness, like `useGroupLore`:
  // `false` is the answer for every world but this one, and a missing flag must
  // fail rather than read as a decision nobody made.
  if (typeof castLore?.useRole !== "boolean") {
    throw new Error(`world ${where}: "castLore.useRole" must be true or false`);
  }
  if (!Array.isArray(platforms?.social) || typeof platforms?.private !== "string") {
    throw new Error(`world ${where}: "platforms" needs a social array and a private string`);
  }
  // A platform the app has no overlay for is a typo in a world file, and it renders as a
  // top-bar button that opens nothing - so it throws, the same rule an unknown address
  // register follows. The offending id is named, because a message that only says the
  // field is wrong sends the reader back to the file to guess which entry.
  // A MODEL naming an undeclared platform is the opposite case and is filtered, not
  // raised: see filterSocialByPlatforms.
  for (const id of platforms.social) {
    if (!SOCIAL_PLATFORM_IDS.includes(id)) {
      throw new Error(`world ${where}: "platforms.social" names ${id}, which the app has no overlay for`);
    }
  }
  if (!PRIVATE_PLATFORM_IDS.includes(platforms.private)) {
    throw new Error(`world ${where}: "platforms.private" names ${platforms.private}, which the app has no overlay for`);
  }
  // Section 10 prints one note per stat and the three stat keys are permanent, so
  // all three are required by name. An absent one would render as `undefined` in
  // the cached prefix, which is the class of defect the conditional member fields
  // exist to prevent - and there is nothing conditional about a stat every save has.
  for (const k of ["selfId", "secrecy", "mood"]) {
    if (typeof statNotes?.[k] !== "string" || !statNotes[k]) {
      throw new Error(`world ${where}: "statNotes.${k}" must be a non-empty string`);
    }
  }

  // What these five people actually DO all day, which is the most world-specific
  // fact there is and was four English literals in buildSystemPrompt until step 7.
  // The ROLE CONTRACT enumerated `practice, schedules, comebacks, the dorm, this
  // company` in every world - so a campus prompt asserted, two sections after
  // section 4 called them students, that the cast have comebacks and a company.
  // That is the [BLACKPINK Background] shape: a specific claim in an authoritative
  // section contradicting a general rule elsewhere, and the model may build on it.
  //
  // English, like sections 6 and 7 themselves, so these sit in the
  // language-invariant half. `kpop_idol` declares exactly what it already rendered.
  for (const k of ["theirs", "notHers", "recentBeat", "sceneExample", "socialReach"]) {
    if (typeof castLife?.[k] !== "string" || !castLife[k]) {
      throw new Error(`world ${where}: "castLife.${k}" must be a non-empty string`);
    }
  }
  // The work title's REGISTER, and which way it points.
  //
  // `addressContext` supplies the two words section 6 wraps the title in. They were
  // the literals "on the job" and "at work", which is true of an agency and of an
  // office and false of a lecture hall: a student does not address her professor on
  // the job. Two strings, English like the rest of section 6, and `kpop_idol`
  // declares exactly what it already rendered.
  for (const k of ["toPlayer", "toCast"]) {
    if (typeof addressContext?.[k] !== "string" || !addressContext[k]) {
      throw new Error(`world ${where}: "addressContext.${k}" must be a non-empty string`);
    }
  }
  // A work title points AT the player or AT the cast, and until step 7 that was one
  // hardcoded identity id in mainAgent.js. Four of step 7's identities point it at
  // the cast, and every one of them would have rendered the sentence backwards -- the
  // inverted age line again, followed correctly because it was stated wrongly.
  //
  // Absent means to_player, so no existing entry is edited into saying what it
  // already meant. `because` is the reason clause the to_cast sentence needs and is
  // required with it; it is REFUSED without it, because a field the renderer cannot
  // reach is the shape this repo has already found seven times.
  for (const ident of identities) {
    const wt = ident?.workTitle;
    if (!wt) continue;
    if (typeof wt.form !== "string" || !wt.form || typeof wt.kr !== "string" || !wt.kr) {
      throw new Error(`world ${where}: identity "${ident.id}" has a workTitle without a form and a kr`);
    }
    if (wt.direction !== undefined && wt.direction !== "to_cast") {
      throw new Error(`world ${where}: identity "${ident.id}" has workTitle.direction "${wt.direction}"; the only value is "to_cast" (absent means the title points at the player)`);
    }
    if (wt.direction === "to_cast" && (typeof wt.because !== "string" || !wt.because)) {
      throw new Error(`world ${where}: identity "${ident.id}" points its title at the cast and must say why in workTitle.because`);
    }
    if (wt.direction === undefined && wt.because !== undefined) {
      throw new Error(`world ${where}: identity "${ident.id}" has workTitle.because with no direction, which nothing renders`);
    }
  }
  // The register is resolved HERE rather than carried in the world file, so
  // `world.addressForms` still exists for buildSystemPrompt while exactly one
  // copy of the table exists on disk.
  const registerId = country?.register;
  if (!registerId) throw new Error(`world ${where}: "country.register" must name a register`);
  const addressForms = registers?.[registerId];
  if (!addressForms) throw new Error(`world ${where}: no address register "${registerId}"`);

  // The token table is what the whole address protocol reads. An absent `ya` is
  // meaningful (zh has no usable vocative particle — see CLAUDE.md), so it is
  // checked for presence of the key set rather than for truthiness.
  const tk = addressForms?.tokens;
  if (!tk || typeof tk !== "object") {
    throw new Error(`register ${registerId}/${language}: "tokens" must be an object`);
  }
  for (const k of ["unnie", "ya", "nim", "ssi", "sep"]) {
    if (!(k in tk)) throw new Error(`register ${registerId}/${language}: tokens is missing "${k}"`);
  }
  if (typeof addressForms.guide !== "string") {
    throw new Error(`register ${registerId}/${language}: "guide" must be a string`);
  }

  // `prose` is the per-LANGUAGE half of the prompt: the rules that decide how the
  // story SOUNDS, authored in the language they are about rather than described in
  // English. It lives in the SAME document as the address register, and for the
  // same reason the register does — these are facts about a LANGUAGE, not about a
  // setting, so four worlds must not carry four copies of one paragraph.
  //
  // Measured on the rendered zh golden, v1.3.9 against v1.4.2: the static prompt
  // grew 37% and the Chinese share of its characters FELL from 18.4% to 16.2%.
  // Every rule governing register — style, tone, the opening, the scene and story
  // rules — was an English sentence describing Chinese writing abstractly, which
  // is the condition that produces translationese, and it costs the weakest model
  // in a route first.
  //
  // A MISSING KEY THROWS; it does not fall back to English. A prose rule that
  // silently disappears is a prompt that quietly stops asking for something, and
  // the symptom is "the writing got worse" with nothing to bisect — the same
  // reasoning as the unknown-register throw above, applied to the half of the
  // prompt no diff makes obvious.
  const prose = registers?.prose;
  if (!prose || typeof prose !== "object") {
    throw new Error(`register ${language}: "prose" must be an object`);
  }
  for (const k of PROSE_KEYS) {
    if (typeof prose[k] !== "string" || !prose[k].trim()) {
      throw new Error(`register ${language}: prose is missing "${k}"`);
    }
  }

  return {
    prose,
    id: world?.id || worldId,
    name: world?.name || worldId,
    emoji: world?.emoji || "",
    color: world?.color || "",
    country,
    setting,
    tone,
    statNotes,
    platforms,
    castLore,
    useGroupLore,
    identities,
    modes,
    phases,
    places,
    scenario,
    addressForms,
    npcArchetypes,
    addressContext,
    castLife,
  };
}

export const getIdentity = (world, id) =>
  world?.identities?.find((i) => i.id === id) || null;

// The rule carries its own `[Story Mode: X]` prefix, exactly as the pace rule
// carried `[Pace: X]`, so the caller adds no label of its own.
export const getModeRule = (world, id) => world?.modes?.[id] || "";

// ------------------------------------------------------------------
// Korean particles
// ------------------------------------------------------------------
// A Korean particle is chosen by the sound the preceding word ENDS in, and the
// word here is interpolated — `{name}` is whichever member the player picked, and
// the ex-girlfriend keepsake is one of four. So the author could not write one
// form: ko.json said `{name}는`, which is right for Joy and wrong for Irene, and
// `{keepsake}을/를`, which put a literal slash in every Korean prompt. Two of the
// ko backgrounds also carried `{reason}로`, giving `미숙함로` — plainly wrong.
//
// So the world file writes the pair in its conventional order and this resolves
// it. Consonant-final takes the FIRST form, vowel-final the SECOND — which is the
// order Korean writes them in anyway (은/는, 이/가, 을/를, 과/와).
const PARTICLE_PAIRS = ["은/는", "이/가", "을/를", "과/와", "으로/로"];

// A Hangul syllable encodes its own final consonant arithmetically: the jongseong
// index is (code - 0xAC00) % 28, and 0 means the syllable ends in a vowel. So for
// `{reason}` and `{keepsake}`, which are Korean, the answer is exact.
//
// A Latin word does NOT carry the answer, and guessing from its last letter is
// wrong often enough to be worse than not trying: Irene reads 아이린 and ends in a
// consonant while its last letter is a vowel, Winter reads 윈터 and ends in a vowel
// while its last letter is not. Member names are Latin stage names by design, so
// those resolve to the parenthetical dual form `은(는)` — which is exactly what
// Korean writes when the noun is a variable, and is never wrong.
const RIEUL = 8;   // the one jongseong that takes 로, not 으로 (서울로)

function finalSound(text) {
  const ch = (text || "").trimEnd().slice(-1);
  const code = ch.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return "unknown";
  const jongseong = (code - 0xac00) % 28;
  if (jongseong === 0) return "vowel";
  return jongseong === RIEUL ? "rieul" : "consonant";
}

/**
 * Replace every `은/는`-style particle pair with the form the preceding word takes,
 * or with `은(는)` where the preceding word is not Hangul and cannot decide.
 * Inert on text containing no pair, which is every non-Korean world file.
 */
export function resolveKoreanParticles(text) {
  let out = text;
  for (const pair of PARTICLE_PAIRS) {
    const [afterConsonant, afterVowel] = pair.split("/");
    out = out.replaceAll(pair, (_match, index, whole) => {
      const sound = finalSound(whole.slice(0, index));
      if (sound === "unknown") return `${afterConsonant}(${afterVowel})`;
      // ㄹ takes the vowel form of 으로/로 and the consonant form of everything else.
      if (sound === "rieul") return pair === "으로/로" ? afterVowel : afterConsonant;
      return sound === "consonant" ? afterConsonant : afterVowel;
    });
  }
  return out;
}

/**
 * Render an identity's background text.
 *
 * `{name}` is the main member. `{reason}` and `{keepsake}` exist only on the
 * ex-girlfriend identity and are picked from `variants` by `seed` — the same
 * two-index scheme the code used before the data moved out: separate bit ranges,
 * so the keepsake is not locked to the breakup reason. The seed comes from
 * backstorySeed(), which is why this is stable for the life of a save and why
 * the static prompt can be cached at all. See CLAUDE.md, "buildSystemPrompt must
 * be a pure function of the save".
 */
export function renderIdentityBackground(world, identityId, mainMemberName, seed = 0) {
  const entry = getIdentity(world, identityId);
  if (!entry?.background) return "";
  let out = entry.background.replaceAll("{name}", mainMemberName || "her");
  const v = entry.variants;
  if (v) {
    if (Array.isArray(v.reason) && v.reason.length > 0) {
      out = out.replaceAll("{reason}", v.reason[seed % v.reason.length]);
    }
    if (Array.isArray(v.keepsake) && v.keepsake.length > 0) {
      out = out.replaceAll("{keepsake}", v.keepsake[(seed >>> 16) % v.keepsake.length]);
    }
  }
  // Last, because a particle is chosen by the word in front of it and every word
  // in front of one here was just substituted in.
  return resolveKoreanParticles(out);
}
