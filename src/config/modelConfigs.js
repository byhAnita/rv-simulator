// src/config/modelConfigs.js
// 4种 LLM 模型配置

export const MODEL_CONFIGS = {
  deepseek: {
    id: "deepseek", name: "DeepSeek V3", emoji: "🐋", desc: "", color: "#4d6bfe",
    url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat",
    keyPrefix: "sk-", keyHelp: "platform.deepseek.com → API Keys", format: "openai",
  },
  gemini: {
    id: "gemini", name: "Gemini 2.5 Flash", emoji: "💎", desc: "", color: "#4285f4",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    model: "gemini-2.0-flash", keyPrefix: "AIza", keyHelp: "aistudio.google.com → API Keys", format: "gemini",
  },
  claude: {
    id: "claude", name: "Claude 3.5 Haiku", emoji: "🎭", desc: "", color: "#d97757",
    url: "https://api.anthropic.com/v1/messages", model: "claude-3-5-haiku-20241022",
    keyPrefix: "sk-ant-", keyHelp: "console.anthropic.com → API Keys", format: "claude",
  },
  gpt4omini: {
    id: "gpt4omini", name: "GPT-4o Mini", emoji: "⚡", desc: "", color: "#10a37f",
    url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini",
    keyPrefix: "sk-", keyHelp: "platform.openai.com → API Keys", format: "openai",
  },
};