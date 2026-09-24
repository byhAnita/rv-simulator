// test/graders.mjs
//
// Prose graders for the live playthrough harness, extracted in v1.3.9.
//
// Shared with smoke Layer L deliberately, following test/fixtures/prompts.mjs:
// these had never been unit-tested, only run live, so a grader that could never
// fire was indistinguishable from a clean run. Two of them are regex-matched
// against real prose a player reported, which is precisely the kind of thing
// that rots silently.
//
// NOT part of the app bundle. Node only.

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Everything between paired quotes. A character class cannot do this: it has no
// way to tell an opening quote from a closing one, so narration that follows a
// line of dialogue reads as if it were inside it. That produced a false
// "real-name-vocative" on a round whose dialogue was in fact correct.
export function dialogueSpans(story) {
  const spans = [];
  for (const re of [/"([^"]*)"/g, /“([^”]*)”/g, /「([^」]*)」/g]) {
    for (const m of story.matchAll(re)) spans.push(m[1]);
  }
  return spans;
}

// The game is set in South Korea, so Korean address forms stay transliterated
// in every output language. Rendering 언니 as the Chinese 姐, or as the English
// "big sister", localizes the setting away — the prompt bans both by name and
// this catches a model that does it anyway. Anchored to a member or the player,
// so ordinary 姐姐/小姐 in narration does not match.
export function sinicizedHonorifics(story, cast, lang) {
  const names = [...cast.members.map((m) => m.name), cast.playerName].filter(Boolean);
  const bad = [];
  if (lang === "zh") {
    if (names.some((n) => new RegExp(`${esc(n)}\\s*姐`).test(story))) bad.push("sinicized-honorific");
  } else if (lang === "en") {
    if (names.some((n) => new RegExp(`${esc(n)}[-\\s](big sister|sis|sister)\\b`, "i").test(story))) {
      bad.push("sinicized-honorific");
    }
  }
  return bad;
}

// "Irene, thanks for the coffee" — spoken by Irene. The speaker of a line is not
// recoverable from prose, so this targets the form that is anomalous whoever
// says it: a member's full real name used as a vocative inside dialogue.
// Members address each other by stage name, so a real name in the vocative is
// almost always the model reaching for the only Korean-looking name it has.
// Narration may use real names freely and is deliberately excluded.
export function selfNameErrors(story, cast) {
  const bad = [];
  const spans = dialogueSpans(story);
  if (spans.length === 0) return bad;
  for (const m of cast.members) {
    if (!m.name_kr) continue;
    // A vocative opens a clause. Requiring that excludes self-introduction
    // ("我叫孙胜完，…" / "My name is Bae Ju-hyun, …"), which is correct speech
    // and was the third false positive this check produced.
    const re = new RegExp(`(^|[。.!！?？…—])\\s*${esc(m.name_kr)}\\s*[,，!！?？]`);
    if (spans.some((s) => re.test(s))) bad.push(`real-name-vocative:${m.id}`);
  }
  return bad;
}

// "你走进练习室，Irene欧尼正站在窗边。" — an address form in narration. Honorifics
// are things characters SAY to each other; narration names a member plainly.
// The prompt scoped pronouns to narration from v1.3.6 but said nothing about
// address forms until v1.3.9, and the token examples carried no scope marker.
//
// Anchored to a member or player name immediately followed by the form, so an
// unrelated "xi" inside an English word, or 欧尼 used in dialogue, cannot match.
const NARRATABLE_FORMS = {
  zh: ["欧尼", "nim", "xi"],
  en: ["unnie", "nim", "ssi"],
  ko: ["언니", "님", "씨"],
};
export function narratedHonorifics(story, cast, lang) {
  const forms = NARRATABLE_FORMS[lang] || NARRATABLE_FORMS.zh;
  // Blank the dialogue rather than extracting it: what is left is narration.
  let narration = story;
  for (const re of [/"[^"]*"/g, /“[^”]*”/g, /「[^」]*」/g]) {
    narration = narration.replace(re, " [D] ");
  }
  const names = [...cast.members.map((m) => m.name), cast.playerName].filter(Boolean);
  const bad = [];
  for (const form of forms) {
    for (const n of names) {
      // The separator differs by language: en hyphenates (Irene-unnie), ko
      // spaces (Irene 언니), zh joins directly (Irene欧尼). Accept all three, or
      // the en and ko cases silently never fire.
      if (new RegExp(`${esc(n)}[\\s\\-]*${esc(form)}`).test(narration)) {
        bad.push(`narrated-honorific:${form}`);
        break;
      }
    }
  }
  return [...new Set(bad)];
}

// zh only: "小饼呀，你来了" — 呀 attached to a name as a vocative. Korean 야 is a
// vocative suffix; Chinese 呀 is sentence-final, so transliterating the sound
// imports the wrong grammar and reads as slightly off to a native speaker.
// Reported from hand play in v1.3.9. Standalone 呀/哎呀 is correct and must not
// match, so this requires a name immediately before it.
export function nameYaVocative(story, cast, lang) {
  if (lang !== "zh") return [];
  const names = [...cast.members.map((m) => m.name), cast.playerName].filter(Boolean);
  for (const n of names) {
    if (new RegExp(`${esc(n)}呀`).test(story)) return ["name-ya-vocative"];
  }
  return [];
}
