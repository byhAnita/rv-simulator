// src/agent/memoryPool.js
// v11.1: Memory Pool with npcAppearances support

import { getStageName } from "../config/stageConfig";

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
    npcAppearances: {},
  };
}

export function updateMemory(memory, updates, maxRounds = 5) {
  const {
    playerStats, affections, storyRound, socialPosts,
    kktMessages, stageChanges, memberAppearances, npcAppearances,
  } = updates;

  if (playerStats) memory.playerStats = playerStats;
  if (affections) memory.affections = { ...memory.affections, ...affections };
  if (storyRound) memory.storyRounds = [...(memory.storyRounds || []), storyRound].slice(-maxRounds);
  if (socialPosts?.length > 0) memory.socialPosts = [...(memory.socialPosts || []), ...socialPosts].slice(-20);
  if (kktMessages) {
    memory.kktMessages = { ...memory.kktMessages };
    Object.entries(kktMessages).forEach(([mid, msgs]) => {
      memory.kktMessages[mid] = [...(memory.kktMessages[mid] || []), ...msgs].slice(-20);
    });
  }
  if (stageChanges?.length > 0) memory.stageChanges = [...(memory.stageChanges || []), ...stageChanges].slice(-10);
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

export function buildMemoryContext(memory, members, mainId, maxRounds = 5) {
  const parts = [];

  if (memory.playerStats) {
    const s = memory.playerStats;
    parts.push(`[Player Status] SelfId:${s.selfId} Secrecy:${s.secrecy} Alert:${s.alert} Pressure:${s.pressure} Mood:${s.mood} Round:${s.week} Scene:${s.scene}`);
  }

  const affLines = [];
  const affMap = memory.affections || {};
  members.forEach(m => {
    const aff = affMap[m.id] || 0;
    affLines.push(`${m.emoji}${m.name}:${aff}(${getStageName(aff)})`);
  });
  parts.push(`[Affections] ${affLines.join(" | ")}`);

  if (memory.storyRounds?.length > 0) {
    const recent = memory.storyRounds.slice(-maxRounds);
    parts.push(`[Recent Stories ${recent.length} rounds]`);
    recent.forEach((r, i) => {
      const w = Math.floor(((i + 1) / recent.length) * 100);
      parts.push(`Round ${r.round}(weight ${w}%): ${r.story?.substring?.(0, 300) || ""} | Choice: ${r.playerChoice}`);
    });
  }

  if (memory.socialPosts?.length > 0) {
    const rp = memory.socialPosts.slice(-8);
    parts.push(`[Social Media] ${rp.map(p => `[${p.platform}]${p.memberId}: ${typeof p.content === 'string' ? p.content.substring(0, 80) : ""}`).join(" | ")}`);
  }

  const kk = Object.keys(memory.kktMessages || {});
  if (kk.length > 0) {
    const kl = [];
    kk.forEach(mid => {
      const ms = (memory.kktMessages[mid] || []).slice(-3);
      const m = members.find(mb => mb.id === mid);
      kl.push(`${m?.emoji || ""}${m?.name || mid}: ${ms.map(msg => typeof msg.content === 'string' ? msg.content.substring(0, 60) : "").join(" | ")}`);
    });
    parts.push(`[KKT Messages] ${kl.join(" | ")}`);
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