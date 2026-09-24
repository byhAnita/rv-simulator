// src/rag/saveMigrator.js
//
// Saves written before v1.4.0 record who the player chose but not where they
// came from: no group id, no world, no roster. This brings one up to the shape
// the cast/world/roster split needs, at read time and in place.
//
// Two rules govern every line here.
//
// MIGRATION REPRODUCES, IT DOES NOT FIX. Every value written is one the save
// already implied, so a game in flight builds a byte-identical prompt before
// and after. That is what lets a player load a save mid-run and see nothing
// change. Where the old value was wrong — the birth year most of all — it stays
// wrong, and correcting it is a separate, visible act the player takes.
//
// NOTHING IS INVENTED TO FILL A GAP. An identity or pace the world no longer
// declares is kept verbatim rather than blanked; a group that cannot be
// identified is reported rather than guessed at silently. loadGroupIndex's
// catch returning a hardcoded Red Velvet entry is what made the v1.3.5 path bug
// invisible for a whole release, and a migration that quietly rewrites a save's
// cast would be the same failure with the player's progress attached.

import { loadGroupIndex, loadGroupConfig } from "./groupLoader";
import { DEFAULT_WORLD_ID } from "./worldLoader";
import { buildClassicRoster } from "./rosterResolver";
import { GAME_YEAR } from "../config/constants";

// Written into every migrated save. The storage key stays `rv_sim_saves_v13`
// on purpose — bumping it would orphan every existing save, which is the exact
// opposite of the requirement — so this field is how a reader tells the shapes
// apart. See docs/V140_PLAN.md §9.2.
export const SAVE_SCHEMA = 14;

// Used only when the cast cannot be identified at all, and never silently.
const FALLBACK_GROUP_ID = "red_velvet";

/**
 * The half of the migration that needs no network: schema, world, birth year.
 *
 * Pure and synchronous so it can be reasoned about and tested on its own, and
 * so the expensive half is skippable for a save that already carries a roster.
 */
export function migrateSaveFields(save) {
  if (!save) return save;
  const form = save.form || {};

  // The one field that changes meaning. Through v1.3.9 the prompt derived the
  // player's birth year as GAME_YEAR - age on every build; doing that arithmetic
  // once, here, writes down the value the save has always produced. It does not
  // recover the true year — age does not contain it — so a migrated save keeps
  // whatever ±1 error it already had. See CLAUDE.md, "the player's birth year is
  // collected, not derived".
  //
  // A save with no usable age gets no birth year rather than a fabricated one:
  // buildSystemPrompt's legacy fallback already handles that case, and an
  // invented 2006 sitting in a save field would look like something the player
  // chose.
  const age = parseInt(form.age);
  const birthYear = form.birthYear || (age ? String(GAME_YEAR - age) : undefined);

  return {
    ...save,
    schema: SAVE_SCHEMA,
    worldId: save.worldId || DEFAULT_WORLD_ID,
    // form.identity, form.pace and form.starLevel are copied untouched even
    // when the world no longer declares them. A custom identity is a free
    // string by design, and blanking an unrecognised one would erase the
    // premise of somebody's run to satisfy a lookup table.
    form: birthYear ? { ...form, birthYear } : { ...form },
  };
}

/**
 * Which group this save's cast came from.
 *
 * Member ids are not unique across the library: `x` is a crossover roster and
 * shares seven ids with the groups those members debuted in, so a save whose
 * main member is `irene` is genuinely ambiguous between `red_velvet` and `x`.
 * Matching on the main member alone would pick one at random, in index order,
 * and hand the player a cast she never chose.
 *
 * So the test is containment of the whole chosen cast — main plus every sub —
 * which separates the two in every case where the player picked a sub at all.
 * `preferGroupId` breaks a remaining tie using the group the app currently has
 * selected: that is a real signal and it cannot reintroduce the bug this
 * function exists to fix, because a group that does not contain the cast is
 * never a candidate in the first place.
 *
 * @returns {Promise<{groupId: string, config: object|null, ambiguous: boolean}>}
 */
async function findGroupForCast(save, language, preferGroupId) {
  const form = save.form || {};
  const wanted = [form.mainMember, ...(form.subMembers || [])].filter(Boolean);

  const index = await loadGroupIndex();
  // One group failing to load must not abort the scan: it is almost certainly
  // not the group being looked for, and a hard failure here would make an
  // unrelated 404 unloadable-save shaped.
  const settled = await Promise.allSettled(
    index.map(async (g) => ({ id: g.id, config: await loadGroupConfig(g.id, language) })));

  const loaded = [];
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "fulfilled") loaded.push(settled[i].value);
    else console.warn(`saveMigrator: ${index[i]?.id} did not load during the group scan`);
  }

  const candidates = loaded.filter(({ config }) => {
    const ids = new Set(config.members.map((m) => m.id));
    return wanted.length > 0 && wanted.every((id) => ids.has(id));
  });

  if (candidates.length === 1) return { ...candidates[0], groupId: candidates[0].id, ambiguous: false };

  if (candidates.length > 1) {
    const preferred = candidates.find((c) => c.id === preferGroupId) || candidates[0];
    console.warn(
      `saveMigrator: ${wanted.join("+")} appears in ${candidates.map((c) => c.id).join(", ")};`
      + ` reading this save as ${preferred.id}`);
    return { groupId: preferred.id, config: preferred.config, ambiguous: true };
  }

  // Nothing contains this cast. Either the save predates the group it used, or
  // the index did not load. Say so — the roster resolve that follows will drop
  // members it cannot find, and a silent Red Velvet here is how that turns into
  // "the game replaced my cast" with no way to describe it.
  console.warn(
    `saveMigrator: no group contains ${wanted.join("+") || "(no members recorded)"};`
    + ` falling back to ${FALLBACK_GROUP_ID}`);
  const fallback = loaded.find((g) => g.id === FALLBACK_GROUP_ID);
  return { groupId: FALLBACK_GROUP_ID, config: fallback?.config || null, ambiguous: true };
}

/**
 * Bring a save up to schema 14: world, group, roster, birth year.
 *
 * Idempotent, and deliberately not gated on the schema number — each field is
 * filled only when it is absent, so a half-migrated save written by a build
 * between these two shapes is completed rather than trusted or rejected.
 *
 * @param {object} save        a save slot, any vintage
 * @param {string} language    zh/en/ko, for the group fetch
 * @param {object} [opts]      { preferGroupId } — tie-break for a shared cast
 */
export async function migrateSave(save, language = "zh", opts = {}) {
  if (!save) return save;
  const migrated = migrateSaveFields(save);
  if (migrated.groupId && migrated.roster) return migrated;

  const { groupId, config } = await findGroupForCast(migrated, language, opts.preferGroupId);
  const form = migrated.form || {};

  // Member order is the order profiles appear in the system prompt, so the
  // roster is built from the group JSON's own order. Any other order would
  // resolve to the same cast and a different prompt — the same bytes rearranged
  // is still a total cache miss.
  const memberIds = config ? config.members.map((m) => m.id) : [];

  return {
    ...migrated,
    groupId,
    roster: migrated.roster || buildClassicRoster(
      groupId, form.mainMember, form.subMembers || [], memberIds, migrated.worldId),
  };
}
