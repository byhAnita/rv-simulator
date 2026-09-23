// src/config/modelConfigs.js
// 4 LLM provider configurations. The "qwen" provider is shown as "Aliyun" in
// the UI; its id stays "qwen" so saves and rv_sim_model_v11 keep working.
//
// maxOutputTokens — read by llmTool.js as the per-provider output cap.
// llmTool.js emits it as `max_completion_tokens` for Aliyun and `max_tokens`
// for the others. Aliyun accepts either name (verified live); the split just
// tracks the field OpenAI-compatible APIs are standardising on.
//
// gameplay — hours of play per $1 (per ￥1 for zh, per ₩1,000 for ko),
// derived from the cost table in README.md. Keep the two in sync when
// provider pricing changes.

export const ALIYUN_CHAT_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// Token Plan keys (sk-sp-) need token-plan.cn-beijing.maas.aliyuncs.com, whose
// CORS preflight returns 401 without Access-Control-Allow-Origin, so browsers
// cannot call it. Keep the subscription hint hidden until a proxy exists.
export const ALIYUN_TOKEN_PLAN_SUPPORTED = false;
export const ALIYUN_TOKEN_PLAN_URL = "https://www.qianwenai.com/benefits/tokenplan";

// Free-credit route: every entry has its own new-user allowance and JSON mode.
// Ordered by storytelling quality, best first; the router walks it top-down.
// Order is best-storytelling-first, with two live-testing exceptions:
//  - qwen3.8-2.4t-a95b and qwen3.5-27b are absent. Neither can serve a round:
//    a95b never finished inside 90s (0/12), qwen3.5-27b answers literal `null`
//    (0/12). See docs/TEST_FINDINGS.md.
//  - glm-5.3 sits last despite flagship quality: it cannot stop thinking, so it
//    costs ~2x the tokens and 3-5x the time of everything above it.
export const ALIYUN_FREE_ROUTE = [
  // Flagship
  "qwen3.8-max", "qwen3.8-max-0902", "deepseek-v4-pro", "deepseek-v4-pro-0813",
  "glm-5.2", "glm-5.1",
  // Mid
  "qwen3.7-plus", "qwen3.7-plus-2026-05-26", "qwen3.6-plus", "qwen3.6-plus-2026-04-02",
  "qwen3.5-plus", "qwen3.5-plus-2026-04-20", "qwen3.5-plus-2026-02-15", "qwen3.5-397b-a17b",
  "deepseek-v4.1-flash", "deepseek-v4-flash",
  // Flash
  "qwen3.8-flash", "qwen3.7-flash", "qwen3.7-flash-2026-07-15", "qwen3.6-flash",
  "qwen3.6-flash-2026-04-16", "qwen3.5-flash", "qwen3.5-flash-2026-02-23", "qwen3.5-122b-a10b",
  // Small
  "qwen3.6-35b-a3b", "qwen3.6-27b", "qwen3.5-35b-a3b",
  // Always thinks, cannot be told not to - slowest by a wide margin, so last.
  "glm-5.3",
];

