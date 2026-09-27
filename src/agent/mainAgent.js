// src/agent/mainAgent.js
// v11.1 Final: Language enforcement + Social isolation + NPC no social + JSON hardening + Age texture + Chapter auto + Special events
import { callLLM } from "../tools/llmTool";
import { buildHistoryLedger, buildDynamicTail, collapseHistoryIfNeeded, updateMemory, getTopMember, createEmptyMemory, isLegacyMemory } from "./memoryPool";
// `probabilityEngine` is deliberately NOT imported any more — see the note beside
// where pickPrimaryMember used to be called, and docs/PROPOSALS.md §4.
import { getStageIdx, stageNameIn, stageNamesFor, STAGE_BANDS } from "../config/stageConfig";
import { KKT_THRESHOLD, KKT_MAX, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, GAME_YEAR, AFFECTION_MAX_DELTA } from "../config/constants";
import { checkRelationshipEvents } from "../config/relationshipEvents";
import { checkAchievement } from "../config/achievements";
import { getIdentity, getPaceRule, renderIdentityBackground } from "../rag/worldLoader";

// Shortest story we will show the player. The prompt asks for 250-350 words, so
// anything this brief is a non-answer: it also catches validateAndFixOutput's own
// 22-character "The story continues..." placeholder, which used to be rendered
// as a silently wasted round. Safe across zh/en/ko, where the same content runs
// ~650 / ~2,400 / ~1,000 characters.
const MIN_STORY_CHARS = 40;

// Module-level globals: social media delayed by one round
let pendingSocialFeeds = null;
let pendingNotifications = [];
export function popPendingSocial() {
  const result = { feeds: pendingSocialFeeds, notifs: pendingNotifications };
  pendingSocialFeeds = null;
  pendingNotifications = [];
  return result;
}

export function resetPendingSocial() {
  pendingSocialFeeds = null;
  pendingNotifications = [];
}

// ============================================================
// Game chapter based on round number
// ============================================================
function getChapterByRound(roundNum) {
  if (roundNum <= 6) return "start";
  if (roundNum <= 14) return "develop";
  if (roundNum <= 24) return "climax";
  return "resolve";
}

