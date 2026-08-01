// src/config/modelConfigs.js
// 4种 LLM 模型配置

export const MODEL_CONFIGS = {
  deepseek: {
    id: "deepseek", name: "DeepSeek V4 Flash", emoji: "🐋", desc: "", color: "#4d6bfe",
    url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-v4-flash",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 4小时", en: "$1 ≈ 25 hrs", ko: "₩1,000 ≈ 18시간" },
  },
  gemini: {
    id: "gemini", name: "Gemini 3.6 Flash", emoji: "💎", desc: "", color: "#4285f4",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    model: "gemini-3.6-flash", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "gemini",
    gameplay: { zh: "￥1 ≈ 20分钟", en: "$1 ≈ 2.2 hrs", ko: "₩1,000 ≈ 1.5시간" },
  },
  claude: {
    id: "claude", name: "Claude 3.5 Haiku", emoji: "🎭", desc: "", color: "#d97757",
    url: "https://api.anthropic.com/v1/messages", model: "claude-3-5-haiku-20241022",
    keyPrefix: "sk-ant-", keyHelp: "console.anthropic.com → API Keys", format: "claude",
    gameplay: { zh: "￥1 ≈ 30分钟", en: "$1 ≈ 3.3 hrs", ko: "₩1,000 ≈ 2.3시간" },
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-5.6 Luna", emoji: "⚡", desc: "", color: "#10a37f",
    url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
    gameplay: { zh: "￥1 ≈ 2.5小时", en: "$1 ≈ 16 hrs", ko: "₩1,000 ≈ 11시간" },
  },
};