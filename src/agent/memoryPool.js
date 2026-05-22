// src/agent/memoryPool.js
// 记忆池管理：创建、更新、构建上下文

import { getStageName } from "../config/stageConfig";

/**
 * 创建空记忆池
 */
export function createEmptyMemory() {
  return {
    playerStats: null,
    affections: {},
    topMemberId: null,
    storyRounds: [],
    socialPosts: [],
    kktMessages: {},
    stageChanges: [],
    memberAppearances: {},
  };
}

/**
 * 更新记忆池 — 每轮结束后调用
 */
export function updateMemory(memory, updates, maxRounds = 5) {
  const {
    playerStats,
    affections,
    storyRound,
    socialPosts,
    kktMessages,
    stageChanges,
    memberAppearances,
  } = updates;

  if (playerStats) memory.playerStats = playerStats;
  if (affections) memory.affections = { ...memory.affections, ...affections };

  if (storyRound) {
    memory.storyRounds = [...(memory.storyRounds || []), storyRound].slice(-maxRounds);
  }

  if (socialPosts && socialPosts.length > 0) {
    memory.socialPosts = [...(memory.socialPosts || []), ...socialPosts].slice(-20);
  }

  if (kktMessages) {
    memory.kktMessages = { ...memory.kktMessages };
    Object.entries(kktMessages).forEach(([memberId, msgs]) => {
      memory.kktMessages[memberId] = [...(memory.kktMessages[memberId] || []), ...msgs].slice(-20);
    });
  }

  if (stageChanges && stageChanges.length > 0) {
    memory.stageChanges = [...(memory.stageChanges || []), ...stageChanges].slice(-10);
  }

  if (memberAppearances) {
    memory.memberAppearances = { ...memory.memberAppearances };
    Object.entries(memberAppearances).forEach(([memberId, rounds]) => {
      memory.memberAppearances[memberId] = [...(memory.memberAppearances[memberId] || []), ...rounds].slice(-10);
    });
  }

  return memory;
}

/**
 * 构建记忆池上下文 (用于发给 LLM)
 */
export function buildMemoryContext(memory, members, mainId, maxRounds = 5) {
  const parts = [];

  // 玩家状态
  if (memory.playerStats) {
    const s = memory.playerStats;
    parts.push(`【玩家状态】自我认同:${s.selfId} 保密度:${s.secrecy} 公司警觉:${s.alert} 事业压力:${s.pressure} 心情:${s.mood} 第${s.week}回合 ${s.scene}`);
  }

  // 各成员好感
  const affLines = [];
  const affMap = memory.affections || {};
  members.forEach(m => {
    const aff = affMap[m.id] || 0;
    affLines.push(`${m.emoji}${m.name}:${aff}(${getStageName(aff)})`);
  });
  parts.push(`【成员好感】${affLines.join(" | ")}`);

  // 近期故事 (加权)
  if (memory.storyRounds?.length > 0) {
    const recent = memory.storyRounds.slice(-maxRounds);
    parts.push(`【近期故事 ${recent.length}轮】`);
    recent.forEach((r, i) => {
      const w = Math.floor(((i + 1) / recent.length) * 100);
      parts.push(`第${r.round}轮(权重${w}%): ${r.story?.substring?.(0, 300) || r.story} | 玩家选择: ${r.playerChoice}`);
    });
  }

  // 社媒
  if (memory.socialPosts?.length > 0) {
    const rp = memory.socialPosts.slice(-8);
    parts.push(`【社媒动态】${rp.map(p => `[${p.platform}]${p.memberId}: ${typeof p.content === 'string' ? p.content.substring(0, 100) : p.content}`).join(" | ")}`);
  }

  // KKT
  const kk = Object.keys(memory.kktMessages || {});
  if (kk.length > 0) {
    const kl = [];
    kk.forEach(mid => {
      const ms = (memory.kktMessages[mid] || []).slice(-3);
      const m = members.find(mb => mb.id === mid);
      kl.push(`${m?.emoji || ""}${m?.name || mid}: ${ms.map(msg => typeof msg.content === 'string' ? msg.content.substring(0, 80) : msg.content).join(" | ")}`);
    });
    parts.push(`【KKT私聊】${kl.join(" | ")}`);
  }

  // 阶段变化
  if (memory.stageChanges?.length > 0) {
    const rc = memory.stageChanges.slice(-3);
    parts.push(`【阶段变化】${rc.map(c => `${c.memberId}: ${c.from}→${c.to}(第${c.round}轮)`).join(" | ")}`);
  }

  return parts.join("\n");
}

/**
 * 计算最高好感成员
 */
export function getTopMember(members, affections) {
  if (!members || members.length === 0) return members?.[0] || null;
  let best = members[0];
  let bestAff = affections[best.id] || 0;
  for (const m of members) {
    const aff = affections[m.id] || 0;
    if (aff > bestAff) { best = m; bestAff = aff; }
  }
  return best;
}