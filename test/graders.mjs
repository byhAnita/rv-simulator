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

// A Kakao the round DID deliver, transcribed into the prose as well.
//
// The sibling check in playthrough.mjs only runs when a round delivered NO
// KKT, so this case was invisible to it by construction: the model generates
// kktMessages correctly AND writes them into the story, and the player reads
// the same message twice — once in prose, in the narrator's voice, before she
// has looked at her phone, and once in the Kakao overlay.
//
// Reported from hand play on DeepSeek Official in zh, v1.3.9.
//
// Matching is on the delivered text appearing VERBATIM in the story, which is
// language-independent and has almost no room for a false positive: prose does
// not coincidentally contain a whole chat line. Short messages are skipped
// because "ok" or "응" legitimately appear in dialogue.
const KKT_MIN_VERBATIM = 6;

// The ROLE CONTRACT, graded from the prose. Reported from hand play on a Chaebol
// player: Irene said "作为会长，我…", claiming the player's own office, and
// narration wrote "Irene越过你离开走向会长办公室" — sending her to the chairman's
// office while the chairman stood in the room. See CLAUDE.md, "Whose life is
// whose".
//
// Dialogue only, and only a SELF-ascription. The bare title is legitimate all
// over a clean round: members address the player as 会长nim constantly, and
// narration may name her office. What is never legitimate is a member saying she
// holds it.
//
// `playerRole` must be the bare title (会장 / 회장 / 经纪人), not the address form
// — and the caller must not pass one for 练习생, whose work title points the OTHER
// way: there the members ARE the seniors and "작为前辈，我…" is correct. mainAgent's
// `identityAddress` makes the same exception for the same reason.
// THE PLAYER SPEAKS INSIDE QUOTES TOO, and the first version of this grader did
// not know that. It read every dialogue span as a member's, so on a 20-round
// Chaebol playthrough it fired twice on the player's own correct lines:
//
//   你的声音不高…"…而我作为会长，有权决定用什么方式让我的团队保持这种状态。"
//   你直视着她的眼睛…"作为会长，我需要为整个团队负责。"
//
// She IS the 会长; those are the premise working. That makes four grader bugs out
// of four live flags this project has ever produced — read a flag as a hypothesis.
//
// So the speaker has to be identified, and `memberNames` is required for that.
// Precision first: flag only when a member is named beside the quote and the
// player's second-person pronoun is absent from the same window. Narration calls
// the player 你/you and nothing else, so its presence means she is in the frame
// and the line is probably hers. That trades a missed "她看着你说「作为会长，我…」"
// for never firing on a correct round, which is the right way round — a grader
// that cries wolf gets tuned away, and this one is checking a rule that is
// usually satisfied.
export function roleClaimedByMember(story, playerRole, memberNames = []) {
  if (!story || !playerRole || !memberNames.length) return [];
  const r = esc(playerRole);
  const claims = [
    new RegExp(`(作为|身为|我是|我就是|我这个)\\s*${r}`),
    new RegExp(`${r}(으로서|로서)`),
    new RegExp(`(저는|제가|내가)\\s*${r}`),
    new RegExp(`\\b(as|I am|I'm)\\s+(the\\s+)?${r}\\b`, "i"),
  ];
  const secondPerson = /你|너|\byou\b/i;
  for (const re of [/"([^"]*)"/g, /“([^”]*)”/g, /「([^」]*)」/g]) {
    for (const m of story.matchAll(re)) {
      if (!claims.some((c) => c.test(m[1]))) continue;
      // Attribution can sit on either side of the quote, so both are examined.
      const before = story.slice(Math.max(0, m.index - 40), m.index);
      const after = story.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const attributed = [before, after].some((w) =>
        memberNames.some((n) => n && w.includes(n)) && !secondPerson.test(w));
      if (attributed) return [`role-claimed-by-member:${playerRole}`];
    }
  }
  return [];
}

