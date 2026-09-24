// src/rag/rosterResolver.js
//
// A roster says WHO is in this run and what part each of them plays. It is the
// internal representation behind both doors: the classic "pick a group" path
// builds one implicitly from a group id, and the v1.4.1 builder produces one
// directly. Everything downstream consumes `members[]`, so nothing past
// resolveRoster needs to know which door the player came through.
//
// Two rules the shape encodes, both from docs/V140_PLAN.md §4.2:
//
//   - Library members stay BY REFERENCE (`src: "library"` + groupId + memberId),
//     so a fix to a shipped profile reaches games already in progress.
//   - Custom members are SNAPSHOTTED inline (`src: "custom"` + profile), so
//     deleting one from the palette can never break a running save. The palette
//     is not a dependency.

import { loadGroupConfig } from "./groupLoader";
import { DEFAULT_WORLD_ID } from "./worldLoader";

export const SLOTS = ["main", "sub", "npc"];

/**
 * The classic path expressed as a roster: one group, one main, some subs, and
 * everyone else an NPC.
 *
 * `memberIds` is passed in rather than fetched so this stays synchronous and
 * pure, and so the ORDER is the caller's. That order matters: it is the order
 * member profiles appear in the system prompt, so a roster built from the group
 * JSON's own member order reproduces today's prompt exactly.
 */
export function buildClassicRoster(groupId, mainId, subIds = [], memberIds = [], worldId = DEFAULT_WORLD_ID) {
  const subs = new Set(subIds);
  return {
    worldId,
    groupId,
    entries: memberIds.map((id) => ({
      src: "library",
      groupId,
      memberId: id,
      slot: id === mainId ? "main" : subs.has(id) ? "sub" : "npc",
    })),
  };
}

/**
 * Turn a roster into the shape the prompt builder consumes.
 *
 * Returns { members, mainId, subIds, npcIds, groupConfig }. `members` is in
 * roster order and carries no roster bookkeeping — the slots come back
 * separately, because buildSystemPrompt already takes mainId/subIds and an
 * extra field on a member object is a thing that can accidentally reach a
 * prompt.
 *
 * NPCs are explicit here, which is the point: getNpcMembers derives them as
 * "everyone not chosen", so a 9-member group with 1 main and 2 subs emits six
 * NPC profiles into the static prompt whether or not they matter. That stops
 * being automatic once a roster names them.
 */
export async function resolveRoster(roster, language = "zh") {
  const entries = roster?.entries || [];

  const groupIds = [...new Set(
    entries.filter((e) => e.src !== "custom" && e.groupId).map((e) => e.groupId))];
  const configs = new Map();
  for (const gid of groupIds) {
    configs.set(gid, await loadGroupConfig(gid, language));
  }

  const members = [];
  const slotOf = new Map();
  for (const e of entries) {
    let base = null;
    if (e.src === "custom") {
      // Snapshotted at build time; `id` is authoritative so an edited profile
      // cannot rename itself out from under the affection map.
      base = e.profile ? { ...e.profile, id: e.memberId } : null;
    } else {
      const found = configs.get(e.groupId)?.members.find((m) => m.id === e.memberId);
      // A member the roster names but the group no longer has is skipped rather
      // than faked. A blank profile would reach the prompt as a nameless cast
      // member, which is worse than a smaller cast.
      base = found ? { ...found } : null;
      if (!found) console.warn(`roster: ${e.groupId}/${e.memberId} is not in the library`);
    }
    if (!base) continue;
    if (e.override) Object.assign(base, e.override);
    members.push(base);
    slotOf.set(base.id, e.slot);
  }

  const idsWith = (slot) => members.filter((m) => slotOf.get(m.id) === slot).map((m) => m.id);
  const mainId = idsWith("main")[0] || members[0]?.id || null;

  // The group whose lore the prompt uses. For a single-group roster that is
  // simply the group; a cross-group roster needs composed lore, which is
  // v1.4.1 work and deliberately not invented here.
  const primaryGroupId = entries.find((e) => e.memberId === mainId)?.groupId
    || roster?.groupId || groupIds[0] || null;

  return {
    members,
    mainId,
    subIds: idsWith("sub"),
    npcIds: idsWith("npc"),
    groupConfig: configs.get(primaryGroupId) || null,
  };
}