// ============================================================
// Build System Prompt
// ============================================================
// `world` is required and has no default on purpose. A default would be a second
// copy of every string in public/worlds/, and the two would drift silently; it
// would also let a missing-wiring bug render as plausible output instead of
// failing. Callers load it with loadWorld() once per game, exactly as they
// already load the group config.
export function buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel, language, world) {
  if (!world?.addressForms?.tokens) {
    throw new Error("buildSystemPrompt: a world is required (see rag/worldLoader.js)");
  }
  const mainMember = members.find(m => m.id === mainId);
  const modelName = selectedModel || "AI";
  const allTargetIds = [mainId, ...subIds];
  const npcIds = members.map(m => m.id).filter(id => !allTargetIds.includes(id));
  const subList = subIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  const npcList = npcIds.map(id => members.find(m => m.id === id)).filter(Boolean);

  // Language rules
  const langRules = {
    zh: {
      lang: "Chinese (Simplified)",
      // The old wording asked for Korean words "rarely, with a translation in
      // parentheses" and gave "unnie" as its example — which contradicted
      // section 6 twice over (it wants 欧尼, no gloss, and frequent enough to
      // feel Korean) from inside a section headed HIGHEST PRIORITY. It predates
      // the address protocol and was never revisited. Now it defers instead of
      // competing.
      rule: "ALL generated content MUST be in Simplified Chinese (简体中文). DO NOT use Traditional Chinese (繁体中文). Korean address forms are the one exception and follow section 6's table exactly: they are texture rather than untranslated text, and take no parenthetical gloss.",
      storyRule: "Story text must be in Simplified Chinese.",
      socialRule: "Social media content must be in Simplified Chinese. DO NOT output Korean in bubble/instagram/weverse/KKT content.",
    },
    en: {
      lang: "English",
      rule: "ALL generated content MUST be in English. DO NOT output Chinese characters. Korean address forms are the one exception and follow section 6's table exactly: they are texture rather than untranslated text, and take no parenthetical gloss.",
      storyRule: "Story text must be in English.",
      socialRule: "Social media content must be in English. DO NOT output Korean in bubble/instagram/weverse/KKT content.",
    },
    ko: {
      lang: "Korean",
      // "DO NOT output English characters" forbade the one thing this prompt
      // requires: every member's name in MEMBER PROFILES is her Latin stage name,
      // and section 6's own narration example is "Joy는 창가에 서 있다". Section 1
      // is headed HIGHEST PRIORITY, so the two could only be resolved one way.
      // Same shape as the zh Korean-gloss contradiction fixed in step 6 — a rule
      // written before the data it constrains.
      rule: "ALL generated content MUST be in Korean (한국어). DO NOT output Chinese characters. Member names are the one exception: spell each member exactly as MEMBER PROFILES spells her — her Latin stage name — and never transcribe it into Hangul or swap in her real name.",
      storyRule: "Story text must be in Korean.",
      socialRule: "Social media content must be in Korean.",
    },
  };
  const lr = langRules[language] || langRules.zh;

  // Identity background. The seed is what keeps this stable round to round —
  // see backstorySeed below, and "buildSystemPrompt must be a pure function of
  // the save" in CLAUDE.md.
  const identityBg = renderIdentityBackground(world, form.identity, mainMember?.name, backstorySeed(form, mainId));

  // The identity and the pace both reached the model as their raw ids, which are
  // authored in Chinese for every language — so an English player's prompt said
  // `Alex's identity: 财阀` and `Progression Pace: 高压舆论向`, an internal key in a
  // language she does not read, while Setup showed her "Chaebol" and "High
  // Pressure Scandal". Two vocabularies for one thing, and the model got the one
  // nobody can read: exactly the stage-label bug from step 6, one section up.
  //
  // `name` fixes the identity. The pace needs no name field, because its authored
  // rule already opens with a self-describing "[Pace: High Pressure]" — and
  // sending the rule closes a live feature gap as well: `paceRules` was built into
  // a local and never referenced, so "secrecy changes doubled" and "love triangle
  // scenes probability doubled" were things the player could select and the model
  // could not know. Both fall back to the id, so a world file without either still
  // renders something true.
  const identityName = getIdentity(world, form.identity)?.name || form.identity;
  const paceLine = getPaceRule(world, form.pace) || `Progression Pace: ${form.pace}`;

  // Korean seniority is a birth-year boundary, not a gap in years: a 1994 and a
  // 1995 idol are not peers even though they may be months apart. Direction is
  // therefore decided on birth year alone and never flips. How much of the
  // resulting formality is actually spoken is left to the REGISTER block, which
  // asks the model to blend it with the current stage and her personality.
  //
  // The previous version computed the same number and printed it as the MEMBER's
  // age texture ("15 years younger") when the sign actually describes the
  // PLAYER, so every profile in every group stated the relationship backwards.
  //
  // `form.birthYear` is the truth and `playerAge` is a rendering of it, which is
  // the opposite of what shipped through v1.3.9: that derived the birth year
  // from the age as `GAME_YEAR - age`, which assumes the player's birthday has
  // already passed this year and is therefore wrong for roughly half of all
  // players. Age cannot determine a birth year — the information is simply not
  // in it — and since seniority here is a hard year boundary with no tolerance,
  // a one-year error flips the relationship outright whenever it lands on a
  // member's birth year. Reported from hand play: a player born 1999-11-19
  // entering age 26 derived 2000, so a 1999 member became her senior when the
  // two are peers, and the game told her to say 欧尼 to her own age group.
  //
  // The fallback is the legacy path, not a default. A save written before
  // v1.4.0 carries only `age`, and saveMigrator fills `birthYear` from exactly
  // this arithmetic so a migrated save keeps producing the prompt it already
  // had. It stays here rather than throwing the way a missing `world` does,
  // because a missing world is a wiring bug worth failing loudly on, while an
  // absent birth year is old player data — and a slightly wrong honorific is a
  // great deal better than a game that will not load.
  const playerBirthYear = parseInt(form.birthYear) || (GAME_YEAR - (parseInt(form.age || 20) || 20));
  const playerAge = GAME_YEAR - playerBirthYear;
  const playerName = form.name || "Player";

  // Every line here is conditional on having content, for the same reason the
  // member profile block is: a solo run has no sub members and rendered a blank
  // line mid-list, a custom main member has no `name_kr` and rendered `Kim()`,
  // and a custom identity has no background and rendered a second blank line.
  const castLines = [
    `${playerName}'s identity: ${identityName}`,
    paceLine,
    `Main Member: ${mainMember?.name}${mainMember?.name_kr ? `(${mainMember.name_kr})` : ""}`,
    subList.length > 0 ? `Sub Members: ${subList.map(m => m.name).join(", ")}` : "",
    npcList.length > 0
      ? `NPC Members: ${npcList.map(m => m.name).join(", ")} (non-romanceable, must appear in background)`
      : "",
    identityBg,
  ].filter(Boolean).join("\n");

  // The setting is South Korea, so Korean address forms are transliterated into
  // whatever language the story is written in — never swapped for a native
  // equivalent. Rendering 언니 as the Chinese 姐 reads as a Chinese family
  // drama and throws away the register the game is built on.
  // zh mixes scripts on purpose, following how K-pop fans actually write:
  // 언니 has a settled Chinese transliteration (欧尼), but 님 and 씨 are written
  // in Latin as "nim" and "xi" — a reader knows "会长nim" at sight and would
  // stumble over "会长尼姆".
  // The table now lives in the world file, one per language, because which
  // forms exist is a property of the SETTING and not of the output language:
  // Korean seniority is a birth-year boundary that 언니/님/씨 encode, and a
  // different country needs different forms and a different rule. See
  // public/worlds/kpop_idol/<lang>.json and CLAUDE.md.
  //
  // Two invariants the data carries, both of them bugs that shipped:
  //   - zh `ya` is null. 呀 is an existing Chinese sentence-final particle, so
  //     transliterating the Korean vocative 야 imports the wrong grammar.
  //   - `sep` supplies the hyphen, so no token carries one of its own; `ya`
  //     did, and every English prompt emitted "Alex--ya" from v1.3.6 to v1.3.9.
  const tk = world.addressForms.tokens;
  const call = (name, token) => `${name}${tk.sep}${token}`;
  // The casual form only exists where the language has a vocative particle that
  // survives transliteration. zh does not (see the token table), so the clause
  // is dropped rather than rendered as a duplicate of the plain name.
  const casually = (name) => tk.ya ? `, or "${call(name, tk.ya)}" once close` : "";

  // The narration example in the SPEAKER CONTRACT, one clause per language. The ko
  // frame is possessive on purpose: the natural "<name>는 창가에 서 있다" hardcodes a
  // topic particle whose form depends on how the name is PRONOUNCED — 는 after Joy
  // but 은 after Irene (아이린) — and an example is an instruction, so a wrong one
  // teaches the error. `의` is invariant after every name, Latin or Hangul, and the
  // sentence still does the one job it has: naming her by stage name alone.
  const stoodByTheWindow = language === "zh" ? "正站在窗边"
    : language === "ko" ? "의 시선이 창가로 향했다"
    : " was standing by the window";

  // Round-phase beats and the archetypes an unnamed supporting role may be.
  // Both are English rule text in every language file, so the three world files
  // must agree on them - smoke Layer I asserts they do.
  const phaseLines = world.phases.map(p => p.line).join("\n");
  const a = world.npcArchetypes;
  const archetypeList = a.length > 1
    ? `${a.slice(0, -1).join(", ")}, or ${a[a.length - 1]}`
    : (a[0] || "");

  // Identities carrying a workplace register that outranks age. It softens
  // toward her given name as they get closer — REGISTER covers that. The world
  // file is per-language, so `form` is already the right language and `kr` is
  // the Hangul the prompt shows alongside it.
  const WORK_TITLE = getIdentity(world, form.identity)?.workTitle || null;
  const workTitle = WORK_TITLE ? `"${WORK_TITLE.form}" (${WORK_TITLE.kr})` : null;
  // The two branches point the title in OPPOSITE directions — a trainee uses it
  // FOR the members, everyone else is called it BY them — so the "it relaxes as
  // they grow close" clause has to live inside each branch. Shared, it read "It
  // relaxes toward her given name", which named the wrong person in one of the two.
  const identityAddress = !workTitle ? null
    : form.identity === "练习生"
      ? `${playerName} is an undebuted trainee and every member is a debuted senior, so ${playerName} also uses ${workTitle} for them at work, relaxing toward a member's plain stage name as that member grows close to her`
      : `she addresses ${playerName} as ${workTitle} on the job whatever their ages, relaxing toward "${playerName}" as they grow close`;

  const memberDetails = members.map(m => {
    const memberBirthYear = parseInt((m.birthday || "2000-01-01").split('-')[0]) || 2000;
    // Positive => born earlier => the member is the elder.
    const memberIsOlderBy = playerBirthYear - memberBirthYear;

    let ageLine, addressLine;
    if (memberIsOlderBy > 0) {
      ageLine = `b.${memberBirthYear} — ${memberIsOlderBy} yr OLDER than ${playerName} (b.${playerBirthYear}). She is ${playerName}'s unnie (언니).`;
      addressLine = `${playerName} -> "${call(m.name, tk.unnie)}". She -> "${playerName}"${casually(playerName)}. She must NEVER call ${playerName} "${tk.unnie}".`;
    } else if (memberIsOlderBy < 0) {
      ageLine = `b.${memberBirthYear} — ${Math.abs(memberIsOlderBy)} yr YOUNGER than ${playerName} (b.${playerBirthYear}). ${playerName} is her unnie (언니).`;
      addressLine = `She -> "${call(playerName, tk.unnie)}". ${playerName} -> "${m.name}"${casually(m.name)}. ${playerName} must NEVER call her "${tk.unnie}".`;
    } else {
      ageLine = `b.${memberBirthYear} — same birth year as ${playerName}. 동갑, no unnie in either direction.`;
      addressLine = `Both use the plain given name; 반말 comes easily after a few meetings.`;
    }
    const role = m.id === mainId ? "[MAIN - Core Romance Line]"
      : subIds.includes(m.id) ? "[SUB - Romanceable]"
      : "[NPC - Non-romanceable, must appear in background]";
    // EVERY optional field is conditional: an absent one renders nothing at all,
    // never a label with a trailing space and never the string "undefined".
    //
    // Only Age and Address are unconditional, because both are computed here and
    // can never come out empty. Everything else is data, and step 6's custom
    // members are allowed to omit all of it — docs/V140_PLAN.md §4.4 requires
    // exactly three fields (name, birthday, private_personality), so a member
    // built from the required tier alone has no emoji, no name_kr, no animal and
    // no prose but one line.
    //
    // That branch used to produce four defects in one profile block: `undefined`
    // twice (emoji, animal) and a trailing space twice (`  Public: `,
    // `  Queer Texture: `). A trailing space is invisible to a reviewer and costs
    // the whole ~5,500-token cached prefix — it is the single byte the goldens
    // caught during the step 3 extraction, after 1,368 clean renders had not.
    //
    // The goldens cannot catch it HERE, which is the point worth remembering:
    // all 175 library member records are complete, so every fixture renders
    // byte-identically whether these lines are conditional or not. Only the
    // dedicated Layer I guard fails, and it was verified to. Custom members are
    // the branch no snapshot can contain.
    //
    // Habit sits below the prose fields because it is the staging handle for
    // them, not a fourth differentiator alongside them.
    const line = (label, value) =>
      (value && String(value).trim() ? `\n  ${label}: ${value}` : "");
    const emojiPart = m.emoji ? `${m.emoji} ` : "";
    const krPart = m.name_kr ? `(${m.name_kr})` : "";
    return `${emojiPart}${m.name}${krPart} ${role}
  Age: ${ageLine}
  Address: ${addressLine}${line("Animal", m.animal_plastic)}${line("Public", m.public_image)}${line("Private", m.private_personality)}${line("Queer Texture", m.queer_texture)}${line("Speech Style", m.speech_style)}${line("Habit", m.habit)}${line("Hidden Conflict", m.hidden_conflict)}`;
  }).join("\n\n");

  // JSON schema. Written without the spaces a formatter would add: the schema is
  // ~8 lines of the cached prefix and reads the same to the model either way.
  // `photoDesc` was missing from the schema while BubbleOverlay has always rendered
  // it: `hasPhoto` drew a photo frame whose only content is `photoDesc`, which the
  // model was never asked for, so the frame could only ever come out empty. And the
  // example pinned the flag to `false` twice over (here and in RULES), so it was
  // never set anyway — a UI feature that could not fire and could not have rendered
  // if it had.
  const bubbleShape = `{"content":"msg","hasPhoto":false,"photoDesc":""}`;
  const mainSocial = `"${mainId}": {"bubble":[${bubbleShape}],"instagram":null,"weverse":null}`;
  const subSocials = subIds.map(id => `"${id}": {"bubble":[${bubbleShape}],"instagram":null,"weverse":null}`).join(",");
  const kktFields = allTargetIds.map(id => `"${id}":["msg"]`).join(",");
  return `You are the Dungeon Master (DM) of a yuri dating simulator. You must respond with valid json output. This is a parallel-universe fictional work. Current AI: ${modelName}

╔══════════════════════════════════════════╗
║ 1. LANGUAGE RULE - HIGHEST PRIORITY      ║
╚══════════════════════════════════════════╝
LANGUAGE: ${lr.lang}
${lr.rule}
${lr.storyRule}
${lr.socialRule}

╔══════════════════════════════════════════╗
║ 2. JSON OUTPUT - HIGHEST PRIORITY        ║
╚══════════════════════════════════════════╝
CRITICAL: Output ONLY ONE valid JSON object. NO repeated keys. NO text, code fences, explanations, verification checks, or natural language outside JSON.
Every key (scene, statChanges, affectionChanges, story, summary, socialContent, kktMessages, options) must appear EXACTLY ONCE.
Emit them in that order. The story comes BEFORE socialContent and kktMessages, so what she posts and texts follows from what happened, and so the scene is not written around a message she has not read yet.
The key "story" must appear EXACTLY ONCE with a single string value.
DO NOT repeat "story" key. DO NOT put JSON inside the story string.
story value = ONE continuous text, no JSON syntax inside it.
First character: {  Last character: }
NO introductory text, NO closing remarks, NO markdown code blocks.

╔══════════════════════════════════════════╗
║ 3. STORY GENERATION                      ║
╚══════════════════════════════════════════╝
- MEMBER ROTATION: Balance main and sub members. The main member should still appear most rounds, but sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable member disappear for more than 3 rounds. [Rounds Absent] in CURRENT STATE counts this for you: the number is how many rounds she has missed, so anyone at 3 belongs in this one.

- Story length: 350 - 450 words in ${lr.lang}
- Style: Literary, emotional, sensory details (sight/sound/touch/smell).
- Open with 1-2 sentences establishing scene atmosphere
- PRONOUN RULE: In NARRATION, always refer to the player as "you/your". In DIALOGUE (inside quotation marks), a member addresses the player by name or by the title given on her Address line in section 6 — never by her own name, and never by another member's name. Section 6 SPEAKER CONTRACT is binding.
- UNKNOWN CHARACTER RULE: Only characters listed in MEMBER PROFILES may appear by name. Supporting roles are limited to unnamed archetypes: ${archetypeList}.
- NO SOCIAL MEDIA IN STORY: ABSOLUTELY FORBIDDEN to include phone notifications, messages, social media updates, or a Kakao transcript. Every one of those is delivered by the app, not by the prose — section 7.
- HER PHONE BELONGS TO THE APP, NOT TO THE STORY. Nothing in the prose lights up ${playerName}'s screen, buzzes in her pocket, arrives on it or is read off it — whatever the channel is called. Not Kakao, not a company system, not an unnamed message, not a reply she types. When a member wants to reach her and is not in the room, she leaves something instead: a note pushed under the door, food in the fridge with her name on it, a jacket over the back of her chair. That is the same beat and it is yours to write.
${phaseLines}

╔══════════════════════════════════════════╗
║ 4. GROUP BACKGROUND                      ║
╚══════════════════════════════════════════╝
${groupConfig.loreComposed
  ? `This cast is its own group and everything known about it is written below. It has NO published history, so there is none to reference: build their shared past as the story goes — who joined when, what they have already been through together — and keep it consistent once you have written it. Never borrow a real group's history, discography or agency, and never add a member who is not in MEMBER PROFILES.`
  : `This is the established world-setting. Draw from it freely — reference group history, inside jokes, shared memories, and past events to enrich scene texture and continuity.`}
