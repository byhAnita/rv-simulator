// src/agent/mainAgent.js
// v12: Queue-based special event system, round-0 first-meet, intro-phase auto-inject
import { callLLM } from "../tools/llmTool";
import { buildMemoryContext, updateMemory, getTopMember, createEmptyMemory } from "./memoryPool";
import { pickPrimaryMember } from "./probabilityEngine";
import { getStageIdx, getStageName } from "../config/stageConfig";
import { KKT_THRESHOLD, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, ENDING_MIN_ROUND, ENDING_MIN_AFFECTION, CAREER_EARLY_ROUND, CAREER_MID_ROUND, CAREER_LATE_ROUND, EMOTIONAL_EARLY_ROUND, EMOTIONAL_LATE_ROUND, MAX_QUEUE_STAY, MAX_D_SHOWN_COUNT, D_COOLDOWN } from "../config/constants";
import { checkRelationshipEvents } from "../config/relationshipEvents";
import { checkAchievement } from "../config/achievements";
import { buildCareerBackground, buildEmotionalBackground } from "../config/identityConfig";
import { pickRhythmEventForQueue, pickCareerEvent, pickEmotionalEvent, buildEpiloguePrompt } from "../config/specialEvents";

// Module-level globals: social media delayed by one round
let pendingSocialFeeds = null;
let pendingNotifications = [];
export function popPendingSocial() {
  const result = { feeds: pendingSocialFeeds, notifs: pendingNotifications };
  pendingSocialFeeds = null;
  pendingNotifications = [];
  return result;
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
export function buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel, language, roundMemberIds = [], queueDActive = false) {
  const mainMember = members.find(m => m.id === mainId);
  const identity = form.identity === "H" ? form.customIdentity : form.identity;
  const modelName = selectedModel || "AI";
  const allTargetIds = [mainId, ...subIds];
  const npcIds = members.map(m => m.id).filter(id => !allTargetIds.includes(id));
  const subList = subIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  const npcList = npcIds.map(id => members.find(m => m.id === id)).filter(Boolean);

  // Language rules
  const langRules = {
    zh: {
      lang: "Chinese (Simplified)",
      rule: "ALL generated content MUST be in Simplified Chinese (简体中文). DO NOT use Traditional Chinese (繁体中文). Korean words (like unnie, xi) may appear rarely with Simplified Chinese translation in parentheses.",
      storyRule: "Story text must be in Simplified Chinese.",
      socialRule: "Social media content must be in Simplified Chinese. DO NOT output Korean in bubble/instagram/weverse/KKT content.",
    },
    en: {
      lang: "English",
      rule: "ALL generated content MUST be in English. Korean words (like unnie, xi) may appear rarely with English translation in parentheses. DO NOT output Chinese characters.",
      storyRule: "Story text must be in English.",
      socialRule: "Social media content must be in English. DO NOT output Korean in bubble/instagram/weverse/KKT content.",
    },
    ko: {
      lang: "Korean",
      rule: "ALL generated content MUST be in Korean (한국어). DO NOT output English characters. DO NOT output Chinese characters.",
      storyRule: "Story text must be in Korean.",
      socialRule: "Social media content must be in Korean.",
    },
  };
  const lr = langRules[language] || langRules.zh;

  // Identity backgrounds (dual system)
  const company = groupConfig.group?.company || "";
  const careerBg = buildCareerBackground(form.careerIdentity, company, mainMember?.name, form.customCareerText, language);
  const emotionalBg = buildEmotionalBackground(form.emotionalIdentity, mainMember?.name, form.customEmotionalText, language, form.identityRandoms || {});
  const identityBg = [careerBg, emotionalBg].filter(Boolean).join("\n");

  const memberDetails = members.map(m => {
    const role = m.id === mainId ? "[MAIN - Core Romance Line]"
      : subIds.includes(m.id) ? "[SUB - Romanceable]"
      : "[NPC - Non-romanceable, background only]";
    return `${m.emoji} ${m.name}(${m.name_kr}) ${role}
  ★ Public Image: ${m.public_image || ""}
  ★ Private Personality: ${m.private_personality || ""}
  ★ Queer Texture: ${m.queer_texture || ""}${m.hidden_conflict ? `\n  Hidden Conflict: ${m.hidden_conflict}` : ""}
  Animal type: ${m.animal_plastic}`;
  }).join("\n\n");

  // JSON schema
  //const mainSocial = `"${mainId}": { "bubble": [{"content":"msg","hasPhoto":false}], "instagram": null, "weverse": null }`;
  //const subSocials = subIds.map(id => `"${id}": { "bubble": [{"content":"msg","hasPhoto":false}], "instagram": null, "weverse": null }`).join(",\n    ");
  //const kktFields = allTargetIds.map(id => `"${id}": ["msg"]`).join(",\n    ");
  // change to brief schema version
  const mainSocial = `"${mainId}": {"bubble":[{"content":"msg","hasPhoto":false}],"instagram":null,"weverse":null}`;
  const subSocials = subIds.map(id => `"${id}": {"bubble":[{"content":"msg","hasPhoto":false}],"instagram":null,"weverse":null}`).join(",");
  const kktFields = allTargetIds.map(id => `"${id}":["msg"]`).join(",");

  return `You are the Dungeon Master (DM) of a yuri dating simulator. This is a parallel-universe fictional work. Current AI: ${modelName}

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
CRITICAL: Output ONLY ONE valid JSON object. NO repeated keys. NO text outside JSON.
Every key (statChanges, affectionChanges, socialContent, kktMessages, story, options) must appear EXACTLY ONCE.
The key "story" must appear EXACTLY ONCE with a single string value.
DO NOT repeat "story" key. DO NOT put JSON inside the story string.
story value = ONE continuous text, no JSON syntax inside it.
First character: {  Last character: }
NO introductory text, NO closing remarks, NO markdown code blocks.

╔══════════════════════════════════════════╗
║ 3. STORY GENERATION                      ║
╚══════════════════════════════════════════╝
- GENDER: The player character is a young woman. ALL idol members are women. This is a yuri (WLW) story. Use female pronouns (她/she/그녀) for the player at ALL times, no exceptions.
- SPECIAL EVENT OVERRIDE: If the user message contains a [SPECIAL EVENT] block, that event MUST be the main scene of this round. All other story direction is secondary. Do not continue the previous scene — 1-2 sentences establishing a smooth narrative bridge transition into to build the new scene around the event described.

- MEMBER ROTATION: Balance main and sub members. The main member should still appear most rounds, but sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable member disappear for more than 3 rounds.

- Story length: 250-350 words in ${lr.lang}
- Style: Literary, emotional, sensory details (sight/sound/touch/smell)
- Open with 1-2 sentences establishing scene atmosphere
- NO SOCIAL MEDIA IN STORY: ABSOLUTELY FORBIDDEN to include phone notifications, messages, social media updates.
- Phase 1 (Rounds 1-6): First encounters. Awkward distance, professional politeness, subtle curiosity. No romantic moves.
- Phase 2 (Rounds 7-14): Repeated encounters. Growing familiarity, accidental touches, late-night talks, first hints of jealousy.
- Phase 3 (Rounds 15-24): Reality pressure. Dating rumors, company warnings, fan scrutiny, career vs feelings dilemma.
- Phase 4 (Rounds 25+): Consequences. Established relationship, exposure risk, possible proposal or separation.

║ 4. GROUP BACKGROUND                      ║
╚══════════════════════════════════════════╝
This is the established world-setting. Draw from it freely — reference group history, inside jokes, shared memories, and past events to enrich scene texture and continuity.
${groupConfig.groupLore}

╔══════════════════════════════════════════╗
║ 5. MEMBER PROFILES                       ║
╚══════════════════════════════════════════╝
CRITICAL: ★ Public Image / Private Personality / Queer Texture are the PRIMARY differentiators for every scene. The same event must feel distinct depending on which member is present — her voice, body language, reactions, and subtext should all reflect her personality. Never flatten members into a generic idol type.
${memberDetails}

╔══════════════════════════════════════════╗
║ 6. PLAYER SETTINGS                       ║
╚══════════════════════════════════════════╝
Name: ${form.name} | Player: young WLW woman
Career Identity: ${form.careerIdentity || form.identity || ""}${form.emotionalIdentity && form.emotionalIdentity !== "none" ? ` | Emotional Background: ${form.emotionalIdentity}` : ""}
Main Member: ${mainMember?.name}(${mainMember?.name_kr})
${subList.length > 0 ? `Sub Members: ${subList.map(m => m.name).join(", ")}` : ""}
${npcList.length > 0 ? `NPC Members: ${npcList.map(m => m.name).join(", ")} (non-romanceable, must appear in background)` : ""}
${identityBg}
${form.emotionalIdentity && form.emotionalIdentity !== "none" ? `CRITICAL: The above emotional background applies EXCLUSIVELY to ${mainMember?.name}. Sub members have NO special emotional history with the player — treat them as normal acquaintances regardless of affection level.` : ""}

╔══════════════════════════════════════════╗
║ 7. SOCIAL PLATFORM RULES                 ║
╚══════════════════════════════════════════╝
- LANGUAGE: ${lr.lang}.
- Bubble: member-to-fan daily sharing. 1-3 posts. Style: warm, cute, casual.
- Instagram: Photo social. Style: aesthetic, short caption + emoji.
- Weverse: Fan community. Style: friendly, natural.
- KKT (KakaoTalk): Private chat, member-to-player. Style: flirty/caring/casual.
- Only main and sub members generate social content. NPC members DO NOT generate social content.

╔══════════════════════════════════════════╗
║ 8. NPC RULES                             ║
╚══════════════════════════════════════════╝
- NPC: max 1 dialogue/round, 2-round cooldown.
- All members must be present in group scenes

╔══════════════════════════════════════════╗
║ 9. GAME RULES                            ║
╚══════════════════════════════════════════╝
- Relationship stages: - Stages: 0-15 Stranger, 16-30 Acquaintance, 31-50 Interest, 51-65 Flirting, 66-80 Confirmed, 81-90 Passionate, 91-100 Trial.
- Tone: 60% sweet, 30% realistic pressure, 10% youthful regret.

╔══════════════════════════════════════════╗
║ 10. STAT SYSTEM                          ║
╚══════════════════════════════════════════╝
Player 4 stats: 🌈Self-Identity | 🔒Secrecy(lower=more exposed) | 💫Mood | 📅Round
Stat delta ranges per round (MUST stay within these bounds):
- selfId: -3 to +5
- secrecy: -6 to 0
- mood: -8 to +10
- affection (each member): -3 to +5

╔══════════════════════════════════════════╗
║ JSON SCHEMA - MUST FOLLOW EXACTLY        ║
╚══════════════════════════════════════════╝
{
  "scene": "Location description in ${lr.lang}",
  "statChanges": { "selfId": 0, "secrecy": 0, "mood": 0 },
  "affectionChanges": { "${mainId}": 0${subIds.map(id => `, "${id}": 0`).join("")} },
  "socialContent": {
    ${mainSocial}${subIds.length > 0 ? ",\n    " + subSocials : ""}
  },
  "kktMessages": {
    ${kktFields}
  },
  "story": "Story text in ${lr.lang} (250-350 words). Pure story, NO stat bars, NO options.",
  "summary": "One sentence (~100 chars) summarizing what happened this round and who appeared. In English.",
  "options": ["A. option text", "B. option text", "C. option text", "${queueDActive ? "D. [reserved]" : "D. Custom"}"]
}

RULES:
- scene: A short location description (e.g., "SM Practice Room, 10PM").
- statChanges: at least 1 field non-zero. Respect delta ranges from stat system rules. Values are numbers.
- affectionChanges: at least 1 member non-zero. Values are numbers.
- socialContent.bubble: MUST be an ARRAY like [{"content":"...","hasPhoto":false}], NOT a string.
- socialContent.instagram: MUST be an object {"caption":"...","likes":800000} or null.
- socialContent.weverse: MUST be an object {"content":"...","likes":2000,"comments":100} or null.
- kktMessages: Object with member IDs, each value is an ARRAY of strings or empty array [].
- story: PURE story text. NO stat bars, NO options embedded, NO repeated "story" keys.
- summary: ALWAYS required. One short English sentence capturing who appeared and what emotionally shifted.
- options: EXACTLY 4 option strings. PURE choice text. DO NOT include stat changes or route indicators. Style: warm/flirty/sweet/casual.${queueDActive ? "\n- Option D is pre-assigned externally this round. Output exactly \"D. [reserved]\" for D. Focus all creativity on A, B, C." : ""}
- ALL story/social/option content MUST be in ${lr.lang}. summary is always in English.
- For Chinese/English: bubble/social content MUST NOT be in Korean.
- CRITICAL: All field types must match exactly. Arrays use [], objects use {}, strings use "", numbers are bare.

[MEMORY CONTEXT - Generate based on this]
${memoryContext}`;
}

