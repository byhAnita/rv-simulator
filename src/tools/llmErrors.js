// src/tools/llmErrors.js
// Classifies provider HTTP errors into a small set of kinds. The kind drives
// three things: same-model retry (llmTool.js), Aliyun free-route decisions,
// and the player-facing notice (t.errors[kind]).
// Source of truth: docs/error_code/{aliyun,deepseek,openai,gemini}_error_codes.md

export class LLMError extends Error {
  constructor(kind, { provider = null, model = null, status = null, code = "", message = "" } = {}) {
    super(message || kind);
    this.name = "LLMError";
    this.kind = kind;
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.code = code;
  }
}

// Accepts OpenAI-style {error:{code,message}}, DashScope-native {code,message},
// and Gemini's {error:{code:int,status,details[].reason}}, optionally array-wrapped.
export function parseErrorBody(body) {
  const root = Array.isArray(body) ? body[0] : body;
  const err = (root && typeof root.error === "object" && root.error) || root || {};
  const reason = Array.isArray(err.details) ? (err.details.find(d => d?.reason)?.reason || "") : "";
  return {
    code: typeof err.code === "string" ? err.code : "",
    status: typeof err.status === "string" ? err.status : "",
    reason,
    message: typeof err.message === "string" ? err.message : "",
  };
}

const has = (text, ...needles) => needles.some(n => text.includes(n));

function aliyunKind(http, text) {
  // Matched on content before status: Throttling.AllocationQuota is a 429 that
  // means either "free quota gone" or plain TPM throttling, and Arrearage is a 400.
  if (has(text, "freetieronly", "free tier of the model has been exhausted", "free allocated quota exceeded")) return "free_exhausted";
  if (has(text, "arrearage", "good standing", "bill is overdue")) return "balance";
  if (has(text, "datainspectionfailed", "data_inspection_failed", "inappropriate content")) return "content_blocked";
  if (http === 401 || has(text, "invalid_api_key", "invalidapikey", "accessdenied.unpurchased")) return "auth";
  if (http === 429) return "rate_limit";
  if (http === 403 || http === 404) return "model_unavailable";
  if (http >= 500) return "server_busy";
  if (http === 400 || http === 422) return "bad_request";
  return "unknown";
}

function deepseekKind(http) {
  if (http === 401) return "auth";
  if (http === 402) return "balance";
  if (http === 429) return "rate_limit";
  if (http === 404) return "model_unavailable";
  if (http >= 500) return "server_busy";
  if (http === 400 || http === 422) return "bad_request";
  return "unknown";
}

function openaiKind(http, text) {
  if (http === 401) return "auth";
  if (http === 403) return has(text, "country", "region", "territory") ? "region" : "auth";
  if (http === 429) {
    return has(text, "credit_balance_exhausted", "spend_limit", "usage_limit", "insufficient_quota") ? "balance" : "rate_limit";
  }
  if (http === 404) return "model_unavailable";
  if (http >= 500) return "server_busy";
  if (http === 400) return "bad_request";
  return "unknown";
}

function geminiKind(http, text) {
  if (http === 400) {
    if (has(text, "api_key_invalid", "api key not valid")) return "auth";
    if (has(text, "failed_precondition")) return "region";
    return "bad_request";
  }
  if (http === 401 || http === 403) return "auth";
  if (http === 404) return "model_unavailable";
  if (http === 429) return "rate_limit";
  if (http === 504) return "timeout";
  if (http >= 500) return "server_busy";
  return "unknown";
}

const RULES = { qwen: aliyunKind, deepseek: deepseekKind, gpt4omini: openaiKind, gemini: geminiKind };

export function classifyError(provider, httpStatus, body) {
  const { code, status, reason, message } = parseErrorBody(body);
  const text = `${code} ${status} ${reason} ${message}`.toLowerCase();
  const rule = RULES[provider] || deepseekKind;
  return { kind: rule(httpStatus, text), code: code || status || reason, message };
}
