// src/config/modelConfigs.js
// 4 LLM provider configurations (qwen exposes 3 sub-models)
//
// maxOutputTokens — read by llmTool.js as the per-provider output cap.
// Qwen's API expects this as `max_completion_tokens`; the others expect
// `max_tokens`. llmTool.js picks the correct field name per provider.
//
// gameplay — hours of play per $1 (per ￥1 for zh, per ₩1,000 for ko),
// derived from the cost table in README.md. Keep the two in sync when
// provider pricing changes.

export const MODEL_CONFIGS = {
  qwen: {
    id: "qwen", name: "Qwen", emoji: "🐉",
    desc: { zh: "新用户免费额度 · 优秀叙事能力", en: "Free credits · Excellent Storytelling", ko: "신규 무료 크레딧 · 뛰어난 스토리텔링" },
    color: "#6236ff", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen3.8-max", keyPrefix: "sk-ws-", keyHelp: "platform.qianwenai.com → Get API Key", format: "openai",
    // Qwen 3.x needs headroom: with reasoning ON, thinking + content share this budget.
    maxOutputTokens: 65535,
    hasFreeCredits: true,
    // Fallback when no sub-model is selected — matches the qwen3.8-max default.
    gameplay: { zh: "￥1 ≈ 1.4小时", en: "$1 ≈ 10 hrs", ko: "₩1,000 ≈ 7시간" },
    subModels: [
      {
        id: "qwen3.8-max",
        name: "Qwen 3.8 Max",
        desc: { zh: "旗舰推理 · 最高质量", en: "Flagship · Highest quality", ko: "플래그십 · 최고 품질" },
        gameplay: { zh: "￥1 ≈ 1.4小时", en: "$1 ≈ 10 hrs", ko: "₩1,000 ≈ 7시간" },
      },
      {
        id: "qwen3.7-max",
        name: "Qwen 3.7 Max",
        desc: { zh: "平衡质量与速度", en: "Balanced quality & speed", ko: "품질과 속도 균형" },
        gameplay: { zh: "￥1 ≈ 2小时", en: "$1 ≈ 14 hrs", ko: "₩1,000 ≈ 10시간" },
      },
      {
        id: "qwen3.7-plus",
        name: "Qwen 3.7 Plus",
        desc: { zh: "最经济 · 快速生成", en: "Most affordable · Fast", ko: "가장 저렴 · 빠른 생성" },
        gameplay: { zh: "￥1 ≈ 7小时", en: "$1 ≈ 49 hrs", ko: "₩1,000 ≈ 36시간" },
      },
    ],
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek V4 Flash", emoji: "🐋",
    desc: { zh: "平衡价格与质量 · 最佳故事体验", en: "Balancing price and quality · Best story experience", ko: "가격과 품질의 균형 · 최고의 스토리 경험" },
    color: "#4d6bfe", url: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    maxOutputTokens: 8192,
    gameplay: { zh: "￥1 ≈ 5小时", en: "$1 ≈ 35 hrs", ko: "₩1,000 ≈ 26시간" },
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-5.6 Luna", emoji: "⚡",
    desc: { zh: "经济高效 · 适合全球用户", en: "Cost-efficient · Versatile for global users", ko: "가성비 우수 · 글로벌 사용자에게 적합" },
    color: "#10a37f", url: "https://api.openai.com/v1/chat/completions", model: "gpt-5.6-luna",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    maxOutputTokens: 8192,
    gameplay: { zh: "￥1 ≈ 5.2小时", en: "$1 ≈ 37 hrs", ko: "₩1,000 ≈ 27시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 3.5 Flash-Lite", emoji: "💎",
    desc: { zh: "低延迟 · 快速生成", en: "Low latency · Fast generation", ko: "초저지연 · 대량 작업에 최적화" },
    color: "#4285f4", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.5-flash-lite", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "openai",
    maxOutputTokens: 8192,
    gameplay: { zh: "￥1 ≈ 4.1小时", en: "$1 ≈ 29 hrs", ko: "₩1,000 ≈ 21시간" },
  },
};
