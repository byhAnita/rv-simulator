// src/agent/mainAgent.js
// 主 Agent：每轮循环的编排器

import { createEmptyMemory, updateMemory, buildMemoryContext, getTopMember } from "./memoryPool";
import { pickPrimaryMember } from "./probabilityEngine";
import { callLLM } from "../tools/llmTool";
import { generateSocialContent } from "../tools/socialMediaTool";
import { generateKktMessages } from "../tools/kktTool";
import { getStageIdx, getStageName, getStageColor } from "../config/stageConfig";
import { KKT_THRESHOLD, MEMORY_ROUNDS, MAIN_INITIAL_AFFECTION, SUB_INITIAL_AFFECTION_MIN, SUB_INITIAL_AFFECTION_MAX } from "../config/constants";

/**
 * 创建初始状态
 */
export function createInitialStats(mainId, subIds) {
  const multiAff = {};
  subIds.forEach(id => {
    multiAff[id] = Math.floor(Math.random() * (SUB_INITIAL_AFFECTION_MAX - SUB_INITIAL_AFFECTION_MIN + 1)) + SUB_INITIAL_AFFECTION_MIN;
  });

  return {
    affection: MAIN_INITIAL_AFFECTION,
    selfId: Math.floor(Math.random() * 20) + 20,
    secrecy: 100,
    alert: Math.floor(Math.random() * 15) + 10,
    pressure: Math.floor(Math.random() * 20) + 45,
    mood: Math.floor(Math.random() * 20) + 50,
    week: 1,
    scene: "首尔·SM大楼",
    chapter: "起",
    multiAff,
  };
}

/**
 * 构建系统提示
 */
export function buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel) {
  const mainMember = members.find(m => m.id === mainId);
  const identity = form.identity === "H" ? form.customIdentity : form.identity;
  const modelName = selectedModel || "AI";

  // 成员详细信息
  const memberDetails = members.map(m => {
    const role = m.id === mainId ? "【主线成员-核心感情线】"
      : subIds.includes(m.id) ? "【支线成员-可攻略】"
      : "【队友NPC-必须出现在故事中但不参与攻略】";
    return `${m.emoji} ${m.name}(${m.name_kr}) ${role}
  动物塑: ${m.animal_plastic}
  公开形象: ${m.public_image || ""}
  私下性格: ${m.private_personality || ""}
  女同特质: ${m.queer_texture || ""}${m.hidden_conflict ? `\n  隐藏矛盾: ${m.hidden_conflict}` : ""}`;
  }).join("\n\n");

  // 可攻略成员列表
  const allTargetIds = [mainId, ...subIds];
  const targetList = allTargetIds.map(id => {
    const m = members.find(mb => mb.id === id);
    return `${m?.emoji} ${m?.name}`;
  }).join("、");

  return `你是 Red Velvet 女豆恋爱养成模拟器的 DM。本游戏为平行世界虚构创作。当前AI: ${modelName}

${groupConfig.groupLore}

【成员详细信息】
${memberDetails}

【玩家档案】
姓名: ${form.name} | 国籍: ${form.nationality} | 年龄: ${form.age} | 身份: ${form.identity}
主线成员: ${mainMember?.name}(${mainMember?.name_kr}) | 爱称: ${form.nickname || "无"} / ${form.herNickname || "无"}
可攻略成员: ${targetList}
追星程度: ${form.starLevel} | 剧情节奏: ${form.pace}

【重要: NPC成员必须出现】
以下成员为队友NPC，不参与攻略，但必须在每一轮故事中作为背景或配角出现:
${members.filter(m => !allTargetIds.includes(m.id)).map(m => `${m.emoji} ${m.name}`).join("、")}
绝对不能出现组合成员无故缺席的情况。如果场景在练习室/打歌后台/宿舍等，所有5位成员都应该在场或合理提及。

【记忆池上下文 — 必须基于此生成】
${memoryContext}

【强制输出格式】
每轮开头必须输出属性栏:
╔══════════════════════════════╗
💗 ${mainMember?.emoji}${mainMember?.name}好感：__/100
🌈自我认同：__/100 | 🔒保密度：__/100
👁公司警觉：__/100 | 📊事业压力：__/100
💫心情：__/100 | 📅第__回合 | 📍__[地点]
🎭阶段：[起/承/转/合]
${subIds.length > 0 ? members.filter(m => subIds.includes(m.id)).map(m => `${m.emoji}${m.name}好感：__/100`).join(" | ") : ""}
╚══════════════════════════════╝

然后剧情正文(300-500字)，描写女主外貌/神态/动作。

【五项强制规则】
①每轮必须：至少一位可攻略成员好感变化(±1-10) + 至少一项玩家状态变化(±1-10) + 至少一位成员社媒或KKT有新内容
②基于记忆池上下文生成所有内容
③【最重要】结尾必须且只能输出4个选项: A.xxx B.xxx C.xxx D.xxx
④感情阶段变化时括号提醒: (💗 与XX进入XX期)
⑤每回合结束标记: 【回合结束】

【禁止】正文里写选项内容、写"好感度+3"、跳级感情、无选项结尾、成员无故缺席。
全程中文，韩/英附注释。`;
}

