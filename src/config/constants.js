// src/config/constants.js
export const GAME_YEAR = 2026;
export const KKT_THRESHOLD = 30;
export const HISTORY_FULL_MAX = 3;     // N: full-story entries before collapse trigger
export const HISTORY_PRUNE_BATCH = 15; // batch-prune oldest summaries at round 50+
export const KKT_MAX = 10;            // Q: KKT messages per member
export const MAIN_INITIAL_AFFECTION = 12;
export const SUB_INITIAL_AFFECTION_MIN = 5;
export const SUB_INITIAL_AFFECTION_MAX = 10;

// Largest affection change one round may apply to one member, either direction.
// The prompt asks for +/-1..10 and this sits below that on purpose: a compliant
// model is never clamped, and a model that ignores the range cannot rush the
// player through several relationship stages in a single round. Pacing has to be
// the game's property, not the served model's - the free router picks the model
// and the player never sees which one. See CLAUDE.md, "Affection pacing".
export const AFFECTION_MAX_DELTA = 8;

// The player's birth year, not her age, is what the address protocol compares
// against each member's - Korean seniority is a hard year boundary, so an age is
// one lossy step away from the only number that matters. See the note above
// playerBirthYear in mainAgent.js for the bug that made this a save field.
//
// The bounds are a sanity range, not a rule about who may play: below 18 the
// premise stops being a premise, and a four-digit typo (1099, 2206) should not
// silently make the whole cast her junior.
//
// They live here, with one predicate, because the year is now written in TWO
// places - at Setup and by the in-game correction a migrated save needs - and a
// correction that accepted a year Setup would have refused is a save holding
// data no path was allowed to produce.
export const PLAYER_BIRTH_YEAR_MIN = GAME_YEAR - 80;
export const PLAYER_BIRTH_YEAR_MAX = GAME_YEAR - 18;
export const validPlayerBirthYear = (v) => {
  const y = parseInt(v);
  return y >= PLAYER_BIRTH_YEAR_MIN && y <= PLAYER_BIRTH_YEAR_MAX;
};

// NPC_APPEARANCE_CHANCE / NPC_COOLDOWN_ROUNDS were removed in v1.3.1: nothing
// imported them. NPC appearance is driven entirely by the NPC rules in
// buildSystemPrompt() plus the [NPC Appearances] block in the dynamic tail.
// Tune NPC behaviour there, not here.