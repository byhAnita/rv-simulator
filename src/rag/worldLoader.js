// src/rag/worldLoader.js
//
// A world is the half of the old "group" concept that is not the cast: the
// setting's identities, paces, phase beats, NPC archetypes and — the part that
// is easy to mistake for a language concern — its address forms.
//
// Fetched at runtime from public/worlds/, exactly like group JSON, so the
// prefix comes from the build and never from the hostname. See groupLoader.js
// for why that rule exists.

const base = () => import.meta.env.BASE_URL;

export const DEFAULT_WORLD_ID = "kpop_idol";

// The four story modes. The IDS are universal across every world and the RULES
// are each world's own, which is what lets the picker be one control in i18n
// instead of a per-world list coupled to it by position. `PACES` in App.jsx was
// that positional list, and a world with different ids would have written an id
// the world does not declare into `form.pace`.
export const MODE_IDS = ["free", "romance", "pressure", "dramatic"];

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
const REQUIRED = ["world", "country", "setting", "tone", "statNotes", "platforms",
  "castLore", "useGroupLore", "identities", "paces", "modes", "phases", "places",
  "scenario", "npcArchetypes"];

export function parseWorld(config, worldId = DEFAULT_WORLD_ID, language = "zh", registers = null) {
  const where = `${worldId}/${language}`;
  for (const key of REQUIRED) {
    if (config?.[key] === undefined) throw new Error(`world ${where}: missing "${key}"`);
  }
  const { world, country, setting, tone, statNotes, platforms, castLore, useGroupLore,
    identities, paces, modes, phases, places, scenario, npcArchetypes } = config;

  for (const [key, value] of [["identities", identities], ["paces", paces],
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
  if (!Array.isArray(platforms?.social) || typeof platforms?.private !== "string") {
    throw new Error(`world ${where}: "platforms" needs a social array and a private string`);
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

  return {
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
    paces,
    modes,
    phases,
    places,
    scenario,
    addressForms,
    npcArchetypes,
  };
}

export const getIdentity = (world, id) =>
  world?.identities?.find((i) => i.id === id) || null;

export const getPaceRule = (world, id) =>
  world?.paces?.find((p) => p.id === id)?.rule || "";

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
