// src/tools/llmTool.js
// LLM Tool: 4 providers through one OpenAI-compatible client.
// Aliyun (provider id "qwen") adds a free-credit auto-router and a paid model picker.
import { MODEL_CONFIGS, ALIYUN_FREE_ROUTE, getAliyunModelParams } from "../config/modelConfigs";
import { LLMError, classifyError } from "./llmErrors";
import {
  getFreeCandidates, markModel, recordServedModel, resolvePaidModel,
  shouldProbeForRecovery, clearExhausted,
} from "./aliyunRoute";

// A thinking round legitimately takes 2-4x longer: ~15% of them exceeded 90s in
// live testing, and the player saw a timeout instead of a story.
const REQUEST_TIMEOUT_MS = 90000;
const REQUEST_TIMEOUT_THINKING_MS = 180000;
// Every attempt after the first in the same round gets a short leash: a healthy
// model answers in 10-20s, so 30s separates "this model is slow" from "this
// connection is bad" and keeps the whole walk inside the round budget.
const RETRY_TIMEOUT_MS = 30000;
const ROUND_BUDGET_MS = 120000;
const ROUND_BUDGET_THINKING_MS = 240000;
const MAX_MODELS_PER_ROUND = 4;
const MAX_BAD_RETRIES = 2;
// Same-model retry delays per error kind; kinds not listed fail immediately.
const RETRY_DELAYS_MS = {
  rate_limit: [2000, 5000],
  server_busy: [1000, 1000],
  network: [1000, 1000],
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Thinking is OFF by default everywhere. Providers differ in their own default,
// so each branch states the OFF position explicitly instead of relying on
// omission. When the player turns Deep Thinking on, one effort level per model
// is chosen for them — see docs/api_references/ for the per-provider values.
function buildRequestBody(modelId, model, messages, reasoningEnabled) {
  const cfg = MODEL_CONFIGS[modelId];
  const body = {
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.92,
  };

  let outputCap = reasoningEnabled
    ? (cfg.maxOutputTokensReasoning || cfg.maxOutputTokens || 8192)
    : (cfg.maxOutputTokens || 8192);
  let capField = cfg.capField || "max_tokens";

  if (modelId === "qwen") {
    // Aliyun: everything is per-model — thinking toggle, effort, cap field.
    const p = getAliyunModelParams(model);
    outputCap = reasoningEnabled ? p.maxOutputTokensOn : p.maxOutputTokensOff;
    capField = p.capField;
    // "never" (qwenOpen): Deep Thinking corrupts their JSON, so it is pinned off
    // and the player's toggle is ignored. "always" (glm-5.3) thinks regardless,
    // but the player's toggle still decides how hard — we do not raise its effort
    // or its cap unless they asked for it.
    const thinkingOn = p.thinking === "never" ? false : reasoningEnabled;
    if (p.thinking !== "always") {
      // Booleans, per the API reference. Qwen 3.x and the DeepSeek/GLM models
      // on Aliyun all default to thinking ON, so OFF must be explicit.
      body.enable_thinking = thinkingOn;
      // Never preserve: the game does not send reasoning_content back, and
      // preserved thinking would be billed as input on the next round.
      if (p.preserveThinking) body.preserve_thinking = false;
    }
    // "always" models reject enable_thinking:false — send no toggle at all.
    if (thinkingOn && p.reasoningEffort) body.reasoning_effort = p.reasoningEffort;
    outputCap = thinkingOn ? p.maxOutputTokensOn : p.maxOutputTokensOff;
  } else if (modelId === "deepseek") {
    // DeepSeek Official: thinking is the upstream default — must disable.
    body.thinking = reasoningEnabled ? { type: "enabled" } : { type: "disabled" };
    if (reasoningEnabled) body.reasoning_effort = "high";   // none | low | high | max
  } else if (modelId === "gpt4omini") {
    // OpenAI documents "none" as an effort value, so OFF is explicit here too.
    body.reasoning_effort = reasoningEnabled ? "high" : "none";
  } else if (modelId === "gemini") {
    // Gemini 3+ has no documented "off": thinkingLevel bottoms out at MINIMAL,
    // which is what flash-lite does by default. Only speak up to raise it.
    if (reasoningEnabled) body.reasoning_effort = "high";
  }

  body[capField] = outputCap;
  return body;
}

async function callLLMOnce({ modelId, model, messages, apiKey, reasoningEnabled, signal }) {
  const cfg = MODEL_CONFIGS[modelId];
  let resp;
  try {
    resp = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(buildRequestBody(modelId, model, messages, reasoningEnabled)),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new LLMError("network", { provider: modelId, model, message: e.message });
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const { kind, code, message } = classifyError(modelId, resp.status, errBody);
    throw new LLMError(kind, { provider: modelId, model, status: resp.status, code, message: message || `HTTP ${resp.status}` });
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  // Always use content only — never fall back to reasoning_content (chain-of-thought)
  const content = choice?.message?.content || "";
  if (!content) {
    console.warn("[callLLM] Empty content. finish_reason:", choice?.finish_reason, "raw:", JSON.stringify(data).slice(0, 300));
  }
  return { content, finishReason: choice?.finish_reason || null };
}

// Names why a 200 response is unusable, or null when it is fine. All three cases
// are non-answers that used to reach the player: an empty body became a
// placeholder story, a truncated one was rendered as raw JSON, and a degenerate
// one was quietly swapped for "The story continues...".
function describeUnusable({ content, finishReason }, validateContent) {
  if (!content) return "empty";
  // Truncated mid-JSON by the output cap: no parser repair can close a string
  // cut deep inside a nested object.
  if (finishReason === "length") return "truncated";
  if (validateContent && !validateContent(content)) return "degenerate";
  return null;
}

// One model, with timeout and per-kind retry. Throws `bad_response` when the
// model keeps answering with something unusable, so the caller can move on
// rather than render it.
async function callModelWithRetry(opts) {
  const timeoutMs = opts.timeoutMs || REQUEST_TIMEOUT_MS;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    let result;
    try {
      result = await callLLMOnce({ ...opts, signal: ctrl.signal });
    } catch (e) {
      clearTimeout(tid);
      const err = e?.name === "AbortError"
        ? new LLMError("timeout", { provider: opts.modelId, model: opts.model, message: "LLM API request timeout" })
        : e;
      const delay = RETRY_DELAYS_MS[err.kind]?.[attempt];
      if (delay == null) throw err;
      console.warn(`[callLLM] ${err.kind} on ${opts.model} (attempt ${attempt + 1}): ${err.message} — retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }
    clearTimeout(tid);
    const unusable = describeUnusable(result, opts.validateContent);
    if (!unusable) return result.content;
    if (attempt >= MAX_BAD_RETRIES) {
      console.error(`[callLLM] ${opts.model} returned ${unusable} output after all retries.`);
      throw new LLMError("bad_response", {
        provider: opts.modelId, model: opts.model, code: unusable,
        message: `Model returned ${unusable} output`,
      });
    }
    console.warn(`[callLLM] ${unusable} response from ${opts.model} on attempt ${attempt + 1}, retrying in 1s…`);
    await sleep(1000);
  }
}

// Kinds meaning "this model cannot serve this key right now": skip and remember.
const SKIP_KINDS = ["free_exhausted", "model_unavailable", "bad_request", "bad_response"];

// The route is empty, which normally means the free tier is spent. A top-up
// makes every model answer again, and nothing in the API tells us that happened
// — so probe once an hour rather than stranding the player forever.
async function tryRecoveryProbe(base, timeoutMs, onModelSwitch) {
  if (!shouldProbeForRecovery(base.apiKey)) return null;
  const model = ALIYUN_FREE_ROUTE[0];
  try {
    const content = await callModelWithRetry({ ...base, model, timeoutMs });
    clearExhausted(base.apiKey);
    const previous = recordServedModel(base.apiKey, model);
    if (previous && previous !== model) onModelSwitch?.({ from: previous, to: model });
    console.warn(`[aliyun] recovery probe on ${model} succeeded — clearing exhausted marks`);
    return content;
  } catch (e) {
    console.warn(`[aliyun] recovery probe on ${model} failed: ${e.kind}`);
    return null;
  }
}

// Walks the free-credit route. Bounded by MAX_MODELS_PER_ROUND and a wall-clock
// budget so a key with many spent models cannot leave the player on a silent
// spinner for minutes.
async function callAliyunFreeRoute(base, aliyun) {
  const onModelSwitch = aliyun?.onModelSwitch;
  const onRouteStep = aliyun?.onRouteStep;
  const firstTimeout = base.reasoningEnabled ? REQUEST_TIMEOUT_THINKING_MS : REQUEST_TIMEOUT_MS;
  const budget = base.reasoningEnabled ? ROUND_BUDGET_THINKING_MS : ROUND_BUDGET_MS;
  const startedAt = Date.now();

  let rateLimited = null;
  let lastSkip = null;
  let attempts = 0;
  let consecutiveTimeouts = 0;

  const candidates = getFreeCandidates(base.apiKey);
  if (!candidates.length) {
    const recovered = await tryRecoveryProbe(base, firstTimeout, onModelSwitch);
    if (recovered !== null) return recovered;
  }

  for (const model of candidates) {
    if (attempts >= MAX_MODELS_PER_ROUND) break;
    if (attempts > 0 && Date.now() - startedAt >= budget) break;
    if (attempts > 0) onRouteStep?.({ model, index: attempts });
    // Only the first model gets the full limit; see RETRY_TIMEOUT_MS.
    const timeoutMs = attempts === 0 ? firstTimeout : RETRY_TIMEOUT_MS;
    attempts++;
    try {
      const content = await callModelWithRetry({ ...base, model, timeoutMs });
      const previous = recordServedModel(base.apiKey, model);
      if (previous && previous !== model) onModelSwitch?.({ from: previous, to: model });
      return content;
    } catch (e) {
      if (e.kind === "timeout") {
        consecutiveTimeouts++;
        // A second timeout, at a much shorter limit, is evidence about the
        // player's connection rather than the models. Stop and say so, and do
        // not blame this model by marking it.
        if (consecutiveTimeouts >= 2) throw e;
        markModel(base.apiKey, model, "timeout");
        lastSkip = { model, kind: e.kind, code: e.code, message: e.message };
        console.warn(`[aliyun] ${model} timed out, trying next model on a short leash`);
        continue;
      }
      consecutiveTimeouts = 0;
      if (SKIP_KINDS.includes(e.kind)) {
        markModel(base.apiKey, model, e.kind);
        lastSkip = { model, kind: e.kind, code: e.code, message: e.message };
        if (e.kind === "bad_request") console.error(`[aliyun] ${model} rejected the request — check its family in getAliyunModelParams: ${e.code} ${e.message}`);
        else console.warn(`[aliyun] ${model}: ${e.kind}, trying next model`);
        continue;
      }
      if (e.kind === "rate_limit") {
        rateLimited = e;
        console.warn(`[aliyun] ${model} still rate-limited, trying next model for this round`);
        continue;
      }
      throw e;
    }
  }
  if (rateLimited) throw rateLimited;
  // Carry why the last model was skipped: a bad_request swallowed by the walk
  // would otherwise be invisible behind a generic "all exhausted".
  const err = new LLMError("free_all_exhausted", { provider: "qwen", message: "All free-credit models are exhausted or unavailable" });
  err.cause = lastSkip;
  throw err;
}

/**
 * Call LLM API
 * @param {string} userMsg - User message
 * @param {Array} history - Message history [{role, content}]
 * @param {string} systemPrompt - System prompt
 * @param {string} apiKey - API Key
 * @param {string} modelId - Provider id (deepseek/gemini/gpt4omini/qwen)
 * @param {Array} prebuiltMessages - Optional pre-constructed messages array
 * @param {boolean} reasoningEnabled - Deep Thinking on/off
 * @param {{mode:'free'|'paid', paidModel?:string, onModelSwitch?:Function, onRouteStep?:Function}|null} aliyun - Aliyun options; null = paid on the default model
 * @param {((content:string)=>boolean)|null} validateContent - caller's usability check; a false
 *        verdict is treated like an empty answer (retried, then `bad_response`). Keeps the
 *        game's JSON schema out of this module.
 * @returns {Promise<string>} LLM response
 * @throws {LLMError} with a `kind` the UI maps to t.errors[kind]
 */
export async function callLLM(userMsg, history, systemPrompt, apiKey, modelId = "deepseek", prebuiltMessages = null, reasoningEnabled = false, aliyun = null, validateContent = null) {
  if (!apiKey?.trim()) throw new LLMError("auth", { provider: modelId, message: "Please set your API Key" });

  const cfg = MODEL_CONFIGS[modelId];
  if (!cfg) throw new Error(`Unknown model: ${modelId}`);

  const messages = prebuiltMessages || [
    { role: "system", content: systemPrompt },
    ...history.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMsg },
  ];
  const base = { modelId, messages, apiKey, reasoningEnabled, validateContent };
  // Thinking rounds legitimately take 2-4x longer; a flat 90s made them fail.
  const timeoutMs = reasoningEnabled ? REQUEST_TIMEOUT_THINKING_MS : REQUEST_TIMEOUT_MS;

  if (modelId !== "qwen") return callModelWithRetry({ ...base, model: cfg.model, timeoutMs });

  if (apiKey.trim().startsWith("sk-sp-")) {
    throw new LLMError("token_plan_key", { provider: modelId, message: "Token Plan keys need an endpoint that blocks browser requests" });
  }
  if (aliyun?.mode === "free") return callAliyunFreeRoute(base, aliyun);
  return callModelWithRetry({ ...base, model: resolvePaidModel(aliyun?.paidModel), timeoutMs });
}