/**
 * 解析属性栏
 */
export function parseStats(text, currentStats, mainId, subIds, members) {
  const ns = { ...currentStats };
  let changed = false;

  const ap = [/💗\s*[🐰🐻🐿️🐥🐢]\s*[A-Za-z]+好感[：:]\s*(\d+)/, /💗\s*[A-Za-z]+好感[：:]\s*(\d+)/, /好感度[：:]\s*(\d+)/];
  for (const p of ap) { const m = text.match(p); if (m) { const v = parseInt(m[1]); if (v !== ns.affection) { ns.affection = v; changed = true; } break; } }

  const sm = text.match(/自我认同[：:]\s*(\d+)/); if (sm) { const v = parseInt(sm[1]); if (v !== ns.selfId) { ns.selfId = v; changed = true; } }
  const scm = text.match(/保密度[：:]\s*(\d+)/); if (scm) { const v = parseInt(scm[1]); if (v !== ns.secrecy) { ns.secrecy = v; changed = true; } }
  const am = text.match(/公司警觉[：:]?\s*(\d+)/); if (am) { const v = parseInt(am[1]); if (v !== ns.alert) { ns.alert = v; changed = true; } }
  const pm = text.match(/事业压力[：:]\s*(\d+)/); if (pm) { const v = parseInt(pm[1]); if (v !== ns.pressure) { ns.pressure = v; changed = true; } }
  const mm = text.match(/心情[：:]?\s*(\d+)/); if (mm) { const v = parseInt(mm[1]); if (v !== ns.mood) { ns.mood = v; changed = true; } }
  const wm = text.match(/第\s*(\d+)\s*回/); if (wm) { const v = parseInt(wm[1]); if (v !== ns.week) { ns.week = v; changed = true; } }
  const sn = text.match(/📍\s*(.+?)(?:\s*$|\n)/); if (sn) { const v = sn[1].trim(); if (v !== ns.scene) { ns.scene = v; changed = true; } }
  const cm = text.match(/阶段[：:]\s*[\[【]?\s*(起|承|转|合)/); if (cm) { const v = cm[1]; if (v !== ns.chapter) { ns.chapter = v; changed = true; } }

  if (subIds.length > 0) {
    const ma = { ...ns.multiAff };
    members.filter(m => subIds.includes(m.id)).forEach(m => {
      const re = new RegExp(m.emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*" + m.name + "好感[：:]\\s*(\\d+)");
      const mt = text.match(re);
      if (mt) { const v = parseInt(mt[1]); if (v !== ma[m.id]) { ma[m.id] = v; changed = true; } }
    });
    ns.multiAff = ma;
  }

  if (changed) return ns;
  return null;
}

/**
 * 检测感情阶段变化
 */
export function checkStageChanges(currentAffections, previousAffections, members, allTargetIds) {
  const changes = [];
  const prev = previousAffections || {};
  const curr = currentAffections || {};

  allTargetIds.forEach(id => {
    const pv = prev[id] || 0;
    const cv = curr[id] || 0;
    const prevStage = getStageIdx(pv);
    const currStage = getStageIdx(cv);
    if (currStage > prevStage) {
      const m = members.find(mb => mb.id === id);
      changes.push({
        memberId: id,
        memberName: m?.name || id,
        from: getStageName(pv),
        to: getStageName(cv),
      });
    }
  });

  return changes;
}

/**
 * 强制微调：确保至少一项变化
 */
export function forceStatChange(stats, mainId, subIds) {
  const ns = { ...stats };

  // 随机选一位可攻略成员
  const allTargets = [mainId, ...subIds];
  const targetId = allTargets[Math.floor(Math.random() * allTargets.length)];
  const delta = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 5) + 1);

  if (targetId === mainId) {
    ns.affection = Math.max(0, Math.min(100, ns.affection + delta));
  } else {
    ns.multiAff = { ...ns.multiAff, [targetId]: Math.max(0, Math.min(100, (ns.multiAff?.[targetId] || 0) + delta)) };
  }

  // 随机改一个状态值
  const statKeys = ['selfId', 'secrecy', 'alert', 'pressure', 'mood'];
  const rk = statKeys[Math.floor(Math.random() * statKeys.length)];
  ns[rk] = Math.max(0, Math.min(100, ns[rk] + (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 5) + 1)));
  ns.week = (ns.week || 1) + 1;

  return ns;
}

/**
 * 主循环：执行一轮
 */
