// src/config/stageConfig.js
// 感情阶段 + 状态定义 (可从 RAG 的 game_settings 覆盖)

export const DEFAULT_STAGE_THRESHOLDS = [0, 16, 31, 51, 66, 81, 91, 101];

// One scale, three vocabularies. Until v1.4.0 step 6 there was only the Chinese
// list and `getStageName` took no language, so buildDynamicTail emitted 有印象 to
// an English player's model while section 9 of the system prompt listed
// "Acquaintance" — two names for one thing, with nothing saying they matched. The
// UI had the same problem in the open: an English game showed Chinese stage
// labels under every member.
//
// zh is unchanged on purpose. It is what every existing save's prompts have
// always contained, and the dynamic tail is the always-miss message, so
// localizing the other two costs no cached prefix.
export const STAGE_NAMES = {
  zh: ["陌生人", "有印象", "产生兴趣", "暧昧期", "确认关系", "热恋期", "考验期"],
  en: ["Stranger", "Acquaintance", "Interest", "Flirting", "Confirmed", "Passionate", "Trial"],
  ko: ["남남", "안면", "관심", "썸", "연인", "열애", "시험기"],
};
export const DEFAULT_STAGE_NAMES = STAGE_NAMES.zh;

// The English list is also what section 9 of the system prompt prints, so these
// two must not drift apart: smoke asserts the prompt's list and this one are the
// same seven in the same order.
export const stageNamesFor = (language) => STAGE_NAMES[language] || STAGE_NAMES.zh;

// The address ladder's three rungs (v1.4.4 P1), as the stages that make them up:
// R1 distant 0-30, R2 warming 31-65, R3 close 66+. Named by STAGE, not by score,
// because the stage label is what [Affections] in the tail prints beside her score.
export const RUNG_FIRST_STAGE = [0, 2, 4];
export const rungStagesFor = (language) => {
  const names = stageNamesFor(language);
  return RUNG_FIRST_STAGE.map((lo, i) => names.slice(lo, RUNG_FIRST_STAGE[i + 1]));
};

// "0-15", "16-30", … derived from the thresholds rather than typed out beside
// them. Section 9 of the system prompt prints these, and a hand-written copy is
// how the prompt ends up describing a scale the code does not implement.
export const STAGE_BANDS = DEFAULT_STAGE_THRESHOLDS.slice(0, -1)
  .map((lo, i) => `${lo}-${DEFAULT_STAGE_THRESHOLDS[i + 1] - 1}`);

// What each stage ALLOWS (v1.4.4 P2), one line per stage, from the design doc's
// section 9. Section 9 of the prompt used to print the names and the score bands
// and nothing else, so a member at 12 had no statement anywhere that she should
// not already care - and Yuhan's chaebol play had Irene looking after the player
// on day one. English rule text, the same in every language; the stage NAME
// beside each line is the localized one the tail prints.
export const STAGE_BEHAVIOUR = [
  "politeness, brief help, contact through work or circumstance - nothing more",
  "she starts keeping track of {player} - her habits, where she tends to be - and simple care is allowed",
  "she makes short conversations happen on her own, still held back by what they are to each other",
  "open push and pull: jealousy, testing, contact late at night. Naming what they feel is hardest here, between two women",
  "both know and have said it, which does not mean it can be public; secrecy becomes the pressure that matters most",
  "sweeter, and the chance of a crisis rises sharply",
  "the story is heading for its ending: {player} chooses between love, career, going public and her own growth",
];
export const DEFAULT_STAGE_COLORS = ["#9e9e9e", "#64b5f6", "#81c784", "#ffb74d", "#f06292", "#e91e63", "#9c27b0"];

export function getStageIdx(aff, thresholds = DEFAULT_STAGE_THRESHOLDS) {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (aff >= thresholds[i]) return i;
  }
  return 0;
}

export function getStageName(aff, names = DEFAULT_STAGE_NAMES, thresholds = DEFAULT_STAGE_THRESHOLDS) {
  return names[getStageIdx(aff, thresholds)] || "陌生人";
}

// Prefer this at every call site that knows the player's language — which is all
// of them. `getStageName` keeps its shape for the RAG override path that may pass
// its own names.
export function stageNameIn(aff, language, thresholds = DEFAULT_STAGE_THRESHOLDS) {
  const names = stageNamesFor(language);
  return names[getStageIdx(aff, thresholds)] || names[0];
}

export function getStageColor(aff, colors = DEFAULT_STAGE_COLORS, thresholds = DEFAULT_STAGE_THRESHOLDS) {
  return colors[getStageIdx(aff, thresholds)] || "#9e9e9e";
}