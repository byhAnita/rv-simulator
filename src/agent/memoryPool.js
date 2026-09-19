// src/agent/memoryPool.js
// 1-Tier Stepped Window: single append-only history ledger for KV prefix cache optimization

import { getStageName } from "../config/stageConfig";
import { HISTORY_FULL_MAX, HISTORY_PRUNE_BATCH, KKT_MAX, KKT_THRESHOLD } from "../config/constants";

export function createEmptyMemory() {
  return {
    playerStats:       null,  // {selfId, secrecy, mood, week, scene, chapter}
    affections:        {},    // {memberId: number}
    topMemberId:       null,
    history:           [],    // [{round, type:'summary'|'full', text, choice?, summary?}]
    kktMessages:       {},    // {memberId: [{sender, content}]} max KKT_MAX per member
    stageChanges:      [],    // [{memberId, from, to}] last 10
    memberAppearances: {},    // {memberId: [roundNums]} last 10
    npcAppearances:    {},    // {memberId: lastRoundNum}
  };
}

// Detects any save without the new history field (v12 had summaries/fullStories, v11 had storyRounds)
export function isLegacyMemory(memory) {
  return memory && memory.history === undefined;
}

// Called at the START of each round, before building the prompt.
// Mutates full entries in-place → summary. Applies batch prune if ledger grows very long.
export function collapseHistoryIfNeeded(memory) {
  const fullCount = memory.history.filter(h => h.type === 'full').length;
  if (fullCount >= HISTORY_FULL_MAX) {
    memory.history = memory.history.map(h => {
      if (h.type !== 'full') return h;
      // A story the player edited has not reached the model yet: this runs
      // before the ledger is built, so collapsing it now would drop the edit
      // without it ever being sent — and saveStoryEdit deliberately keeps the
      // original summary, so there would be no trace of it at all. Spare it for
      // this one round; updateMemory clears the flag when the next entry is
      // appended, which is the moment it has definitely been delivered.
      if (h.keepFull) return h;
      return { round: h.round, type: 'summary', text: h.summary || h.text.substring(0, 150) };
    });
  }

  // Batch prune: drop oldest summaries in one hit to keep context bounded
  const summaryCount = memory.history.filter(h => h.type === 'summary').length;
  if (summaryCount > HISTORY_PRUNE_BATCH * 3) {
    let pruned = 0;
    memory.history = memory.history.filter(h => {
      if (h.type === 'summary' && pruned < HISTORY_PRUNE_BATCH) { pruned++; return false; }
      return true;
    });
  }
}

export function updateMemory(memory, updates) {
  const {
    playerStats, affections, historyEntry,
    kktMessages, stageChanges, memberAppearances, npcAppearances,
  } = updates;

  if (playerStats) memory.playerStats = playerStats;
  if (affections) memory.affections = { ...memory.affections, ...affections };

  if (historyEntry) {
    // Appending happens at the end of the round the previous entry was sent in,
    // so any keepFull reprieve has now been used. Clearing it here (rather than
    // inside the collapse) also covers an edit made in a round where no collapse
    // ran, and bounds the ledger to at most one spared entry at a time.
    memory.history = [
      ...memory.history.map(h => (h.keepFull ? (({ keepFull, ...rest }) => rest)(h) : h)),
      historyEntry,
    ];
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

// Serializes the append-only history ledger — this block is cacheable across consecutive rounds.
export function buildHistoryLedger(memory) {
  if (!memory.history?.length) return "";
  const parts = [];
  memory.history.forEach(h => {
    if (h.type === 'summary') {
      parts.push(`R${h.round}: ${h.text}`);
    } else {
      parts.push(`=== Round ${h.round} ===\n${h.text}\nChoice: ${h.choice || ""}`);
    }
  });
  return parts.join("\n");
}

// Serializes the dynamic tail — changes every round, always cache miss, kept small.
// Contains: player stats, affections, stage changes, NPC appearances, KKT.
export function buildDynamicTail(memory, members, roundMemberIds = []) {
  const parts = [];

  if (memory.playerStats) {
    const s = memory.playerStats;
    parts.push(`[Player Status] SelfId:${s.selfId} Secrecy:${s.secrecy} Mood:${s.mood} Round:${s.week} Scene:${s.scene}`);
  }

  const affMap = memory.affections || {};
  const affLines = members.map(m => {
    const aff = affMap[m.id] || 0;
    return `${m.emoji}${m.name}:${aff}(${getStageName(aff)})`;
  });
  parts.push(`[Affections] ${affLines.join(" | ")}`);

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

  // KKT is gated on affection, and the model has to be told which channels are
  // open BEFORE it writes: filterKktByAffection runs after generation, so the
  // story is already built around a message we are about to delete. That left
  // prose describing a Kakao the player never received.
  const kktRoster = roundMemberIds.length > 0
    ? roundMemberIds
    : Object.keys(memory.kktMessages || {});
  if (kktRoster.length > 0) {
    const channels = kktRoster.map(mid => {
      const m = members.find(mb => mb.id === mid);
      const open = (affMap[mid] || 0) >= KKT_THRESHOLD;
      return `${m?.name || mid}:${open ? "unlocked" : "LOCKED"}`;
    });
    parts.push(`[KKT Channels] ${channels.join(" | ")}`);
  }

  // Affection can fall, and stored messages do not disappear when it does —
  // re-check the threshold here or a member who dropped back below it keeps her
  // channel open in the prompt forever.
  const kktTargets = kktRoster.filter(mid => (affMap[mid] || 0) >= KKT_THRESHOLD);
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
