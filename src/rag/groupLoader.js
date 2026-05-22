// src/rag/groupLoader.js
// RAG 加载器：从 JSON 文档加载女团设定，解析为全局 Background

/**
 * 加载女团设定文档
 * @param {string} groupName - 女团名称 (对应 /public/groups/ 下的文件名)
 * @returns {Promise<object>} 解析后的团设定对象
 */
export async function loadGroupConfig(groupName = "red_velvet") {
  try {
    const response = await fetch(`/groups/${groupName}.json`);
    if (!response.ok) throw new Error(`加载失败: HTTP ${response.status}`);
    const config = await response.json();
    return parseGroupConfig(config);
  } catch (error) {
    console.error("RAG 加载失败:", error);
    throw error;
  }
}

/**
 * 解析团设定 JSON 为游戏可用的 Background
 */
function parseGroupConfig(config) {
  const { group, members, history, game_settings } = config;

  // 1. 解析成员数组
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
    // 补充信息 (存入 Background)
    public_image: m.public_image || "",
    private_personality: m.private_personality || "",
    queer_texture: m.queer_texture || "",
    animal_plastic: m.animal_plastic || "",
    hidden_conflict: m.hidden_conflict || "",
  }));

  // 2. 构建组合背景文本
  const groupLore = buildGroupLore(group, members, history);

  // 3. 游戏设置
  const settings = {
    kktThreshold: game_settings?.kkt_threshold || 30,
    memoryRounds: game_settings?.memory_rounds || 5,
    mainInitialAffection: game_settings?.main_initial_affection || 20,
    subInitialAffectionMin: game_settings?.sub_initial_affection_min || 0,
    subInitialAffectionMax: game_settings?.sub_initial_affection_max || 10,
    stageThresholds: game_settings?.stage_thresholds || [0, 16, 31, 51, 66, 81, 91, 101],
    stageNames: game_settings?.stage_names || ["陌生人", "有印象", "产生兴趣", "暧昧期", "确认关系", "热恋期", "考验期"],
    statNames: game_settings?.stat_names || {
      selfId: { icon: "🌈", label: "自我认同" },
      secrecy: { icon: "🔒", label: "恋情保密度" },
      alert: { icon: "👁", label: "公司警觉度" },
      pressure: { icon: "📊", label: "事业压力" },
      mood: { icon: "💫", label: "心情值" },
    },
  };

  return {
    group: {
      name: group.name,
      fandom: group.fandom,
      socialPlatforms: group.social_platforms || ["bubble", "instagram", "weverse"],
      privateChat: group.private_chat || "kakaotalk",
      timelineStart: group.timeline_start,
      timelineEnd: group.timeline_end,
    },
    members: parsedMembers,
    groupLore,
    settings,
  };
}

/**
 * 构建组合背景文本
 */
function buildGroupLore(group, members, history) {
  const parts = [];
  parts.push(`【${group.name} 背景资料】`);
  parts.push(`${group.name} 是${group.members_count}人组合。粉丝名:${group.fandom}。`);

  // 成员简介
  members.forEach(m => {
    parts.push(`${m.emoji} ${m.name}(${m.name_kr}) - ${m.role}, ${m.mbti}, ${m.animal_plastic}`);
    if (m.public_image) parts.push(`  公开形象: ${m.public_image}`);
    if (m.private_personality) parts.push(`  私下性格: ${m.private_personality}`);
    if (m.queer_texture) parts.push(`  女同特质: ${m.queer_texture}`);
  });

  // 组合历史
  parts.push("\n【组合历史】");
  history.forEach(h => {
    parts.push(`- ${h.date}: ${h.event}`);
  });

  return parts.join("\n");
}

/**
 * 构建成员详细信息 (用于系统提示)
 */
export function buildMemberDetails(members, mainId, subIds) {
  const parts = [];
  const roleMap = {
    [mainId]: "主线成员（初始好感最高，核心感情线）",
  };
  subIds.forEach(id => {
    roleMap[id] = "支线成员（可攻略）";
  });
  members.forEach(m => {
    if (!roleMap[m.id]) roleMap[m.id] = "队友NPC（不参与攻略，但必须出现在故事中）";
  });

  members.forEach(m => {
    parts.push(`${m.emoji} ${m.name}(${m.name_kr}) [${roleMap[m.id]}]`);
    parts.push(`  动物塑: ${m.animal_plastic}`);
    if (m.public_image) parts.push(`  公开形象: ${m.public_image}`);
    if (m.private_personality) parts.push(`  私下性格: ${m.private_personality}`);
    if (m.queer_texture) parts.push(`  女同特质: ${m.queer_texture}`);
    if (m.hidden_conflict) parts.push(`  隐藏矛盾: ${m.hidden_conflict}`);
  });

  return parts.join("\n");
}

/**
 * 获取 NPC 成员名单 (非主线且非支线的成员)
 */
export function getNpcMembers(allMembers, mainId, subIds) {
  return allMembers.filter(m => m.id !== mainId && !subIds.includes(m.id));
}