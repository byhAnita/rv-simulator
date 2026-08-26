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
    temperature: 0.92,
  };

  // Output cap. Qwen's API names this field max_completion_tokens; the rest use
  // max_tokens. Resolved after the reasoning branches below, since turning
  // reasoning on needs extra headroom for thinking tokens.
  let outputCap = cfg.maxOutputTokens || 8192;

  // Thinking/reasoning settings per model.
  // Each branch sets the OFF default first, then overrides if reasoningEnabled.
  if (modelId === "deepseek") {
    // V4 Flash default is AUTO — must explicitly disable
    body.thinking = reasoningEnabled
      ? { type: "enabled" }
      : { type: "disabled" };
    if (reasoningEnabled) {
      body.reasoning_effort = "high";
      outputCap = 65536;
    }
  } else if (modelId === "qwen") {
    // Qwen 3.x default is ON — must explicitly disable
    body.enable_thinking  = reasoningEnabled ? "true" : "false";
    body.preserve_thinking = reasoningEnabled ? "true" : "false";
    if (reasoningEnabled) {
      // qwen3.8-max uses "medium" for reasoning_effort; other sub-models use "high"
      body.reasoning_effort = resolvedModel === "qwen3.8-max" ? "medium" : "high";
    }
  } else if (modelId === "gemini") {
    // Gemini reasoning is off by default; only add the field when enabling
    if (reasoningEnabled) {
      body.reasoning_effort = "high";
      outputCap = 65535;
    }
  } else if (modelId === "gpt4omini") {
    // GPT-4o-mini reasoning is off by default; only add the field when enabling
    if (reasoningEnabled) {
      body.reasoning_effort = "high";
    }
  }

  if (modelId === "qwen") body.max_completion_tokens = outputCap;
  else body.max_tokens = outputCap;


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
  // Always use content only — never fall back to reasoning_content (chain-of-thought)
  const content = choice?.message?.content || "";
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