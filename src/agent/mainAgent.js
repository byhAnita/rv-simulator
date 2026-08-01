// src/agent/mainAgent.js
// v11.1 Final: Language enforcement + Social isolation + NPC no social + JSON hardening + Age texture + Chapter auto + Special events
import { callLLM } from "../tools/llmTool";
import { buildMemoryContext, updateMemory, getTopMember, createEmptyMemory, isLegacyMemory } from "./memoryPool";
import { pickPrimaryMember } from "./probabilityEngine";
import { getStageIdx, getStageName } from "../config/stageConfig";
import { KKT_THRESHOLD, MEMORY_SUMMARY_MAX, MEMORY_STORY_MAX, KKT_MAX, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX, GAME_YEAR } from "../config/constants";
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
    "慢热现实向": "[Pace: Slow Burn] Flipped & Ambiguous. Affection grows slowly. Focus on details and subtle tension. No rushing into relationship.",
    "浪漫情感向": "[Pace: Romantic] Ambiguous & Romantic. Natural progression with mutual attraction. Members flirt during Flirting stage. ",
    "高压舆论向": "[Pace: High Pressure] Media and fan scrutiny higher, secrecy changes doubled. Public interaction may carry attention, dissected by CP fans and solo stans.",
    "修罗海王向": "[Pace: Harem Route] Light comedic. Love triangle scences probability doubled. Members compete more openly for your attention.",
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
Every key (statChanges, affectionChanges, socialContent, kktMessages, story, summary, options) must appear EXACTLY ONCE.
The key "story" must appear EXACTLY ONCE with a single string value.
DO NOT repeat "story" key. DO NOT put JSON inside the story string.
story value = ONE continuous text, no JSON syntax inside it.
First character: {  Last character: }
NO introductory text, NO closing remarks, NO markdown code blocks.

╔══════════════════════════════════════════╗
║ 3. STORY GENERATION                      ║
╚══════════════════════════════════════════╝
- MEMBER ROTATION: Balance main and sub members. The main member should still appear most rounds, but sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable member disappear for more than 3 rounds.

