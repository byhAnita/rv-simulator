// src/tools/llmTool.js
// LLM Tool: 4种模型 API 路由

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
async function callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, signal) {
  const cfg = MODEL_CONFIGS[modelId];

  let resp;
  if (cfg.format === "openai") {
    resp = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: userMsg },
        ],
        max_tokens: 8192,
        temperature: 0.92,
      }),
      signal,
    });
  } else if (cfg.format === "gemini") {
    resp = await fetch(`${cfg.url}?key=${apiKey.trim()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          ...history.filter(m => !m.hidden).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          { role: "user", parts: [{ text: userMsg }] },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 200000, temperature: 0.92 },
      }),
      signal,
    });
  } else if (cfg.format === "claude") {
    resp = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        system: systemPrompt,
        messages: [
          ...history.filter(m => !m.hidden).map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          { role: "user", content: userMsg },
        ],
        max_tokens: 200000,
        temperature: 0.9,
      }),
      signal,
    });
  }

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.error?.code || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  let content = "";
  if (cfg.format === "gemini") content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  else if (cfg.format === "claude") content = data.content?.[0]?.text || "";
  else {
    const choice = data.choices?.[0];
    // DeepSeek reasoning models may put output in reasoning_content when content is null
    content = choice?.message?.content || choice?.message?.reasoning_content || "";
    if (!content) {
      console.warn("[callLLM] Empty content. finish_reason:", choice?.finish_reason, "raw:", JSON.stringify(data).slice(0, 300));
    }
  }
  return content;
}

export async function callLLM(userMsg, history, systemPrompt, apiKey, modelId = "deepseek") {
  if (!apiKey?.trim()) throw new Error("请设置 API Key");

  const cfg = MODEL_CONFIGS[modelId];
  if (!cfg) throw new Error(`未知模型: ${modelId}`);

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90000);
    try {
      const content = await callLLMOnce(userMsg, history, systemPrompt, apiKey, modelId, ctrl.signal);
      clearTimeout(tid);
      if (content) return content;
      // Empty response — retry unless last attempt
      if (attempt < MAX_RETRIES) {
        console.warn(`[callLLM] Empty response on attempt ${attempt + 1}, retrying in 1s…`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        console.error("[callLLM] Empty response after all retries.");
        return "";
      }
    } catch (e) {
      clearTimeout(tid);
      if (e.name === "AbortError") throw new Error("请求超时");
      // Retry on transient network errors, throw on last attempt
      if (attempt < MAX_RETRIES) {
        console.warn(`[callLLM] Error on attempt ${attempt + 1}: ${e.message}, retrying in 1s…`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
}