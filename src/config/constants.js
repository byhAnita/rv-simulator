// src/config/constants.js
export const GAME_YEAR = 2026;
export const KKT_THRESHOLD = 30;
export const HISTORY_FULL_MAX = 3;     // N: full-story entries before collapse trigger
export const HISTORY_PRUNE_BATCH = 15; // batch-prune oldest summaries at round 50+
export const KKT_MAX = 10;            // Q: KKT messages per member
export const MAIN_INITIAL_AFFECTION = 12;
export const SUB_INITIAL_AFFECTION_MIN = 5;
export const SUB_INITIAL_AFFECTION_MAX = 10;

// NPC_APPEARANCE_CHANCE / NPC_COOLDOWN_ROUNDS were removed in v1.3.1: nothing
// imported them. NPC appearance is driven entirely by the NPC rules in
// buildSystemPrompt() plus the [NPC Appearances] block in the dynamic tail.
// Tune NPC behaviour there, not here.