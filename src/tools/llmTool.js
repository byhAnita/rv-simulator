// src/tools/llmTool.js
// LLM Tool: 4 model API routing
// VERSION: v4-gemini-3.5-flash-lite-20260806
console.log("🔥 llmTool.js LOADED — version v4-gemini-3.5-flash-lite");
import { MODEL_CONFIGS } from "../config/modelConfigs";

/**
 * Call LLM API
 * @param {string} userMsg - User message
 * @param {Array} history - Message history [{role, content}]
 * @param {string} systemPrompt - System prompt
 * @param {string} apiKey - API Key
 * @param {string} modelId - Model ID (deepseek/gemini/gpt4omini/qwen)
 * @param {AbortSignal} signal - Abort signal for fetch
 * @param {Array} prebuiltMessages - Optional pre-constructed messages array
 * @returns {Promise<string>} LLM response
 */

async function callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, signal, prebuiltMessages = null, reasoningEnabled = false, qwenSubModel = null) {
  const cfg = MODEL_CONFIGS[modelId];

  const messages = prebuiltMessages || [
    { role: "system", content: systemPrompt },
    ...history.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMsg },
  ];

  const resolvedModel = (modelId === "qwen" && qwenSubModel) ? qwenSubModel : cfg.model;
  console.log("🔥🔥🔥 callLLM v4 entered — prebuiltMessages:", !!prebuiltMessages, "model:", modelId, "resolvedModel:", resolvedModel);
  console.log("[DEBUG] Messages count:", messages.length);

  const body = {
    model: resolvedModel,
    messages,
    response_format: { type: "json_object" },
    max_tokens: cfg.maxOutputTokens || 8192,  // ← Prioritize model's own limit
    temperature: 0.92,
  };

  
  if (modelId === "qwen") {
    // Qwen 3.8/3.7 Max/Plus default thinking ON — disable unless user enabled reasoning
    body.enable_thinking = "false";
    body.preserve_thinking = "false";
  }

  // Reasoning — applied when user has enabled it in Settings
  if (reasoningEnabled) {
    if (modelId === "deepseek") {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = "high";
      body.max_tokens = 65536;
    }
    if (modelId === "gpt4omini") {
      body.reasoning_effort = "high";
    }
    if (modelId === "gemini") {
      body.reasoning_effort = "high";
      body.max_tokens = 65535;
    }
    if (modelId === "qwen") {
      body.enable_thinking = "true";
      // qwen3.8-max uses reasoning_effort low/medium/xhigh; others use low/high/max
      body.reasoning_effort = resolvedModel === "qwen3.8-max" ? "medium" : "high";
    }
  }


  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
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

export async function callLLM(userMsg, history, systemPrompt, apiKey, modelId = "deepseek", prebuiltMessages = null, reasoningEnabled = false, qwenSubModel = null) {
  if (!apiKey?.trim()) throw new Error("Please set your API Key");

  const cfg = MODEL_CONFIGS[modelId];
  if (!cfg) throw new Error(`Unknown model: ${modelId}`);

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90000);
    try {
      const content = await callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, ctrl.signal, prebuiltMessages, reasoningEnabled, qwenSubModel);
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