${groupConfig.groupLore}

╔══════════════════════════════════════════╗
║ 5. MEMBER PROFILES                       ║
╚══════════════════════════════════════════╝
CRITICAL: ★ Public Image / Private Personality / Queer Texture are the PRIMARY differentiators for every scene. The same event must feel distinct depending on which member is present — her voice, body language, reactions, and subtext should all reflect her personality. Never flatten members into a generic idol type.
${memberDetails}

╔══════════════════════════════════════════╗
║ 6. CAST IDENTITY & ADDRESS               ║
╚══════════════════════════════════════════╝
THE PLAYER: ${playerName} — a WLW woman, age ${playerAge}, born ${playerBirthYear}. She is NOT a member of the group and never appears in MEMBER PROFILES.
${castLines}

-- SPEAKER CONTRACT (the most common failure — apply it literally) --
- Inside quotation marks, "I"/"me"/"my" = the character who is speaking; "you"/"your" = the character she is speaking TO.
- In the player's choice text, "I" is always ${playerName} and "you" is the member being addressed. Do not swap them when you continue the scene.
- A character's own name is never a way to address someone else. When ${mainMember?.name || "a member"} speaks, "${mainMember?.name}" and "${mainMember?.name_kr}" refer to herself — she cannot use either to address ${playerName}. Thanking ${playerName} by speaking her own name is always wrong.
- No member ever addresses ${playerName} by another member's name. ${playerName} is the only character who may be addressed as "${playerName}".
- In NARRATION (outside quotation marks) the player is always "you/your"; members are named, or "she/her".
- Address forms are SPOKEN, not narrated. "${tk.unnie}", "${tk.nim}", "${tk.ssi}" and every Address line above belong INSIDE quotation marks, where one character is speaking to another. In narration a member is her stage name alone: "${mainMember?.name || "She"}${stoodByTheWindow}", NEVER "${call(mainMember?.name || "She", tk.unnie)}${stoodByTheWindow}".

