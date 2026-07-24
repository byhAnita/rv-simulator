// src/config/constants.js
export const GAME_YEAR = 2026;
export const KKT_THRESHOLD = 30;
export const MEMORY_ROUNDS = 4;
export const MAIN_INITIAL_AFFECTION = 12;
export const SUB_INITIAL_AFFECTION_MIN = 5;
export const SUB_INITIAL_AFFECTION_MAX = 10;
export const NPC_APPEARANCE_CHANCE = 0.3;
export const NPC_COOLDOWN_ROUNDS = 2;

// Special event rounds
// Round 0: background-only first-meet (no event injection)
// Intro phase auto-inject: CAREER_EARLY_ROUND and EMOTIONAL_EARLY_ROUND
// Queue phase begins at EMOTIONAL_LATE_ROUND
export const CAREER_EARLY_ROUND = 1;        // auto-inject career early (intro phase)
export const CAREER_MID_ROUND = 14;         // career mid enters priority queue
export const CAREER_LATE_ROUND = 28;        // career late enters priority queue
export const EMOTIONAL_EARLY_ROUND = 3;     // auto-inject emotional early (intro phase)
export const EMOTIONAL_LATE_ROUND = 6;      // emotional late enters queue; queue phase begins

// FIFO special event queue constants
export const MAX_QUEUE_STAY = 8;            // rounds in queue before silent discard
export const MAX_D_SHOWN_COUNT = 3;         // times shown as D before discard
export const D_COOLDOWN = 2;               // rounds D reverts to custom after player triggers

// Ending condition: round >= MIN_ROUND AND topAffection >= MIN_AFFECTION
export const ENDING_MIN_ROUND = 35;
export const ENDING_MIN_AFFECTION = 95;
