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
export async function callLLM(userMsg, history, systemPrompt, apiKey, modelId = "deepseek") {
  if (!apiKey?.trim()) throw new Error("请设置 API Key");

  const cfg = MODEL_CONFIGS[modelId];
  if (!cfg) throw new Error(`未知模型: ${modelId}`);

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 90000);

  try {
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
          max_tokens: 2000,
          temperature: 0.92,
        }),
        signal: ctrl.signal,
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
          generationConfig: { maxOutputTokens: 2000, temperature: 0.92 },
        }),
        signal: ctrl.signal,
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
          max_tokens: 2000,
          temperature: 0.9,
        }),
        signal: ctrl.signal,
      });
    }

    clearTimeout(tid);

    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e?.error?.message || e?.error?.code || `HTTP ${resp.status}`);
    }

    const data = await resp.json();

    if (cfg.format === "gemini") return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (cfg.format === "claude") return data.content?.[0]?.text || "";
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw new Error("请求超时");
    throw e;
  }
}