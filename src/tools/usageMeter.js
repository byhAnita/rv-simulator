// src/tools/usageMeter.js
//
// Session-scoped token accounting. Every provider returns a `usage` block and
// until v1.3.9 nothing in src/ read it, so a player running their own key had no
// idea what a round cost - and the project's central claim about prompt caching
// was something the README asserted rather than something the app could show.
//
// A module-level sink, not a callback threaded through callLLM. Two reasons.
// callModelWithRetry and callAliyunFreeRoute both return a plain string, and
// widening that to carry usage would touch every branch of the route walk for a
// number none of them care about. And a sink records what the walk actually
// spent: same-model retries and the attempts on models that failed before one
// answered are all billed, so the honest total includes them. A per-round return
// value would report only the call that happened to succeed.
//
// The data never leaves the browser and is not persisted: a session is a session.

import { estimateCallCostUsd } from "../config/modelConfigs";

const LATENCY_SAMPLE_MAX = 200;   // p50 needs a sample, not a transcript

function emptyState() {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    // Prompt tokens from calls whose provider actually reported a cached_tokens
    // field. Twelve Aliyun route models report none, and folding their prompt
    // tokens into the denominator would drag the displayed hit rate toward zero
    // for a cache that may well be working. They are excluded and counted here
    // instead, so the panel can say how much of the session it could measure.
    measuredPromptTokens: 0,
    unmeasuredCalls: 0,
    latencies: [],
    costUsd: 0,
    // null once any served model has no published price: a partial total would
    // read as a full one.
    costComplete: true,
    lastModel: null,
  };
}

let state = emptyState();

export function resetUsage() {
  state = emptyState();
}

// Called once per HTTP round trip that returned 200, including retries and the
// attempts that were later discarded as unusable - all of them bill.
export function recordUsage({ model, usage, latencyMs }) {
  state.calls += 1;
  state.lastModel = model || state.lastModel;

  if (typeof latencyMs === "number" && latencyMs >= 0) {
    state.latencies.push(latencyMs);
    if (state.latencies.length > LATENCY_SAMPLE_MAX) state.latencies.shift();
  }

  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  // Absent field and a reported zero are different facts. `0` means the provider
  // measured no cache hit; undefined means it does not tell us, and averaging
  // those together would be inventing data.
  const rawCached = usage?.prompt_tokens_details?.cached_tokens;
  const reportsCache = typeof rawCached === "number" && Number.isFinite(rawCached);
  const cached = reportsCache ? rawCached : 0;

  state.promptTokens += prompt;
  state.completionTokens += completion;
  if (reportsCache) {
    state.cachedTokens += cached;
    state.measuredPromptTokens += prompt;
  } else {
    state.unmeasuredCalls += 1;
  }

  const cost = estimateCallCostUsd(model, {
    cachedTokens: cached, promptTokens: prompt, completionTokens: completion,
  });
  if (cost === null) state.costComplete = false;
  else state.costUsd += cost;
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// A plain snapshot for the panel to render. Every field that cannot be known is
// null rather than 0, because "0%" and "we were not told" look identical on
// screen and mean opposite things.
export function getUsageSummary() {
  const sorted = [...state.latencies].sort((a, b) => a - b);
  return {
    calls: state.calls,
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    totalTokens: state.promptTokens + state.completionTokens,
    cachedTokens: state.cachedTokens,
    cacheHitRate: state.measuredPromptTokens > 0
      ? state.cachedTokens / state.measuredPromptTokens
      : null,
    cacheMeasurable: state.measuredPromptTokens > 0,
    unmeasuredCalls: state.unmeasuredCalls,
    p50LatencyMs: median(sorted),
    costUsd: state.calls > 0 ? state.costUsd : null,
    costComplete: state.costComplete,
    lastModel: state.lastModel,
  };
}
