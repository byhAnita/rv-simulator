// src/config/stageConfig.js
// 感情阶段 + 状态定义 (可从 RAG 的 game_settings 覆盖)

export const DEFAULT_STAGE_THRESHOLDS = [0, 16, 31, 51, 66, 81, 91, 101];
export const DEFAULT_STAGE_NAMES = ["陌生人", "有印象", "产生兴趣", "暧昧期", "确认关系", "热恋期", "考验期"];
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

export function getStageColor(aff, colors = DEFAULT_STAGE_COLORS, thresholds = DEFAULT_STAGE_THRESHOLDS) {
  return colors[getStageIdx(aff, thresholds)] || "#9e9e9e";
}