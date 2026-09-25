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
 * Section 4 of the prompt, composed from the ROSTER instead of from one group.
 *
 * This fixes a bug reported from phone play on a cross-group cast: Jisoo
 * (BLACKPINK) as main, Irene (Red Velvet) and a custom member as subs, Mina and
 * Sana (TWICE) as NPCs. Round 1 put Jennie, Rose and Lisa in the story, and set
 * the company to YG.
 *
 * Neither was the model's fault. `groupConfig` was the MAIN MEMBER'S group, so
 * section 4 handed over `[BLACKPINK Background]` plus full Public / Private /
 * Queer Texture prose for all four BLACKPINK members — three of whom are not in
 * the roster at all. Section 6's rule says only members in MEMBER PROFILES may
 * appear by name, and section 4 was contradicting it two sections earlier with
 * richer detail. "YG" was never in any file: the model inferred the agency from
 * being told the cast was BLACKPINK, which is a reasonable thing to infer.
 *
 * So the composed form names WHO IS IN THE CAST and from where, and says plainly
 * that nobody else exists. It does not repeat the prose fields, because section 5
 * already carries them in full for exactly the members who are present — the
 * single-group lore duplicates them and that is inherited token cost, not a
 * pattern to extend.
 *
 * Deterministic by construction: groups appear in order of first appearance in
 * the roster, members in roster order. `buildSystemPrompt` must stay a pure
 * function of the save.
 */
export const DEFAULT_CAST_NAME = "X";
/** The agency is derived, not asked for: one field to name, not two. */
export const agencyFor = (castName) => `${castName || DEFAULT_CAST_NAME} Entertainment`;

/** The one-line member header, with every absent field omitted rather than blank. */
function memberLine(m) {
  const kr = m.name_kr ? `(${m.name_kr})` : "";
  const facts = [m.role, m.mbti, m.animal_plastic].filter(Boolean).join(", ");
  return `${m.emoji ? `${m.emoji} ` : ""}${m.name}${kr}${facts ? ` - ${facts}` : ""}`;
}

export function composeRosterLore(entries, configs, members, castName) {
  const known = new Set(members.map((m) => m.id));
  const groupsUsed = [];
  let hasCustom = false;
  for (const e of entries) {
    if (!known.has(e.memberId)) continue;   // skipped by the resolver, so absent here too
    if (e.src === "custom") { hasCustom = true; continue; }
    if (!groupsUsed.includes(e.groupId)) groupsUsed.push(e.groupId);
  }
  const crossSource = hasCustom || groupsUsed.length !== 1;

  const lines = [];
  if (crossSource) {
    // THE CAST IS A GROUP, not a collection of people from other groups. This is
    // the premise the whole setting already assumes: secrecy, dorms, schedules,
    // group activities and the phase beats are all group machinery, and a cast
    // described as five idols from four agencies has none of it — every scene
    // would need to justify why two of them are in the same room.
    //
    // Naming the agency is also what stops the model inventing one. "YG" was never
    // in any file; it was inferred from being told the cast was BLACKPINK.
    const name = castName || DEFAULT_CAST_NAME;
    lines.push(`[${name} Background]`);
    lines.push(`${name} is a ${members.length}-member group under ${agencyFor(name)}.`);
    // The origin groups are deliberately NOT named. Naming them is what leaked
    // Jennie, Rose and Lisa into round 1 — the model completes a group it has been
    // told about. Nothing downstream needs them: a member's profile carries who she
    // is, and her real-world affiliation plays no part in the game.
    lines.push(`${name} exists only in this story. These ${members.length} debuted`
      + ` together as ${name}. Whatever groups these members belong to outside this`
      + ` story are not part of this world and must never be mentioned.`);
    lines.push("ONLY the members listed in MEMBER PROFILES are in this group. No"
      + " other idol exists in this story, and none may be named or referred to,"
      + " not even in passing or over a phone.");
  } else {
    // A subset of one real group keeps that group's name, because it IS that group
    // — but the exclusion has to be said out loud. Handing over "BLACKPINK is a
    // 4-member group" while naming only Jisoo invites the model to supply the other
    // three from its own knowledge, which is the same leak in a quieter form.
    const cfg = configs.get(groupsUsed[0]);
    const label = cfg?.group?.name || groupsUsed[0];
    lines.push(`[${label} Background]`);
    lines.push(`This story follows part of ${label}.`
      + (cfg?.group?.fandom ? ` Fandom: ${cfg.group.fandom}.` : ""));
    lines.push(`ONLY these members of ${label} exist in this story:`
      + ` ${members.map((m) => m.name).join(", ")}. No other member of ${label}`
      + ` appears, and none may be named or referred to.`);
  }
  lines.push("");
  for (const m of members) lines.push(memberLine(m));
  // The prose fields are NOT repeated here. Section 5 carries them in full for
  // exactly the members present; the single-group lore duplicates them and that is
  // inherited token cost, not a pattern worth extending to a new code path.
  //
  // `name` comes back with the lore so the two can never disagree: a subset of
  // BLACKPINK is still called BLACKPINK on the setup screen, while a cross-source
  // cast is called by its own name everywhere.
  return {
    lore: lines.join("\n"),
    name: crossSource
      ? (castName || DEFAULT_CAST_NAME)
      : (configs.get(groupsUsed[0])?.group?.name || groupsUsed[0]),
    crossSource,
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
  const primary = configs.get(primaryGroupId) || null;

  // A single group's own lore is used VERBATIM when the roster is exactly that
  // group — which is what the classic door always produces, since
  // buildClassicRoster gives every member a slot. That condition is what keeps
  // the golden prompts byte-identical: the composed form below is reached only by
  // a cast the old code could not express in the first place.
  //
  // A SUBSET of one group takes the composed form too, deliberately. Handing over
  // "[BLACKPINK Background] BLACKPINK is a 4-member group" while naming only Jisoo
  // invites the model to supply the other three from its own knowledge, which is
  // the same failure in a quieter form.
  const liveIds = new Set(members.map((m) => m.id));
  const isWholeSingleGroup = groupIds.length === 1
    && !entries.some((e) => e.src === "custom")
    && Boolean(primary)
    && primary.members.every((m) => liveIds.has(m.id));

  const castName = roster?.name || DEFAULT_CAST_NAME;
  const composed = isWholeSingleGroup
    ? null
    : composeRosterLore(entries, configs, members, castName);
  const groupLore = composed ? composed.lore : primary.groupLore;

  // An all-custom cast has no primary config at all, and buildSystemPrompt reads
  // `groupConfig.groupLore` unconditionally — so returning null here threw a
  // TypeError before the first round. Reachable from the builder, since a custom
  // member can be the main.
  // The display name follows the lore: a cast that reads as its own group is
  // named as one everywhere, not called BLACKPINK on the setup screen.
  const groupConfig = primary
    ? { ...primary, groupLore,
        group: composed ? { ...primary.group, name: composed.name } : primary.group }
    : { group: { name: composed?.name || castName, fandom: "", socialPlatforms: ["bubble", "instagram", "weverse"], privateChat: "kakaotalk" },
        members: [], groupLore };

  return {
    members,
    mainId,
    subIds: idsWith("sub"),
    npcIds: idsWith("npc"),
    groupConfig,
  };
}
