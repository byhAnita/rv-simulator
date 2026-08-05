// src/config/modelConfigs.js
// 4种 LLM 模型配置

export const MODEL_CONFIGS = {
  deepseek: {
    id: "deepseek", name: "DeepSeek V4 Flash", emoji: "🐋", desc: "", color: "#4d6bfe",
    url: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 4小时", en: "$1 ≈ 28 hrs", ko: "₩1,000 ≈ 21시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 2.5 Flash-Lite", emoji: "💎", desc: "Lightweight reasoning model", color: "#4285f4",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash-lite", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 3小时", en: "$1 ≈ 21 hrs", ko: "₩1,000 ≈ 16시간" },
  },
  claude: {
    id: "claude", name: "Claude Haiku 4.5", emoji: "🎭", desc: "", color: "#d97757",
    url: "https://api.anthropic.com/v1/", model: "claude-haiku-4-5-20251001",
    keyPrefix: "sk-ant-", keyHelp: "console.anthropic.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 2.4小时", en: "$1 ≈ 17 hrs", ko: "₩1,000 ≈ 13시간" },
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-5.6 Luna", emoji: "⚡", desc: "", color: "#10a37f",
    url: "https://api.openai.com/v1/chat/completions", model: "gpt-5.6-luna",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 2.4小时", en: "$1 ≈ 17 hrs", ko: "₩1,000 ≈ 13시간" },
  },
};