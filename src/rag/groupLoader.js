// src/rag/groupLoader.js
// RAG 加载器：根据语言加载对应版本的 JSON 文档

/**
 * 加载女团设定文档
 * @param {string} groupName - 女团名称 (对应 /public/groups/ 下的文件名)
 * @param {string} language - 语言 (zh/en/ko)
 * @returns {Promise<object>} 解析后的团设定对象
 */
export async function loadGroupConfig(groupName = "red_velvet", language = "zh") {
  const suffix = language === "zh" ? "" : `_${language}`;
  const fileName = `${groupName}${suffix}.json`;

  // 判断是否在生产环境（GitHub Pages）
  const isProduction = !window.location.hostname.includes('localhost');
  const base = isProduction ? '/rv-simulator/' : '/';
  const url = `${base}groups/${fileName}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (language !== "zh") {
        console.warn(`${fileName} not found, falling back to ${groupName}.json`);
        const fallbackUrl = `${base}groups/${groupName}.json`;
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) throw new Error(`Failed to load: HTTP ${fallbackResponse.status}`);
        const config = await fallbackResponse.json();
        return parseGroupConfig(config);
      }
      throw new Error(`Failed to load: HTTP ${response.status}`);
    }
    const config = await response.json();
    return parseGroupConfig(config);
  } catch (error) {
    console.error("RAG load failed:", error);
    throw error;
  }
}

/**
 * 解析团设定 JSON 为游戏可用的 Background
 */
function parseGroupConfig(config) {
  const { group, members, history, game_settings } = config;

  const parsedMembers = members.map(m => ({
    id: m.id,
    emoji: m.emoji,
    name: m.name,
    name_kr: m.name_kr,
    color: m.color,
    accent: m.accent,
    animal: m.animal,
    mbti: m.mbti,
    role: m.role,
    ig: m.ig || `${m.id}_official`,
    public_image: m.public_image || "",
    private_personality: m.private_personality || "",
    queer_texture: m.queer_texture || "",
    animal_plastic: m.animal_plastic || "",
    hidden_conflict: m.hidden_conflict || "",
  }));

  const groupLore = buildGroupLore(group, parsedMembers, history);

  const settings = {
    kktThreshold: game_settings?.kkt_threshold || 30,
    memoryRounds: game_settings?.memory_rounds || 5,
    mainInitialAffection: game_settings?.main_initial_affection || 20,
    subInitialAffectionMin: game_settings?.sub_initial_affection_min || 0,
    subInitialAffectionMax: game_settings?.sub_initial_affection_max || 10,
    stageThresholds: game_settings?.stage_thresholds || [0, 16, 31, 51, 66, 81, 91, 101],
    stageNames: game_settings?.stage_names || ["Stranger", "Acquaintance", "Interest", "Flirting", "Confirmed", "Passionate", "Trial"],
  };

  return { group: { name: group.name, fandom: group.fandom, socialPlatforms: group.social_platforms || ["bubble", "instagram", "weverse"], privateChat: group.private_chat || "kakaotalk" }, members: parsedMembers, groupLore, settings };
}

function buildGroupLore(group, members, history) {
  const parts = [];
  parts.push(`[${group.name} Background]`);
  parts.push(`${group.name} is a ${members.length}-member group. Fandom: ${group.fandom}.`);
  members.forEach(m => {
    parts.push(`${m.emoji} ${m.name}(${m.name_kr}) - ${m.role}, ${m.mbti}, ${m.animal_plastic}`);
    if (m.public_image) parts.push(`  Public: ${m.public_image}`);
    if (m.private_personality) parts.push(`  Private: ${m.private_personality}`);
    if (m.queer_texture) parts.push(`  Queer Texture: ${m.queer_texture}`);
  });
  parts.push("\n[History]");
  history.forEach(h => parts.push(`- ${h.date}: ${h.event}`));
  return parts.join("\n");
}

export function buildMemberDetails(members, mainId, subIds) { /* unchanged */ }
export function getNpcMembers(allMembers, mainId, subIds) {
  return allMembers.filter(m => m.id !== mainId && !subIds.includes(m.id));
}