-- ROLE CONTRACT (whose life is whose — apply it as literally as the one above) --
- ${playerName}'s identity above describes HER position in this world and no one else's. No member holds it, is described by it, or speaks as if she held it. Where that role carries a title, the title names ${playerName} alone — and narration never sends a member off to that title as though its holder were a third person elsewhere in the building. In narration she is "you".
- The members' working life — practice, schedules, comebacks, the dorm, this company — is THEIRS. ${playerName} does not inherit it; she has exactly what her own identity gives her and nothing more. Unless that identity places her inside this group's working day, she has no practice here to be late for and no place in their schedule, and no member reminds her of one.
- When the scene needs somewhere for ${playerName} to be, or something for her to be doing, take it from her identity — never from the group's calendar.

-- REGISTER: blend these, do not look one up --
Each member's Address line fixes WHICH titles exist between her and ${playerName} and which way they point. That direction comes from birth year and NEVER reverses, at any affection level.${identityAddress ? `\nWork override: ${identityAddress}.` : ""}
How much of that formality she actually speaks is a blend of three things, none of which decides alone:
  1. Age gap — a wide gap keeps a trace of deference even at the highest affection. That trace is texture, not distance.
  2. Closeness — read her score in [Affections] in CURRENT STATE. Formality loosens as the score rises.
  3. Her Private Personality — a blunt member drops honorifics early; a reserved one keeps them long after the score says they are close.
A same-age or near-age member is already casual while the score is still low. A much older member is warm but careful early, and grows protective rather than informal.
-- KOREAN ADDRESS FORMS: transliterate, never localize --
This is South Korea. Korean address forms are kept in ${lr.lang} as transliterations, because swapping them for a native equivalent throws away the setting.
${world.addressForms.guide}
A Korean word dropped into the prose is texture, not a translation error. Keep them frequent enough to feel Korean and rare enough to stay readable.