// ============================================================
// Generate Custom Events (async, fires after round 0 for custom identities)
// ============================================================
export async function generateCustomEvents({ form, members, mainId, apiKey, selectedModel, language }) {
  const mainMember = members.find(m => m.id === mainId);
  const n = mainMember?.name || "her";
  const careerIsCustom = form.careerIdentity === "custom";
  const emotionalIsCustom = form.emotionalIdentity === "custom";
  if (!careerIsCustom && !emotionalIsCustom) return {};

  const systemMsg = "You are a game designer creating personalized story events for a yuri K-pop idol dating simulator. Output ONLY valid JSON, no text outside JSON.";

  let userMsg = `Generate story event prompts and multilingual D-option intro texts for a custom player identity.

Main member: ${n}
Player name: ${form.name || "player"}
`;
  if (careerIsCustom) {
    userMsg += `\nCustom career background: ${form.customCareerText || "(none provided)"}
Generate 3 career event tiers. Each should be a natural scene that fits this career context and develops the relationship with ${n}.
- early (round ~1): A first awkward or professional moment that hints at chemistry.
- mid (round ~14): A turning-point scene where boundaries blur.
- late (round ~28): A high-stakes scene that forces a clearer emotional stance.`;
  }
  if (emotionalIsCustom) {
    userMsg += `\nCustom emotional background: ${form.customEmotionalText || "(none provided)"}
Generate 2 emotional event tiers. Each should surface the emotional history naturally.
- early (round ~3): A subtle first moment where the emotional past surfaces.
- late (round ~6): A more direct confrontation or breakthrough of the emotional connection.`;
  }
  userMsg += `\n\nOutput this JSON schema exactly:
{
  ${careerIsCustom ? `"career": {
    "early": {"prompt": "2-4 sentence scene description in English. Name ${n} directly.", "intro_zh": "~15-char player-action lead-in in Chinese", "intro_en": "~8-word player-action lead-in in English", "intro_ko": "~15-char player-action lead-in in Korean"},
    "mid":   {"prompt": "...", "intro_zh": "...", "intro_en": "...", "intro_ko": "..."},
    "late":  {"prompt": "...", "intro_zh": "...", "intro_en": "...", "intro_ko": "..."}
  }${emotionalIsCustom ? "," : ""}` : ""}
  ${emotionalIsCustom ? `"emotional": {
    "early": {"prompt": "2-4 sentence scene description in English. Name ${n} directly.", "intro_zh": "~15-char player-action lead-in in Chinese", "intro_en": "~8-word player-action lead-in in English", "intro_ko": "~15-char player-action lead-in in Korean"},
    "late":  {"prompt": "...", "intro_zh": "...", "intro_en": "...", "intro_ko": "..."}
  }` : ""}
}

Rules:
- prompt: English only. Describes the scene for the story AI. Reference ${n} by name.
- intro_zh/en/ko: Short first-person player action (e.g. "你走向她" / "You walk toward her" / "그녀에게 다가간다"). This is shown as option D in the game — keep it brief and action-focused.`;

  try {
    const output = await callLLM(userMsg, [], systemMsg, apiKey, selectedModel);
    const s = output.indexOf('{'), e = output.lastIndexOf('}');
    if (s === -1 || e === -1) return {};
    const parsed = JSON.parse(output.slice(s, e + 1));
    return {
      customCareerEvents: careerIsCustom ? parsed.career : undefined,
      customEmotionalEvents: emotionalIsCustom ? parsed.emotional : undefined,
    };
  } catch (err) {
    console.error("[generateCustomEvents] Failed:", err);
    return {};
  }
}