// Paid mode: player-selectable models. peakPricing marks Aliyun DeepSeek's 2x
// daytime rate; gameplay for those is a daily blend.
export const ALIYUN_PAID_MODELS = [
  {
    id: "qwen3.8-max", name: "Qwen 3.8 Max",
    desc: { zh: "旗舰 · 最高质量", en: "Flagship · Best quality", ko: "플래그십 · 최고 품질" },
    gameplay: { zh: "￥1 ≈ 1.4小时", en: "$1 ≈ 10 hrs", ko: "₩1,000 ≈ 7시간" },
  },
  {
    id: "qwen3.8-flash", name: "Qwen 3.8 Flash",
    desc: { zh: "极速 · 最便宜", en: "Fastest · Cheapest", ko: "초고속 · 최저가" },
    gameplay: { zh: "￥1 ≈ 26小时", en: "$1 ≈ 190 hrs", ko: "₩1,000 ≈ 130시간" },
  },
  {
    id: "qwen3.7-plus", name: "Qwen 3.7 Plus",
    desc: { zh: "质量与价格均衡", en: "Balanced value", ko: "균형 잡힌 가성비" },
    gameplay: { zh: "￥1 ≈ 7小时", en: "$1 ≈ 49 hrs", ko: "₩1,000 ≈ 36시간" },
  },
  {
    id: "qwen3.6-flash", name: "Qwen 3.6 Flash",
    desc: { zh: "快速 · 经济", en: "Fast · Affordable", ko: "빠름 · 저렴" },
    gameplay: { zh: "￥1 ≈ 10小时", en: "$1 ≈ 74 hrs", ko: "₩1,000 ≈ 53시간" },
  },
  {
    id: "deepseek-v4-pro", name: "DeepSeek V4 Pro",
    desc: { zh: "DeepSeek 旗舰", en: "DeepSeek flagship", ko: "DeepSeek 플래그십" },
    gameplay: { zh: "￥1 ≈ 2.7小时", en: "$1 ≈ 19 hrs", ko: "₩1,000 ≈ 14시간" },
  },
  {
    id: "deepseek-v4-pro-0813", name: "DeepSeek V4 Pro 0813", peakPricing: true,
    desc: { zh: "旗舰固定版 · 闲时半价", en: "Flagship snapshot · off-peak ½", ko: "플래그십 스냅샷 · 비피크 ½" },
    gameplay: { zh: "￥1 ≈ 3.3小时", en: "$1 ≈ 24 hrs", ko: "₩1,000 ≈ 17시간" },
  },
  {
    id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", peakPricing: true,
    desc: { zh: "新一代快速版", en: "Newest fast model", ko: "최신 고속 모델" },
    gameplay: { zh: "￥1 ≈ 12小时", en: "$1 ≈ 87 hrs", ko: "₩1,000 ≈ 63시간" },
  },
  {
    id: "deepseek-v4-flash-0731", name: "DeepSeek V4 Flash 0731", peakPricing: true,
    desc: { zh: "快速固定版", en: "Fast snapshot", ko: "고속 스냅샷" },
    gameplay: { zh: "￥1 ≈ 10小时", en: "$1 ≈ 71 hrs", ko: "₩1,000 ≈ 51시간" },
  },
  {
    id: "glm-5.2", name: "GLM-5.2",
    desc: { zh: "智谱旗舰 · 文风细腻", en: "Zhipu flagship · Nuanced prose", ko: "Zhipu 플래그십 · 섬세한 문체" },
    gameplay: { zh: "￥1 ≈ 2.1小时", en: "$1 ≈ 15 hrs", ko: "₩1,000 ≈ 11시간" },
  },
];

export const ALIYUN_DEFAULT_PAID_MODEL = "qwen3.8-max";

// Per-model request params, from docs/api_references/aliyun_references.md.
//
// thinking  "toggle" — enable_thinking accepts true/false
//           "always" — the model cannot stop thinking (glm-5.3 rejects false),
//                      so no toggle is sent and the OFF cap keeps thinking room
// effort    reasoning_effort sent when Deep Thinking is ON; null = omit the
//           field, for families the reference does not list it for.
//           One level below each family's maximum: enough depth for a story
//           round without paying for the top tier.
// preserve  model accepts preserve_thinking (Qwen hybrids only). We always send
//           false: the game never sends reasoning_content back, and preserved
//           thinking would be billed as input on the next round.
// capField  max_completion_tokens is documented for Qwen Max/Plus/Flash, the
//           DeepSeek V4 series and GLM 5+; open-weight Qwen builds are not on
//           that list, so they get the standard max_tokens.
// tokens    [OFF, ON] output cap. A round needs ~800 tokens; the ON value adds
//           headroom because thinking and answer share one budget.
const ALIYUN_FAMILIES = {
  qwen38:     { thinking: "toggle", effort: "medium", preserve: true,  capField: "max_completion_tokens", tokens: [8192, 65535] },
  qwenHybrid: { thinking: "toggle", effort: null,     preserve: true,  capField: "max_completion_tokens", tokens: [8192, 65535] },
  // "never": Deep Thinking is a no-op here. With enable_thinking:true these builds
  // return the whole JSON escaped inside a string (qwen3.6-27b: 12/12 clean off,
  // 1/4 on), which no parser level can recover. Always send false.
  qwenOpen:   { thinking: "never",  effort: null,     preserve: false, capField: "max_tokens",            tokens: [8192, 8192] },
  deepseek:   { thinking: "toggle", effort: "high",   preserve: false, capField: "max_completion_tokens", tokens: [8192, 65535] },
  glm:        { thinking: "toggle", effort: "high",   preserve: false, capField: "max_completion_tokens", tokens: [8192, 65535] },
  glmAlways:  { thinking: "always", effort: "max",    preserve: false, capField: "max_completion_tokens", tokens: [32768, 65535] },
};

