// src/tools/llmTool.js
// LLM Tool: 4种模型 API 路由
// VERSION: v2-cachefix-20240802
console.log("🔥 llmTool.js LOADED — version v2-cachefix");
import { MODEL_CONFIGS } from "../config/modelConfigs";

/**
 * 调用 LLM API
 * @param {string} userMsg - 用户消息
 * @param {Array} history - 历史消息 [{role, content}]
 * @param {string} systemPrompt - 系统提示
 * @param {string} apiKey - API Key
 * @param {string} modelId - 模型 ID (deepseek/gemini/claude/gpt4omini)
 * @returns {Promise<string>} LLM 回复
 */

async function callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, signal, prebuiltMessages = null) {
  const cfg = MODEL_CONFIGS[modelId];

  const messages = prebuiltMessages || [
    { role: "system", content: systemPrompt },
    ...history.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMsg },
  ];

  console.log("🔥🔥🔥 callLLM v2 entered — prebuiltMessages:", !!prebuiltMessages, "model:", modelId);
  console.log("[DEBUG] Messages count:", messages.length);

  const body = {
    model: cfg.model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: 8192,
    temperature: 0.92,
  };
  // DeepSeek: extended thinking + high reasoning
  if (modelId === "deepseek") {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = "high";
    body.max_tokens = 200000;
  }
  // GPT: reasoning_effort supported on o-series / reasoning-capable models
  if (modelId === "gpt4omini") {
    body.reasoning_effort = "high";
  }
  // Gemini 2.5+: reasoning_effort maps to ~24k token thinking budget
  if (modelId === "gemini") {
    body.reasoning_effort = "high";
    body.max_tokens = 65535; // Flash-Lite max output limit
  }

  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.error?.code || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  // DeepSeek reasoning models may put output in reasoning_content when content is null
  const content = choice?.message?.content || choice?.message?.reasoning_content || "";
  if (!content) {
    console.warn("[callLLM] Empty content. finish_reason:", choice?.finish_reason, "raw:", JSON.stringify(data).slice(0, 300));
  }
  return content;
}

export async function callLLM(userMsg, history, systemPrompt, apiKey, modelId = "deepseek", prebuiltMessages = null) {
  if (!apiKey?.trim()) throw new Error("请设置 API Key");

  const cfg = MODEL_CONFIGS[modelId];
  if (!cfg) throw new Error(`未知模型: ${modelId}`);

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90000);
    try {
      const content = await callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, ctrl.signal, prebuiltMessages);
      clearTimeout(tid);
      if (content) return content;
      if (attempt < MAX_RETRIES) {
        console.warn(`[callLLM] Empty response on attempt ${attempt + 1}, retrying in 1s…`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        console.error("[callLLM] Empty response after all retries.");
        return "";
      }
    } catch (e) {
      clearTimeout(tid);
      if (e.name === "AbortError") throw new Error("Error: LLM API request timeout");
      if (attempt < MAX_RETRIES) {
        console.warn(`[callLLM] Error on attempt ${attempt + 1}: ${e.message}, retrying in 1s…`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
}