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

// NPC_APPEARANCE_CHANCE / NPC_COOLDOWN_ROUNDS were removed in v1.3.1: nothing
// imported them. NPC appearance is driven entirely by the NPC rules in
// buildSystemPrompt() plus the [NPC Appearances] block in the dynamic tail.
// Tune NPC behaviour there, not here.