// Convert a custom event tier object {prompt, intro_zh, intro_en, intro_ko} into the
// standard queue-compatible shape {id, prompt, intro: {zh, en, ko}}.
function customEventToQueueItem(tier, customEvents, idPrefix) {
  const ev = customEvents?.[tier];
  if (!ev?.prompt) return null;
  return {
    id: `${idPrefix}_${tier}_custom`,
    prompt: ev.prompt,
    intro: { zh: ev.intro_zh || "", en: ev.intro_en || "", ko: ev.intro_ko || "" },
  };
}

// ============================================================
// Generate Epilogue (separate LLM call, free-form prose)
// ============================================================
export async function generateEpilogue({ rhythm, mainMember, allMembers, affections, summaries, language, apiKey, selectedModel, playerName }) {
  const userMsg = buildEpiloguePrompt(rhythm, mainMember, allMembers, affections, summaries, language, playerName);
  const systemMsg = "You are a literary author writing a short epilogue scene. Output only the prose — no JSON, no headers, no commentary.";
  const output = await callLLM(userMsg, [], systemMsg, apiKey, selectedModel);
  return output || "";
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

  // Preprocess: escape unescaped newlines in story field
  // "summary" now sits between "story" and "options" in the schema
  const storyMatch = text.match(/"story":\s*"([\s\S]*?)"\s*,\s*"(?:summary|options)"/);
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

function validateAndFixOutput(result) {
  // Fix multiple story keys
  if (typeof result.story === 'object' && result.story !== null && !Array.isArray(result.story)) {
    const allStories = [];
    for (const [key, value] of Object.entries(result)) {
      if (key === 'story' || (typeof value === 'string' && value.length > 20)) allStories.push(value);
    }
    result.story = allStories.join('\n\n') || "The story continues...";
  }

  if (!result.statChanges) result.statChanges = { selfId: 1, secrecy: 0, mood: 1 };
  if (!result.affectionChanges) result.affectionChanges = {};
  if (!result.socialContent) result.socialContent = {};
  if (!result.kktMessages) result.kktMessages = {};
  if (!result.story || result.story.length < 20) result.story = "The story continues...";
  if (!result.summary || typeof result.summary !== "string") result.summary = "";
  // Strip any summary text the LLM may have appended to the story field
  if (result.story && result.summary && result.story.includes(result.summary.substring(0, 20))) {
    result.story = result.story.replace(result.summary, "").replace(/\s*[\[(【]?[Ss]ummary[^\]】)]*[\]】)]?\s*$/, "").trim();
  }
  if (result.story && result.story.includes('\\n')) {
    result.story = result.story.replace(/\\n/g, '\n').replace(/\\"/g, '"');
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
        platforms.bubble = platforms.bubble.map(item => typeof item === 'string' ? { content: item, hasPhoto: false } : item);
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
  groupConfig, apiKey, selectedModel, kktUnlocked, language,
  rhythm = "free", triggeredEventIds = [],
  specialEventQueue = [], queueCooldown = 0,
}) {
  const allTargetIds = [mainId, ...subIds];
  const roundNum = stats.week;

  const careerIdentity = form.careerIdentity || "";
  const emotionalIdentity = form.emotionalIdentity || "none";
  const mainMemberObj = members.find(m => m.id === mainId);
  const subList = subIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  const npcList = members.filter(m => !allTargetIds.includes(m.id));

  // ── Context ──────────────────────────────────────────────────
  const roundMemberIds = allTargetIds;
  const memoryContext = buildMemoryContext(memory, members, mainId, roundMemberIds);

  // ── Special event / queue logic ──────────────────────────────
  let specialEventBlock = null;
  let newTriggeredIds = [...triggeredEventIds];
  let nextQueue = [...specialEventQueue];
  let nextQueueCooldown = queueCooldown;
  let activeQueueItem = null;

  const isIntroPhase = roundNum > 0 && roundNum < EMOTIONAL_LATE_ROUND;
  const isQueuePhase = roundNum >= EMOTIONAL_LATE_ROUND;

  // INTRO PHASE: auto-inject career early / emotional early
  if (isIntroPhase) {
    // Career early — hardcoded or custom (try target round then +1 if custom events not yet ready)
    const careerEarlyRounds = careerIdentity === "custom"
      ? [CAREER_EARLY_ROUND, CAREER_EARLY_ROUND + 1]
      : [CAREER_EARLY_ROUND];
    if (careerIdentity && careerEarlyRounds.includes(roundNum)) {
      let ev = null;
      if (careerIdentity === "custom") {
        ev = customEventToQueueItem("early", form.customCareerEvents, "career");
      } else {
        ev = pickCareerEvent(careerIdentity, "early", newTriggeredIds);
      }
      if (ev && !newTriggeredIds.includes(ev.id)) {
        const prompt = ev.prompt
          .replace(/\$\{n\}/g, mainMemberObj?.name || "")
          .replace(/\$\{randoms\.(\w+)\}/g, (_, k) => form.identityRandoms?.[k] || "");
        specialEventBlock = `Target member: ${mainMemberObj?.name}\n${prompt}`;
        newTriggeredIds = [...newTriggeredIds, ev.id];
      }
    }

    // Emotional early — hardcoded or custom
    const emotionalEarlyRounds = emotionalIdentity === "custom"
      ? [EMOTIONAL_EARLY_ROUND, EMOTIONAL_EARLY_ROUND + 1]
      : [EMOTIONAL_EARLY_ROUND];
    if (emotionalIdentity !== "none" && emotionalEarlyRounds.includes(roundNum) && !specialEventBlock) {
      let ev = null;
      if (emotionalIdentity === "custom") {
        ev = customEventToQueueItem("early", form.customEmotionalEvents, "emotional");
      } else {
        ev = pickEmotionalEvent(emotionalIdentity, "early", newTriggeredIds);
      }
      if (ev && !newTriggeredIds.includes(ev.id)) {
        const prompt = ev.prompt
          .replace(/\$\{n\}/g, mainMemberObj?.name || "")
          .replace(/\$\{randoms\.(\w+)\}/g, (_, k) => form.identityRandoms?.[k] || "");
        specialEventBlock = `Target member: ${mainMemberObj?.name}\n${prompt}`;
        newTriggeredIds = [...newTriggeredIds, ev.id];
      }
    }
  }

  // QUEUE PHASE ─────────────────────────────────────────────────
  if (isQueuePhase) {
    // A. Detect player chose D last round → inject front item this round
    const playerChoseD = playerChoice.startsWith("D.") && nextQueue.length > 0 && queueCooldown === 0;
    if (playerChoseD) {
      const front = nextQueue[0];
      const targetMember = members.find(m => m.id === front.memberId) || mainMemberObj;
      const prompt = front.event.prompt
        .replace(/\$\{n\}/g, targetMember?.name || "")
        .replace(/\$\{randoms\.(\w+)\}/g, (_, k) => form.identityRandoms?.[k] || "");
      specialEventBlock = `Target member: ${targetMember?.name || ""}\n${prompt}`;
      newTriggeredIds = [...newTriggeredIds, front.event.id];
      nextQueue = nextQueue.slice(1);
      nextQueueCooldown = D_COOLDOWN;
    }

    // B. Expire items exceeding MAX_QUEUE_STAY
    nextQueue = nextQueue.filter(item => (roundNum - item.entryRound) < MAX_QUEUE_STAY);

    // C. Push new priority items to front (career mid/late, emotional late)
    // Custom identity events use +1 deferral window if events not yet generated.
    const newPriority = [];

    const careerMidRounds = careerIdentity === "custom" ? [CAREER_MID_ROUND, CAREER_MID_ROUND + 1] : [CAREER_MID_ROUND];
    if (careerIdentity && careerMidRounds.includes(roundNum)) {
      const ev = careerIdentity === "custom"
        ? customEventToQueueItem("mid", form.customCareerEvents, "career")
        : pickCareerEvent(careerIdentity, "mid", newTriggeredIds);
      if (ev && !newTriggeredIds.includes(ev.id)) newPriority.push({ event: ev, memberId: mainId, category: "career", entryRound: roundNum, dShownCount: 0, intro: ev.intro });
    }

    const careerLateRounds = careerIdentity === "custom" ? [CAREER_LATE_ROUND, CAREER_LATE_ROUND + 1] : [CAREER_LATE_ROUND];
    if (careerIdentity && careerLateRounds.includes(roundNum)) {
      const ev = careerIdentity === "custom"
        ? customEventToQueueItem("late", form.customCareerEvents, "career")
        : pickCareerEvent(careerIdentity, "late", newTriggeredIds);
      if (ev && !newTriggeredIds.includes(ev.id)) newPriority.push({ event: ev, memberId: mainId, category: "career", entryRound: roundNum, dShownCount: 0, intro: ev.intro });
    }

    const emotionalLateRounds = emotionalIdentity === "custom" ? [EMOTIONAL_LATE_ROUND, EMOTIONAL_LATE_ROUND + 1] : [EMOTIONAL_LATE_ROUND];
    if (emotionalIdentity !== "none" && emotionalLateRounds.includes(roundNum)) {
      const ev = emotionalIdentity === "custom"
        ? customEventToQueueItem("late", form.customEmotionalEvents, "emotional")
        : pickEmotionalEvent(emotionalIdentity, "late", newTriggeredIds);
      if (ev && !newTriggeredIds.includes(ev.id)) newPriority.push({ event: ev, memberId: mainId, category: "emotional", entryRound: roundNum, dShownCount: 0, intro: ev.intro });
    }

    nextQueue = [...newPriority, ...nextQueue];

    // D. Push rhythm event to back if no rhythm event currently queued
    if (rhythm !== "free" && !nextQueue.some(i => i.category === "rhythm")) {
      const currentAffForQueue = { [mainId]: stats.affection, ...stats.multiAff };
      const rhythmPick = pickRhythmEventForQueue(rhythm, currentAffForQueue, stats.secrecy, members.filter(m => allTargetIds.includes(m.id)), newTriggeredIds);
      if (rhythmPick) {
        nextQueue = [...nextQueue, { event: rhythmPick.event, memberId: rhythmPick.memberId, category: "rhythm", entryRound: roundNum, dShownCount: 0, intro: rhythmPick.event.intro }];
      }
    }

    // E. Determine active D item for this round
    if (nextQueueCooldown > 0) {
      nextQueueCooldown--;  // decrement; D = custom this round
    } else {
      // Discard front items that have exceeded MAX_D_SHOWN_COUNT
      while (nextQueue.length > 0 && nextQueue[0].dShownCount >= MAX_D_SHOWN_COUNT) {
        nextQueue = nextQueue.slice(1);
      }
      if (nextQueue.length > 0) {
        activeQueueItem = nextQueue[0];
        nextQueue = [{ ...nextQueue[0], dShownCount: nextQueue[0].dShownCount + 1 }, ...nextQueue.slice(1)];
      }
    }
  }

  // ── Build system prompt ───────────────────────────────────────
  const systemPrompt = buildSystemPrompt(
    form, members, mainId, subIds, groupConfig, memoryContext,
    selectedModel, language, roundMemberIds, !!activeQueueItem
  );

  // ── Build user message ────────────────────────────────────────
  let userMsg = `Player choice: ${playerChoice}`;

  // Round 0: background-only first-meet scene
  if (roundNum === 0) {
    const emotionalHints = {
      ex_gf: `${mainMemberObj?.name} and the player have a past as ex-girlfriends. This is a reunion, not a first meeting — she is deliberately polite but not warm, keeping deliberate distance.`,
      secret_crush: `${mainMemberObj?.name} secretly had feelings for the player before. She knows exactly what this reunion means; the player does not. She may betray small tells of familiarity.`,
      fate_encounter: `${mainMemberObj?.name} and the player share an unspoken memory from a previous night together. Both are performing normalcy in this professional context.`,
    };
    const emotionalHint = emotionalHints[emotionalIdentity] || `${mainMemberObj?.name} meets the player for the first time in a professional context.`;
    userMsg += `\n\n[GAME OPENING — ROUND 0]
This is the very first scene of the game. Build a natural first-encounter scene in one unified setting where the player arrives in their career role and meets ALL group members.
- Sub members (${subList.map(m => m.name).join(", ") || "none"}) and NPC members (${npcList.map(m => m.name).join(", ") || "none"}): genuine first meetings with the player.
- Main member (${mainMemberObj?.name}): ${emotionalHint}
Do NOT inject any special event. Focus on world-building, character establishment, and the player's career role.`;
  }

  // Intro phase: emotional subtext reminder (rounds 1 to EMOTIONAL_LATE_ROUND-1)
  if (isIntroPhase && emotionalIdentity !== "none" && emotionalIdentity !== "custom") {
    const subtextHints = {
      ex_gf: `${mainMemberObj?.name} and the player have a shared past. She is keeping deliberate distance — polite but not warm. Small involuntary familiar gestures may slip through.`,
      secret_crush: `${mainMemberObj?.name} quietly cared for the player before they were properly introduced. Subtle tells may surface: remembering details, instinctive attentiveness.`,
      fate_encounter: `${mainMemberObj?.name} and the player share an unspoken memory from a previous night together. Both are performing normalcy. Brief moments of mutual recognition may surface.`,
    };
    const hint = subtextHints[emotionalIdentity];
    if (hint) userMsg += `\n\n[INTRO PHASE — EMOTIONAL SUBTEXT]\n${hint}`;
  }

  // Special event injection
  if (specialEventBlock) {
    userMsg += `\n\n[SPECIAL EVENT — THIS ROUND ONLY]\nThe story MUST open with 1–2 sentences that naturally continue or close out the previous round's situation (smooth narrative bridge). Then transition into the following required event as the main scene. Player choice is secondary context only.\n${specialEventBlock}`;
  }

  userMsg += `\nGenerate the next round. Output ONLY valid JSON.`;

  // ── LLM call ─────────────────────────────────────────────────
  let roundNotifs = [];
  let socialFeedsUpdate = {};

  const llmOutput = await callLLM(userMsg, [], systemPrompt, apiKey, selectedModel);
  const parsed = parseLLMOutput(llmOutput);

  // Overwrite D option with queue intro text if active
  if (activeQueueItem && parsed.options && parsed.options.length >= 4) {
    const introText = activeQueueItem.intro?.[language] || activeQueueItem.intro?.zh || "";
    parsed.options[3] = introText ? `D. ${introText.replace(/^D\.\s*/, "")}` : "D. Custom";
  }

  // ── Compute stats ─────────────────────────────────────────────
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
      stageChanges.push({ memberId: id, memberName: m?.name, from: getStageName(pv), to: getStageName(cv) });
    }
  });

  const primaryId = pickPrimaryMember(allTargetIds, currentAff, memory);
  const relationshipEvent = checkRelationshipEvents(newStats, currentAff, allTargetIds, roundNum, members, language);
  const achievement = checkAchievement(newStats, currentAff, roundNum, language);

  const topAffValue = Math.max(...Object.values(currentAff));
  const endingUnlocked = newStats.week >= ENDING_MIN_ROUND && topAffValue >= ENDING_MIN_AFFECTION;

  // Notifications
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

  for (const [mid, platforms] of Object.entries(socialContent)) {
    if (!allTargetIds.includes(mid)) continue;
    socialFeedsUpdate[mid] = {
      bubble: platforms?.bubble || [], instagram: platforms?.instagram || null,
      weverse: platforms?.weverse || null, timestamp: Date.now(), lastUpdate: Date.now(),
    };
  }

  pendingSocialFeeds = socialFeedsUpdate;
  pendingNotifications = roundNotifs;

  const npcAppearances = { ...memory.npcAppearances };

  const updatedMemory = updateMemory(memory, {
    playerStats: { selfId: newStats.selfId, secrecy: newStats.secrecy, mood: newStats.mood, week: newStats.week, scene: newStats.scene, chapter: newStats.chapter },
    affections: currentAff,
    summary: parsed.summary ? { round: roundNum, memberId: primaryId, summary: parsed.summary } : null,
    storyRound: { round: roundNum, story: parsed.story || "", playerChoice },
    kktMessages: filteredKkt,
    stageChanges,
    memberAppearances: { [primaryId]: [roundNum] },
    npcAppearances,
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
    relationshipEvent,
    achievement,
    newTriggeredIds,
    endingUnlocked,
    newSpecialEventQueue: nextQueue,
    newQueueCooldown: nextQueueCooldown,
  };
}