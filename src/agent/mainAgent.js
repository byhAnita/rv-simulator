// src/agent/mainAgent.js
// v11.1 Final: Language enforcement + Social isolation + NPC no social + JSON hardening + Age texture + Chapter auto + Special events
import { callLLM } from "../tools/llmTool";
import { buildMemoryContext, updateMemory, getTopMember, createEmptyMemory } from "./memoryPool";
import { pickPrimaryMember } from "./probabilityEngine";
import { getStageIdx, getStageName } from "../config/stageConfig";
import { KKT_THRESHOLD, MEMORY_ROUNDS, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, GAME_YEAR } from "../config/constants";
import { checkRelationshipEvents } from "../config/relationshipEvents";
import { checkAchievement } from "../config/achievements";

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
export function buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel, language) {
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

  // Identity background
  const identityBg = getIdentityBackground(form.identity, mainMember?.name, language);

  // Pace rules
  const paceRules = {
    "慢热现实向": "[Pace: Slow Burn] Affection grows slowly. Members rarely initiate romantic moves. Focus on details and subtle tension. No rushing into relationship.",
    "浪漫情感向": "[Pace: Romantic] Balanced sweet/angst. Members may flirt during Flirting stage. Natural progression with mutual attraction.",
    "高压舆论向": "[Pace: High Pressure] Company alert and secrecy changes are amplified (x2). Scandal events more likely. Media and fan scrutiny higher. Every public interaction carries risk.",
    "修罗海王向": "[Pace: Harem Route] Affection grows faster. Love triangle probability doubled. Members compete more openly for your attention.",
  };
  const paceRule = paceRules[form.pace] || "";

  // Age texture for each member
  const playerBirthYear = GAME_YEAR - parseInt(form.age || 20);
  const memberDetails = members.map(m => {
    const memberBirthYear = parseInt((m.birthday || "2000-01-01").split('-')[0]) || 2000;
    const ageDiff = playerBirthYear - memberBirthYear;
    let ageTexture = '';
    if (language === "zh") {
      if (ageDiff > 2) ageTexture = `年下${ageDiff}岁。互动中有年下感，可能被当成妹妹/后辈看待。`;
      else if (ageDiff < -2) ageTexture = `年上${Math.abs(ageDiff)}岁。互动中有年上感，自然流露出照顾和保护欲。`;
      else ageTexture = `同龄人。相处更加平等自然，有同代人的默契。`;
    } else if (language === "ko") {
      if (ageDiff > 2) ageTexture = `${ageDiff}살 연하. 언니/선배로 대하는 느낌.`;
      else if (ageDiff < -2) ageTexture = `${Math.abs(ageDiff)}살 연상. 자연스럽게 보호하고 챙겨주는 느낌.`;
      else ageTexture = `동갑. 더 평등하고 자연스러운 관계.`;
    } else {
      if (ageDiff > 2) ageTexture = `${ageDiff} years younger. Interacts with a junior/sisterly feel.`;
      else if (ageDiff < -2) ageTexture = `${Math.abs(ageDiff)} years older. Naturally caring and protective.`;
      else ageTexture = `Same age. Equal, natural chemistry with generational默契.`;
    }

    const role = m.id === mainId ? "[MAIN - Core Romance Line]"
      : subIds.includes(m.id) ? "[SUB - Romanceable]"
      : "[NPC - Non-romanceable, must appear in background]";
    return `${m.emoji} ${m.name}(${m.name_kr}) ${role}
  Age Texture: ${ageTexture}
  Animal: ${m.animal_plastic}
  Public: ${m.public_image || ""}
  Private: ${m.private_personality || ""}
  Queer Texture: ${m.queer_texture || ""}${m.hidden_conflict ? `\n  Hidden Conflict: ${m.hidden_conflict}` : ""}`;
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
- MEMBER ROTATION: Balance main and sub members. The main member should still appear most rounds, but sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable member disappear for more than 3 rounds.

- Story length: 250-400 words in ${lr.lang}
- Style: Literary, emotional, sensory details (sight/sound/touch/smell)
- Open with 1-2 sentences establishing scene atmosphere
- NO SOCIAL MEDIA IN STORY: ABSOLUTELY FORBIDDEN to include phone notifications, messages, social media updates.
- Phase 1 (Rounds 1-6): First encounters. Awkward distance, professional politeness, subtle curiosity. No romantic moves.
- Phase 2 (Rounds 7-14): Repeated encounters. Growing familiarity, accidental touches, late-night talks, first hints of jealousy.
- Phase 3 (Rounds 15-24): Reality pressure. Dating rumors, company warnings, fan scrutiny, career vs feelings dilemma.
- Phase 4 (Rounds 25+): Consequences. Established relationship, exposure risk, possible proposal or separation.

║ 4. GROUP BACKGROUND                      ║
╚══════════════════════════════════════════╝
${groupConfig.groupLore}

╔══════════════════════════════════════════╗
║ 5. MEMBER PROFILES                       ║
╚══════════════════════════════════════════╝
${memberDetails}

╔══════════════════════════════════════════╗
║ 6. PLAYER SETTINGS                       ║
╚══════════════════════════════════════════╝
Name: ${form.name} | Age: ${form.age}
Identity: ${form.identity} | Pace: ${form.pace}
${paceRule}
Main Member: ${mainMember?.name}(${mainMember?.name_kr})
${subList.length > 0 ? `Sub Members: ${subList.map(m => m.name).join(", ")}` : ""}
${npcList.length > 0 ? `NPC Members: ${npcList.map(m => m.name).join(", ")} (non-romanceable, must appear in background)` : ""}
${identityBg}

╔══════════════════════════════════════════╗
║ 7. SOCIAL PLATFORM RULES                 ║
╚══════════════════════════════════════════╝
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
LLM decides stat changes +/-1-10 each round, NOT mandatory.

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
  "story": "Story text in ${lr.lang} (250-400 words). Pure story, NO stat bars, NO options.",
  "options": ["A. option text", "B. option text", "C. option text", "D. Custom"]
}

RULES:
- scene: A short location description (e.g., "SM Practice Room, 10PM").
- statChanges: at least 1 field non-zero (+/-1 to +/-10). Values are numbers.
- affectionChanges: at least 1 member non-zero (+/-1 to +/-10). Values are numbers.
- socialContent.bubble: MUST be an ARRAY like [{"content":"...","hasPhoto":false}], NOT a string.
- socialContent.instagram: MUST be an object {"caption":"...","likes":800000} or null.
- socialContent.weverse: MUST be an object {"content":"...","likes":2000,"comments":100} or null.
- kktMessages: Object with member IDs, each value is an ARRAY of strings or empty array [].
- story: PURE story text. NO stat bars, NO options embedded, NO repeated "story" keys.
- options: EXACTLY 4 option strings. PURE choice text. DO NOT include stat changes or route indicators.
- ALL content MUST be in ${lr.lang}. For Chinese/English: bubble/social content MUST NOT be in Korean.
- CRITICAL: All field types must match exactly. Arrays use [], objects use {}, strings use "", numbers are bare.

[MEMORY CONTEXT - Generate based on this]
${memoryContext}`;
}

// ============================================================
// Identity Background (Trilingual)
// ============================================================
function getIdentityBackground(identity, mainMemberName, language = "zh") {
  const name = mainMemberName || "her";
  const sepReasons = {
    zh: ["事业规划不同", "家庭压力", "年少不懂事", "聚少离多"],
    en: ["different career plans", "family pressure", "youthful immaturity", "long distance"],
    ko: ["서로 다른 진로 계획", "가족의 압력", "어린 시절의 미숙함", "바쁜 스케줄로 인한 소원함"],
  };
  const keepsakes = {
    zh: ["她送的手链", "一起拍的照片", "她写的信", "你们共同听过的CD"],
    en: ["a bracelet she gave", "a photo together", "a letter she wrote", "a CD you shared"],
    ko: ["그녀가 준 팔찌", "함께 찍은 사진", "그녀가 쓴 편지", "함께 듣던 CD"],
  };
  const reasons = sepReasons[language] || sepReasons.zh;
  const keeps = keepsakes[language] || keepsakes.zh;

  const backgrounds = {
    zh: {
      "练习生": `[身份背景] 你是${name}的练习生后辈, 与${name}在训练中自然相识。优势：接触自然，有共同训练记忆。劣势：公司内规严格，身份曝光影响双方前途。`,
      "Staff": `[身份背景] 你是${name}的Staff(造型/摄影/行政等岗位)，因工作频繁进入${name}的工作半径。优势：能接触真实台下状态。劣势：职场边界明确，暧昧可能被认定为失职。`,
      "韩娱艺人": `[身份背景] 你是其他公司的韩娱艺人，因合作活动与${name}相识。优势:身份平等，娱乐/时尚/影视合作机会。 劣势:公众关注度高,任何同框被粉丝解读, 会产生CP粉和毒唯。`,
      "粉丝": `[身份背景] 你是${name}的粉丝，通过特殊事件与她建立了私下联系。优势：对${name}有深度了解。劣势：身份极其敏感，曝光会被粉圈放大审判。`,
      "留学生": `[身份背景] 你是来韩留学的艺术生，因日常活动/共同朋友与${name}相识。优势：公众关注度低，有练舞/唱歌共同话题。劣势：身份差距、文化差异、思乡/学业压力。`,
      "财阀": `[身份背景] 你是女性财阀，可以给${name}提供娱乐/时尚资源，你与${name}公司高层相识。因商务活动(酒会/时装周/投资)与${name}相识。优势：充足资金和资源。劣势：公众关注度极高，身份差距大。`,
      "主线成员前女友": `[特殊身份背景-主线成员前女友]
- 你和${name}曾是恋人，几年前因${reasons[Math.floor(Math.random()*4)]}分手
- 你至今保留着${keeps[Math.floor(Math.random()*4)]}
- 现在重逢：尴尬、心情复杂、未说出口的话。初期互动刻意保持距离、眼神闪躲、礼貌但疏离
- 其他成员可能知道或不知道你们的过去。随着游戏推进，可能复合也可能各自前行`,
    },
    en: {
      "练习生": `[Identity: Trainee] You are a trainee junior who naturally met ${name} through training. Advantage: natural contact, shared memories. Disadvantage: strict company rules, exposure affects both futures.`,
      "Staff": `[Identity: Staff] You work at SM (styling/photography/admin) and frequently enter ${name}'s work radius. Advantage: access to real off-stage state. Disadvantage: clear workplace boundaries, any ambiguity = misconduct.`,
      "韩娱艺人": `[Identity: K-pop Artist] You are an artist from another company who met ${name} through collaboration. Advantage: equal status. Disadvantage: high public attention, any interaction analyzed by fans.`,
      "粉丝": `[Identity: Fan] You are ${name}'s fan who established private contact through special events. Advantage: deep knowledge of ${name}. Disadvantage: extremely sensitive identity, exposure = fan trial.`,
      "留学生": `[Identity: Student] You are a foreign student in Korea who met ${name} through daily activities/mutual friends. Advantage: low public attention, common interests. Disadvantage: status gap, culture shock, homesickness/academic pressure.`,
      "财阀": `[Identity: Female chaebol] You can provide entertainment/fashion resources to ${name}. You met ${name} at business events. Advantage: abundant resources. Disadvantage: extreme public attention, status gap.`,
      "主线成员前女友": `[Special Identity: Main Member's Ex-Girlfriend]
- You and ${name} were lovers years ago, separated due to ${reasons[Math.floor(Math.random()*4)]}
- You still keep ${keeps[Math.floor(Math.random()*4)]}
- Now reunited: awkwardness, complex feelings, unspoken words. Early interactions: deliberate distance, averted eyes, polite but cold.
- Other members may or may not know your past. As the game progresses, may reconcile or move on.`,
    },
    ko: {
      "练习生": `[신분: 연습생] 당신은 연습생 후배로 ${name}와 훈련 중 자연스럽게 알게 되었습니다. 장점: 자연스러운 접촉. 단점: 엄격한 회사 규정.`,
      "Staff": `[신분: 직원] 당신은 직원(스타일링/촬영/행정 등)으로 업무상 ${name}의 작업 반경에 자주 들어갑니다. 장점: 실제 생활을 알 수 있음. 단점: 명확한 직장 경계.`,
      "韩娱艺人": `[신분: 케이팝 아티스트] 당신은 다른 회사 소속 아티스트로, 협업을 통해 ${name}을 알게 됨. 장점: 동등한 지위. 단점: 대중의 높은 관심.`,
      "粉丝": `[신분: 팬] 당신은 ${name}의 팬으로 특별한 이벤트를 통해 그녀와 개인적인 연락을 구축했습니다. 장점: 깊은 이해. 단점: 극도로 민감한 신분.`,
      "留学生": `[신분: 유학생] 당신은 한국에서 미술을 전공하는 학생입니다. 일상 활동/공통 지인을 통해 ${name}을 만났습니다. 장점: 낮은 인지도. 단점: 문화적 충격, 학업 스트레스.`,
      "财阀": `[신분: 여성 재벌] 당신은 ${name}에게 연예/패션 업계의 자원을 제공할 수 있습니다. 장점: 풍부한 자원. 단점: 높은 대중적 인지도.`,
      "主线成员前女友": `[특별 신분: 메인 멤버의 전 여자친구]
- 당신과 ${name}는 몇 년 전 연인이었으나 ${reasons[Math.floor(Math.random()*4)]}로 인해 헤어졌습니다
- 당신은 아직도 ${keeps[Math.floor(Math.random()*4)]}을/를 간직하고 있습니다
- 현재 재회: 어색함, 복잡한 감정. 초기에는 의도적인 거리두기.`,
    },
  };
  return (backgrounds[language] || backgrounds.zh)[identity] || "";
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
  const storyMatch = text.match(/"story":\s*"([\s\S]*?)"\s*,\s*"options"/);
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
}) {
  const allTargetIds = [mainId, ...subIds];
  const roundNum = stats.week;
  const npcIds = members.map(m => m.id).filter(id => !allTargetIds.includes(id));

  // Step 1: Context
  const memoryContext = buildMemoryContext(memory, members, mainId, MEMORY_ROUNDS);
  const systemPrompt = buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel, language);

  // Step 1.5: Init round variables
  let roundNotifs = [];
  let socialFeedsUpdate = {};

  // Step 2: LLM
  const llmInput = `Player choice: ${playerChoice}\nGenerate the next round. Output ONLY valid JSON.`;
  const llmOutput = await callLLM(llmInput, [], systemPrompt, apiKey, selectedModel);
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
      stageChanges.push({ memberId: id, memberName: m?.name, from: getStageName(pv), to: getStageName(cv) });
    }
  });

  const primaryId = pickPrimaryMember(allTargetIds, currentAff, memory);
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

  const npcAppearances = { ...memory.npcAppearances };

  // Update memory
  const updatedMemory = updateMemory(memory, {
    playerStats: { selfId: newStats.selfId, secrecy: newStats.secrecy, mood: newStats.mood, week: newStats.week, scene: newStats.scene, chapter: newStats.chapter },
    affections: currentAff,
    storyRound: { round: roundNum, story: parsed.story?.substring(0, 500) || "", playerChoice },
    socialPosts: Object.entries(socialContent).filter(([mid]) => allTargetIds.includes(mid)).map(([mid, p]) => ({ platform: "all", memberId: mid, content: p?.bubble?.[0]?.content || p?.instagram?.caption || p?.weverse?.content || "", time: new Date().toLocaleTimeString() })),
    kktMessages: filteredKkt,
    stageChanges,
    memberAppearances: { [primaryId]: [roundNum] },
    npcAppearances,
  }, MEMORY_ROUNDS);

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