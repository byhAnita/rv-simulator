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

export const SLOTS = ["main", "sub", "npc"];

/**
 * The classic path expressed as a roster: one group, one main, some subs, and
 * everyone else an NPC.
 *
 * A ROSTER CARRIES NO WORLD. It answers which of them are in this run and in
 * what slot; `resolveRoster(roster, lang, world)` already takes the world as its
 * own argument, so a `worldId` on the roster was a second copy of a fact that
 * lives on the save. It drifted, exactly as a second copy does: the builder
 * stamped it with whatever world was selected on the COVER, the player then
 * chose a different one at Setup, and the save recorded the builder's answer.
 * Loading that slot gave a chaebol run the idol world's canon places, all four
 * social platforms and an idol system prompt. See CLAUDE.md, *The second phone
 * pass: a save recorded a world the run was never played in*.
 *
 * `memberIds` is passed in rather than fetched so this stays synchronous and
 * pure, and so the ORDER is the caller's. That order matters: it is the order
 * member profiles appear in the system prompt, so a roster built from the group
 * JSON's own member order reproduces today's prompt exactly.
 */
export function buildClassicRoster(groupId, mainId, subIds = [], memberIds = []) {
  const subs = new Set(subIds);
  return {
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
/**
 * The umbrella organisation, derived from the one name the player gives rather
 * than asked for twice. The SUFFIX is the world's, because "Entertainment" is
 * true of an idol agency and false of a university, a company or a family firm
 * — `world.castLore.orgSuffix` — and it is REQUIRED rather than defaulted: a
 * default would render a campus cast "under Hanseo Entertainment", which is
 * plausible-looking and wrong, the failure mode this repo bans fallbacks for.
 *
 * Empty suffix is legal and is why this joins rather than concatenates: a world
 * whose org name IS the name it was given must not come out with a trailing
 * space, which is the one byte the goldens have already caught once.
 */
export const orgNameFor = (castName, suffix) =>
  [castName || DEFAULT_CAST_NAME, suffix].filter(Boolean).join(" ");

/**
 * The one-line member header, with every absent field omitted rather than blank.
 *
 * `useRole` is the WORLD's, because `role` is a position in an idol group —
 * `Main Vocal`, `Leader`, `Maknae`. A campus world would otherwise describe a
 * student as a main vocal and an office world an analyst as a maknae, which is
 * the `[BLACKPINK Background]` shape: a specific-sounding claim two sections away
 * from the rule it contradicts, and the model is entitled to build on it.
 *
 * It filters what the MODEL sees and nothing else. `role` stays on
 * `parseGroupConfig`'s whitelist, in all 30 group files, and on every cast screen
 * — stripping it at the loader would take an idol position out of the idol world
 * too. `mbti` and `animal_plastic` are world-neutral and are not filtered.
 */
function memberLine(m, useRole) {
  const kr = m.name_kr ? `(${m.name_kr})` : "";
  const facts = [useRole ? m.role : null, m.mbti, m.animal_plastic].filter(Boolean).join(", ");
  return `${m.emoji ? `${m.emoji} ` : ""}${m.name}${kr}${facts ? ` - ${facts}` : ""}`;
}

/**
 * Render a world's cast-framing template: `{key}` from `vars`.
 *
 * A line whose value is MISSING is dropped entirely rather than rendered with a
 * gap in it — the same conditional-field rule section 5 applies to a member's
 * optional prose, and for the same reason: `Fandom: .` is worse than no line, and
 * a trailing space costs the whole ~5,500-token cached prefix. That is what lets
 * the world author `Fandom: {fandom}.` as its own element and have it disappear
 * for a cast whose group declares none, without the label living in this file.
 *
 * An UNKNOWN placeholder throws. A template is data, so a typo in a world file
 * would otherwise reach the model as a literal `{labl}` in section 4 — the
 * `편지을/를` class of defect, which renders as plausible text nobody reads.
 */
export function renderCastLore(template, vars) {
  const out = [];
  for (const line of template) {
    let drop = false;
    const rendered = line.replace(/\{(\w+)\}/g, (_, key) => {
      if (!(key in vars)) throw new Error(`castLore template: unknown placeholder {${key}}`);
      if (!vars[key]) { drop = true; return ""; }
      return vars[key];
    });
    if (!drop) out.push(rendered);
  }
  return out;
}

export function composeRosterLore(entries, configs, members, castName, castLore) {
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
    // The origin groups are deliberately NOT named, and the template must never
    // name them. Naming them is what leaked Jennie, Rose and Lisa into round 1 —
    // the model completes a group it has been told about. Nothing downstream needs
    // them: a member's profile carries who she is, and her real-world affiliation
    // plays no part in the game.
    //
    // The sentences themselves are the WORLD's since v1.4.1 step 4. They used to be
    // four string literals here, saying `N-member group under X Entertainment` and
    // `no other idol exists` — true of an idol world and false of a lecture hall.
    // `kpop_idol`'s template is those four strings verbatim, so this renders
    // byte-identically for the world that shipped them.
    const name = castName || DEFAULT_CAST_NAME;
    lines.push(...renderCastLore(castLore.composed, {
      name,
      n: String(members.length),
      org: orgNameFor(name, castLore.orgSuffix),
    }));
  } else {
    // A subset of one real group keeps that group's name, because it IS that group
    // — but the exclusion has to be said out loud. Handing over "BLACKPINK is a
    // 4-member group" while naming only Jisoo invites the model to supply the other
    // three from its own knowledge, which is the same leak in a quieter form.
    const cfg = configs.get(groupsUsed[0]);
    const label = cfg?.group?.name || groupsUsed[0];
    // `Fandom:` is its own template element now rather than a clause appended in
    // code, so a world with no fanbase simply does not author the line — and a
    // group config carrying no `fandom` drops it, which is `renderCastLore`'s
    // missing-value rule doing the job the ternary used to.
    lines.push(...renderCastLore(castLore.subset, {
      label,
      fandom: cfg?.group?.fandom || "",
      members: members.map((m) => m.name).join(", "),
    }));
  }
  lines.push("");
  for (const m of members) lines.push(memberLine(m, castLore.useRole));
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
 *
 * `world` is REQUIRED and has no default, the same rule buildSystemPrompt follows:
 * section 4's framing is the world's since v1.4.1 step 4, and a default would be a
 * second copy of every string in public/worlds/ that drifts from the first in
 * silence. It also means a missing-wiring bug fails here instead of rendering a
 * lecture hall as a K-pop agency, which is plausible output and therefore worse.
 */
export async function resolveRoster(roster, language = "zh", world) {
  if (!world?.castLore) {
    throw new Error("resolveRoster: a world is required (see rag/worldLoader.js)");
  }
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
  // ...and only in a world that says a real group's own history belongs to it.
  // `useGroupLore: false` sends every cast down the composed path, so a Red Velvet
  // roster in an office world cannot inherit Red Velvet's idol history, SM
  // included. A whole single group then takes the SUBSET template — it really is
  // that group, and its real name is what the player picked — with the world's own
  // wording instead of the group file's dated History block.
  const liveIds = new Set(members.map((m) => m.id));
  const isWholeSingleGroup = world.useGroupLore
    && groupIds.length === 1
    && !entries.some((e) => e.src === "custom")
    && Boolean(primary)
    && primary.members.every((m) => liveIds.has(m.id));

  const castName = roster?.name || DEFAULT_CAST_NAME;
  const composed = isWholeSingleGroup
    ? null
    : composeRosterLore(entries, configs, members, castName, world.castLore);
  const groupLore = composed ? composed.lore : primary.groupLore;

  // An all-custom cast has no primary config at all, and buildSystemPrompt reads
  // `groupConfig.groupLore` unconditionally — so returning null here threw a
  // TypeError before the first round. Reachable from the builder, since a custom
  // member can be the main.
  // The display name follows the lore: a cast that reads as its own group is
  // named as one everywhere, not called BLACKPINK on the setup screen.
  // `loreComposed` tells buildSystemPrompt which section-4 preamble to print.
  // A real group's lore carries a dated History block and the preamble tells the
  // model to draw on it; a composed cast has no history at all, so the same
  // sentence ("reference group history … past events") is an instruction to
  // invent one — and the nearest history it knows belongs to the real groups the
  // members came from, which is the leak the composed lore exists to close.
  const groupConfig = primary
    ? { ...primary, groupLore, loreComposed: Boolean(composed),
        group: composed ? { ...primary.group, name: composed.name } : primary.group }
    : { group: { name: composed?.name || castName, fandom: "" },
        members: [], groupLore, loreComposed: true };

  return {
    members,
    mainId,
    // The main is excluded from the subs even if her entry says "sub". `mainId`
    // falls back to the first member when no entry claims the main slot, and then
    // she is in both lists — which does not throw, it produces a prompt that
    // contradicts itself: `Main Member: Irene` beside `Sub Members: Irene, Wendy`,
    // and a JSON schema listing `"irene": 0` twice in `affectionChanges` under a
    // section 2 that demands every key appear EXACTLY ONCE.
    //
    // Not reachable from the app today — RosterBuilder gates Start and Save on a
    // main being chosen — but this function is the single funnel every roster
    // passes through, including ones a save carries, and a funnel that normalises
    // shape is the place to do it.
    subIds: idsWith("sub").filter((id) => id !== mainId),
    npcIds: idsWith("npc").filter((id) => id !== mainId),
    groupConfig,
  };
}