export function getAliyunModelFamily(modelId) {
  const id = String(modelId || "");
  if (id === "glm-5.3") return "glmAlways";              // reasoning_effort: max only
  if (id.startsWith("glm-")) return "glm";
  if (id.startsWith("deepseek-")) return "deepseek";
  if (/^qwen3\.8-(max|flash)/.test(id)) return "qwen38"; // low | medium | xhigh
  if (/^qwen3\.[5-8]-(plus|flash)/.test(id)) return "qwenHybrid";
  return "qwenOpen";                                     // 397b-a17b, 27b, 35b-a3b, 122b-a10b
}

export function getAliyunModelParams(modelId) {
  const f = ALIYUN_FAMILIES[getAliyunModelFamily(modelId)];
  return {
    thinking: f.thinking,
    reasoningEffort: f.effort,
    preserveThinking: f.preserve,
    capField: f.capField,
    maxOutputTokensOff: f.tokens[0],
    maxOutputTokensOn: f.tokens[1],
  };
}

export const MODEL_CONFIGS = {
  qwen: {
    id: "qwen", name: "Aliyun", emoji: "🐉",
    desc: { zh: "千问 · DeepSeek · GLM · 新用户免费", en: "Qwen · DeepSeek · GLM · Free credits", ko: "Qwen · DeepSeek · GLM · 무료 크레딧" },
    color: "#6236ff", url: ALIYUN_CHAT_URL,
    model: ALIYUN_DEFAULT_PAID_MODEL, keyPrefix: "sk-ws-", keyHelp: "platform.qianwenai.com → Get API Key", format: "openai",
    // Caps and field name come from getAliyunModelParams(model), per model.
    maxOutputTokens: 8192, capField: "max_completion_tokens",
    hasFreeCredits: true,
    // Fallback cost string — matches the qwen3.8-max paid default.
    gameplay: { zh: "￥1 ≈ 1.4小时", en: "$1 ≈ 10 hrs", ko: "₩1,000 ≈ 7시간" },
  },
  deepseek: {
    // Named for the model, not the platform: "DeepSeek Official" told the player
    // whose API it is but not what they would be running. The id stays `deepseek`.
    id: "deepseek", name: "DeepSeek V4.1 Flash", emoji: "🐋",
    desc: { zh: "DeepSeek 官方平台 · 需少量充值", en: "DeepSeek's own platform · small top-up", ko: "DeepSeek 공식 플랫폼 · 소액 충전 필요" },
    color: "#4d6bfe", url: "https://api.deepseek.com/chat/completions", model: "deepseek-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    // Upstream defaults: 8K non-thinking, 64K thinking (max_tokens, not max_completion_tokens).
    maxOutputTokens: 8192, maxOutputTokensReasoning: 65536, capField: "max_tokens",
    gameplay: { zh: "￥1 ≈ 18小时", en: "$1 ≈ 120 hrs", ko: "₩1,000 ≈ 90시간" },
  },
  gpt4omini: {
    // The provider id stays "gpt4omini": it is the value stored in
    // rv_sim_model_v11 and in every save slot, so renaming it would silently
    // reset the model choice for existing players. Only the model string moves.
    id: "gpt4omini", name: "GPT-6 Luna", emoji: "⚡",
    desc: { zh: "经济高效 · 适合全球用户", en: "Cost-efficient · Versatile for global users", ko: "가성비 우수 · 글로벌 사용자에게 적합" },
    color: "#10a37f", url: "https://api.openai.com/v1/chat/completions", model: "gpt-6-luna",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    // max_tokens is deprecated upstream; reasoning tokens need their own room.
    // GPT-6 Luna allows 128000 out — these are ceilings, not reservations.
    maxOutputTokens: 8192, maxOutputTokensReasoning: 32768, capField: "max_completion_tokens",
    gameplay: { zh: "￥1 ≈ 23小时", en: "$1 ≈ 163 hrs", ko: "₩1,000 ≈ 118시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 3.5 Flash-Lite", emoji: "💎",
    desc: { zh: "低延迟 · 快速生成", en: "Low latency · Fast generation", ko: "초저지연 · 대량 작업에 최적화" },
    color: "#4285f4", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.5-flash-lite", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "openai",
    maxOutputTokens: 8192, maxOutputTokensReasoning: 65535, capField: "max_tokens",
    gameplay: { zh: "￥1 ≈ 4.1小时", en: "$1 ≈ 29 hrs", ko: "₩1,000 ≈ 21시간" },
  },
};
