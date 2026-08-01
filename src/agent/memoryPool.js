// src/agent/memoryPool.js
// Two-tier memory: M=15 summaries + N=3 full stories; KKT per-member Q=10

import { getStageName } from "../config/stageConfig";
import { MEMORY_SUMMARY_MAX, MEMORY_STORY_MAX, KKT_MAX } from "../config/constants";

export function createEmptyMemory() {
  return {
    playerStats: null,
    affections: {},
    topMemberId: null,
    summaries: [],        // [{round, memberId, summary}]  max MEMORY_SUMMARY_MAX, FIFO
    fullStories: [],      // [{round, story, playerChoice}] max MEMORY_STORY_MAX, FIFO
    kktMessages: {},      // {memberId: [{sender, content}]} max KKT_MAX per member
    stageChanges: [],
    memberAppearances: {},
    npcAppearances: {},
  };
}

// Migration guard: old saves have storyRounds instead of summaries/fullStories
export function isLegacyMemory(memory) {
  return memory && memory.summaries === undefined;
}

export function updateMemory(memory, updates) {
  const {
    playerStats, affections, summary, storyRound,
    kktMessages, stageChanges, memberAppearances, npcAppearances,
  } = updates;

  if (playerStats) memory.playerStats = playerStats;
  if (affections) memory.affections = { ...memory.affections, ...affections };

  if (summary) {
    memory.summaries = [...(memory.summaries || []), summary].slice(-MEMORY_SUMMARY_MAX);
  }
  if (storyRound) {
    memory.fullStories = [...(memory.fullStories || []), storyRound].slice(-MEMORY_STORY_MAX);
  }

  if (kktMessages) {
    memory.kktMessages = { ...memory.kktMessages };
    Object.entries(kktMessages).forEach(([mid, msgs]) => {
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      const normalized = msgs.map(m => typeof m === "string" ? { sender: mid, content: m } : m);
      memory.kktMessages[mid] = [...(memory.kktMessages[mid] || []), ...normalized].slice(-KKT_MAX);
    });
  }

  if (stageChanges?.length > 0) {
    memory.stageChanges = [...(memory.stageChanges || []), ...stageChanges].slice(-10);
  }
  if (memberAppearances) {
    memory.memberAppearances = { ...memory.memberAppearances };
    Object.entries(memberAppearances).forEach(([mid, rounds]) => {
      memory.memberAppearances[mid] = [...(memory.memberAppearances[mid] || []), ...rounds].slice(-10);
    });
  }
  if (npcAppearances) {
    memory.npcAppearances = { ...memory.npcAppearances, ...npcAppearances };
  }

  return memory;
}

export function buildMemoryContext(memory, members, mainId, roundMemberIds = []) {
  const parts = [];

  if (memory.playerStats) {
    const s = memory.playerStats;
    parts.push(`[Player Status] SelfId:${s.selfId} Secrecy:${s.secrecy} Mood:${s.mood} Round:${s.week} Scene:${s.scene}`);
  }

  const affLines = [];
  const affMap = memory.affections || {};
  members.forEach(m => {
    const aff = affMap[m.id] || 0;
    affLines.push(`${m.emoji}${m.name}:${aff}(${getStageName(aff)})`);
  });
  parts.push(`[Affections] ${affLines.join(" | ")}`);

  // Tier 1: long summaries (up to M=15)
  if (memory.summaries?.length > 0) {
    parts.push(`[Long Memory — ${memory.summaries.length} summaries]`);
    memory.summaries.forEach(s => {
      const m = members.find(mb => mb.id === s.memberId);
      const tag = m ? `${m.emoji}${m.name}` : s.memberId;
      parts.push(`R${s.round}(${tag}): ${s.summary}`);
    });
  }

  // Tier 2: last N=3 full stories
  if (memory.fullStories?.length > 0) {
    parts.push(`[Recent Stories — last ${memory.fullStories.length} rounds]`);
    memory.fullStories.forEach(r => {
      parts.push(`=== Round ${r.round} ===\n${r.story}\nChoice: ${r.playerChoice}`);
    });
  }

  // KKT: only inject for members appearing this round
  const kktTargets = roundMemberIds.length > 0
    ? roundMemberIds
    : Object.keys(memory.kktMessages || {});
  const kktLines = [];
  kktTargets.forEach(mid => {
    const msgs = memory.kktMessages?.[mid] || [];
    if (msgs.length === 0) return;
    const m = members.find(mb => mb.id === mid);
    const recent = msgs.slice(-5).map(msg => typeof msg === "string" ? msg : msg.content).join(" | ");
    kktLines.push(`${m?.emoji || ""}${m?.name || mid}: ${recent}`);
  });
  if (kktLines.length > 0) {
    parts.push(`[KKT Messages — round-relevant members]\n${kktLines.join("\n")}`);
  }

  if (memory.stageChanges?.length > 0) {
    const rc = memory.stageChanges.slice(-3);
    parts.push(`[Stage Changes] ${rc.map(c => `${c.memberId}: ${c.from}→${c.to}`).join(" | ")}`);
  }

  if (memory.npcAppearances && Object.keys(memory.npcAppearances).length > 0) {
    const npcInfo = Object.entries(memory.npcAppearances)
      .map(([mid, round]) => {
        const m = members.find(mb => mb.id === mid);
        return `${m?.emoji || ""}${m?.name || mid}(last: round ${round})`;
      })
      .join(" | ");
    parts.push(`[NPC Appearances] ${npcInfo}`);
  }

  return parts.join("\n");
}

export function getTopMember(members, affections) {
  if (!members?.length) return members?.[0] || null;
  let best = members[0];
  let bestAff = affections[best.id] || 0;
  for (const m of members) {
    const aff = affections[m.id] || 0;
    if (aff > bestAff) { best = m; bestAff = aff; }
  }
  return best;
}
