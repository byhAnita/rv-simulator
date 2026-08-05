// src/config/modelConfigs.js
// 4种 LLM 模型配置

export const MODEL_CONFIGS = {
  deepseek: {
    id: "deepseek", name: "DeepSeek V4 Flash", emoji: "🐋", desc: "", color: "#4d6bfe",
    url: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 9小时", en: "$1 ≈ 64 hrs", ko: "₩1,000 ≈ 47시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 3.6 Flash", emoji: "💎", desc: "", color: "#4285f4",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.6-flash", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 27分钟", en: "$1 ≈ 3.2 hrs", ko: "₩1,000 ≈ 2.4시간" },
  },
  claude: {
    id: "claude", name: "Claude Haiku 4.5", emoji: "🎭", desc: "", color: "#d97757",
    url: "https://api.anthropic.com/v1/", model: "claude-haiku-4-5-20251001",
    keyPrefix: "sk-ant-", keyHelp: "console.anthropic.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 40分钟", en: "$1 ≈ 4.7 hrs", ko: "₩1,000 ≈ 3.5시간" },
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-5.6 Luna", emoji: "⚡", desc: "", color: "#10a37f",
    url: "https://api.openai.com/v1/chat/completions", model: "gpt-5.6-luna",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 3小时", en: "$1 ≈ 21 hrs", ko: "₩1,000 ≈ 15시간" },
  },
};