export async function executeRound({
  playerChoice,
  stats,
  memory,
  form,
  members,
  mainId,
  subIds,
  groupConfig,
  apiKey,
  selectedModel,
  kktUnlocked,
}) {
  const allTargetIds = [mainId, ...subIds];
  const roundNotifs = [];
  const roundNum = stats.week;

  // ============================================================
  // Step 1-2: 强制更新状态和好感 (本轮开始时)
  // ============================================================
  let newStats = forceStatChange(stats, mainId, subIds);

  // ============================================================
  // Step 3: 解析 Context + 计算最高好感成员
  // ============================================================
  const topMember = getTopMember(
    members.filter(m => allTargetIds.includes(m.id)),
    { ...newStats.multiAff, [mainId]: newStats.affection }
  );

  // ============================================================
  // Step 4: 多线概率引擎
  // ============================================================
  const primaryId = pickPrimaryMember(allTargetIds, { ...newStats.multiAff, [mainId]: newStats.affection }, memory);
  memory.memberAppearances = {
    ...memory.memberAppearances,
    [primaryId]: [...(memory.memberAppearances?.[primaryId] || []), roundNum].slice(-10),
  };

  // ============================================================
  // Step 5: 构建 Context + 生成故事
  // ============================================================
  const memoryContext = buildMemoryContext(memory, members, mainId, MEMORY_ROUNDS);
  const systemPrompt = buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel);

  const storyPrompt = `玩家选择: ${playerChoice}\n请生成下一轮故事。严格按格式输出属性栏+剧情正文+ABCD选项。`;
  const storyReply = await callLLM(storyPrompt, [], systemPrompt, apiKey, selectedModel);

  // 确保有 ABCD 选项
  let storyContent = storyReply;
  if (!storyContent.match(/[ABCD][.、．]/)) {
    storyContent += "\n\nA. 继续聊天\nB. 转移话题\nC. 默默观察\nD. 自定义";
  }

  // ============================================================
  // 解析属性栏
  // ============================================================
  const parsed = parseStats(storyContent, newStats, mainId, subIds, members);
  if (parsed) newStats = parsed;

  // ============================================================
  // Step 6: 检测阶段变化 + KKT
  // ============================================================
  const currentAff = { ...newStats.multiAff, [mainId]: newStats.affection };
  const prevAff = memory.affections || {};
  const stageChanges = checkStageChanges(currentAff, prevAff, members, allTargetIds);

  const kktUpdates = {};
  for (const sc of stageChanges) {
    const aff = currentAff[sc.memberId] || 0;
    if (aff >= KKT_THRESHOLD) {
      const member = members.find(m => m.id === sc.memberId);
      const { msgs, notifs } = await generateKktMessages(
        sc.memberId, member, aff, memoryContext, systemPrompt, apiKey, selectedModel
      );
      kktUpdates[sc.memberId] = msgs;
      roundNotifs.push(...notifs);
    }
  }

  // ============================================================
  // Step 7: 社媒生成
  // ============================================================
  const socialTargets = members
    .filter(m => allTargetIds.includes(m.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(1, Math.ceil(allTargetIds.length / 2)));

  const socialUpdates = {};
  for (const m of socialTargets) {
    const { feed, notifs } = await generateSocialContent(
      m.id, m, memoryContext, systemPrompt, apiKey, selectedModel
    );
    socialUpdates[m.id] = feed;
    roundNotifs.push(...notifs);
  }

  // 强制兜底
  if (roundNotifs.length === 0) {
    const mm = members.find(m => allTargetIds.includes(m.id));
    roundNotifs.push({ platform: "bubble", memberId: mm?.id || mainId });
  }

  // ============================================================
  // Step 8: 更新记忆池
  // ============================================================
  const updatedMemory = updateMemory(memory, {
    playerStats: {
      selfId: newStats.selfId,
      secrecy: newStats.secrecy,
      alert: newStats.alert,
      pressure: newStats.pressure,
      mood: newStats.mood,
      week: newStats.week,
      scene: newStats.scene,
      chapter: newStats.chapter,
    },
    affections: currentAff,
    storyRound: {
      round: roundNum,
      story: storyContent.substring(0, 500),
      playerChoice,
    },
    socialPosts: Object.entries(socialUpdates).map(([mid, feed]) => ({
      platform: "all",
      memberId: mid,
      content: feed.bubble?.[0]?.content || feed.instagram?.caption || "",
      time: new Date().toLocaleTimeString(),
    })),
    kktMessages: kktUpdates,
    stageChanges,
    memberAppearances: { [primaryId]: [roundNum] },
  }, MEMORY_ROUNDS);

  // KKT 解锁状态
  const newKktUnlocked = { ...kktUnlocked };
  allTargetIds.forEach(id => {
    if ((currentAff[id] || 0) >= KKT_THRESHOLD) newKktUnlocked[id] = true;
  });

  return {
    newStats,
    storyContent,
    roundNotifs,
    updatedMemory,
    stageChanges,
    socialUpdates,
    kktUpdates,
    topMember,
    newKktUnlocked,
  };
}