// The other direction: the player handed the members' working life. A Chaebol
// player was reminded not to be late for tomorrow's practice, and narrated going
// to her own trainee session.
//
// Skipped entirely when her identity DOES place her in it — a 练习生 has practice
// at this company and a 韩娱艺人 has a comeback of her own, so for them none of
// this is a defect. That flag comes from the caller, because only it knows the
// identity.
//
// Two shapes, both needing the player as the possessor. A bare "练习室" is fine:
// a chairman may visit one. "Your practice" is not.
export function playerGivenIdolLife(story, { sharesIdolLife = false } = {}) {
  if (!story || sharesIdolLife) return [];
  const possessive = [
    /你的(练习|排练|行程|回归|打歌|练习室时间)/,
    /(너의|네)\s*(연습|스케줄|컴백)/,
    /\byour\s+(practice|rehearsal|schedule|comeback)\b/i,
  ];
  for (const p of possessive) {
    const m = story.match(p);
    if (m) return [`player-given-idol-life:${m[0]}`];
  }
  // The reported line carried no possessive: an obligation aimed at "you" in the
  // same sentence as a practice word. Sentence-scoped so a member's own schedule
  // two sentences away cannot pull it in.
  for (const sentence of story.split(/[。！？.!?\n]/)) {
    if (!/你|너|네가|\byou\b/i.test(sentence)) continue;
    if (!/(练习|排练|연습|리허설|\bpractice\b|\brehearsal\b)/i.test(sentence)) continue;
    if (/(迟到|别晚|早点到|准时|记得来|지각|늦지|\blate\b|\bon time\b)/i.test(sentence)) {
      return [`player-given-idol-life:${sentence.trim().slice(0, 40)}`];
    }
  }
  return [];
}

// A cross-group cast is its own group, and the origin groups are never named in
// section 4 — because naming them lets the model complete the group from its own
// knowledge. That is exactly what happened on the phone: a cast of Jisoo, Irene,
// a custom member, Mina and Sana was handed "[BLACKPINK Background]", and round 1
// put Jennie, Rose and Lisa in the story and set the company to YG.
//
// So this grades the leak itself rather than the prompt: a member of an origin
// group who is NOT in the roster, appearing by name, and a real agency appearing
// at all when the cast's agency is derived from its own name.
//
// `forbidden` is [{name, name_kr}] — computed by the caller, which is the only
// place that knows which members were left out. A name that is a SUBSTRING of
// someone present is dropped by the caller, not here.
const REAL_AGENCIES = ["YG", "SM", "JYP", "HYBE", "ADOR", "Starship", "Pledis",
                       "Cube", "Source Music", "Belift", "KOZ"];

export function outsideCastNames(story, forbidden = []) {
  if (!story) return [];
  const bad = [];
  for (const m of forbidden) {
    for (const form of [m?.name, m?.name_kr]) {
      const needle = String(form || "").trim();
      if (needle.length < 2) continue;
      if (story.includes(needle)) { bad.push(`outside-cast:${m.name || needle}`); break; }
    }
  }
  return bad;
}

// Latin acronyms need a boundary or "SM" matches inside an ordinary word. The
// boundary is non-letter rather than \b so a zh sentence wrapping the acronym in
// Chinese characters still counts as a hit.
export function realAgencyNames(story) {
  if (!story) return [];
  const bad = [];
  for (const a of REAL_AGENCIES) {
    if (new RegExp(`(^|[^A-Za-z])${esc(a)}([^A-Za-z]|$)`).test(story)) bad.push(`real-agency:${a}`);
  }
  return bad;
}

export function kktTranscribed(story, kktUpdate) {
  if (!story) return [];
  for (const [id, msgs] of Object.entries(kktUpdate || {})) {
    if (!Array.isArray(msgs)) continue;
    for (const raw of msgs) {
      const text = String(typeof raw === "string" ? raw : raw?.content ?? "").trim();
      // Trailing punctuation is dropped: the model reflows it when it reformats
      // the line as prose, and that must not be enough to slip past the check.
      const needle = text.replace(/[.。!！?？~～\s]+$/u, "");
      if (needle.length < KKT_MIN_VERBATIM) continue;
      if (story.includes(needle)) return [`kkt-transcribed-in-story:${id}`];
    }
  }
  return [];
}
