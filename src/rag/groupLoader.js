// src/rag/groupLoader.js
// src/rag/groupLoader.js

/**
 * 加载组合索引
 * @returns {Promise<Array>} 组合列表 [{id, name, emoji, members_count, color}]
 */
export async function loadGroupIndex() {
  const isProduction = !window.location.hostname.includes('localhost');
  const base = isProduction ? '/rv-simulator/' : '/';
  const url = `${base}groups/_index.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Group index load failed:", error);
    return [{ id: "red_velvet", name: "Red Velvet", emoji: "💗", members_count: 5, color: "#e887b0" }];
  }
}

/**
 * 加载女团设定文档
 * @param {string} groupId - 女团 ID（对应文件夹名）
 * @param {string} language - zh/en/ko
 * @returns {Promise<object>} 解析后的团设定对象
 */
export async function loadGroupConfig(groupId = "red_velvet", language = "zh") {
  const isProduction = !window.location.hostname.includes('localhost');
  const base = isProduction ? '/rv-simulator/' : '/';
  const url = `${base}groups/${groupId}/${language}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (language !== "zh") {
        console.warn(`${groupId}/${language}.json not found, falling back to zh.json`);
        const fallbackUrl = `${base}groups/${groupId}/zh.json`;
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
  const { group, members, history } = config;

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

  return {
    group: {
      name: group.name,
      fandom: group.fandom,
      socialPlatforms: group.social_platforms || ["bubble", "instagram", "weverse"],
      privateChat: group.private_chat || "kakaotalk",
    },
    members: parsedMembers,
    groupLore,
  };
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
  if (history?.length) {
    parts.push("\n[History]");
    history.forEach(h => parts.push(`- ${h.date}: ${h.event}`));
  }
  return parts.join("\n");
}

export function getNpcMembers(allMembers, mainId, subIds) {
  return allMembers.filter(m => m.id !== mainId && !subIds.includes(m.id));
}