// src/config/modelConfigs.js
// 4 LLM model configurations

export const MODEL_CONFIGS = {
  qwen: {
    id: "qwen", name: "Qwen Plus Character", emoji: "🐉",
    desc: { zh: "新用户免费额度 · 角色扮演专属", en: "Free credits · Roleplay specialist", ko: "신규 무료 크레딧 · 롤플레이 전문" },
    color: "#6236ff", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus-character", keyPrefix: "sk-", keyHelp: "platform.qianwenai.com → Get API Key", format: "openai",
    maxOutputTokens: 4096,
    hasFreeCredits: true,
    gameplay: { zh: "￥1 ≈ 50小时", en: "$1 ≈ 208 hrs", ko: "₩1,000 ≈ 155시간" },
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek V4 Flash", emoji: "🐋",
    desc: { zh: "平衡价格与质量 · 最佳故事体验", en: "Balancing price and quality · Best story experience", ko: "가격과 품질의 균형 · 최고의 스토리 경험" },
    color: "#4d6bfe", url: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 8小时", en: "$1 ≈ 56 hrs", ko: "₩1,000 ≈ 41시간" },
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-5.6 Luna", emoji: "⚡",
    desc: { zh: "经济高效 · 适合全球用户", en: "Cost-efficient · Versatile for global users", ko: "가성비 우수 · 글로벌 사용자에게 적합" },
    color: "#10a37f", url: "https://api.openai.com/v1/chat/completions", model: "gpt-5.6-luna",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 4.7小时", en: "$1 ≈ 34 hrs", ko: "₩1,000 ≈ 25시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 3.5 Flash-Lite", emoji: "💎",
    desc: { zh: "低延迟 · 快速生成", en: "Low latency · Fast generation", ko: "초저지연 · 대량 작업에 최적화" },
    color: "#4285f4", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.5-flash-lite", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 3.9小时", en: "$1 ≈ 28 hrs", ko: "₩1,000 ≈ 21시간" },
  },
};