- Story length: 350 - 450 words in ${lr.lang}
- Style: Literary, emotional, sensory details (sight/sound/touch/smell).
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
Identity: ${form.identity}
Progression Pace: ${form.pace}
Main Member: ${mainMember?.name}(${mainMember?.name_kr})
${subList.length > 0 ? `Sub Members: ${subList.map(m => m.name).join(", ")}` : ""}
${npcList.length > 0 ? `NPC Members: ${npcList.map(m => m.name).join(", ")} (non-romanceable, must appear in background)` : ""}
${identityBg}

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
  "story": "Story text in ${lr.lang} (350-450 words). Pure story, NO stat bars, NO options.",
  "summary": "One sentence (~100 chars) summarizing what happened this round and who appeared. In English.",
  "options": ["A. option text", "B. option text", "C. option text", "D. option text"]
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
- summary: ALWAYS required. One short English sentence capturing who appeared and what emotionally shifted.
- options: EXACTLY 4 option strings. PURE choice text. DO NOT include stat changes or route indicators.
- ALL story/social/option content MUST be in ${lr.lang}. summary is always in English.
- For Chinese/English: bubble/social content MUST NOT be in Korean.
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
      "练习生": `[身份背景] 你是${name}的练习生后辈, 与${name}在公司练习室自然相识。\ 典型事件：向${name}请教舞台发声和舞蹈技巧；\ 在公司走廊偶遇时${name}顺手帮你整理了一下发型；\ 深夜练习室和${name}两人练到最后，互相袒露心声；\ 被选入公司综艺后辈特辑与${name}共同出镜等 \ 优势：接触自然，有共同训练记忆。劣势：公司内规严格，前后辈身份差异。`,
      "Staff": `[身份背景] 你是${name}的新任Staff(助理+经纪人)，负责组合打歌行程、妆发协调、后台照顾${name}等。\ 典型事件：去练习室探班给全组带奶茶，${name}对此感到意外且有些受宠若惊；\ 深夜陪${name}下班开车送她回宿舍，接纳她的脆弱； \ 打歌后台关心${name}状态督促她吃饭等 \ 优势：能接触真实台下状态。劣势：职场边界明确，暧昧可能被认定为失职。`,
      "韩娱艺人": `[身份背景] 你是其他公司的kpop女idol, 与${name}有合作机会。\ 典型事件：你和${name}两人私下排练合作舞台，逐渐熟悉和默契；\ 你和${name}在音乐银行合作打歌舞台, 互动被CP粉截图疯狂分析; \ 你和${name}的综艺同框被剪辑成暧昧视频广泛流传等。 \ 优势:身份平等，合作机会。 劣势:公众关注度极高,任何同框被CP粉和双方毒唯解读。`,
      "粉丝": `[身份背景] 你是${name}的粉丝，粉丝活动中她似乎对你有超过其他粉丝的特殊对应。\ 典型事件：打歌舞台你抢到前排，${name}的眼神似乎在你身上多停留了一秒；\ 签售会${name}注意到你换了发型/装扮/风格主动提及 \ 你在${name}的bubble粉丝留言板发了条普通的消息, 她接着你的话题和粉丝们聊天 \ 粉丝活动你和${name}拍双人拍立得时${name}凑近搭上了你的肩 \ 优势：对${name}有深度了解。劣势：身份敏感，曝光会被粉圈放大审判。`,
      "留学生": `[身份背景] 你是来韩留学生，因与${name}因有共同的舞蹈/唱歌/艺术爱好偶然在日常活动中与${name}相识。优势：有共同爱好, 在日常活动中自然接触。劣势：身份差距、年龄差异`,
      "财阀": `[身份背景] 你是${name}组合所在公司的新任年轻女会长，主导组合事业走向。\ 典型事件：与${name}所在女团开回归企划讨论会，${name}提出想法令你刮目相看；\ 借关心成员们的名义亲自去探班制造和${name}相处机会；\ 你心疼${name}辛苦于是让秘书给整个组合带薪放假、发奖金等 \ 优势：充足资金和资源。劣势：身份差距。`,
      "主线成员前女友": `[特殊身份背景-主线成员前女友]
- 你和${name}曾是学生时代的恋人，几年前因${reasons[Math.floor(Math.random()*4)]}分手
- 你至今保留着${keeps[Math.floor(Math.random()*4)]}
- 现在因工作调动重逢：尴尬、心情复杂、未说出口的话。初期互动刻意保持距离、眼神闪躲、礼貌但疏离
- 其他成员可能知道或不知道你们的过去。随着游戏推进，可能复合也可能各自前行`,
    },
    en: {
      "练习生": `[Identity: Trainee] You are a trainee junior of ${name}, and naturally met through training at the company practice room. Typical events: Asking ${name} for vocal and dance tips; ${name} casually fixing your hair when bumping into each other in the hallway; Late-night practice sessions where you two are the last ones left, opening up to each other; Being selected for a company variety show junior special alongside ${name}. Advantage: Natural contact, shared training memories. Disadvantage: Strict company rules, senior-junior hierarchy.`,
      "Staff": `[Identity: Staff] You are ${name}'s new staff member (assistant + manager), responsible for the group's music show schedules, hair and makeup coordination, and looking after ${name} backstage. Typical events: Bringing milk tea for the whole team during a practice room visit, catching ${name} off guard and feeling touched; Driving ${name} home late at night after schedules, being there for her vulnerable moments; Checking in on ${name} backstage at music shows and making sure she eats. Advantage: Access to her real off-stage self. Disadvantage: Clear workplace boundaries, any ambiguity could be seen as misconduct.`,
      "韩娱艺人": `[Identity: K-pop Artist] You are a K-pop idol from another company, with opportunities to collaborate with ${name}. Typical events: Rehearsing a collaboration stage together in private, growing familiar and in sync; Performing together on Music Bank, your interactions getting screenshotted and wildly analyzed by CP fans; Your variety show appearances together being edited into romantic compilations that circulate widely. Advantage: Equal status, collaboration opportunities. Disadvantage: Extremely high public attention, any interaction dissected by CP fans and solo stans from both sides.`,
      "粉丝": `[Identity: Fan] You are ${name}'s fan, and during fan events she seems to give you special treatment beyond what other fans receive. Typical events: You grab a front-row spot at a music show, and ${name}'s gaze seems to linger on you a second longer; At a fansign, ${name} notices and brings up your new hairstyle/outfit/style change; You post an ordinary message on ${name}'s Bubble, and she picks up your topic to chat with the fans; During a fan event two-shot Polaroid, ${name} leans in and puts her hand on your shoulder. Advantage: Deep knowledge of ${name}. Disadvantage: Highly sensitive identity, exposure means fandom trial.`,
      "留学生": `[Identity: International Student] You are an international student in Korea who met ${name} through a shared passion for dance/singing/art during everyday activities. Advantage: Shared interests, naturally meeting through daily life. Disadvantage: Status gap, age difference.`,
      "财阀": `[Identity: Chaebol] You are the new young female chairwoman of ${name}'s group's company, steering the group's career direction. Typical events: Holding a comeback planning meeting with ${name}'s group, where ${name} proposes ideas that impress you; Visiting rehearsals under the guise of checking on the members to create chances to be around ${name}; Feeling for ${name}'s hard work and having your secretary grant the entire group paid leave and bonuses. Advantage: Abundant funds and resources. Disadvantage: Status gap.`,
      "主线成员前女友": `[Special Identity: Main Member's Ex-Girlfriend]
- You and ${name} were lovers back in your school days, breaking up years ago due to ${reasons[Math.floor(Math.random()*4)]}
- You still keep ${keeps[Math.floor(Math.random()*4)]} to this day
- Now reunited through a work transfer: awkwardness, complex feelings, unspoken words. Early interactions involve deliberate distance, averted eyes, polite but distant
- Other members may or may not know about your past. As the game progresses, you may reconcile or go your separate ways`,
    },
    ko: {
      "练习生": `[신분: 연습생] 당신은 ${name}의 연습생 후배로, 회사 연습실에서 자연스럽게 알게 되었습니다. 주요 이벤트: ${name}에게 보컬과 댄스 팁을 구함; 복도에서 우연히 마주친 ${name}이 손수 머리를 정리해 줌; 늦은 밤 연습실에 둘만 남아 서로의 진심을 털어놓음; 회사 예능 후배 특집에 선발되어 ${name}와 함께 출연. 장점: 자연스러운 접촉, 함께한 훈련의 추억. 단점: 엄격한 회사 규정, 선후배 신분 차이.`,
      "Staff": `[신분: 스태프] 당신은 ${name}의 새로운 스태프(어시스턴트+매니저)로, 그룹의 음악방송 스케줄, 헤어메이크업 조율, 대기실에서 ${name}를 챙기는 일을 맡고 있습니다. 주요 이벤트: 연습실에 밀크티를 들고 찾아가 전 멤버에게 나눠주자 ${name}가 의외라며 감동함; 늦은 밤 스케줄 끝난 ${name}를 차로 숙소까지 데려다주며 그녀의 약한 모습을 감싸줌; 음악방송 대기실에서 ${name}의 컨디션을 살피고 밥을 꼭 챙겨 먹게 함. 장점: 무대 밖 진짜 모습을 볼 수 있음. 단점: 명확한 직장 경계, 애매한 관계는 실책으로 간주될 수 있음.`,
      "韩娱艺人": `[신분: 케이팝 아티스트] 당신은 다른 소속사의 케이팝 여성 아이돌로, ${name}와 협업 기회가 있습니다. 주요 이벤트: 둘이서만 비공개로 합동 무대를 연습하며 점점 가까워지고 호흡이 맞아감; 뮤직뱅크에서 함께한 무대, 상호작용이 CP 팬들에게 캡처되어 열렬히 분석됨; ${name}와의 예능 동반 출연 장면이 묘한 분위기의 영상으로 편집되어 널리 퍼짐. 장점: 동등한 지위, 협업 기회. 단점: 대중의 관심이 극도로 높아 모든 동선이 CP 팬과 양측 독팬에게 해석됨.`,
      "粉丝": `[신분: 팬] 당신은 ${name}의 팬으로, 팬 이벤트에서 그녀가 다른 팬들에게는 하지 않는 특별한 대응을 당신에게만 보여주는 듯합니다. 주요 이벤트: 음악방송에서 앞줄을 차지한 당신에게 ${name}의 시선이 1초 더 머문 듯한 순간; 팬사인회에서 ${name}가 당신의 바뀐 헤어스타일/스타일링/분위기를 먼저 알아채고 말을 건넴; ${name}의 버블에 평범한 메시지를 남겼는데 그녀가 당신의 주제를 이어받아 팬들과 대화를 나눔; 팬 이벤트 투샷 폴라로이드를 찍을 때 ${name}가 가까이 다가와 어깨에 손을 올림. 장점: ${name}에 대한 깊은 이해. 단점: 극도로 민감한 신분, 발각되면 팬덤의 재판을 받게 됨.`,
      "留学生": `[신분: 유학생] 당신은 한국에 유학 온 학생으로, 춤/노래/예술이라는 공통된 취미를 통해 일상 속에서 우연히 ${name}와 알게 되었습니다. 장점: 공통된 취미, 일상 활동 속 자연스러운 접촉. 단점: 신분 격차, 나이 차이.`,
      "财阀": `[신분: 재벌] 당신은 ${name}의 그룹 소속사에 새로 부임한 젊은 여성 회장으로, 그룹의 활동 방향을 이끌고 있습니다. 주요 이벤트: ${name}의 그룹과 컴백 기획 회의를 하던 중 ${name}가 제안한 아이디어에 감탄함; 멤버들을 살피러 왔다는 명목으로 직접 연습실을 방문해 ${name}와 마주할 기회를 만듦; ${name}의 고생이 안쓰러워 비서를 시켜 그룹 전원에게 유급 휴가와 보너스를 지급함. 장점: 풍부한 자금과 자원. 단점: 신분 격차.`,
      "主线成员前女友": `[특별 신분: 메인 멤버의 전 여자친구]
- 당신과 ${name}는 학창 시절 연인이었으며, 몇 년 전 ${reasons[Math.floor(Math.random()*4)]}로 인해 헤어졌습니다
- 당신은 아직도 ${keeps[Math.floor(Math.random()*4)]}을/를 간직하고 있습니다
- 지금은 업무 발령으로 재회: 어색함, 복잡한 감정, 하지 못한 말들. 초기에는 의도적으로 거리를 두고, 눈을 마주치지 못하며, 예의 바르지만 거리를 둠
- 다른 멤버들은 당신들의 과거를 알 수도, 모를 수도 있습니다. 게임이 진행되며 재결합할 수도, 각자의 길을 갈 수도 있습니다`,
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
}) {
  const allTargetIds = [mainId, ...subIds];
  const roundNum = stats.week;
  const npcIds = members.map(m => m.id).filter(id => !allTargetIds.includes(id));

  // Step 1: Context
  const roundMemberIds = allTargetIds;
  const memoryContext = buildMemoryContext(memory, members, mainId, roundMemberIds);
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
    specialEvent,
    relationshipEvent,
    achievement,
  };
}