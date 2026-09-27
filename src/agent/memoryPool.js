// src/agent/memoryPool.js
// 1-Tier Stepped Window: single append-only history ledger for KV prefix cache optimization

import { stageNameIn } from "../config/stageConfig";
import { HISTORY_FULL_MAX, HISTORY_PRUNE_BATCH, KKT_MAX, KKT_THRESHOLD } from "../config/constants";

export function createEmptyMemory() {
  return {
    playerStats:       null,  // {selfId, secrecy, mood, week, scene, chapter}
    affections:        {},    // {memberId: number}
    topMemberId:       null,
    history:           [],    // [{round, type:'summary'|'full', text, choice?, summary?}]
    kktMessages:       {},    // {memberId: [{sender, content}]} max KKT_MAX per member
    stageChanges:      [],    // [{memberId, from, to}] last 10
    // {memberId: [roundNums]} last 10 — EVERY member, NPCs included, and observed
    // from the prose rather than drawn. `npcAppearances` used to sit beside this as a
    // second record in a different shape; nothing ever wrote it, so the tail line it
    // fed was never sent to any model. An old save may still carry the key.
    memberAppearances: {},
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
    kktMessages, stageChanges, memberAppearances,
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
      // The Choice line is omitted rather than rendered empty: `Choice: ` with a
      // trailing space is the same invisible byte that has cost the cached prefix
      // before, and this block is the cacheable one. Every path in App.jsx supplies
      // a choice (round 1 sends "Game start"), so this is defence at the renderer
      // for a legacy or hand-built entry, not a case the app produces.
      parts.push(`=== Round ${h.round} ===\n${h.text}`
        + (h.choice ? `\nChoice: ${h.choice}` : ""));
    }
  });
  return parts.join("\n");
}

// Serializes the dynamic tail — changes every round, always cache miss, kept small.
// Contains: player stats, affections, stage changes, NPC appearances, KKT.
// `language` defaults to zh so an older caller keeps today's behaviour exactly —
// the stage labels were Chinese for everyone until v1.4.0 step 6, and defaulting
// to the player's language instead would have silently moved the tail for the
// tests that call this with three arguments.
export function buildDynamicTail(memory, members, roundMemberIds = [], language = "zh") {
  const parts = [];

  if (memory.playerStats) {
    const s = memory.playerStats;
    parts.push(`[Player Status] SelfId:${s.selfId} Secrecy:${s.secrecy} Mood:${s.mood} Round:${s.week} Scene:${s.scene}`);
  }

  const affMap = memory.affections || {};
  const nameOf = (mid) => {
    const m = members.find(mb => mb.id === mid);
    return `${m?.emoji || ""}${m?.name || mid}`;
  };
  // Only romanceable members have a score. Listing the NPCs too printed every one
  // of them as `0(Stranger)` for the whole game — telling the model in round 30
  // that the main member's groupmate, who has been in most scenes, is a stranger.
  // An empty roundMemberIds means an older caller that passed no round roster, so
  // it keeps the old behaviour of listing everyone.
  const scored = roundMemberIds.length > 0
    ? members.filter(m => roundMemberIds.includes(m.id))
    : members;
  const affLines = scored.map(m => {
    const aff = affMap[m.id] || 0;
    return `${m.emoji}${m.name}:${aff}(${stageNameIn(aff, language)})`;
  });
  parts.push(`[Affections] ${affLines.join(" | ")}`);

  if (memory.stageChanges?.length > 0) {
    const rc = memory.stageChanges.slice(-3);
    // By display name, like every other line in this block. It used to print the
    // raw member id, so the model had to match `irene` to `🐰Irene` one line above
    // — and a custom member's id is a timestamp, which matches nothing at all.
    parts.push(`[Stage Changes] ${rc.map(c => `${nameOf(c.memberId)}: ${c.from}→${c.to}`).join(" | ")}`);
  }

  // Section 3 asks for rotation — sub members every 2-3 rounds, nobody absent for
  // more than 3 — and live runs showed it comprehensively ignored: a romanceable
  // member appearing once in twenty rounds, an NPC the prompt says must appear in the
  // background appearing never, across three languages and four identities.
  //
  // The model was not refusing the rule. Nothing told it how long anyone had been
  // away: [Affections] is a score, not a history. So this is that fact, counted in
  // the unit the rule is written in — rounds of ABSENCE, so 0 means she was in the
  // previous round and 4 means she has missed the last four.
  //
  // Omitted entirely on round 1, when every value would read "never".
  const now = memory.playerStats?.week
    ?? (memory.history?.length ? memory.history.at(-1).round + 1 : 1);
  const appearances = memory.memberAppearances || {};
  if (Object.keys(appearances).length > 0) {
    const absence = members.map(m => {
      const seen = appearances[m.id] || [];
      const npc = roundMemberIds.length > 0 && !roundMemberIds.includes(m.id) ? "(npc)" : "";
      const value = seen.length ? Math.max(0, now - Math.max(...seen) - 1) : "never";
      return `${m.emoji || ""}${m.name}${npc}:${value}`;
    });
    parts.push(`[Rounds Absent] ${absence.join(" | ")}`);
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