╔══════════════════════════════════════════╗
║ 7. SOCIAL PLATFORM RULES                 ║
╚══════════════════════════════════════════╝
- LANGUAGE: ${lr.lang}.
- ALL of it comes out of THIS round. A member posts about the day she has just had — the practice she just left, the weather she just walked through, the thing that just made her laugh. Nothing here is filler written about no particular day, and nothing here says outright what the story kept unspoken.
- Bubble: member-to-fan daily sharing. 1-3 posts. Style: warm, cute, casual. A post may carry a photo.
- Instagram: Photo social. Style: aesthetic, short caption + emoji.
- Weverse: Fan community. Style: friendly, natural.
- KKT (KakaoTalk): Private chat, member-to-player. Style: flirty/caring/casual.
- KKT IS DELIVERED BY THE APP, NEVER BY THE STORY. Whatever you put in kktMessages is shown to ${playerName} in her own Kakao window after this round. The story therefore NEVER contains a Kakao message, a chat transcript, a phone screen lighting up, or a notification — for EVERY member, the unlocked ones included. Writing the message into the prose delivers it twice, in the wrong voice, before she has looked at her phone.
- KKT IS A LOCKED CHANNEL. [KKT Channels] in CURRENT STATE lists every member as unlocked or LOCKED. A LOCKED member has no private line to ${playerName} yet: output [] for her id. Those messages do not exist, and narrating one produces a scene about a message the player never receives.
- Only main and sub members generate social content. NPC members DO NOT generate social content.

╔══════════════════════════════════════════╗
║ 8. NPC RULES                             ║
╚══════════════════════════════════════════╝
- NPC: max 1 dialogue/round, 2-round cooldown. [Rounds Absent] marks them (npc) and counts the cooldown for you — one at 2 or more may speak this round.
- All members must be present in group scenes.

╔══════════════════════════════════════════╗
║ 9. GAME RULES                            ║
╚══════════════════════════════════════════╝
- Relationship stages, in order: ${stageNamesFor(language).map((n, i) => `${STAGE_BANDS[i]} ${n}`).join(", ")}. [Affections] in CURRENT STATE gives each member's score and her stage by these exact names.
- Tone: 60% sweet, 30% realistic pressure, 10% youthful regret.

╔══════════════════════════════════════════╗
║ 10. STAT SYSTEM                          ║
╚══════════════════════════════════════════╝
Player stats you may change: 🌈Self-Identity | 🔒Secrecy(lower=more exposed) | 💫Mood — those three and no others.
📅Round is a counter the app keeps. It is not a stat and never appears in statChanges.
Pick their values yourself from what happened this round, +/-1 to +/-10, and move at least one.

╔══════════════════════════════════════════╗
║ JSON SCHEMA - MUST FOLLOW EXACTLY        ║
╚══════════════════════════════════════════╝
{
  "scene": "Location description in ${lr.lang}",
  "statChanges": { "selfId": 0, "secrecy": 0, "mood": 0 },
  "affectionChanges": { "${mainId}": 0${subIds.map(id => `, "${id}": 0`).join("")} },
  "story": "Story text in ${lr.lang} (350-450 words). Pure story, NO stat bars, NO options.",
  "summary": "ONE sentence, 100-150 characters, in English: who appeared and what emotionally shifted.",
  "socialContent": {
    ${mainSocial}${subIds.length > 0 ? ",\n    " + subSocials : ""}
  },
  "kktMessages": {
    ${kktFields}
  },
  "options": ["A. option text", "B. option text", "C. option text", "D. option text"]
}

RULES:
- scene: ONE SHORT PHRASE — a place and a time, nothing else: "Practice room, 10PM". It is printed inside a one-line status box on a phone screen, so a sentence will not fit there and a paragraph is worse. Change it when the story moves, and never repeat the previous round's scene word for word. The only company that exists in this story is the one section 4 names; never write another one's name anywhere.
- statChanges: at least 1 field non-zero (+/-1 to +/-10). Values are numbers.
- affectionChanges: at least 1 member non-zero (+/-1 to +/-10). Values are numbers.
- socialContent.bubble: MUST be an ARRAY like [{"content":"...","hasPhoto":false,"photoDesc":""}], NOT a string. Set hasPhoto true only when she would really attach a picture, and then photoDesc is a short phrase naming what is in it; otherwise hasPhoto is false and photoDesc is "".
- socialContent.instagram: MUST be an object {"caption":"...","likes":800000} or null.
- socialContent.weverse: MUST be an object {"content":"...","likes":2000,"comments":100} or null.
- kktMessages: Object with member IDs, each value is an ARRAY of strings or empty array []. Members marked LOCKED in [KKT Channels] MUST be [].
- story: PURE story text. NO stat bars, NO options embedded, NO repeated "story" keys.
- summary: ALWAYS required. ONE English sentence, 100-150 characters — not two, not a paragraph. This replaces the whole story in your memory of this round three rounds from now, so it is the only thing you will still know about it: short enough to keep, specific enough to be worth keeping.
- options: EXACTLY 4 option strings. PURE choice text. DO NOT include stat changes or route indicators.
- ALL story/social/option content MUST be in ${lr.lang}. summary is always in English.
- For Chinese/English: bubble/social content MUST NOT be written in Hangul. Section 6's transliterated address forms are not Hangul and are welcome there.
- CRITICAL: All field types must match exactly. Arrays use [], objects use {}, strings use "", numbers are bare.
${memoryContext ? `\n[MEMORY CONTEXT - Generate based on this]\n${memoryContext}` : ''}`;
}

// ============================================================
// Backstory seed
// ============================================================

// The system prompt is rebuilt from scratch every round and must come out
// byte-identical every time, or the provider's prefix cache misses on all
// ~5,500 tokens of it. The ex-girlfriend background used Math.random() to pick
// its breakup reason and keepsake, so it re-rolled every round: full-price
// input forever, and a model told a different shared past each round on the one
// route built around a shared past.
//
// Seeding from the save fixes both while keeping the variety between
// playthroughs. Every field here is chosen at character setup and never changes
// afterwards, so the value is stable for the life of a save and survives
// save/load with no new field to persist and nothing to migrate.
//
// The text it indexes into now lives in the world file, as `variants` on the
// identity; renderIdentityBackground applies this seed to it.
function backstorySeed(form, mainId) {
  let h = 0x811c9dc5;                                            // FNV-1a, as in aliyunRoute.js
  for (const ch of `${form.name || ""}|${form.age || ""}|${form.pace || ""}|${mainId || ""}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ============================================================
// Create Initial Stats
// ============================================================
export function createInitialStats(mainId, subIds) {
  const multiAff = {};
  subIds.forEach(id => {
    multiAff[id] = Math.floor(Math.random() * (SUB_INITIAL_AFFECTION_MAX - SUB_INITIAL_AFFECTION_MIN + 1)) + SUB_INITIAL_AFFECTION_MIN;
  });
  return {
    affection: MAIN_INITIAL_AFFECTION,
    selfId: Math.floor(Math.random() * 20) + 20,
    secrecy: 100,
    mood: Math.floor(Math.random() * 20) + 50,
    week: 0,
    scene: "Seoul·Entertainment Building",
    chapter: "start",
    multiAff,
  };
}

// ============================================================
// Parse JSON Output (triple attempt + validate)
// ============================================================
function parseLLMOutput(text) {
  console.log("[parseLLMOutput] Raw length:", text?.length);

  // If text contains story before JSON, extract only the JSON part
  const jsonStart = text.search(/\{\s*"(scene|statChanges|selfId|story|options|socialContent|affectionChanges|kktMessages)"/);
  if (jsonStart > 0) {
    text = text.substring(jsonStart);
  }

  // Preprocess: escape unescaped newlines in story field.
  //
  // The following key is matched generically, not by name. It was `"options"`,
  // then `"(?:summary|options)"` when summary was inserted between them — so the
  // repair silently stopped working each time the schema was reordered, and it is
  // the repair that keeps a model emitting raw newlines inside `story` parseable
  // at all. Any key ends the story field; naming them couples this to an order it
  // has no reason to know.
  const storyMatch = text.match(/"story":\s*"([\s\S]*?)"\s*,\s*"[a-zA-Z_]\w*"\s*:/);
  if (storyMatch) {
    const rawStory = storyMatch[1];
    const escapedStory = rawStory
      .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      .replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t');
    text = text.replace(rawStory, escapedStory);
  }
  // Fix truncated key-value (e.g., ends with "instagram")
  if (!text.trim().endsWith('}')) {
    // If ends with a key name, close it
    const truncatedKey = text.match(/"([a-zA-Z_]\w*)"\s*$/);
    if (truncatedKey) {
      text = text.replace(/"([a-zA-Z_]\w*)"\s*$/, '"$1": null}');
    }
    // Auto-close incomplete JSON
    if (!text.trim().endsWith('}')) {
      let fixed = text.trim();
      let openBraces = (fixed.match(/\{/g) || []).length, closeBraces = (fixed.match(/\}/g) || []).length;
      while (closeBraces < openBraces) { fixed += '}'; closeBraces++; }
      let openBrackets = (fixed.match(/\[/g) || []).length, closeBrackets = (fixed.match(/\]/g) || []).length;
      while (closeBrackets < openBrackets) { fixed += ']'; closeBrackets++; }
      text = fixed;
    }
  }
    

  // Try 1: Direct parse
  try { const r = JSON.parse(text); console.log("[parse] Direct OK"); return validateAndFixOutput(r); } catch (e) { console.log("[parse] Direct fail:", e.message); }

  // Try 2: Extract {...}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    try { const r = JSON.parse(text.slice(s, e + 1)); console.log("[parse] Extract OK"); return validateAndFixOutput(r); } catch (e2) { console.log("[parse] Extract fail:", e2.message); }
  }

  // Try 3: Remove markdown
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const cs = clean.indexOf('{'), ce = clean.lastIndexOf('}');
  if (cs !== -1 && ce !== -1 && ce > cs) {
    try { const r = JSON.parse(clean.slice(cs, ce + 1)); console.log("[parse] Clean OK"); return validateAndFixOutput(r); } catch (e3) { console.log("[parse] Clean fail:", e3.message); }
  }

  // Try 4: Fix common JSON errors (missing quotes, trailing commas, unquoted keys)
  try {
    let fixed = text
      .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":') // quote unquoted keys
      .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
      .replace(/"(\w+)"\s*:/g, '"$1":'); // normalize quotes
    const r = JSON.parse(fixed);
    console.log("[parse] Regex fix OK");
    return validateAndFixOutput(r);
  } catch (e4) { console.log("[parse] Regex fix fail:", e4.message); }

  // Fallback
  console.log("[parse] ALL FAILED - using fallback");
  return {
    statChanges: { selfId: 1, secrecy: 0, mood: 1 },
    affectionChanges: {},
    socialContent: {},
    kktMessages: {},
    story: text.substring(0, 500) || "The story continues...",
    options: ["A. Continue", "B. Change topic", "C. Stay silent", "D. Custom"],
  };
}

export function validateAndFixOutput(result) {
  // Fix multiple story keys
  if (typeof result.story === 'object' && result.story !== null && !Array.isArray(result.story)) {
    const allStories = [];
    for (const [key, value] of Object.entries(result)) {
      if (key === 'story' || (typeof value === 'string' && value.length > 20)) allStories.push(value);
    }
    result.story = allStories.join('\n\n') || "The story continues...";
  }

  if (!result.statChanges) result.statChanges = { selfId: 1, secrecy: 0, mood: 1 };
  // A non-object here is not merely useless, it throws: module code is strict, so
  // writing to Object.entries of a string below would be a TypeError and the
  // round would die on a malformed field we can simply discard.
  if (!result.affectionChanges || typeof result.affectionChanges !== "object" || Array.isArray(result.affectionChanges)) {
    result.affectionChanges = {};
  }
  // Clamp the delta, not the result. Bounding only the 0-100 result (which the
  // caller already does) limits where the player can end up but not how fast she
  // gets there, so a model answering +30 skipped three relationship stages in one
  // round. Non-numeric values become 0 rather than NaN, which would otherwise
  // poison that member's affection for the rest of the run; fractional values are
  // truncated because affection is an integer score and stage thresholds are
  // integer boundaries.
  for (const [id, delta] of Object.entries(result.affectionChanges)) {
    const n = Number(delta);
    result.affectionChanges[id] = Number.isFinite(n)
      ? Math.max(-AFFECTION_MAX_DELTA, Math.min(AFFECTION_MAX_DELTA, Math.trunc(n)))
      : 0;
  }
  if (!result.socialContent) result.socialContent = {};
  if (!result.kktMessages) result.kktMessages = {};
  if (!result.story || result.story.length < 20) result.story = "The story continues...";
  if (!result.summary || typeof result.summary !== "string") result.summary = "";
  // Strip any leaked JSON fragments the LLM embedded at the end of the story string.
  // Covers: ,"summary":"...", ,"options":[...], and similar key-value tails.
  if (result.story) {
    result.story = result.story
      .replace(/,?\s*"(?:summary|options|scene|statChanges|affectionChanges|socialContent|kktMessages)"\s*:[\s\S]*$/i, "")
      .trim();
  }
  // Secondary: strip if summary text itself was appended as plain prose
  if (result.story && result.summary && result.story.includes(result.summary.substring(0, 20))) {
    result.story = result.story.replace(result.summary, "").replace(/\s*[\[(【]?[Ss]ummary[^\]】)]*[\]】)]?\s*$/, "").trim();
  }
  if (result.story) {
    result.story = result.story
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\')
      .replace(/\\(?![n"\\\/])/g, '');
  }
  if (!result.options || !Array.isArray(result.options) || result.options.length < 4) {
    result.options = ["A. Continue", "B. Change topic", "C. Stay silent", "D. Custom"];
  }
  result.options = result.options.slice(0, 4);
  while (result.options.length < 4) result.options.push("D. Custom");

  // Fix bubble format
  if (result.socialContent) {
    for (const [mid, platforms] of Object.entries(result.socialContent)) {
      if (platforms && typeof platforms.bubble === 'string') platforms.bubble = [{ content: platforms.bubble, hasPhoto: false }];
      if (platforms && Array.isArray(platforms.bubble)) {
        platforms.bubble = platforms.bubble.map(item => {
          const post = typeof item === 'string' ? { content: item, hasPhoto: false } : { ...item };
          // The two fields are one feature and BubbleOverlay renders the frame off
          // the flag alone: a post claiming a photo with nothing to describe draws
          // an empty box. Keep them consistent here rather than in the component,
          // so the same rule holds for a save written by an older build.
          if (post.hasPhoto && !String(post.photoDesc || "").trim()) post.hasPhoto = false;
          return post;
        });
      }
    }
  }
  if (result.kktMessages) {
    for (const [mid, msgs] of Object.entries(result.kktMessages)) {
      if (typeof msgs === 'string') result.kktMessages[mid] = [msgs];
    }
  }

  console.log("[parse] Validated: story=", result.story?.length, "chars, options=", result.options?.length);
  return result;
}

// ============================================================
// Filter KKT
// ============================================================
function filterKktByAffection(kktMessages, affections, allTargetIds) {
  const filtered = {};
  for (const id of allTargetIds) filtered[id] = (affections[id] || 0) >= KKT_THRESHOLD ? (kktMessages[id] || []) : [];
  return filtered;
}

// ============================================================
// Main Loop
// ============================================================
export async function executeRound({
  playerChoice, stats, memory, form, members, mainId, subIds,
  groupConfig, world, apiKey, selectedModel, kktUnlocked, language, reasoningEnabled, aliyun = null,
  timeSpeed = "default",
}) {
  const allTargetIds = [mainId, ...subIds];
  const roundNum = stats.week;
  const npcIds = members.map(m => m.id).filter(id => !allTargetIds.includes(id));

  // Step 1: Collapse history if N full stories reached.
  // collapseHistoryIfNeeded mutates in place and destroys full story text, so it
  // runs on a clone: a round that fails at the LLM call must leave the caller's
  // memory exactly as it was, or the player's next attempt sends a ledger that
  // was collapsed early. The clone is handed back only on success.
  const roundMemberIds = allTargetIds;
  memory = JSON.parse(JSON.stringify(memory));
  collapseHistoryIfNeeded(memory);

  // Step 1a: Build 3-tier prompt blocks
  // Tier 1 (static)  — system prompt: rules, lore, member profiles, JSON schema
  // Tier 2 (ledger)  — append-only history: 2/3 rounds cache hit
  // Tier 3 (dynamic) — stats, affections, KKT: always cache miss, kept small
  const systemPrompt = buildSystemPrompt(form, members, mainId, subIds, groupConfig, '', selectedModel, language, world);
  const historyLedger = buildHistoryLedger(memory);
  const dynamicTail   = buildDynamicTail(memory, members, roundMemberIds, language);

  // Step 1.5: Init round variables
  let roundNotifs = [];
  let socialFeedsUpdate = {};

  // Step 2: LLM — 3-tier cache-optimized messages
  const cacheOptimizedMessages = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: historyLedger ? `[HISTORY]\n${historyLedger}` : "[HISTORY]\n(no history yet)" },
    { role: "user",   content: `[CURRENT STATE]\n${dynamicTail}${timeSpeed === "slow" ? "\n[Pacing] slow — stay in this moment, don't advance time much this round" : timeSpeed === "fast" ? "\n[Pacing] fast — advance time noticeably, skip ahead to the next event or date" : ""}\n\nPlayer choice: ${playerChoice}\n\nGenerate the next round. Output ONLY valid JSON.` },
  ];

  // A response that parses but carries no real story is a wasted round. Rather
  // than let validateAndFixOutput quietly swap in a placeholder, tell the client
  // it is unusable so it retries and, in free mode, moves to another model.
  const hasUsableStory = (content) => {
    try {
      const story = parseLLMOutput(content)?.story || "";
      return story.trim().length >= MIN_STORY_CHARS;
    } catch {
      return false;    // unparseable is the client's problem to retry, not ours
    }
  };

  const llmOutput = await callLLM('', [], '', apiKey, selectedModel, cacheOptimizedMessages, reasoningEnabled, aliyun, hasUsableStory);
  const parsed = parseLLMOutput(llmOutput);

  // Step 3: Compute
  const newStats = {
    ...stats,
    selfId: Math.max(0, Math.min(100, stats.selfId + (parsed.statChanges?.selfId || 0))),
    secrecy: Math.max(0, Math.min(100, stats.secrecy + (parsed.statChanges?.secrecy || 0))),
    mood: Math.max(0, Math.min(100, stats.mood + (parsed.statChanges?.mood || 0))),
    week: stats.week + 1,
    scene: parsed.scene || stats.scene,
    chapter: getChapterByRound(stats.week + 1),
  };

  if (parsed.affectionChanges) {
    newStats.multiAff = { ...stats.multiAff };
    for (const [id, delta] of Object.entries(parsed.affectionChanges)) {
      if (id === mainId) newStats.affection = Math.max(0, Math.min(100, stats.affection + (delta || 0)));
      else if (subIds.includes(id)) newStats.multiAff[id] = Math.max(0, Math.min(100, (stats.multiAff?.[id] || 0) + (delta || 0)));
    }
  }

  const currentAff = { [mainId]: newStats.affection, ...newStats.multiAff };
  const filteredKkt = filterKktByAffection(parsed.kktMessages || {}, currentAff, allTargetIds);

  const newKktUnlocked = { ...kktUnlocked };
  allTargetIds.forEach(id => { if (currentAff[id] >= KKT_THRESHOLD) newKktUnlocked[id] = true; });

  const stageChanges = [];
  const prevAff = memory.affections || {};
  allTargetIds.forEach(id => {
    const pv = prevAff[id] || 0, cv = currentAff[id] || 0;
    if (getStageIdx(cv) > getStageIdx(pv)) {
      const m = members.find(mb => mb.id === id);
      stageChanges.push({ memberId: id, memberName: m?.name, from: stageNameIn(pv, language), to: stageNameIn(cv, language) });
    }
  });

  // `pickPrimaryMember` used to be called here, and its result was used for exactly
  // one thing: writing a fabricated `memberAppearances` entry for whoever the lottery
  // drew AFTER the round was already generated. Appearances are observed from the prose
  // now, so the draw fed nothing at all — a `Math.random()` in the round path whose
  // result was discarded.
  //
  // The module is left in place, not deleted: whether to wire the engine into the
  // prompt (a hint in the tail, drawn BEFORE the call) or remove it is a decision about
  // whether rotation should feel mechanical, and it is written up in
  // `docs/PROPOSALS.md` §4. If it is wired, the call site is a different one.
  const relationshipEvent = checkRelationshipEvents(newStats, currentAff, allTargetIds, roundNum, members, language);
  const achievement = checkAchievement(newStats, currentAff, roundNum, language);

  // Special event detection
  const specialEvent = (relationshipEvent && (relationshipEvent.type === "proposal_ready" || relationshipEvent.type === "breakup_warning" || relationshipEvent.type === "pressure_warning"))
    ? relationshipEvent : null;

  // Step 4: Notifications
  const socialContent = parsed.socialContent || {};
  for (const [mid, platforms] of Object.entries(socialContent)) {
    if (!allTargetIds.includes(mid)) continue;
    if (platforms?.bubble) roundNotifs.push({ platform: "bubble", memberId: mid });
    if (platforms?.instagram) roundNotifs.push({ platform: "instagram", memberId: mid });
    if (platforms?.weverse) roundNotifs.push({ platform: "weverse", memberId: mid });
  }
  for (const [mid, msgs] of Object.entries(filteredKkt)) {
    if (msgs.length > 0) roundNotifs.push({ platform: "kakao", memberId: mid });
  }

  const topMember = getTopMember(members.filter(m => allTargetIds.includes(m.id)), currentAff);

  // Build social feeds
  for (const [mid, platforms] of Object.entries(socialContent)) {
    if (!allTargetIds.includes(mid)) continue;
    socialFeedsUpdate[mid] = {
      bubble: platforms?.bubble || [], instagram: platforms?.instagram || null,
      weverse: platforms?.weverse || null, timestamp: Date.now(), lastUpdate: Date.now(),
    };
  }

  // Store for next round
  pendingSocialFeeds = socialFeedsUpdate;
  pendingNotifications = roundNotifs;

  // Who the prose actually named. This used to be a single fabricated entry for
  // whichever member `pickPrimaryMember` drew AFTER the round was generated, so the
  // record described a lottery rather than the game — a member the story never
  // mentioned was logged as present, and the one who carried the scene often was not.
  //
  // Longest names first, masking each match as it is found, so a member whose name is
  // a substring of another's cannot have her absence reset by someone else appearing.
  const namedInStory = (() => {
    let scan = parsed.story || "";
    const found = [];
    for (const m of [...members].sort((a, b) => (b.name || "").length - (a.name || "").length)) {
      if (!m.name || !scan.includes(m.name)) continue;
      found.push(m.id);
      scan = scan.split(m.name).join(" ");
    }
    return found;
  })();

  // Update memory — append new full-story entry to history ledger
  const updatedMemory = updateMemory(memory, {
    playerStats: { selfId: newStats.selfId, secrecy: newStats.secrecy, mood: newStats.mood, week: newStats.week, scene: newStats.scene, chapter: newStats.chapter },
    affections: currentAff,
    historyEntry: { round: roundNum, type: 'full', text: parsed.story || "", choice: playerChoice, summary: parsed.summary || "" },
    kktMessages: filteredKkt,
    stageChanges,
    memberAppearances: Object.fromEntries(namedInStory.map(id => [id, [roundNum]])),
  });

  return {
    newStats,
    storyContent: parsed.story || "Story continues...",
    options: parsed.options || ["A. Continue", "B. Change topic", "C. Stay silent", "D. Custom"],
    roundNotifs,
    updatedMemory,
    stageChanges,
    socialFeedsUpdate,
    kktUpdate: filteredKkt,
    topMember,
    newKktUnlocked,
    specialEvent,
    relationshipEvent,
    achievement,
  };
}