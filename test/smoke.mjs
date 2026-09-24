// test/smoke.mjs
//
// Smoke test for the LLM client: per-provider request bodies, the error
// classifier, and the Aliyun free-credit router.
//
// NOT part of the app bundle. Lives outside src/ so Vite never sees it, and
// reads its key from process.env (Node only) — never import.meta.env. The env
// var is deliberately unprefixed so Vite cannot inline it into dist/.
//
//   node test/smoke.mjs             # offline contract + leak checks only
//   node test/smoke.mjs --live      # also hit the real provider (spends credits)
//   node test/smoke.mjs --live-free # probe every Aliyun free-route model (tiny
//                                   # calls) + one real round through the router
//
// Layers:
//   A  offline  request-body contract, all 4 providers x reasoning on/off
//   B  live     one real round per reasoning mode against the provider
//   C  offline  secret-leak checks (bundle, source, env hygiene) + version strings
//   D  offline  probability engine recency window
//   E  offline  classifyError against fixtures from docs/error_code/*.md
//   F  offline  Aliyun free-credit router + retry policy with a mocked fetch
//   G  offline  old saves / legacy settings still load after the Aliyun change
//   H  live     Aliyun free-credit route: per-model params + one routed round
//   I  offline  address protocol, KKT channel lock, edited-story delivery
//   J  offline  golden system prompts + prompt determinism
//   K  offline  usage meter + cost estimate
//   L  offline  live-harness prose graders

import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { EXPECTED, bumpFile, readCurrentVersion } from "../scripts/bump-version.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test", ".out");
const LIVE = process.argv.includes("--live");
const LIVE_FREE = process.argv.includes("--live-free");

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`); }
  else { fail++; failures.push(name); console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
}
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

// ---------------------------------------------------------------- env
function loadEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;                        // skips comments and blanks
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnvLocal();
// API_KEY is the name used in .env.local; YURIAGENT_API_KEY is the older one.
const API_KEY = env.YURIAGENT_API_KEY || env.API_KEY || process.env.YURIAGENT_API_KEY || process.env.API_KEY || "";

// .env.local's MODEL_ID comment lists model strings, but MODEL_CONFIGS is keyed
// by provider id. Accept either spelling.
const MODEL_ALIASES = {
  "deepseek-v4-flash": "deepseek", "deepseek-flash": "deepseek", "deepseek": "deepseek",
  "gemini-3.5-flash-lite": "gemini", "gemini": "gemini",
  "gpt-6-luna": "gpt4omini", "gpt-5.6-luna": "gpt4omini", "gpt4omini": "gpt4omini",
  "qwen-3.8-max": "qwen", "qwen3.8-max": "qwen", "qwen": "qwen", "aliyun": "qwen",
};
const rawModel = (env.MODEL_ID || "deepseek-v4-flash").trim();
const MODEL_ID = MODEL_ALIASES[rawModel] || rawModel;

// ------------------------------------------------------- build test bundle
// src/ uses extensionless imports, which plain Node ESM will not resolve.
// esbuild (already a Vite dep) bundles the module graph into something Node
// can import, without touching the app build. One bundle for all three client
// modules so the router's module state is shared with callLLM.
async function buildBundle() {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, "llmTool.mjs");
  // JS API, not the .bin shim — spawning a .cmd shim fails with EINVAL on Windows.
  const esbuild = await import("esbuild");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/tools/llmTool.js";',
        'export * from "./src/tools/llmErrors.js";',
        'export * from "./src/tools/aliyunRoute.js";',
        // Same bundle instance as llmTool's, so a live round's recordUsage and
        // the assertion's getUsageSummary read one module-level state. Two
        // separate bundles would each get their own and the check would be
        // meaningless.
        'export * from "./src/tools/usageMeter.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
  });
  return outfile;
}

// In-memory localStorage so the router's persisted state works under Node.
function installMemoryStorage() {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true, writable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}

// Captures request bodies and answers every call with a canned success.
async function captureBodies(fn) {
  const cap = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
  try { await fn(); } finally { globalThis.fetch = orig; }
  return cap;
}

const MSGS = [
  { role: "system", content: "sys" },
  { role: "user", content: "[HISTORY]\n(no history yet)" },
  { role: "user", content: "[CURRENT STATE]\nPlayer choice: A" },
];

// ============================================================ LAYER A
async function layerA(mod, MODEL_CONFIGS, ALIYUN_PAID_MODELS, cfg) {
  const callLLM = mod.callLLM;
  section("LAYER A — request-body contract (offline, no network)");

  // --- correct field name and OFF cap per provider ---
  console.log("\n  reasoning OFF");
  for (const [id, expectCap, expectField] of [
    ["qwen", 8192, "max_completion_tokens"],
    ["deepseek", 8192, "max_tokens"],
    ["gpt4omini", 8192, "max_completion_tokens"],
    ["gemini", 8192, "max_tokens"],
  ]) {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-test", id, MSGS, false, null));
    const other = expectField === "max_tokens" ? "max_completion_tokens" : "max_tokens";
    eq(`${id}: ${expectField} = ${expectCap}`, body[expectField], expectCap);
    eq(`${id}: ${other} absent`, body[other], undefined);
    eq(`${id}: config maxOutputTokens defined`, typeof MODEL_CONFIGS[id].maxOutputTokens, "number");
  }
  {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-test", "qwen", MSGS, false, { mode: "paid", paidModel: "glm-5.2" }));
    eq("aliyun OFF: enable_thinking = false (boolean, per the reference)", body.enable_thinking, false);
    eq("aliyun OFF: reasoning_effort absent", body.reasoning_effort, undefined);
    const [ds] = await captureBodies(() => callLLM("", [], "", "sk-test", "deepseek", MSGS, false, null));
    eq("deepseek OFF: thinking disabled", ds.thinking?.type, "disabled");
    const [gpt] = await captureBodies(() => callLLM("", [], "", "sk-test", "gpt4omini", MSGS, false, null));
    eq("openai OFF: reasoning_effort = none", gpt.reasoning_effort, "none");
    const [gem] = await captureBodies(() => callLLM("", [], "", "sk-test", "gemini", MSGS, false, null));
    eq("gemini OFF: reasoning_effort omitted (MINIMAL is its floor)", gem.reasoning_effort, undefined);
  }

  // --- reasoning ON: caps must be raised, flags set ---
  console.log("\n  reasoning ON");
  const onCases = [
    ["qwen", null, { model: "qwen3.8-max", max_completion_tokens: 65535, enable_thinking: true, preserve_thinking: false, reasoning_effort: "medium" }],
    // Hybrid Plus/Flash models are not in the reference's reasoning_effort table.
    ["qwen", "qwen3.7-plus", { max_completion_tokens: 65535, enable_thinking: true, preserve_thinking: false, reasoning_effort: undefined }],
    ["qwen", "glm-5.2", { max_completion_tokens: 65535, enable_thinking: true, preserve_thinking: undefined, reasoning_effort: "high" }],
    ["qwen", "deepseek-v4-pro", { max_completion_tokens: 65535, enable_thinking: true, reasoning_effort: "high" }],
    ["deepseek", null, { model: "deepseek-flash", max_tokens: 65536, reasoning_effort: "high" }],
    ["gemini", null, { max_tokens: 65535, reasoning_effort: "high" }],
    // model pinned: a display-name bump that forgets the model string would
    // otherwise ship a retired model and only fail live, on the player's key.
    // "high" is deliberate — GPT-6 Luna also offers xhigh/max, see CLAUDE.md.
    ["gpt4omini", null, { model: "gpt-6-luna", max_completion_tokens: 32768, reasoning_effort: "high" }],
  ];
  for (const [id, paidModel, expected] of onCases) {
    const aliyun = paidModel ? { mode: "paid", paidModel } : null;
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-test", id, MSGS, true, aliyun));
    const label = paidModel ? `${id}/${paidModel}` : id;
    for (const [k, v] of Object.entries(expected)) eq(`${label}: ${k} = ${JSON.stringify(v)}`, body[k], v);
  }

  // --- deepseek thinking object shape (off vs on) ---
  console.log("\n  deepseek thinking object");
  for (const [enabled, want] of [[false, "disabled"], [true, "enabled"]]) {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-test", "deepseek", MSGS, enabled, null));
    eq(`reasoning=${enabled}: thinking.type = ${want}`, body.thinking?.type, want);
  }

  // --- aliyun paid model resolution ---
  console.log("\n  aliyun paid model resolution");
  for (const m of ALIYUN_PAID_MODELS) {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-ws-test", "qwen", MSGS, false, { mode: "paid", paidModel: m.id }));
    eq(`paidModel="${m.id}" -> body.model`, body.model, m.id);
  }
  for (const legacy of ["qwen3.7-max", undefined]) {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-ws-test", "qwen", MSGS, false, { mode: "paid", paidModel: legacy }));
    eq(`paidModel=${JSON.stringify(legacy)} -> falls back to qwen3.8-max`, body.model, "qwen3.8-max");
  }
  {
    const [body] = await captureBodies(() => callLLM("", [], "", "sk-ws-test", "qwen", MSGS, false, null));
    eq("aliyun=null -> paid default qwen3.8-max", body.model, MODEL_CONFIGS.qwen.model);
    check("aliyun never sends the ignored max_tokens field", body.max_tokens === undefined, `max_tokens=${body.max_tokens}`);
  }

  // --- per-model params (docs/api_references/aliyun_references.md) ---
  console.log("\n  aliyun per-model params");
  const FAMILY_EXPECT = {
    "qwen3.8-max": "qwen38", "qwen3.8-max-0902": "qwen38", "qwen3.8-flash": "qwen38",
    "qwen3.5-397b-a17b": "qwenOpen", "qwen3.5-122b-a10b": "qwenOpen",
    "qwen3.6-35b-a3b": "qwenOpen", "qwen3.6-27b": "qwenOpen", "qwen3.5-35b-a3b": "qwenOpen",
    "qwen3.7-plus": "qwenHybrid", "qwen3.7-plus-2026-05-26": "qwenHybrid", "qwen3.6-plus": "qwenHybrid",
    "qwen3.6-plus-2026-04-02": "qwenHybrid", "qwen3.5-plus": "qwenHybrid", "qwen3.5-plus-2026-04-20": "qwenHybrid",
    "qwen3.5-plus-2026-02-15": "qwenHybrid", "qwen3.7-flash": "qwenHybrid", "qwen3.7-flash-2026-07-15": "qwenHybrid",
    "qwen3.6-flash": "qwenHybrid", "qwen3.6-flash-2026-04-16": "qwenHybrid", "qwen3.5-flash": "qwenHybrid",
    "qwen3.5-flash-2026-02-23": "qwenHybrid",
    "glm-5.3": "glmAlways", "glm-5.2": "glm", "glm-5.1": "glm",
    "deepseek-v4-pro": "deepseek", "deepseek-v4-pro-0813": "deepseek", "deepseek-v4.1-flash": "deepseek",
    "deepseek-v4-flash": "deepseek", "deepseek-v4-flash-0731": "deepseek",
  };
  // reasoning_effort values the reference accepts per family; null = omit the field.
  const LEGAL_EFFORT = {
    qwen38: ["low", "medium", "xhigh"], qwenHybrid: [null], qwenOpen: [null],
    deepseek: ["high", "max"], glm: ["high", "max"], glmAlways: ["max"],
  };
  const allAliyunModels = [...new Set([...cfg.ALIYUN_FREE_ROUTE, ...ALIYUN_PAID_MODELS.map(m => m.id)])];
  for (const id of allAliyunModels) {
    const fam = cfg.getAliyunModelFamily(id);
    const p = cfg.getAliyunModelParams(id);
    eq(`family(${id})`, fam, FAMILY_EXPECT[id]);
    check(`${id}: reasoning_effort legal for its family`, LEGAL_EFFORT[fam].includes(p.reasoningEffort), String(p.reasoningEffort));
    check(`${id}: cap field is a documented one`, ["max_tokens", "max_completion_tokens"].includes(p.capField), p.capField);
    check(`${id}: OFF cap covers a round (~800 tok)`, p.maxOutputTokensOff >= 8192 && p.maxOutputTokensOn >= p.maxOutputTokensOff);
  }
  // glm-5.3 rejects enable_thinking:false, so its OFF cap must still fit
  // thinking + answer: live rounds spend 2,300-8,000 reasoning tokens.
  eq("glm-5.3 is marked always-thinking", cfg.getAliyunModelParams("glm-5.3").thinking, "always");
  check("glm-5.3 OFF cap leaves room for the thinking it cannot disable",
    cfg.getAliyunModelParams("glm-5.3").maxOutputTokensOff >= 32768);

  // Deep Thinking corrupts the open-weight builds' JSON, so it is pinned off for
  // the whole family and reasoningEnabled must not change any of their params.
  for (const id of ["qwen3.6-27b", "qwen3.5-35b-a3b", "qwen3.5-397b-a17b"]) {
    const p = cfg.getAliyunModelParams(id);
    eq(`${id} never thinks`, p.thinking, "never");
    eq(`${id} caps are identical on and off`, p.maxOutputTokensOff, p.maxOutputTokensOn);
  }

  // Models live testing proved unusable must stay out of the route.
  for (const id of ["qwen3.8-2.4t-a95b", "qwen3.5-27b"]) {
    check(`${id} is not in the free route (unusable in live play)`, !cfg.ALIYUN_FREE_ROUTE.includes(id));
  }
  eq("glm-5.3 sits last in the route (slowest by far)", cfg.ALIYUN_FREE_ROUTE.at(-1), "glm-5.3");

  // Models that free mode can reach but paid mode cannot select.
  console.log("\n  aliyun free-route bodies");
  for (const [target, reasoning, expected] of [
    // glm-5.3 rejects enable_thinking:false — the toggle must never be sent.
    ["glm-5.3", false, { enable_thinking: undefined, preserve_thinking: undefined, reasoning_effort: undefined, max_completion_tokens: 32768 }],
    // Open-weight builds are not on the max_completion_tokens list, and Deep
    // Thinking stays OFF for them even when the player turns it on.
    ["qwen3.6-27b", true, { enable_thinking: false, max_tokens: 8192, max_completion_tokens: undefined, reasoning_effort: undefined }],
    ["qwen3.6-27b", false, { enable_thinking: false, max_tokens: 8192, max_completion_tokens: undefined, reasoning_effort: undefined }],
  ]) {
    // Aim the route at one model by marking every other one spent up front.
    // Letting the walk discover them no longer works: MAX_MODELS_PER_ROUND stops
    // it after 4 attempts, which is the point of the round budget.
    localStorage.clear();
    for (const other of cfg.ALIYUN_FREE_ROUTE) if (other !== target) mod.markModel("sk-ws-params", other, "free_exhausted");
    const bodies = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => {
      const b = JSON.parse(i.body);
      bodies.push(b);
      if (b.model !== target) return { ok: false, status: 403, json: async () => ({ error: { code: "AllocationQuota.FreeTierOnly", message: "The free tier of the model has been exhausted." } }) };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"story":"x"}' }, finish_reason: "stop" }] }) };
    };
    try { await callLLM("", [], "", "sk-ws-params", "qwen", MSGS, reasoning, { mode: "free" }); }
    finally { globalThis.fetch = orig; localStorage.clear(); }
    const body = bodies.at(-1);
    eq(`${target}: reached by the free route`, body.model, target);
    for (const [k, v] of Object.entries(expected)) eq(`${target}: ${k} = ${JSON.stringify(v)}`, body[k], v);
  }

  // --- gameplay cost strings present for every selectable entry ---
  console.log("\n  cost strings");
  for (const id of Object.keys(MODEL_CONFIGS)) {
    const g = MODEL_CONFIGS[id].gameplay;
    check(`${id}: gameplay has zh/en/ko`, !!(g?.zh && g?.en && g?.ko), JSON.stringify(g));
  }
  for (const m of ALIYUN_PAID_MODELS) {
    const g = m.gameplay;
    check(`aliyun/${m.id}: gameplay has zh/en/ko`, !!(g?.zh && g?.en && g?.ko), JSON.stringify(g));
    check(`aliyun/${m.id}: desc has zh/en/ko`, !!(m.desc?.zh && m.desc?.en && m.desc?.ko));
  }
  check("deepseek cost string updated off the stale 35 hrs",
    !/\b35\s*hrs/.test(MODEL_CONFIGS.deepseek.gameplay.en), MODEL_CONFIGS.deepseek.gameplay.en);
}

// ============================================================ LAYER B
async function layerB(callLLM, MODEL_CONFIGS, meter) {
  section(`LAYER B — live provider round-trip (${MODEL_ID})`);
  if (!LIVE) { console.log("  \x1b[33mSKIP\x1b[0m (pass --live to run; spends credits)"); return; }
  if (!API_KEY) { check("API key present in .env.local", false, "YURIAGENT_API_KEY is empty"); return; }
  check("API key present in .env.local", true);

  const cfg = MODEL_CONFIGS[MODEL_ID];
  check(`MODEL_ID "${rawModel}" resolves to a known provider`, !!cfg, `no MODEL_CONFIGS["${MODEL_ID}"]`);
  if (!cfg) return;

  const system = [
    "You are a narrative engine for a dating simulator. Output ONLY valid JSON, no markdown fences.",
    "Schema: {\"scene\":string,\"statChanges\":{\"selfId\":number,\"secrecy\":number,\"mood\":number},",
    "\"affectionChanges\":{\"irene\":number},\"story\":string (120-200 words, English),",
    "\"summary\":string (one English sentence ~100 chars),",
    "\"options\":[\"A. ...\",\"B. ...\",\"C. ...\",\"D. Custom\"]}",
  ].join(" ");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: "[HISTORY]\n(no history yet)" },
    { role: "user", content: "[CURRENT STATE]\n[Player Status] SelfId:38 Secrecy:97 Mood:82 Round:1 Scene:practice room\n[Affections] Irene:12(Stranger)\n\nPlayer choice: A\n\nGenerate the next round. Output ONLY valid JSON." },
  ];

  // Layer K proves the meter's arithmetic against synthetic usage blocks. Only
  // a real call proves the field path is right — that this provider returns
  // `usage` at all, and that cached tokens really sit at
  // prompt_tokens_details.cached_tokens rather than somewhere provider-specific.
  // A typo there is invisible offline: the meter would simply record zeroes.
  meter?.resetUsage();

  let anyRoundSucceeded = false;
  for (const reasoning of [false, true]) {
    const label = reasoning ? "reasoning ON" : "reasoning OFF";
    console.log(`\n  ${label}`);
    const t0 = Date.now();
    let content;
    try {
      content = await callLLM("", [], "", API_KEY, MODEL_ID, messages, reasoning, null);
    } catch (e) {
      check(`${label}: request succeeded`, false, `${e.kind || ""} ${e.message}`);
      continue;
    }
    anyRoundSucceeded = true;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check(`${label}: request succeeded`, true);
    check(`${label}: non-empty content`, !!content && content.length > 0, `len=${content?.length ?? 0}`);
    if (!content) continue;

    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* fall through */ }
    check(`${label}: response is valid JSON`, !!parsed, content.slice(0, 120));
    if (!parsed) continue;

    check(`${label}: has story (string)`, typeof parsed.story === "string" && parsed.story.length > 50,
      `len=${parsed.story?.length}`);
    check(`${label}: has summary (string)`, typeof parsed.summary === "string" && parsed.summary.length > 0);
    check(`${label}: options is a 4-item array`, Array.isArray(parsed.options) && parsed.options.length === 4,
      `got ${parsed.options?.length}`);
    check(`${label}: statChanges numeric`,
      parsed.statChanges && ["selfId", "secrecy", "mood"].every(k => typeof parsed.statChanges[k] === "number"),
      JSON.stringify(parsed.statChanges));
    check(`${label}: no chain-of-thought leaked into story`,
      !/<think>|<\/think>|reasoning_content/i.test(parsed.story || ""));
    console.log(`       latency ${secs}s · ${content.length} chars`);
  }

  // Gated on a round actually landing. Without this, an exhausted or wrong key
  // reports four extra meter failures on top of the real one, and the next
  // reader spends their time on the meter instead of on the key. Layer H makes
  // the same assertions through the router, which finds a model that answers.
  if (meter && !anyRoundSucceeded) {
    console.log("  \x1b[33mSKIP\x1b[0m usage-meter assertions (no live round landed — see the failure above)");
  } else if (meter) {
    const u = meter.getUsageSummary();
    check("usage meter recorded the live calls", u.calls >= 1, `calls=${u.calls}`);
    check("usage meter read real prompt tokens off the response",
      u.promptTokens > 0, "provider returned no usage.prompt_tokens, or the field path is wrong");
    check("usage meter read real completion tokens",
      u.completionTokens > 0, `got ${u.completionTokens}`);
    check("usage meter measured a latency", u.p50LatencyMs > 0);
    // Not an assertion about the value: this provider may legitimately report
    // no cached_tokens (twelve Aliyun route models do not). Printed so a human
    // can see which case they are looking at.
    const costLabel = u.costUsd === null ? "no calls"
      : (u.costUsd === 0 && !u.costComplete) ? "no published price"
      : `≈ $${u.costUsd.toFixed(5)}`;
    console.log(`       metered: ${u.promptTokens} in · ${u.completionTokens} out · cache ` +
      (u.cacheHitRate === null ? "not reported by this provider" : `${Math.round(u.cacheHitRate * 100)}%`) +
      ` · cost ${costLabel}`);
  }

  // The cap must be HONORED, not merely accepted. An unknown field would be
  // silently ignored and still return 200, so assert a tiny cap truncates.
  console.log("\n  output cap is honored (not just accepted)");
  {
    const capField = MODEL_ID === "qwen" ? "max_completion_tokens" : "max_tokens";
    const resp = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY.trim()}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "Write a 400 word story about a rabbit. Plain text." }],
        ...(MODEL_ID === "qwen" ? { enable_thinking: "false" } : {}),
        ...(MODEL_ID === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        [capField]: 16,
      }),
    });
    const data = await resp.json();
    const choice = data.choices?.[0];
    check(`${capField}:16 -> HTTP 200`, resp.ok, `HTTP ${resp.status} ${data.error?.message || ""}`);
    check(`${capField}:16 -> finish_reason "length" (cap took effect)`,
      choice?.finish_reason === "length",
      `got "${choice?.finish_reason}" — provider may be ignoring ${capField}`);
    check(`${capField}:16 -> output actually short`,
      (choice?.message?.content || "").length < 200,
      `len=${(choice?.message?.content || "").length}`);
  }
}

// ==================================== LAYER D (offline, pure logic)
async function layerD() {
  section("LAYER D — probability engine recency window (offline)");
  const esbuild = await import("esbuild");
  const outfile = join(OUT, "probabilityEngine.mjs");
  await esbuild.build({
    entryPoints: [join(ROOT, "src", "agent", "probabilityEngine.js")],
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
  });
  const { calculateProbability } = await import("file://" + outfile.replace(/\\/g, "/") + "?t=" + Date.now());

  // calculateProbability mixes in Math.random()*0.1. Pin it so the assertions
  // below are deterministic — otherwise the regression guard can pass by luck
  // against the buggy implementation.
  const realRandom = Math.random;
  Math.random = () => 0.5;

  const ids = ["irene", "seulgi"];
  const aff = { irene: 50, seulgi: 50 };
  const hist = (n) => ({ history: [{ round: n, type: "full", text: "x" }] });

  // A member who appeared every recent round must NOT get the "absent" floor.
  const saturated = { ...hist(20), memberAppearances: { irene: [17, 18, 19, 20], seulgi: [] } };
  // A member last seen long ago must clear the 0.3 floor.
  const stale = { ...hist(20), memberAppearances: { irene: [1, 2, 3], seulgi: [] } };

  const pSat = calculateProbability("irene", ids, aff, saturated);
  const pStale = calculateProbability("irene", ids, aff, stale);

  // With Math.random pinned at 0.5 the arithmetic is fully determined:
  //   saturated: recentCount=4 -> penalty 0      -> 0.20+0.15+0.00+0.05 = 0.40
  //   stale:     recentCount=0 -> absent branch  -> 0.20+0.15+0.20+0.05 = 0.60
  // Under the storyRounds bug both collapse to recentCount>0, giving 0.40/0.42.
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  check("saturated member scores exactly 0.40 (recency penalty applied)",
    near(pSat, 0.40), `got ${pSat.toFixed(3)}`);
  check("long-absent member scores exactly 0.60 (absent branch taken)",
    near(pStale, 0.60), `got ${pStale.toFixed(3)} — 0.42 means the recency window is inert`);
  check("long-absent scores strictly higher than saturated",
    pStale > pSat, `stale=${pStale.toFixed(3)} saturated=${pSat.toFixed(3)}`);

  // Regression guard: with the old storyRounds read, lastRound pinned to 0 and
  // every appearance counted as recent, so these two states were identical.
  check("the two states are distinguishable (storyRounds bug would collapse them)",
    Math.abs(pStale - pSat) > 0.05, `delta=${Math.abs(pStale - pSat).toFixed(3)}`);
  Math.random = realRandom;

  // --- Affection clamp -------------------------------------------------
  // Guards the delta bound, not the 0-100 result bound. Those are different
  // things and only the result one existed: a model could answer +30 and move
  // the player through three relationship stages in a single round, so pacing
  // was a property of whichever of 28 route models the router happened to serve.
  const { validateAndFixOutput } = await import("./fixtures/prompts.mjs")
    .then(m => m.loadPromptModules(OUT));
  const clamped = (changes) =>
    validateAndFixOutput({ story: "x".repeat(60), affectionChanges: changes }).affectionChanges;

  check("a runaway positive delta is clamped to +8",
    clamped({ irene: 30 }).irene === 8, `got ${clamped({ irene: 30 }).irene}`);
  check("a runaway negative delta is clamped to -8",
    clamped({ irene: -45 }).irene === -8, `got ${clamped({ irene: -45 }).irene}`);
  // The prompt asks for +/-1..10, so an in-range value must pass through
  // untouched or the clamp is changing writing the model got right.
  check("an in-range delta passes through unchanged",
    clamped({ irene: 5, seulgi: -3 }).irene === 5 && clamped({ irene: 5, seulgi: -3 }).seulgi === -3);
  check("the boundary value +8 is not clamped away",
    clamped({ irene: 8 }).irene === 8);
  // NaN here used to survive into stats and poison that member's affection for
  // the rest of the run - every later comparison against it is false.
  check("a non-numeric delta becomes 0, never NaN",
    clamped({ irene: "lots" }).irene === 0, `got ${JSON.stringify(clamped({ irene: "lots" }).irene)}`);
  check("a fractional delta is truncated to an integer",
    clamped({ irene: 2.7 }).irene === 2);
  // Strict mode makes writing to Object.entries of a string a TypeError, so a
  // malformed field would kill the round rather than be discarded.
  check("a non-object affectionChanges is discarded, not thrown on",
    JSON.stringify(clamped("nonsense")) === "{}");

  // Regression guard: the pre-fix code only bounded the 0-100 result, so the
  // delta reached the caller exactly as the model sent it.
  check("the clamp is actually applied (unfixed code returns the raw +30)",
    clamped({ irene: 30 }).irene !== 30);

  // Dead NPC constants must stay gone.
  const consts = readFileSync(join(ROOT, "src", "config", "constants.js"), "utf8");
  check("NPC_APPEARANCE_CHANCE removed", !/^export const NPC_APPEARANCE_CHANCE/m.test(consts));
  check("NPC_COOLDOWN_ROUNDS removed", !/^export const NPC_COOLDOWN_ROUNDS/m.test(consts));

  // Debug logging must not ship to players.
  for (const f of ["llmTool.js", "llmErrors.js", "aliyunRoute.js", "usageMeter.js"]) {
    const src = readFileSync(join(ROOT, "src", "tools", f), "utf8");
    const activeLogs = src.split("\n").filter(l => /^\s*console\.log\(/.test(l));
    check(`no active console.log in ${f}`, activeLogs.length === 0, activeLogs.join(" | "));
  }
}

// ============================================================ LAYER E
function layerE({ classifyError, parseErrorBody }) {
  section("LAYER E — error classifier (offline, fixtures from docs/error_code)");
  const e = (code, message, extra = {}) => ({ error: { code, message, ...extra } });
  const cases = [
    // Aliyun — first fixture captured live from dashscope 2026-09-15
    ["qwen", 401, { error: { message: "Incorrect API key provided.", type: "invalid_request_error", param: null, code: "invalid_api_key" }, request_id: "x" }, "auth"],
    ["qwen", 403, e("AllocationQuota.FreeTierOnly", "The free tier of the model has been exhausted."), "free_exhausted"],
    ["qwen", 403, { code: "AllocationQuota.FreeTierOnly", message: "The free tier of the model has been exhausted." }, "free_exhausted"],
    ["qwen", 429, e("Throttling.AllocationQuota", "Free allocated quota exceeded."), "free_exhausted"],
    ["qwen", 429, e("Throttling.AllocationQuota", "Allocated quota exceeded, please increase your quota limit."), "rate_limit"],
    ["qwen", 429, e("Throttling.RateQuota", "Requests rate limit exceeded, please try again later."), "rate_limit"],
    ["qwen", 400, e("Arrearage", "Access denied, please make sure your account is in good standing."), "balance"],
    ["qwen", 429, e("PostpaidBillOverdue", "The postpaid bill is overdue."), "balance"],
    ["qwen", 400, e("data_inspection_failed", "Input data may contain inappropriate content."), "content_blocked"],
    ["qwen", 403, e("AccessDenied.Unpurchased", "Access to model denied. Please make sure you are eligible for using the model."), "auth"],
    ["qwen", 403, e("Endpoint.AccessDenied", "Workspace endpoint access denied."), "model_unavailable"],
    ["qwen", 403, e("AccessDenied", "Access denied."), "model_unavailable"],
    ["qwen", 404, e("model_not_found", "The model `qwen9` does not exist or you do not have access to it."), "model_unavailable"],
    ["qwen", 400, e("InvalidParameter.NotSupportEnableThinking", "The model xxx does not support enable_thinking."), "bad_request"],
    ["qwen", 500, e("InternalError", "An internal error has occured."), "server_busy"],
    ["qwen", 503, {}, "server_busy"],
    // DeepSeek
    ["deepseek", 401, e(null, "Authentication Fails"), "auth"],
    ["deepseek", 402, e(null, "Insufficient Balance"), "balance"],
    ["deepseek", 422, e(null, "Invalid Parameters"), "bad_request"],
    ["deepseek", 429, e(null, "Rate Limit Reached"), "rate_limit"],
    ["deepseek", 503, e(null, "Server Overloaded"), "server_busy"],
    // OpenAI
    ["gpt4omini", 401, e("invalid_api_key", "Incorrect API key provided"), "auth"],
    ["gpt4omini", 403, e(null, "Country, region, or territory not supported"), "region"],
    ["gpt4omini", 429, e("credit_balance_exhausted", "Your organization has no prepaid credits remaining."), "balance"],
    ["gpt4omini", 429, e("project_spend_limit_exceeded", "Project spend limit reached"), "balance"],
    ["gpt4omini", 429, e("slow_down", "Slow down", { type: "rate_limit_error" }), "rate_limit"],
    ["gpt4omini", 503, e("server_is_overloaded", "Model temporarily overloaded"), "server_busy"],
    // Gemini (array-wrapped form)
    ["gemini", 400, [{ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }], "auth"],
    ["gemini", 400, { error: { code: 400, message: "Gemini API free tier is not available in your country.", status: "FAILED_PRECONDITION" } }, "region"],
    ["gemini", 400, { error: { code: 400, message: "Invalid JSON payload", status: "INVALID_ARGUMENT" } }, "bad_request"],
    ["gemini", 403, { error: { code: 403, message: "Permission denied", status: "PERMISSION_DENIED" } }, "auth"],
    ["gemini", 429, { error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }, "rate_limit"],
    ["gemini", 504, { error: { code: 504, status: "DEADLINE_EXCEEDED" } }, "timeout"],
    ["gemini", 503, { error: { code: 503, status: "UNAVAILABLE" } }, "server_busy"],
  ];
  for (const [provider, status, body, want] of cases) {
    const { kind, code } = classifyError(provider, status, body);
    eq(`${provider} ${status} ${code || "(no code)"} -> ${want}`, kind, want);
  }
  const parsed = parseErrorBody([{ error: { code: 400, message: "m", status: "S", details: [{ "@type": "x" }, { reason: "R" }] } }]);
  eq("parseErrorBody unwraps arrays and reads details[].reason", `${parsed.status}/${parsed.reason}/${parsed.message}`, "S/R/m");
  eq("parseErrorBody tolerates null/garbage", parseErrorBody(null).message, "");
}

// Every kind the code can throw must have a line in all three languages —
// t.errors[kind] is what the player sees, and a missing key renders the
// English fallback (or nothing) mid-game.
async function layerEi18n() {
  section("LAYER E2 — every error kind is translated (offline)");
  const kinds = new Set();
  const errSrc = readFileSync(join(ROOT, "src/tools/llmErrors.js"), "utf8");
  const toolSrc = readFileSync(join(ROOT, "src/tools/llmTool.js"), "utf8");
  for (const m of errSrc.matchAll(/return "([a-z_]+)"/g)) kinds.add(m[1]);
  for (const m of toolSrc.matchAll(/LLMError\("([a-z_]+)"/g)) kinds.add(m[1]);
  check("classifyError + llmTool emit a non-empty set of kinds", kinds.size >= 10, `${kinds.size} kinds`);

  for (const lang of ["zh", "en", "ko"]) {
    const mod = await import("file://" + join(ROOT, `src/i18n/${lang}.js`).replace(/\\/g, "/"));
    const errors = mod.default?.errors || {};
    const missing = [...kinds].filter(k => !errors[k]);
    check(`${lang}: all ${kinds.size} kinds have a notice`, missing.length === 0, missing.join(", "));
    const dead = Object.keys(errors).filter(k => !kinds.has(k));
    check(`${lang}: no notice for a kind the code cannot throw`, dead.length === 0, dead.join(", "));
  }

  // The Help Center lists the same kinds, and every entry needs help text in
  // all three languages or the row renders with a blank explanation.
  const help = readFileSync(join(ROOT, "src/platforms/HelpOverlay.jsx"), "utf8");
  const order = help.match(/const ERROR_ORDER = \[([\s\S]*?)\];/)?.[1] || "";
  const listed = [...order.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  const notInHelp = [...kinds].filter(k => !listed.includes(k));
  check("Help Center ERROR_ORDER lists every kind", notInHelp.length === 0, notInHelp.join(", "));
  for (const tag of ["EN", "ZH", "KO"]) {
    const block = help.match(new RegExp(`const ERROR_HELP_${tag} = \\{([\\s\\S]*?)\\n\\};`))?.[1] || "";
    const missing = listed.filter(k => !new RegExp(`(^|\\s)${k}:`, "m").test(block));
    check(`ERROR_HELP_${tag} explains all ${listed.length} kinds`, missing.length === 0, missing.join(", "));
  }
}

// ============================================================ LAYER F
async function layerF(mod, ALIYUN_FREE_ROUTE) {
  section("LAYER F — Aliyun free-credit router + retry policy (offline, mocked fetch)");
  const { callLLM, getFreeCandidates, getFreeRouteStatus, markModel, resetSessionSkips } = mod;

  // Collapse retry sleeps to 0ms; keep the 90s abort timer real (it is cleared).
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 60000 ? ms : 0, ...a);
  const realFetch = globalThis.fetch;
  const realWarn = console.warn, realError = console.error;
  console.warn = () => {}; console.error = () => {};

  const ok = { status: 200, body: { choices: [{ message: { content: '{"story":"ok"}' } }] } };
  const err = (status, code, message = "") => ({ status, body: { error: { code, message } } });
  const FREE_EXHAUSTED = err(403, "AllocationQuota.FreeTierOnly", "The free tier of the model has been exhausted.");
  const R = ALIYUN_FREE_ROUTE;

  // handler(model, callIndex) -> response | { throwError }
  const mockFetch = (handler) => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const model = JSON.parse(init.body).model;
      calls.push(model);
      const r = handler(model, calls.length);
      if (r.throwError) throw r.throwError;
      return { ok: r.status === 200, status: r.status, json: async () => r.body };
    };
    return calls;
  };
  const fresh = () => { localStorage.clear(); resetSessionSkips(); };
  const run = async (key, aliyun, provider = "qwen") => {
    try { return { content: await callLLM("", [], "", key, provider, MSGS, false, aliyun) }; }
    catch (e) { return { error: e }; }
  };
  const KEY = "sk-ws-router-test";

  try {
    // 1. exhausted first model -> next one serves, state persisted
    fresh();
    let switches = [];
    const free = { mode: "free", onModelSwitch: (s) => switches.push(s) };
    let calls = mockFetch((m) => (m === R[0] ? FREE_EXHAUSTED : ok));
    let r = await run(KEY, free);
    eq("exhausted R0 -> round served", r.content, '{"story":"ok"}');
    eq("exhausted R0 -> tried R0 then R1", calls.join(","), `${R[0]},${R[1]}`);
    eq("first served model fires no switch toast", switches.length, 0);
    eq("R0 no longer a candidate", getFreeCandidates(KEY)[0], R[1]);
    eq("status shows 29/30", `${getFreeRouteStatus(KEY).available}/${getFreeRouteStatus(KEY).total}`, `${R.length - 1}/${R.length}`);
    calls = mockFetch(() => ok);
    await run(KEY, free);
    eq("next round goes straight to R1 (persisted)", calls.join(","), R[1]);

    // 2. switch toast when the served model changes
    calls = mockFetch((m) => (m === R[1] ? FREE_EXHAUSTED : ok));
    await run(KEY, free);
    eq("R1 exhausted mid-game -> switch toast fired", JSON.stringify(switches), JSON.stringify([{ from: R[1], to: R[2] }]));

    // 3. rate limit: same-model retries, then next model for this round only
    fresh();
    calls = mockFetch((m) => (m === R[0] ? err(429, "Throttling.RateQuota", "Requests rate limit exceeded") : ok));
    r = await run(KEY, { mode: "free" });
    eq("rate-limited R0 -> round served by R1", r.content, '{"story":"ok"}');
    eq("rate-limited R0 retried 3x before moving on", calls.filter(m => m === R[0]).length, 3);
    eq("rate-limited R0 is NOT marked", getFreeCandidates(KEY)[0], R[0]);

    // 4. auth error stops the round, no routing
    fresh();
    calls = mockFetch(() => err(401, "invalid_api_key", "Incorrect API key provided."));
    r = await run(KEY, { mode: "free" });
    eq("401 -> kind auth", r.error?.kind, "auth");
    eq("401 -> single call, no routing", calls.length, 1);

    // 5. everything exhausted. The round budget caps a single round at
    //    MAX_MODELS_PER_ROUND attempts, so discovering a fully spent route now
    //    takes several rounds — that is the trade for never leaving the player
    //    on a silent spinner while 28 models are tried.
    fresh();
    calls = mockFetch(() => FREE_EXHAUSTED);
    r = await run(KEY, { mode: "free" });
    eq("all exhausted -> free_all_exhausted", r.error?.kind, "free_all_exhausted");
    eq("one round tries at most MAX_MODELS_PER_ROUND models", calls.length, 4);
    eq("free_all_exhausted carries the last skip cause", r.error?.cause?.kind, "free_exhausted");
    eq("...naming the model it came from", r.error?.cause?.model, R[3]);

    let totalCalls = calls.length, rounds = 1;
    while (rounds < 20) {
      calls = mockFetch(() => FREE_EXHAUSTED);
      r = await run(KEY, { mode: "free" });
      rounds++;
      totalCalls += calls.length;
      if (calls.length === 0) break;
    }
    eq("across rounds every model is tried exactly once", totalCalls, R.length + 1); // +1 recovery probe
    check("marks persist, so the walk shortens each round", rounds <= Math.ceil(R.length / 4) + 2, `took ${rounds} rounds`);

    // 5b. a mis-parameterised model must stay visible through the walk: without
    // .cause a bad_request looks exactly like "everything is exhausted".
    fresh();
    calls = mockFetch((m) => (m === R[3]
      ? err(400, "InternalError.Algo.InvalidParameter", "The value of the enable_thinking parameter is restricted to True.")
      : FREE_EXHAUSTED));
    r = await run(KEY, { mode: "free" });
    eq("bad_request inside the walk -> still free_all_exhausted to the UI", r.error?.kind, "free_all_exhausted");
    eq("...but .cause exposes the real kind", r.error?.cause?.kind, "bad_request");
    eq("...and the model to fix", r.error?.cause?.model, R[3]);

    // 6. model_unavailable expires after 24h
    fresh();
    mockFetch((m) => (m === R[0] ? err(404, "model_not_found", "does not exist") : ok));
    await run(KEY, { mode: "free" });
    check("unavailable R0 skipped now", !getFreeCandidates(KEY).includes(R[0]));
    check("unavailable R0 returns after 25h", getFreeCandidates(KEY, Date.now() + 25 * 3600 * 1000).includes(R[0]));

    // 7. bad_request skipped for the session only
    fresh();
    mockFetch((m) => (m === R[0] ? err(400, "InvalidParameter.NotSupportEnableThinking", "no enable_thinking") : ok));
    await run(KEY, { mode: "free" });
    check("bad_request R0 skipped this session", !getFreeCandidates(KEY).includes(R[0]));
    resetSessionSkips();
    check("bad_request skip is not persisted", getFreeCandidates(KEY).includes(R[0]));

    // 8. state is per key
    fresh();
    markModel(KEY, R[0], "free_exhausted");
    eq("another key starts with the full route", getFreeRouteStatus("sk-ws-other-key").available, R.length);

    // 9. paid mode: server_busy retried on the same model, no routing
    fresh();
    calls = mockFetch((m, n) => (n < 3 ? err(503, "", "") : ok));
    r = await run(KEY, { mode: "paid", paidModel: "glm-5.2" });
    eq("paid 503,503,200 -> served", r.content, '{"story":"ok"}');
    eq("paid retries stay on the chosen model", [...new Set(calls)].join(","), "glm-5.2");
    calls = mockFetch(() => FREE_EXHAUSTED);
    r = await run(KEY, { mode: "paid", paidModel: "glm-5.2" });
    eq("paid FreeTierOnly -> free_exhausted surfaced, no routing", `${r.error?.kind}/${calls.length}`, "free_exhausted/1");

    // 10. Token Plan key rejected before any request
    calls = mockFetch(() => ok);
    r = await run("sk-sp-tokenplan", { mode: "paid" });
    eq("sk-sp- key -> token_plan_key, 0 calls", `${r.error?.kind}/${calls.length}`, "token_plan_key/0");

    // 11. network failures retried, then surfaced as network
    calls = mockFetch(() => ({ throwError: new TypeError("Failed to fetch") }));
    r = await run(KEY, { mode: "paid" });
    eq("fetch TypeError -> kind network after 3 attempts", `${r.error?.kind}/${calls.length}`, "network/3");

    // 12. other providers classify through the same path
    calls = mockFetch(() => ({ status: 402, body: { error: { message: "Insufficient Balance" } } }));
    r = await run("sk-deepseek", null, "deepseek");
    eq("deepseek 402 -> balance, no retry", `${r.error?.kind}/${calls.length}`, "balance/1");
    r = await run("", null, "deepseek");
    eq("missing key -> auth", r.error?.kind, "auth");

    // 13. bad_response: a 200 whose content cannot be used must never render.
    //     Truncated output is what used to reach the player as raw JSON.
    fresh();
    const truncated = { status: 200, body: { choices: [{ message: { content: '{"scene":"a","story":"half a stor' }, finish_reason: "length" }] } };
    calls = mockFetch((m) => (m === R[0] ? truncated : ok));
    r = await run(KEY, { mode: "free" });
    eq("truncated R0 -> retried then routed to R1", r.content, '{"story":"ok"}');
    eq("...R0 retried MAX_BAD_RETRIES+1 times before moving on", calls.filter(m => m === R[0]).length, 3);
    check("truncated model rests for an hour", !getFreeCandidates(KEY).includes(R[0]));
    check("...and returns after 2h", getFreeCandidates(KEY, Date.now() + 2 * 3600 * 1000).includes(R[0]));

    // 14. degenerate output is caught by the caller's validateContent, so the
    //     game's schema stays out of llmTool.
    fresh();
    const stub = { status: 200, body: { choices: [{ message: { content: '{"story":"..."}', }, finish_reason: "stop" }] } };
    const fullStory = JSON.stringify({ story: "x".repeat(300) });
    const good = { status: 200, body: { choices: [{ message: { content: fullStory }, finish_reason: "stop" }] } };
    calls = mockFetch((m) => (m === R[0] ? stub : good));
    const longEnough = (c) => { try { return (JSON.parse(c).story || "").length >= 40; } catch { return false; } };
    try {
      const content = await callLLM("", [], "", KEY, "qwen", MSGS, false, { mode: "free" }, longEnough);
      eq("degenerate R0 -> routed to R1", content, fullStory);
    } catch (e) { check("degenerate R0 -> routed to R1", false, e.kind); }
    eq("...R0 retried before moving on", calls.filter(m => m === R[0]).length, 3);

    // 15. paid mode surfaces bad_response instead of rendering rubbish
    fresh();
    calls = mockFetch(() => truncated);
    r = await run(KEY, { mode: "paid", paidModel: "glm-5.2" });
    eq("paid truncated -> bad_response after retries", `${r.error?.kind}/${calls.length}`, "bad_response/3");
    eq("...code names why it was unusable", r.error?.code, "truncated");

    // 16. empty content is the same class of non-answer
    fresh();
    calls = mockFetch(() => ({ status: 200, body: { choices: [{ message: { content: "" } }] } }));
    r = await run(KEY, { mode: "paid", paidModel: "glm-5.2" });
    eq("empty content -> bad_response, not a placeholder story", r.error?.kind, "bad_response");
    eq("...code says empty", r.error?.code, "empty");

    // 17. timeout walks to the next model, but two in a row blame the network
    fresh();
    const timeoutErr = () => ({ throwError: Object.assign(new Error("aborted"), { name: "AbortError" }) });
    calls = mockFetch((m) => (m === R[0] ? timeoutErr() : ok));
    r = await run(KEY, { mode: "free" });
    eq("one timeout -> next model serves the round", r.content, '{"story":"ok"}');
    check("timed-out model rests for an hour", !getFreeCandidates(KEY).includes(R[0]));
    check("...and returns after 2h", getFreeCandidates(KEY, Date.now() + 2 * 3600 * 1000).includes(R[0]));

    fresh();
    calls = mockFetch(() => timeoutErr());
    r = await run(KEY, { mode: "free" });
    eq("two timeouts in a row -> timeout, not a 28-model walk", r.error?.kind, "timeout");
    eq("...stops after the second model", calls.length, 2);
    check("the second model is not blamed", getFreeCandidates(KEY).includes(R[1]));

    // 18. recovery probe: a top-up makes a spent route usable again, and nothing
    //     in the API announces that, so the empty route probes once an hour.
    fresh();
    for (const m of R) markModel(KEY, m, "free_exhausted");
    eq("route is empty", getFreeRouteStatus(KEY).available, 0);
    calls = mockFetch(() => ok);
    r = await run(KEY, { mode: "free" });
    eq("probe answers -> round is served", r.content, '{"story":"ok"}');
    eq("...with a single probe call", calls.length, 1);
    eq("...and every exhausted mark is cleared", getFreeRouteStatus(KEY).available, R.length);

    fresh();
    for (const m of R) markModel(KEY, m, "free_exhausted");
    calls = mockFetch(() => FREE_EXHAUSTED);
    r = await run(KEY, { mode: "free" });
    eq("probe fails -> free_all_exhausted", r.error?.kind, "free_all_exhausted");
    calls = mockFetch(() => ok);
    r = await run(KEY, { mode: "free" });
    eq("...and does not probe again within the hour", calls.length, 0);

    // 19. manual reset is the player's escape hatch
    fresh();
    for (const m of R) markModel(KEY, m, "free_exhausted");
    mod.resetFreeRoute(KEY);
    eq("resetFreeRoute restores the whole route", getFreeRouteStatus(KEY).available, R.length);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    console.warn = realWarn; console.error = realError;
  }
}

// ============================================================ LAYER G
async function layerG(mod, MODEL_CONFIGS) {
  section("LAYER G — old saves & legacy settings (offline)");
  const { callLLM, resolvePaidModel, getFreeRouteStatus, getFreeCandidates, markModel, recordServedModel, resetSessionSkips } = mod;
  const KEY = "sk-ws-legacy";

  // Save slots carry no model fields, so the model layer cannot break them.
  const app = readFileSync(join(ROOT, "src", "App.jsx"), "utf8");
  const loadSaveBody = app.slice(app.indexOf("const loadSave"), app.indexOf("const sendMessage"));
  check("loadSave reads no model / sub-model field from a save",
    !/save\.(selectedModel|model|qwenSubModel|aliyun)/.test(loadSaveBody));
  // Loading a save must drop the previous game's pre-round snapshot, or ↺ Retry
  // and the ✎ edit controls restore that game's stats and memory into this one.
  // It is also what gates the edit controls off until a round is played here.
  check("loadSave clears preRoundSnapshotRef (else Retry corrupts the loaded save)",
    /preRoundSnapshotRef\.current = null/.test(loadSaveBody));
  check("loadSave clears the previous game's pending social", /resetPendingSocial\(\)/.test(loadSaveBody));

  // Error notices are UI feedback; they must not become story or save content.
  check("every llmErrorNotice message is tagged error:true",
    !/content: llmErrorNotice\(e\) \}/.test(app) && /llmErrorNotice\(e\), error: true/.test(app));
  check("story export skips tagged error messages",
    /extractStoryText[\s\S]{0,200}!m\.error/.test(app));
  check("save slots skip tagged error messages", /messages=\{storyMessages\(messages\)\}/.test(app));

  // The story edit writes to memory as well as the screen, or the model's
  // context silently diverges from what the player is reading.
  const editBody = app.slice(app.indexOf("const saveStoryEdit"), app.indexOf("const regenerateRound"));
  check("saveStoryEdit updates the history ledger entry, not just the message",
    /memoryRef\.current\?\.history\?\.at\(-1\)/.test(editBody) && /entry\.text = edited/.test(editBody));
  check("saveStoryEdit only touches a full entry it can own", /entry\.type === "full"/.test(editBody));
  check("saveStoryEdit keeps the original summary (collapse target)", !/entry\.summary\s*=/.test(editBody));

  // Key-page layout contract. These are cheap source checks, but each one is a
  // bug that actually shipped to a hand test.
  // The reset control shipped gated behind `available < total`, so on a fresh
  // key (28/28) it never rendered and the player could not find it.
  const freeStart = app.indexOf('aliyunMode === "free" ? (');
  const freeBlock = freeStart === -1 ? "" : app.slice(freeStart, freeStart + 2000);
  check("free-mode block exists", freeBlock.includes("resetFreeRoute"), "marker moved - update this check");
  const resetLine = freeBlock.split("\n").find(l => l.includes("resetFreeRoute(apiKey)")) || "";
  const resetGuarded = freeBlock.slice(0, freeBlock.indexOf(resetLine)).includes("routeStatus.available < routeStatus.total && (");
  check("free-mode reset control is not gated behind 'some models used up'", !resetGuarded);
  check("paid model list is collapsible and scrolls, not 9 rows always open",
    /paidListOpen/.test(app) && /maxHeight: 168/.test(app) && /overflowY: "auto"/.test(app));
  check("story editor is tall enough to read a story without scrolling",
    /minHeight: 220/.test(app) && /el\.scrollHeight/.test(app));
  // An open editor indexes into `messages`; anything that can append a turn
  // while it is open would point the draft at the wrong message.
  check("option bar is hidden while editing", /quickOptions\.length > 0 && !loading && editingIdx === null/.test(app));
  check("custom input is hidden while editing", /\{editingIdx === null && \(\s*<div style=\{\{ padding: "6px 8px", background: th\.inputAreaBg/.test(app));

  check("provider id 'qwen' still exists (rv_sim_model_v11 = \"qwen\" keeps working)", !!MODEL_CONFIGS.qwen);
  check("App falls back to legacy rv_sim_qwen_submodel", /loadFromStorage\("rv_sim_qwen_submodel"\)/.test(app));

  // Legacy rv_sim_qwen_submodel values from the 3-sub-model UI.
  eq("legacy qwen3.8-max kept", resolvePaidModel("qwen3.8-max"), "qwen3.8-max");
  eq("legacy qwen3.7-plus kept", resolvePaidModel("qwen3.7-plus"), "qwen3.7-plus");
  eq("legacy qwen3.7-max (removed) -> qwen3.8-max", resolvePaidModel("qwen3.7-max"), "qwen3.8-max");
  for (const junk of [null, undefined, "", 42, {}, "qwen-nonsense"]) {
    eq(`garbage paid model ${JSON.stringify(junk)} -> qwen3.8-max`, resolvePaidModel(junk), "qwen3.8-max");
  }

  // Corrupted or foreign route state must never crash a round.
  const corrupt = [
    "not-json-object",
    [1, 2, 3],
    { keyHash: mod.hashKey(KEY), exhausted: "oops", unavailable: 7, lastModel: { x: 1 } },
    { keyHash: mod.hashKey(KEY), exhausted: null, unavailable: [] },
    // Written by a build before the degraded / lastProbe fields existed.
    { keyHash: mod.hashKey(KEY), exhausted: {}, unavailable: {}, lastModel: "qwen3.8-max" },
    { keyHash: mod.hashKey(KEY), degraded: "nope", lastProbe: "yesterday" },
    { keyHash: mod.hashKey(KEY), degraded: [1], lastProbe: NaN },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) });
  try {
    for (const state of corrupt) {
      localStorage.clear(); resetSessionSkips();
      localStorage.setItem("rv_sim_aliyun_route", JSON.stringify(state));
      let threw = null;
      try {
        getFreeRouteStatus(KEY);
        markModel(KEY, "qwen3.8-max", "free_exhausted");
        recordServedModel(KEY, "glm-5.3");
        await callLLM("", [], "", KEY, "qwen", MSGS, false, { mode: "free" });
      } catch (e) { threw = e; }
      check(`corrupt route state ${JSON.stringify(state).slice(0, 40)} -> no crash`, threw === null, threw?.message);
    }
    localStorage.clear();
    localStorage.setItem("rv_sim_aliyun_route", "{broken json");
    eq("unparseable route state -> full route", getFreeCandidates(KEY).length, getFreeRouteStatus(KEY).total);
  } finally {
    globalThis.fetch = realFetch;
    localStorage.clear(); resetSessionSkips();
  }

  // --- Storage quota ---------------------------------------------------
  // saveToStorage used to swallow QuotaExceededError, so a refused save was
  // indistinguishable from a written one. localStorage is ~5MB and a slot
  // carries the whole messages array, so ten slots of a long run reach it.
  const esb = await import("esbuild");
  const utilsOut = join(OUT, "utils.mjs");
  await esb.build({
    entryPoints: [join(ROOT, "src", "utils.js")],
    bundle: true, format: "esm", platform: "neutral", outfile: utilsOut, logLevel: "silent",
  });
  const { saveToStorage } = await import("file://" + utilsOut.replace(/\\/g, "/") + "?t=" + Date.now());

  localStorage.clear();
  check("saveToStorage returns true when the write lands", saveToStorage("probe", { a: 1 }) === true);
  eq("...and the value is really there", localStorage.getItem("probe"), '{"a":1}');

  const realSet = localStorage.setItem.bind(localStorage);
  const realErr = console.error;
  localStorage.setItem = () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
  console.error = () => {};
  try {
    check("saveToStorage returns false when the browser refuses the write",
      saveToStorage("probe2", { a: 1 }) === false);
    check("...and still does not throw at the call site",
      (() => { try { saveToStorage("probe3", {}); return true; } catch { return false; } })());
  } finally {
    localStorage.setItem = realSet;
    console.error = realErr;
    localStorage.clear();
  }

  // The return value is worthless if the one caller holding player data ignores
  // it. SaveOverlay rendered the new slot before writing, so a refused save
  // appeared in the list and the player believed it existed.
  const overlay = readFileSync(join(ROOT, "src", "platforms", "SaveOverlay.jsx"), "utf8");
  const saveBody = overlay.slice(overlay.indexOf("const handleSave"), overlay.indexOf("const handleDelete"));
  // Scoped to handleSave on purpose: handleDelete checks the result too, so an
  // unscoped search would pass while the save path ignored it entirely.
  check("handleSave checks the saveToStorage result",
    /if \(!saveToStorage\(/.test(saveBody),
    "a save slot must not be rendered before the write is known to have landed");
  check("SaveOverlay writes before it renders the new slot",
    saveBody.indexOf("saveToStorage(") < saveBody.indexOf("setSaves(updated)"),
    "setSaves ran first, which is what made a failed save invisible");
  check("SaveOverlay surfaces a quota notice", /t\.save\.quota/.test(overlay));

  // Both notices, in all three languages, or a player hits a blank panel.
  for (const lang of ["zh", "en", "ko"]) {
    const i18n = (await import("file://" + join(ROOT, `src/i18n/${lang}.js`).replace(/\\/g, "/"))).default;
    for (const k of ["quotaFull", "quotaRetry"]) {
      check(`${lang}: t.save.${k} exists`, typeof i18n?.save?.[k] === "string" && i18n.save[k].length > 10);
    }
  }
}

// ============================================================ LAYER H
// Verifies the per-model parameters against the real endpoint. Each probe is a
// few dozen tokens, so the whole sweep costs a rounding error of one model's
// free allowance. Only the router's public API is used: to aim a probe at one
// model, every other model is marked unavailable first.
async function layerH(mod, ALIYUN_FREE_ROUTE, getAliyunModelFamily) {
  section("LAYER H — live Aliyun free-credit route (spends free credits)");
  if (!LIVE_FREE) { console.log("  \x1b[33mSKIP\x1b[0m (pass --live-free to run)"); return; }
  if (!API_KEY) { check("API key present in .env.local", false, "API_KEY is empty"); return; }
  check("API key looks like a general Aliyun key (sk-ws-)", API_KEY.startsWith("sk-ws-"),
    "free mode needs a general key, not a Token Plan sk-sp- key");

  const { callLLM, getFreeRouteStatus, markModel } = mod;
  const PROBE = [
    { role: "system", content: "You reply with JSON only." },
    { role: "user", content: 'Return this JSON exactly: {"ok":true}' },
  ];

  const aimAt = (model) => {
    localStorage.clear();
    for (const other of ALIYUN_FREE_ROUTE) if (other !== model) markModel(API_KEY, other, "model_unavailable");
  };

  console.log("\n  per-model probe (thinking OFF, the game's default)");
  const results = [];
  for (const model of ALIYUN_FREE_ROUTE) {
    aimAt(model);
    const t0 = Date.now();
    let outcome, detail = "";
    try {
      const content = await callLLM("", [], "", API_KEY, "qwen", PROBE, false, { mode: "free" });
      try { JSON.parse(content); outcome = "ok"; }
      catch { outcome = content ? "non-json" : "empty"; detail = content.slice(0, 60); }
    } catch (e) {
      // The route swallows per-model skips and rethrows free_all_exhausted once
      // no candidate is left. Since we aimed at exactly one model, e.cause holds
      // that model's real kind — without it a bad_request would look like
      // "everything is exhausted" and the assertion below would pass vacuously.
      const real = e.kind === "free_all_exhausted" && e.cause?.model === model ? e.cause : e;
      outcome = real.kind || "unknown";
      detail = `${real.code || ""} ${real.message || ""}`.trim().slice(0, 90);
    }
    const ms = Date.now() - t0;
    results.push({ model, family: getAliyunModelFamily(model), outcome, ms, detail });
    const colour = outcome === "ok" ? "\x1b[32m" : outcome === "free_exhausted" || outcome === "model_unavailable" ? "\x1b[33m" : "\x1b[31m";
    console.log(`    ${colour}${outcome.padEnd(18)}\x1b[0m ${model.padEnd(26)} ${String(ms).padStart(6)}ms ${detail}`);
  }
  localStorage.clear();

  // bad_request is the only outcome that means OUR parameters are wrong:
  // not-activated models answer model_unavailable, spent ones free_exhausted.
  const badParams = results.filter(r => r.outcome === "bad_request");
  check("no model rejected our request parameters", badParams.length === 0,
    badParams.map(r => `${r.model}: ${r.detail}`).join(" | "));
  const served = results.filter(r => r.outcome === "ok");
  check("at least one free-route model answered", served.length > 0);
  console.log(`\n  ${served.length}/${results.length} models answered · ` +
    ["ok", "free_exhausted", "model_unavailable", "auth", "rate_limit", "bad_request", "non-json", "empty"]
      .map(k => `${k}:${results.filter(r => r.outcome === k).length}`).filter(s => !/:0$/.test(s)).join(" · "));
  for (const fam of [...new Set(results.map(r => r.family))]) {
    const rows = results.filter(r => r.family === fam);
    check(`family ${fam}: params accepted (no bad_request across ${rows.length} models)`,
      rows.every(r => r.outcome !== "bad_request"));
  }
  const glm53 = results.find(r => r.model === "glm-5.3");
  check("glm-5.3 accepted a call with no thinking toggle", glm53 && glm53.outcome !== "bad_request", glm53?.detail);

  // One real round through the router, with the game's actual prompt shape.
  console.log("\n  one routed round (full game prompt)");
  localStorage.clear();
  // Reset here rather than at the top: the per-model sweep above deliberately
  // walks into exhausted and unavailable models, and counting that against the
  // session would make the routed round's numbers meaningless.
  mod.resetUsage?.();
  const system = [
    "You are a narrative engine for a dating simulator. Output ONLY valid JSON, no markdown fences.",
    "Schema: {\"scene\":string,\"statChanges\":{\"selfId\":number,\"secrecy\":number,\"mood\":number},",
    "\"affectionChanges\":{\"irene\":number},\"story\":string (120-200 words, English),",
    "\"summary\":string (one English sentence ~100 chars),",
    "\"options\":[\"A. ...\",\"B. ...\",\"C. ...\",\"D. Custom\"]}",
  ].join(" ");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: "[HISTORY]\n(no history yet)" },
    { role: "user", content: "[CURRENT STATE]\n[Player Status] SelfId:38 Secrecy:97 Mood:82 Round:1 Scene:practice room\n[Affections] Irene:12(Stranger)\n\nPlayer choice: A\n\nGenerate the next round. Output ONLY valid JSON." },
  ];
  const t0 = Date.now();
  let content = null;
  try { content = await callLLM("", [], "", API_KEY, "qwen", messages, false, { mode: "free", onModelSwitch: ({ from, to }) => console.log(`    switched ${from} -> ${to}`) }); }
  catch (e) { check("routed round succeeded", false, `${e.kind} ${e.message}`); }
  if (content !== null) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check("routed round succeeded", true);
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* fall through */ }
    check("routed round returned valid JSON", !!parsed, content.slice(0, 120));
    if (parsed) {
      check("has story (string)", typeof parsed.story === "string" && parsed.story.length > 50, `len=${parsed.story?.length}`);
      check("has summary (string)", typeof parsed.summary === "string" && parsed.summary.length > 0);
      check("options is a 4-item array", Array.isArray(parsed.options) && parsed.options.length === 4, `got ${parsed.options?.length}`);
      check("no chain-of-thought leaked into story", !/<think>|<\/think>|reasoning_content/i.test(parsed.story || ""));
    }

    // Layer K proves the meter's arithmetic against synthetic usage blocks.
    // Only a real response proves the field path: that Aliyun returns `usage`
    // at all, and that cached tokens sit where the meter looks for them
    // (prompt_tokens_details.cached_tokens). A wrong path is invisible offline
    // because the meter would just record zeroes and every test would pass.
    const u = mod.getUsageSummary?.();
    if (u) {
      check("usage meter recorded the routed round", u.calls >= 1, `calls=${u.calls}`);
      check("usage meter read real prompt tokens off the response", u.promptTokens > 0,
        "no usage.prompt_tokens in the response, or the field path is wrong");
      check("usage meter read real completion tokens", u.completionTokens > 0, `got ${u.completionTokens}`);
      check("usage meter measured a latency", u.p50LatencyMs > 0);
      // Deliberately not asserted: whether this model reports cached_tokens.
      // Twelve route models do not, and which one served is the router's call.
      // Printed so a human can see which case they are looking at.
      console.log(`    metered: ${u.promptTokens} in · ${u.completionTokens} out · cache ` +
        (u.cacheHitRate === null ? "not reported by the served model" : `${Math.round(u.cacheHitRate * 100)}%`) +
        ` · cost ${u.costUsd === null ? "no calls" : (u.costUsd === 0 && !u.costComplete) ? "no published price" : "≈ $" + u.costUsd.toFixed(5)}`);
    }

    const status = getFreeRouteStatus(API_KEY);
    console.log(`    served in ${secs}s · route now ${status.available}/${status.total} available · next: ${status.current}`);
  }
  localStorage.clear();
}

// ============================================================ LAYER C
function layerC() {
  section("LAYER C — secret hygiene (offline)");

  // Vite inlines only VITE_* vars; an unprefixed name cannot reach the bundle.
  const prefixed = Object.keys(env).filter(k => k.startsWith("VITE_"));
  check("no VITE_-prefixed var in .env.local (would be inlined into dist/)", prefixed.length === 0, prefixed.join(", "));

  // App source must never read the smoke-test credential or process.env.
  let srcHits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) {
        const t = readFileSync(p, "utf8");
        if (/YURIAGENT_API_KEY|process\.env/.test(t)) srcHits.push(p.replace(ROOT, "").replace(/\\/g, "/"));
      }
    }
  };
  walk(join(ROOT, "src"));
  check("src/ never references YURIAGENT_API_KEY or process.env", srcHits.length === 0, srcHits.join(", "));

  // The built bundle must not contain the key.
  const distDir = join(ROOT, "dist", "assets");
  if (API_KEY && existsSync(distDir)) {
    let leaked = [];
    for (const f of readdirSync(distDir)) {
      if (!/\.(js|css|json)$/.test(f)) continue;
      if (readFileSync(join(distDir, f), "utf8").includes(API_KEY)) leaked.push(f);
    }
    check("built dist/ does not contain the API key", leaked.length === 0, leaked.join(", "));
  } else {
    console.log("  \x1b[33mSKIP\x1b[0m dist/ key scan (no dist build or no key)");
  }

  // .env.local must be ignored by git.
  let ignored = false;
  try { execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: ROOT, stdio: "pipe" }); ignored = true; }
  catch { ignored = false; }
  check(".env.local is git-ignored", ignored, "run: git check-ignore -v .env.local");

  // ...and never committed, in any reachable history. `--pretty=format:` drops
  // the commit header so only path lines remain — otherwise a commit *message*
  // mentioning ".env" is mistaken for a committed file.
  let inHistory = "";
  try {
    inHistory = execFileSync("git", ["log", "--all", "--pretty=format:", "--name-only"], { cwd: ROOT, stdio: "pipe" })
      .toString().split("\n")
      .map(l => l.trim())
      .filter(l => l && /(^|\/)\.env($|\.)/.test(l))
      .join(", ");
  } catch { /* ignore */ }
  check("no .env file appears in git history", inHistory === "", inHistory);

  // --- version-string consistency ---
  //
  // The displayed version lives in 13 places across five files (App.jsx
  // duplicates the i18n cover strings). A partial bump ships a build whose
  // cover disagrees with package.json, which makes a player's bug report
  // ambiguous. `npm run bump` rewrites all 13; this proves it was run.
  //
  // deploy.sh preflight runs this suite, so a partial bump cannot reach
  // players. Re-running the bump script is the fix, never editing by hand.
  const version = readCurrentVersion(ROOT);
  check("package.json version is x.y.z", /^\d+\.\d+\.\d+$/.test(version), version);

  for (const [rel, expected] of Object.entries(EXPECTED)) {
    if (rel === "package.json") continue;
    const text = readFileSync(join(ROOT, rel), "utf8");
    // Count the strings that already carry the current version: bumping to a
    // throwaway version must find exactly as many as EXPECTED declares.
    const { count } = bumpFile(rel, text, version, "0.0.0");
    check(`${rel} carries v${version} in ${expected} place(s)`, count === expected,
      `found ${count}, expected ${expected} — run \`npm run bump ${version}\``);
  }

  // --- host-independent paths ---
  //
  // The app is served from three places at two different depths: GitHub Pages
  // under /rv-simulator/, Vercel and Cloudflare at the root. Anything that
  // hardcodes the Pages subpath 404s on the other two. That shipped: group
  // JSON was fetched from a hostname check (`localhost ? '/' : '/rv-simulator/'`)
  // so every non-local host fell into loadGroupIndex's catch and showed only
  // the hardcoded Red Velvet fallback.
  //
  // The rule: runtime fetches derive their prefix from import.meta.env.BASE_URL,
  // and manifest paths are relative to the manifest's own URL.
  const srcFiles = [];
  const walkSrc = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walkSrc(p);
      else if (/\.(js|jsx)$/.test(e.name)) srcFiles.push(p);
    }
  };
  walkSrc(join(ROOT, "src"));
  const subpathHits = srcFiles.filter((p) => {
    const code = readFileSync(p, "utf8")
      .split("\n")
      // Drop comment lines: explaining the old bug is allowed, shipping it is not.
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n")
      // github.com/byhAnita/rv-simulator is the repo link, not a served path.
      .replace(/https:\/\/github\.com\/[^\s"')]*/g, "");
    return code.includes("/rv-simulator/");
  });
  check("no src/ file hardcodes the /rv-simulator/ subpath",
    subpathHits.length === 0,
    subpathHits.map((p) => p.replace(ROOT, "")).join(", "));

  for (const loader of ["groupLoader", "worldLoader"]) {
    check(`${loader} derives its prefix from BASE_URL`,
      readFileSync(join(ROOT, `src/rag/${loader}.js`), "utf8").includes("import.meta.env.BASE_URL"),
      "a hostname check cannot know the deploy path");
  }

  for (const rel of ["manifest.json", "public/manifest.json"]) {
    const m = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
    const abs = [m.start_url, m.scope, ...(m.icons || []).map((i) => i.src)]
      .filter((v) => typeof v === "string" && v.startsWith("/"));
    check(`${rel} uses paths relative to the manifest`, abs.length === 0, abs.join(", "));
  }

  // Both copies are served - public/ to the built hosts, root to Pages - so a
  // change to one alone means the two sites disagree about scope and icon.
  const rootManifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const pubManifest = JSON.parse(readFileSync(join(ROOT, "public/manifest.json"), "utf8"));
  check("root and public manifest.json agree",
    JSON.stringify(rootManifest) === JSON.stringify(pubManifest),
    "edit both, or the Pages site and the built hosts diverge");

  // --- The root data mirrors have no other guard ---
  //
  // groupLoader fetches `${base}groups/index.json` and worldLoader
  // `${base}worlds/<id>/<lang>.json` at runtime, and GitHub Pages serves the
  // repo root, so root groups/ and worlds/ are load-bearing, not duplicates of
  // public/. Nothing keeps them in sync: deploy.sh copies only assets/*.js and
  // *.css, so editing a group or world JSON under public/ leaves Pages serving
  // the old data indefinitely - no error, no warning, just stale content for
  // everyone on that host. Content is compared with trailing whitespace
  // stripped, because the two trees differ by a trailing newline by history.
  //
  // Both trees are checked by the same loop on purpose: worlds/ landed in
  // v1.4.0 and the plan warns that each new mirrored tree is another chance to
  // forget. Adding rosters/ later means adding one string here.
  const walkTree = (dir, prefix = "") => {
    const out = [];
    for (const name of readdirSync(join(ROOT, dir, prefix), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) out.push(...walkTree(dir, rel));
      else out.push(rel);
    }
    return out.sort();
  };
  for (const tree of ["groups", "worlds"]) {
    const rootTree = walkTree(tree);
    const pubTree = walkTree(`public/${tree}`);
    const missing = pubTree.filter((f) => !rootTree.includes(f));
    const extra = rootTree.filter((f) => !pubTree.includes(f));
    check(`root ${tree}/ mirrors public/${tree}/ file-for-file`,
      missing.length === 0 && extra.length === 0,
      `missing from root: ${missing.join(", ") || "none"}; only in root: ${extra.join(", ") || "none"}`);

    const drifted = pubTree
      .filter((f) => rootTree.includes(f))
      .filter((f) => readFileSync(join(ROOT, tree, f), "utf8").trimEnd()
        !== readFileSync(join(ROOT, `public/${tree}`, f), "utf8").trimEnd());
    check(`root ${tree}/ content matches public/${tree}/`,
      drifted.length === 0,
      `drifted: ${drifted.join(", ")} - copy public/${tree}/ over root ${tree}/`);
  }

  // Referencing the manifest as "/manifest.json" makes Vite treat it as a
  // public-dir asset and rewrite it to "./manifest.json" for the relative base.
  // Writing "./manifest.json" in source instead makes Vite resolve the ROOT
  // copy and emit a second, hashed manifest under assets/ - at a different
  // depth, where the relative icon path no longer resolves.
  check("index.html references the manifest as a public asset",
    /<link rel="manifest" href="\/manifest\.json"/.test(readFileSync(join(ROOT, "index.html"), "utf8")),
    "use /manifest.json, not ./manifest.json");

  // --- Vercel builds from source, not from the committed bundle ---
  //
  // index.html is committed in production mode for GitHub Pages, so Vite would
  // otherwise take `./assets/index-<hash>.js` as its entry and re-bundle the
  // PREVIOUS build instead of compiling src/ - 4 modules instead of 55. The
  // build still succeeds and the site still runs, it is just frozen at the last
  // `npm run deploy`, which makes every branch preview silently show main's
  // code. scripts/dev-index.mjs is what prevents that, so the build command
  // must keep calling it.
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  check("vercel buildCommand normalises index.html first",
    (vercel.buildCommand || "").includes("dev-index.mjs"),
    `got "${vercel.buildCommand}" - previews would serve the last deployed build`);
  check("vercel outputDirectory is dist", vercel.outputDirectory === "dist", vercel.outputDirectory);

  // The README changelog must never be rewritten by a bump: the heading for
  // the *current* release is written by hand, and older ones stay untouched.
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  check(`README has a "What's New in v${version}" section`,
    readme.includes(`What's New in v${version}`),
    "add the section by hand as part of the release commit");
}

// ==================================== LAYER I (offline, pure logic)
// Three bugs that a player sees as "the writing is wrong", all of which are
// really prompt or memory plumbing. Each check is written so it fails against
// the pre-v1.3.6 implementation.
async function layerI() {
  section("LAYER I — address protocol, KKT lock, edited-story delivery (offline)");
  const esbuild = await import("esbuild");
  // Own filename: playthrough.mjs writes a different bundle to agent.mjs.
  const outfile = join(OUT, "agentPrompt.mjs");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/agent/mainAgent.js";',
        'export * from "./src/agent/memoryPool.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
  });
  const { buildSystemPrompt, buildDynamicTail, buildHistoryLedger,
          collapseHistoryIfNeeded, updateMemory } =
    await import("file://" + outfile.replace(/\\/g, "/") + "?t=" + Date.now());

  // Real group data, loaded the way the app loads it. Reading the JSON straight
  // off disk tests the formatter and not the feature: parseGroupConfig copies
  // members field by field, and it was silently dropping `birthday`, so the
  // whole address protocol ran on the "2000-01-01" fallback in the real app
  // while a raw-JSON fixture passed every check.
  const loaderBundle = join(OUT, "groupLoader.mjs");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/rag/groupLoader.js";',
        'export * from "./src/rag/worldLoader.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: loaderBundle, logLevel: "silent",
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  });
  const loader = await import("file://" + loaderBundle.replace(/\\/g, "/") + "?t=" + Date.now());
  const fromDisk = async (fn) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const p = join(ROOT, "public", String(url).replace(/^\//, ""));
      if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, "utf8")) };
    };
    try { return await fn(); } finally { globalThis.fetch = realFetch; }
  };
  const members = (await fromDisk(() => loader.loadGroupConfig("red_velvet", "en"))).members;

  const rawMembers = JSON.parse(
    readFileSync(join(ROOT, "public", "groups", "red_velvet", "en.json"), "utf8")).members;
  check("the loader hands the prompt every birthday the group JSON declares",
    members.every((m) => m.birthday === rawMembers.find((r) => r.id === m.id)?.birthday),
    JSON.stringify(members.map((m) => `${m.name}:${m.birthday}`)));
  check("the cast spans more than one birth year after parsing",
    new Set(members.map((m) => m.birthday)).size > 1,
    "one birth year for the whole cast means the seniority fallback is in play");
  const byId = (id) => members.find((m) => m.id === id);
  const GROUP = { groupLore: "lore" };

  // GAME_YEAR is 2026, so age 31 => born 1995: younger than Irene (1991) and
  // Seulgi/Wendy (1994), older than Joy (1996) and Yeri (1999). One cast, both
  // directions — the only setup that can catch a reversed honorific.
  const form = (over = {}) => ({
    name: "Summer", age: "31", identity: "韩娱艺人", pace: "浪漫情感向",
    mainMember: "irene", subMembers: ["yeri"], ...over,
  });
  const worldFor = {};
  for (const lang of ["zh", "en", "ko"]) {
    worldFor[lang] = await fromDisk(() => loader.loadWorld("kpop_idol", lang));
  }
  const prompt = (f = form(), lang = "en") =>
    buildSystemPrompt(f, members, "irene", ["yeri"], GROUP, "", "qwen", lang, worldFor[lang]);

  const p = prompt();
  const addressOfIn = (text, name) => {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => l.includes(`${name}(`));
    return i === -1 ? "" : lines.slice(i, i + 3).join("\n").replace(/\n/g, " / ");
  };
  const addressOf = (name) => addressOfIn(p, name);

  // --- age direction. The old code printed the player's relative age inside
  //     the member's profile, so every line read backwards.
  const irene = addressOf("Irene"), yeri = addressOf("Yeri"), seulgi = addressOf("Seulgi");
  check("older member is marked OLDER than the player",
    /4 yr OLDER than Summer/.test(irene), irene);
  check("younger member is marked YOUNGER than the player",
    /4 yr YOUNGER than Summer/.test(yeri), yeri);
  check("a 1-year gap still creates seniority (birth-year boundary, not a tolerance)",
    /1 yr OLDER than Summer/.test(seulgi), seulgi);
  check("older member is named as the player's unnie",
    /She is Summer's unnie/.test(irene), irene);
  check("younger member has the player as her unnie",
    /Summer is her unnie/.test(yeri), yeri);

  // --- direction is asymmetric. This is the bug the player reported: both
  //     sides calling each other unnie.
  check("player calls the older member unnie",
    /Summer -> "Irene-unnie"/.test(irene), irene);
  check("older member is forbidden from calling the player unnie",
    /She must NEVER call Summer "unnie"/.test(irene), irene);
  check("younger member calls the player unnie",
    /She -> "Summer-unnie"/.test(yeri), yeri);
  check("player is forbidden from calling the younger member unnie",
    /Summer must NEVER call her "unnie"/.test(yeri), yeri);
  check("no member is told both to use and to avoid unnie",
    !/She -> "Summer-unnie"[\s\S]{0,200}She must NEVER call Summer "unnie"/.test(p));

  // --- same birth year. Age 32 => born 1994, same as Seulgi and Wendy.
  const peer = prompt(form({ age: "32" }));
  const peerLines = peer.split("\n");
  const peerBlock = (name) => {
    const i = peerLines.findIndex((l) => l.includes(`${name}(`));
    return i === -1 ? "" : peerLines.slice(i, i + 3).join("\n");
  };
  check("same birth year produces no unnie in either direction",
    peerLines.filter((l) => /same birth year as Summer/.test(l)).length === 2,
    "expected exactly Seulgi + Wendy");
  check("same-age member's own block offers no unnie form",
    !/-unnie"/.test(peerBlock("Seulgi")), peerBlock("Seulgi").replace(/\n/g, " / "));
  check("same-age member is still given an address form",
    /plain given name/.test(peerBlock("Seulgi")), peerBlock("Seulgi"));
  check("a genuinely older member in the same cast still gets unnie",
    peerBlock("Irene").includes('Summer -> "Irene-unnie"'), peerBlock("Irene"));

  // --- the self-naming bug: a member thanking the player with her own name.
  check("member's own name is ruled out as an address form for the player",
    p.includes('"Irene" and "Bae Ju-hyun" refer to herself'), "SPEAKER CONTRACT missing");
  check("speaker contract defines I/you inside quotation marks",
    /Inside quotation marks, "I"\/"me"\/"my" = the character who is speaking/.test(p));
  check("speaker contract binds the player's own choice text",
    /"I" is always Summer and "you" is the member being addressed/.test(p));
  check("dialogue is no longer exempt from the pronoun rule",
    !/members may address the player by name, nickname, or title — that is fine/.test(p));

  // --- register is soft and blended, not a per-stage lookup.
  for (const cue of ["Age gap", "Closeness", "Private Personality"]) {
    check(`register blends ${cue}`, p.includes(cue));
  }
  check("register states the direction never reverses",
    /NEVER reverses, at any affection level/.test(p));
  // The tail emits Chinese stage labels, so the register text must not key off
  // English stage names it will never see.
  check("register does not name stages the dynamic tail never emits",
    !/\b(Flirting|Lovers|Stranger stage)\b/.test(p.slice(p.indexOf("REGISTER:"), p.indexOf("7. SOCIAL"))));

  // --- Korean address forms stay transliterated in every output language.
  //     Localizing 언니 to the Chinese 姐 reads as a family drama and throws
  //     away the setting the whole game rests on.
  const zhP = prompt(form(), "zh"), enP = prompt(form(), "en"), koP = prompt(form(), "ko");
  check("[zh] the older member is addressed as 欧尼, not 姐",
    /Summer -> "Irene欧尼"/.test(zhP), addressOfIn(zhP, "Irene"));
  check("[zh] 姐 is banned by name so the model cannot default to it",
    zhP.includes('NEVER "姐"'), "the ban has to be explicit — the model reaches for 姐 otherwise");
  // --- 야 is the one form transliteration cannot carry into Chinese.
  // 欧尼 and nim arrive carrying only their Korean sense because neither is a
  // Chinese word. 呀 IS one — sentence-final, where Korean 야 is a vocative
  // suffix on a name — so "小饼呀，你来了" parses as Chinese and reads wrong to a
  // native speaker. Reported from hand play in v1.3.9. It survives only in the
  // use both languages share: a standalone exclamation.
  // Scoped to the Address lines: the prompt deliberately QUOTES the wrong
  // pattern as a counter-example, so a whole-prompt search would match the very
  // text doing the forbidding.
  const addressLinesOf = (src) => src.split("\n").filter(l => l.trim().startsWith("Address:")).join("\n");
  check("[zh] no member is offered a name+呀 vocative",
    !/呀/.test(addressLinesOf(zhP)), addressLinesOf(zhP));
  check("[zh] 呀 is still taught as a standalone exclamation",
    /"呀" ONLY as a standalone exclamation/.test(zhP),
    "dropping it entirely loses a register the two languages genuinely share");
  check("[zh] the wrong pattern is banned by example, not just omitted",
    /NEVER as a suffix on a name/.test(zhP));
  // en and ko are unaffected: English has no competing 呀, Korean is native.
  check("[en] the -ya vocative survives, since English has no competing form",
    /"Summer-ya" once close/.test(enP), addressOfIn(enP, "Irene"));
  check("[ko] the 야 vocative survives in its native language",
    /"Summer 야" once close/.test(koP), addressOfIn(koP, "Irene"));

  // --- address forms are spoken, never narrated.
  // "Irene欧尼正站在窗边" — the SPEAKER CONTRACT scoped pronouns to narration
  // from v1.3.6 but said nothing about address forms, and the token examples
  // carried no scope marker. Reported from hand play in v1.3.9.
  for (const [tag, src] of [["zh", zhP], ["en", enP], ["ko", koP]]) {
    check(`[${tag}] address forms are scoped to dialogue`,
      /Address forms are SPOKEN, not narrated/.test(src));
    check(`[${tag}] the narration rule shows the wrong form, not just the right one`,
      /In narration a member is her stage name alone[\s\S]{0,200}NEVER/.test(src),
      "a rule with no counter-example is the one the model ignores");
  }

  // zh mixes scripts deliberately: 欧尼 in Chinese characters, nim/xi in
  // Latin, because that is what a Chinese K-pop reader recognizes at sight.
  check("[zh] 님 and 씨 are written in Latin as nim and xi",
    /님 -> "nim"/.test(zhP) && /씨 -> "xi"/.test(zhP));
  check("[zh] the unreadable transliterations are banned by name",
    /NEVER "尼姆"/.test(zhP) && /NEVER "西"/.test(zhP));
  check("[zh] a Chaebol player's work title uses Latin nim",
    prompt(form({ identity: "财阀" }), "zh").includes("会长nim"));
  check("[en] the older member is addressed as unnie",
    /Summer -> "Irene-unnie"/.test(enP), addressOfIn(enP, "Irene"));
  check("[en] English kinship words are banned by name",
    /NEVER "big sister"/.test(enP));
  check("[ko] the forms are written natively",
    /Summer -> "Irene 언니"/.test(koP), addressOfIn(koP, "Irene"));
  check("no prompt offers 姐 as an address form in any language",
    ![zhP, enP, koP].some((x) => /-> "[^"]*姐"/.test(x)));

  // --- identity override outranks age, and only for the identities that have one.
  const staff = prompt(form({ identity: "Staff" }));
  check("Staff player is addressed by work title regardless of age",
    /Manager-nim/.test(staff) && /Work override/.test(staff));
  check("work override appears once, not once per member",
    (staff.match(/Work override/g) || []).length === 1,
    `${(staff.match(/Work override/g) || []).length} occurrences`);
  check("identity without a work title gets no override line",
    !/Work override/.test(p));
  check("Chaebol player is addressed as chairwoman",
    /Chairwoman-nim/.test(prompt(form({ identity: "财阀" }))));

  // --- player identity is stated at all, in every language.
  for (const [lang, form_] of [["zh", "Irene欧尼"], ["en", "Irene-unnie"], ["ko", "Irene 언니"]]) {
    const lp = prompt(form(), lang);
    check(`[${lang}] player's birth year is given to the model`,
      /THE PLAYER: Summer .* born 1995/.test(lp));
    check(`[${lang}] address protocol survives the language switch`,
      lp.includes(`Summer -> "${form_}"`), addressOfIn(lp, "Irene"));
  }

  // --- a member with no birthday must not crash or invent seniority.
  const noBday = members.map((m) => (m.id === "joy" ? { ...m, birthday: undefined } : m));
  let fellBack = "";
  try { fellBack = buildSystemPrompt(form(), noBday, "irene", ["yeri"], GROUP, "", "qwen", "en", worldFor.en); }
  catch (e) { fellBack = `THREW ${e.message}`; }
  check("missing birthday falls back instead of throwing",
    fellBack.includes("b.2000") && !fellBack.startsWith("THREW"), fellBack.slice(0, 120));

  // ---------------------------------------------------------------- KKT lock
  // The model writes the story around the KKT it sends, so filtering after the
  // fact leaves prose about a message the player never receives.
  const aff = { irene: 42, yeri: 18 };
  const mem = () => ({
    playerStats: { selfId: 40, secrecy: 90, mood: 70, week: 6, scene: "practice room" },
    affections: { ...aff },
    kktMessages: { irene: [{ sender: "irene", content: "you okay?" }],
                   yeri: [{ sender: "yeri", content: "stale message" }] },
    history: [],
  });
  const tail = buildDynamicTail(mem(), members, ["irene", "yeri"]);
  check("dynamic tail declares the KKT channels", tail.includes("[KKT Channels]"), tail);
  check("unlocked member is marked unlocked", /Irene:unlocked/.test(tail), tail);
  check("below-threshold member is marked LOCKED", /Yeri:LOCKED/.test(tail), tail);
  // Yeri's messages were stored while she was above 30 and her affection later
  // fell. Replaying them keeps a closed channel open in the prompt.
  check("sub-threshold member's stored KKT is not replayed",
    !tail.includes("stale message"), tail);
  check("unlocked member's KKT is still replayed", tail.includes("you okay?"), tail);

  const promptKkt = prompt();
  check("static prompt forbids narrating a locked member's KKT",
    /LOCKED CHANNEL|KKT IS A LOCKED CHANNEL/.test(promptKkt));
  check("static prompt points the lock at the dynamic tail",
    promptKkt.includes("[KKT Channels]"));
  check("schema requires [] for locked members",
    /Members marked LOCKED in \[KKT Channels\] MUST be \[\]/.test(promptKkt));

  // A round-1 memory has no affections recorded at all.
  const empty = buildDynamicTail({ affections: {}, kktMessages: {}, history: [] }, members, ["irene"]);
  check("empty affections default every channel to LOCKED", /Irene:LOCKED/.test(empty), empty);

  // -------------------------------------------------- edited story delivery
  // Reproduces the real sequence: three full rounds, player edits the newest
  // story, next round collapses. Pre-v1.3.6 the edit was replaced by the stale
  // summary before the ledger was ever built.
  const play = (m, round, text) => updateMemory(m, {
    historyEntry: { round, type: "full", text, choice: "A", summary: `summary of round ${round}` },
  });
  let m2 = { history: [], affections: {}, kktMessages: {} };
  play(m2, 0, "story zero"); play(m2, 1, "story one"); play(m2, 2, "story two");
  const EDIT = "SHE TURNED AND SAID SOMETHING THE PLAYER WROTE HERSELF";
  const last = m2.history.at(-1);
  last.text = EDIT; last.keepFull = true;          // exactly what saveStoryEdit does

  collapseHistoryIfNeeded(m2);                      // start of the next round
  const ledger = buildHistoryLedger(m2);
  check("edited story reaches the ledger through the collapse that would have eaten it",
    ledger.includes(EDIT), ledger.slice(0, 200));
  check("unedited stories still collapse to their summaries",
    !ledger.includes("story zero") && ledger.includes("summary of round 0"), ledger.slice(0, 200));
  check("the spared entry is still a full entry",
    m2.history.at(-1).type === "full");

  // Appending the next round means the edit has been delivered; the reprieve
  // must end there or an edited entry would never collapse.
  play(m2, 3, "story three");
  check("keepFull is cleared once the entry has been sent",
    m2.history.every((h) => !h.keepFull), JSON.stringify(m2.history.map((h) => h.keepFull)));
  play(m2, 4, "story four");
  collapseHistoryIfNeeded(m2);
  check("a previously spared entry collapses on the next collapse",
    !buildHistoryLedger(m2).includes(EDIT));

  // Regression guard: the same sequence without the flag must fail, or the
  // check above could pass for the wrong reason.
  let m3 = { history: [], affections: {}, kktMessages: {} };
  play(m3, 0, "a"); play(m3, 1, "b"); play(m3, 2, "c");
  m3.history.at(-1).text = EDIT;                    // edit, no keepFull
  collapseHistoryIfNeeded(m3);
  check("without keepFull the edit is lost (proves the guard above is live)",
    !buildHistoryLedger(m3).includes(EDIT));

  // ------------------------------------------------- live harness bootability
  // v1.3.5 moved groupLoader onto import.meta.env.BASE_URL, which Vite fills at
  // build time and Node does not have — playthrough.mjs died on every model
  // before its first API call, and stayed broken because nothing offline ran
  // its bundling path. This exercises that path: same modules, same esbuild
  // define, group JSON served from disk exactly as the harness serves it.
  const liveBundle = join(OUT, "harnessBoot.mjs");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/agent/mainAgent.js";',
        'export * from "./src/rag/groupLoader.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: liveBundle, logLevel: "silent",
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  });
  const harness = await import("file://" + liveBundle.replace(/\\/g, "/") + "?t=" + Date.now());

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const p = join(ROOT, "public", String(url).replace(/^\//, ""));
    if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, "utf8")) };
  };
  // loadGroupIndex swallows failures and returns a hardcoded Red Velvet entry,
  // so "it returned something" proves nothing — the count is what separates a
  // real load from the fallback.
  let idx = [], cfg = null, bootErr = null;
  try {
    idx = await harness.loadGroupIndex();
    cfg = await harness.loadGroupConfig("red_velvet", "ko");
  } catch (e) { bootErr = `${e.name}: ${e.message}`; }
  globalThis.fetch = realFetch;

  check("live harness bundle boots under Node (no Vite-only globals)",
    bootErr === null, bootErr || "");
  check("group index loads for real, not via the Red Velvet fallback",
    idx.length > 1, `got ${idx.length} groups — 1 means loadGroupIndex fell into its catch`);
  check("group config parses through the harness bundle",
    (cfg?.members?.length || 0) === 5 && !!cfg?.groupLore,
    `members=${cfg?.members?.length}`);
  check("harness-loaded members carry the birthdays the address protocol needs",
    (cfg?.members || []).every((m) => /^\d{4}-/.test(m.birthday || "")),
    "parseGroupConfig drops birthday — the address protocol would fall back to b.2000 for everyone");

  // ------------------------------------------------------ save compatibility
  // A v1.3.5 save has no keepFull anywhere. It must collapse exactly as before.
  const legacy = { history: [
    { round: 0, type: "summary", text: "old summary" },
    { round: 1, type: "full", text: "old full one", choice: "A", summary: "s1" },
    { round: 2, type: "full", text: "old full two", choice: "B", summary: "s2" },
    { round: 3, type: "full", text: "old full three", choice: "C", summary: "s3" },
  ], affections: { irene: 40 }, kktMessages: {} };
  let threw = null;
  try { collapseHistoryIfNeeded(legacy); } catch (e) { threw = e.message; }
  check("legacy save without keepFull collapses without throwing", threw === null, threw || "");
  check("legacy save collapses every full entry",
    legacy.history.every((h) => h.type === "summary"),
    JSON.stringify(legacy.history.map((h) => h.type)));
  let threwTail = null;
  try { buildDynamicTail(legacy, members, ["irene"]); } catch (e) { threwTail = e.message; }
  check("legacy save renders a dynamic tail without throwing", threwTail === null, threwTail || "");
  // A memory wiped by isLegacyMemory has neither affections nor kktMessages.
  let threwEmpty = null;
  try { buildDynamicTail({ history: [] }, members, ["irene"]); } catch (e) { threwEmpty = e.message; }
  check("wiped legacy memory renders a dynamic tail without throwing",
    threwEmpty === null, threwEmpty || "");

  // --- world JSON (v1.4.0 step 3) -----------------------------------------
  //
  // The world half of the old "group" concept, loaded the way the app loads it.
  // Nothing in src/ consumes this yet; these guard the data and the loader so
  // that when buildSystemPrompt does start reading it, a malformed world fails
  // here rather than as a blank prompt section nobody notices.
  const worlds = worldFor;   // loaded above, through loadWorld, off disk
  check("the world loads through loadWorld in all three languages",
    Object.values(worlds).every((w) => w && w.id === "kpop_idol"),
    JSON.stringify(Object.entries(worlds).map(([l, w]) => `${l}:${w?.id}`)));

  // form.identity and form.pace are STORED values, sitting in every save on
  // every device. Renaming one to something tidier blanks that player's
  // identity block silently. Plan §4.1 calls this the gpt4omini lesson.
  const SAVED_IDENTITY_IDS =
    ["练习生", "Staff", "韩娱艺人", "粉丝", "留学生", "财阀", "主线成员前女友"];
  const SAVED_PACE_IDS = ["慢热现实向", "浪漫情感向", "高压舆论向", "修罗海王向"];
  for (const lang of ["zh", "en", "ko"]) {
    const ids = worlds[lang].identities.map((i) => i.id);
    check(`[${lang}] the world declares every identity id that can sit in a save`,
      SAVED_IDENTITY_IDS.every((id) => ids.includes(id)),
      `missing: ${SAVED_IDENTITY_IDS.filter((id) => !ids.includes(id)).join(", ")}`);
    const pids = worlds[lang].paces.map((p) => p.id);
    check(`[${lang}] the world declares every pace id that can sit in a save`,
      SAVED_PACE_IDS.every((id) => pids.includes(id)),
      `missing: ${SAVED_PACE_IDS.filter((id) => !pids.includes(id)).join(", ")}`);
    check(`[${lang}] every identity carries a non-empty background`,
      worlds[lang].identities.every((i) => typeof i.background === "string" && i.background.length > 40),
      worlds[lang].identities.filter((i) => !(i.background?.length > 40)).map((i) => i.id).join(", "));
    check(`[${lang}] every pace carries a rule`,
      worlds[lang].paces.every((p) => typeof p.rule === "string" && p.rule.length > 20), "");
  }

  // "H" is the custom-identity escape hatch: the player types their own text,
  // so the world must NOT ship a background for it. One that existed would
  // silently override what they wrote.
  check("the world ships no background for the custom identity H",
    Object.values(worlds).every((w) => !w.identities.some((i) => i.id === "H")), "");

  // The address token table is the whole reason the extraction is per-world
  // rather than per-language. zh has no usable vocative particle — 呀 is an
  // existing Chinese sentence-final particle, so transliterating 야 imports the
  // wrong grammar (CLAUDE.md, "Korean address forms are transliterated").
  check("[zh] the world keeps no name-suffix vocative",
    worlds.zh.addressForms.tokens.ya === null,
    JSON.stringify(worlds.zh.addressForms.tokens));
  check("[en] the separator is a hyphen and tokens carry none of their own",
    worlds.en.addressForms.tokens.sep === "-"
      && !Object.entries(worlds.en.addressForms.tokens)
        .some(([k, v]) => k !== "sep" && typeof v === "string" && v.startsWith("-")),
    JSON.stringify(worlds.en.addressForms.tokens));
  check("[ko] the separator is a space and the forms are native",
    worlds.ko.addressForms.tokens.sep === " " && worlds.ko.addressForms.tokens.unnie === "언니",
    JSON.stringify(worlds.ko.addressForms.tokens));
  check("[zh] 씨 romanizes as xi, not ssi",
    worlds.zh.addressForms.tokens.ssi === "xi", worlds.zh.addressForms.tokens.ssi);

  // Blocks that are English rule text in every language file. Triplicating them
  // is what `public/worlds/<id>/<lang>.json` costs; this is what stops the three
  // copies drifting apart.
  const langIndependent = (w) => JSON.stringify([w.phases, w.npcArchetypes]);
  check("phases and npcArchetypes are identical across zh/en/ko",
    langIndependent(worlds.zh) === langIndependent(worlds.en)
      && langIndependent(worlds.en) === langIndependent(worlds.ko),
    "the three world files disagree on language-independent rule text");
  check("the world covers all four round phases",
    worlds.zh.phases.length === 4 && worlds.zh.phases[3].to === null,
    JSON.stringify(worlds.zh.phases.map((p) => `${p.from}-${p.to}`)));

  // --- background rendering: stable for one save, varied across saves -------
  const exGf = (seed, lang = "zh") =>
    loader.renderIdentityBackground(worlds[lang], "主线成员前女友", "Joy", seed);
  check("no rendered background leaves an unsubstituted placeholder",
    ["zh", "en", "ko"].every((l) => worlds[l].identities.every((i) =>
      !/\{(name|reason|keepsake)\}/.test(
        loader.renderIdentityBackground(worlds[l], i.id, "Joy", 12345)))),
    "a {placeholder} reached the prompt");
  check("the same seed renders the same backstory every time",
    exGf(0x811c9dc5) === exGf(0x811c9dc5),
    "this is the cache invariant: an unstable static prompt never hits");
  // Different seeds must actually reach different variants, or backstorySeed is
  // decorative and every playthrough shares one past.
  const variants = new Set();
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) variants.add(exGf(r + (k << 16)));
  check("the seed reaches all 16 reason x keepsake combinations",
    variants.size === 16, `${variants.size} distinct backstories from 16 seeds`);
  check("an identity with no variants renders identically for any seed",
    exGf(1, "en") !== exGf(2, "en")
      && loader.renderIdentityBackground(worlds.en, "留学生", "Joy", 1)
        === loader.renderIdentityBackground(worlds.en, "留学生", "Joy", 999),
    "");

  // --- the loader validates instead of silently dropping -------------------
  //
  // parseGroupConfig is a field whitelist and quietly dropped `birthday` for
  // two releases. parseWorld throws instead, so this asserts it actually does.
  const good = JSON.parse(readFileSync(
    join(ROOT, "public", "worlds", "kpop_idol", "zh.json"), "utf8"));
  for (const key of ["identities", "paces", "phases", "addressForms", "npcArchetypes"]) {
    const broken = { ...good };
    delete broken[key];
    let msg = null;
    try { loader.parseWorld(broken); } catch (e) { msg = e.message; }
    check(`parseWorld rejects a world missing "${key}"`,
      msg !== null && msg.includes(key), msg || "parsed without complaint");
  }
  for (const tok of ["unnie", "ya", "nim", "ssi", "sep"]) {
    const broken = JSON.parse(JSON.stringify(good));
    delete broken.addressForms.tokens[tok];
    let msg = null;
    try { loader.parseWorld(broken); } catch (e) { msg = e.message; }
    check(`parseWorld rejects a token table missing "${tok}"`,
      msg !== null && msg.includes(tok), msg || "parsed without complaint");
  }
  // `ya: null` is meaningful data, not a missing field — the zh table ships it.
  let nullYa = null;
  try { loader.parseWorld(good); } catch (e) { nullYa = e.message; }
  check("parseWorld accepts a null ya, which is a real value and not an absence",
    nullYa === null, nullYa || "");
}

// ==================================== LAYER J (offline, pure logic)
// The system prompt is ~5,500 tokens assembled from a dozen template literals,
// and Layer I asserts on perhaps forty substrings of it. Everything else - the
// JSON schema block, the phase rules, section ordering, blank lines - is
// unguarded, so a refactor could rewrite it and the suite would stay green. The
// symptom of that is not an error; it is slightly different writing some weeks
// later, with nothing to bisect.
//
// Two mechanisms here, and they catch different things:
//   1. Golden files - the whole prompt, byte-pinned. Catches what nobody
//      predicted. Cannot explain itself; it just shows a diff.
//   2. A determinism sweep over every identity x language. Catches output that
//      is not a pure function of the save, which no snapshot can detect because
//      a snapshot of unstable output is simply wrong.
async function layerJ() {
  section("LAYER J — golden system prompts + prompt determinism (offline)");
  const { FIXTURES, IDENTITIES, LANGUAGES, renderFixtures, goldenPath, loadPromptModules,
          withDiskFetch } = await import("./fixtures/prompts.mjs");

  // ------------------------------------------------------------ golden files
  const rendered = await renderFixtures(OUT);
  for (const { id, text } of rendered) {
    const path = goldenPath(id);
    if (!existsSync(path)) {
      check(`golden prompt exists: ${id}`, false,
        "no committed golden — run: node scripts/update-golden.mjs");
      continue;
    }
    const golden = readFileSync(path, "utf8");
    if (golden === text) { check(`golden prompt matches: ${id}`, true); continue; }

    // A CRLF golden differs from LF output on every single line while looking
    // character-identical in the report below. It happens when .gitattributes
    // is missing and git checks out with core.autocrlf=true (the default on
    // Windows), so it fails on a fresh clone there and passes on Linux CI.
    // Diagnose it by name rather than making someone stare at an invisible \r.
    if (golden.includes("\r\n") && golden.replace(/\r\n/g, "\n") === text) {
      check(`golden prompt matches: ${id}`, false,
        "golden has CRLF line endings, output has LF — git rewrote it on checkout. " +
        "Check that .gitattributes pins `test/fixtures/*.txt text eol=lf`, then re-checkout " +
        "the file. This is not a prompt change.");
      continue;
    }

    // A byte count says nothing useful; the first differing line is where to look.
    const a = golden.split("\n"), b = text.split("\n");
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    check(`golden prompt matches: ${id}`, false,
      `first difference at line ${i + 1} (${a.length} -> ${b.length} lines)\n` +
      `      golden: ${JSON.stringify((a[i] || "").slice(0, 90))}\n` +
      `      actual: ${JSON.stringify((b[i] || "").slice(0, 90))}\n` +
      `      If this change was intentional: node scripts/update-golden.mjs, then READ the diff.`);
  }
  check("every fixture has a committed golden",
    FIXTURES.every((f) => existsSync(goldenPath(f.id))),
    FIXTURES.filter((f) => !existsSync(goldenPath(f.id))).map((f) => f.id).join(", "));
  // A golden truncated to nothing would match a broken builder that returns "".
  check("golden prompts are full prompts, not stubs",
    rendered.every(({ id }) => readFileSync(goldenPath(id), "utf8").length > 5000),
    rendered.map(({ id }) => `${id}:${readFileSync(goldenPath(id), "utf8").length}`).join(" "));

  // --------------------------------------------------------- determinism
  // executeRound rebuilds the system prompt every round and the provider caches
  // it by prefix, so one character of drift costs all ~5,500 tokens. It must
  // also be stable across sessions, or a loaded save silently rewrites its own
  // backstory.
  //
  // This sweep is what fails against the pre-v1.3.9 code: 主线成员前女友 built
  // its background from two Math.random() calls, so it re-rolled every round —
  // full-price input forever, and a different shared past each round on the one
  // route that is entirely about a shared past.
  const mod = await loadPromptModules(OUT);
  const cfg = await withDiskFetch(() => mod.loadGroupConfig("red_velvet", "en"));
  const dWorld = {};
  for (const lang of LANGUAGES) {
    dWorld[lang] = await withDiskFetch(() => mod.loadWorld("kpop_idol", lang));
  }
  const dForm = (over = {}) => ({
    name: "Summer", age: "28", identity: "韩娱艺人", pace: "浪漫情感向",
    mainMember: "irene", subMembers: ["seulgi"], customIdentity: "childhood neighbour", ...over,
  });
  const dBuild = (form, lang) =>
    mod.buildSystemPrompt(form, cfg.members, "irene", ["seulgi"], cfg, "", "qwen", lang, dWorld[lang]);

  const drifted = [];
  for (const identity of IDENTITIES) {
    for (const lang of LANGUAGES) {
      const form = dForm({ identity });
      if (dBuild(form, lang) !== dBuild(form, lang)) drifted.push(`${identity}/${lang}`);
    }
  }
  check(`the same save renders a byte-identical prompt twice (${IDENTITIES.length}x${LANGUAGES.length} identities x languages)`,
    drifted.length === 0,
    `unstable: ${drifted.join(", ")} — something in buildSystemPrompt reads Math.random(), ` +
    `the clock, or an unordered collection`);

  // The ex-girlfriend route specifically, stated separately so a failure names
  // the bug rather than a grid coordinate.
  const ex = dForm({ identity: "主线成员前女友" });
  check("ex-girlfriend backstory is stable across rounds",
    dBuild(ex, "zh") === dBuild(ex, "zh") && dBuild(ex, "en") === dBuild(ex, "en"),
    "the breakup reason and keepsake are re-rolling — see backstorySeed in mainAgent.js");

  // Stability must not have been bought by pinning everyone to index 0: the
  // seed is supposed to give different playthroughs different backstories.
  const exLine = (form) => (dBuild(form, "en").split("\n")
    .find((l) => l.includes("breaking up years ago due to")) || "");
  const variants = new Set(["Summer", "Alex", "Hana", "Mika", "Rin", "Yuna", "Lea", "Noa"]
    .map((name) => exLine(dForm({ identity: "主线成员前女友", name }))));
  check("different playthroughs still get different backstories",
    variants.size > 1,
    `8 player names produced ${variants.size} distinct breakup reason(s) — a constant seed ` +
    `would make every save identical`);
  check("the backstory line is found at all (guards the check above)",
    exLine(ex).length > 0, "no 'breaking up years ago due to' line — the probe is looking at nothing");

  // Seeded from setup-time fields only, so the same save keeps its backstory
  // for life. If a field that changes mid-game ever entered the seed, this is
  // what would catch it.
  const sameSave = dForm({ identity: "主线成员前女友", name: "Summer", age: "28" });
  check("the seed depends only on fields fixed at character setup",
    exLine(sameSave) === exLine(dForm({ identity: "主线成员前女友", name: "Summer", age: "28" })) &&
    exLine(sameSave) !== exLine(dForm({ identity: "主线成员前女友", name: "Summer", age: "31" })),
    "age is part of the seed by design; a save cannot change it, but this proves the seed is read");
}

// ============================================================ LAYER K
// The usage meter and the cost estimate. Both exist to put a real number in
// front of a player running their own key, so the failure that matters is not a
// crash - it is a number that looks authoritative and is wrong.
async function layerK() {
  section("LAYER K — usage meter + cost estimate (offline)");
  const esb = await import("esbuild");
  const outfile = join(OUT, "usageMeter.mjs");
  await esb.build({
    stdin: {
      contents: [
        'export * from "./src/tools/usageMeter.js";',
        'export { estimateCallCostUsd, MODEL_PRICES_PER_1M, CNY_PER_USD } from "./src/config/modelConfigs.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
  });
  const m = await import("file://" + outfile.replace(/\\/g, "/") + "?t=" + Date.now());
  const { recordUsage, getUsageSummary, resetUsage, estimateCallCostUsd, MODEL_PRICES_PER_1M, CNY_PER_USD } = m;

  const withCache = (p, c, o) => ({
    prompt_tokens: p, completion_tokens: o, prompt_tokens_details: { cached_tokens: c },
  });
  const noCache = (p, o) => ({ prompt_tokens: p, completion_tokens: o });

  resetUsage();
  let u = getUsageSummary();
  check("a fresh session reports no calls", u.calls === 0);
  check("cache rate is null before anything is measured, not 0",
    u.cacheHitRate === null, "0% and 'not measured' look identical on screen and mean opposite things");

  resetUsage();
  recordUsage({ model: "gpt-6-luna", usage: withCache(8000, 7600, 800), latencyMs: 9000 });
  recordUsage({ model: "gpt-6-luna", usage: withCache(8000, 7600, 800), latencyMs: 11000 });
  u = getUsageSummary();
  eq("prompt tokens accumulate", u.promptTokens, 16000);
  eq("completion tokens accumulate", u.completionTokens, 1600);
  eq("total is input plus output", u.totalTokens, 17600);
  check("cache hit rate is cached over measured prompt tokens",
    Math.abs(u.cacheHitRate - 0.95) < 1e-9, `got ${u.cacheHitRate}`);
  eq("p50 latency over an even sample is the midpoint", u.p50LatencyMs, 10000);

  // The heart of it: twelve Aliyun route models send no cached_tokens field.
  // Folding their prompt tokens into the denominator would drag a working
  // cache toward 0% and make the panel lie about the architecture's main claim.
  resetUsage();
  recordUsage({ model: "gpt-6-luna", usage: withCache(1000, 900, 100), latencyMs: 5000 });
  recordUsage({ model: "qwen3.6-flash", usage: noCache(1000, 100), latencyMs: 5000 });
  u = getUsageSummary();
  check("a model reporting no cache data is excluded from the hit rate",
    Math.abs(u.cacheHitRate - 0.9) < 1e-9, `got ${u.cacheHitRate} — 0.45 means unreported was counted as a miss`);
  eq("...and is counted so the panel can say so", u.unmeasuredCalls, 1);
  eq("...while its tokens still count toward the total", u.promptTokens, 2000);

  // A reported zero is a measurement; an absent field is not. Averaging them
  // together would be inventing data.
  resetUsage();
  recordUsage({ model: "gpt-6-luna", usage: withCache(1000, 0, 100), latencyMs: 1 });
  check("a reported cached_tokens of 0 is a real 0%, not 'not reported'",
    getUsageSummary().cacheHitRate === 0);

  // Every call billed, including the ones the route walked past. That is the
  // reason the meter is a sink rather than a per-round return value.
  resetUsage();
  for (let i = 0; i < 4; i++) recordUsage({ model: "gpt-6-luna", usage: withCache(100, 0, 10), latencyMs: 1 });
  eq("retries and discarded attempts are all counted", getUsageSummary().calls, 4);

  // --- Cost -------------------------------------------------------------
  // gpt-6-luna is flat-priced: $0.01 / $0.10 / $0.50 per 1M.
  const c = estimateCallCostUsd("gpt-6-luna", { cachedTokens: 1e6, promptTokens: 1e6, completionTokens: 0 });
  check("a fully cached 1M-token prompt costs the cache-hit rate", Math.abs(c - 0.01) < 1e-12, `got ${c}`);
  const c2 = estimateCallCostUsd("gpt-6-luna", { cachedTokens: 0, promptTokens: 1e6, completionTokens: 1e6 });
  check("an uncached 1M in + 1M out costs input plus output",
    Math.abs(c2 - 0.60) < 1e-12, `got ${c2}`);
  check("prompt_tokens includes the cached ones and is not double-charged",
    estimateCallCostUsd("gpt-6-luna", { cachedTokens: 1e6, promptTokens: 1e6, completionTokens: 0 }) <
    estimateCallCostUsd("gpt-6-luna", { cachedTokens: 0, promptTokens: 1e6, completionTokens: 0 }));

  check("a model with no published price returns null, not 0",
    estimateCallCostUsd("qwen3.8-max", { promptTokens: 1e6 }) === null,
    "0 would render as free; null is what makes the panel say it does not know");
  check("an unknown model id returns null",
    estimateCallCostUsd("something-invented", { promptTokens: 1e6 }) === null);

  // Peak windows are applied at the moment of the call. DeepSeek Official
  // doubles 01:00-04:00 and 06:00-10:00 UTC on weekdays only.
  const args = { cachedTokens: 0, promptTokens: 1e6, completionTokens: 0 };
  const offPeak = estimateCallCostUsd("deepseek-flash", args, new Date(Date.UTC(2026, 8, 23, 20)));  // Wed 20:00
  const onPeak = estimateCallCostUsd("deepseek-flash", args, new Date(Date.UTC(2026, 8, 23, 7)));    // Wed 07:00
  const weekend = estimateCallCostUsd("deepseek-flash", args, new Date(Date.UTC(2026, 8, 26, 7)));   // Sat 07:00
  check("DeepSeek Official peak hours double the rate", Math.abs(onPeak - 2 * offPeak) < 1e-12);
  check("...and the weekend is never peak", Math.abs(weekend - offPeak) < 1e-12,
    "the published window is Mon-Fri");
  // Aliyun DeepSeek doubles 08:00-22:00 Beijing = 00:00-14:00 UTC, every day.
  const aOff = estimateCallCostUsd("deepseek-v4.1-flash", args, new Date(Date.UTC(2026, 8, 26, 18)));
  const aOn = estimateCallCostUsd("deepseek-v4.1-flash", args, new Date(Date.UTC(2026, 8, 26, 9)));
  check("Aliyun DeepSeek peak applies at the weekend too", Math.abs(aOn - 2 * aOff) < 1e-12);

  // A partial total that looks complete is worse than no total.
  resetUsage();
  recordUsage({ model: "gpt-6-luna", usage: withCache(1000, 0, 100), latencyMs: 1 });
  check("cost is marked complete while every model is priced", getUsageSummary().costComplete === true);
  recordUsage({ model: "qwen3.8-max", usage: withCache(1000, 0, 100), latencyMs: 1 });
  check("one unpriced model marks the whole session's cost incomplete",
    getUsageSummary().costComplete === false);
  check("...and the priced part is still counted", getUsageSummary().costUsd > 0);
  resetUsage();

  // --- Priced in the billed currency -----------------------------------
  // The one measurement this whole table is anchored to. A real DeepSeek
  // Official session (40 rounds, off-peak, 2026-09-24) billed CNY 0.20 for
  // exactly these tokens. Pricing it from the README's USD sheet instead read
  // 6.7% high, because DeepSeek's own USD sheet converts at CNY 6.67 = $1 and
  // this repo converts at 7.1 everywhere else. Without this check the bias is
  // invisible: every other assertion passes on internally consistent arithmetic.
  const BILL = { cachedTokens: 240000, promptTokens: 276862, completionTokens: 39696 };
  const offPeakUtc = new Date(Date.UTC(2026, 8, 24, 0));   // 01:00-03:00 Stockholm
  const measured = estimateCallCostUsd("deepseek-flash", BILL, offPeakUtc);
  const billedUsd = 0.20 / CNY_PER_USD;
  check("the measured DeepSeek bill reprices to within 2% of CNY 0.20",
    Math.abs(measured - billedUsd) / billedUsd < 0.02,
    `estimate $${measured.toFixed(4)} vs billed $${billedUsd.toFixed(4)} ` +
    `(${((measured / billedUsd - 1) * 100).toFixed(1)}% off) — the USD-sheet bug was +6.7%`);
  check("that session was genuinely off-peak (guards the check above)",
    measured < estimateCallCostUsd("deepseek-flash", BILL, new Date(Date.UTC(2026, 8, 24, 7))),
    "if the window moved, the assertion above is comparing the wrong rate");

  // CNY entries must actually be divided by the FX rate, not treated as USD.
  const cnyModel = estimateCallCostUsd("qwen3.8-flash", { cachedTokens: 0, promptTokens: 1e6, completionTokens: 0 });
  check("a CNY-priced model is converted, not read as USD",
    Math.abs(cnyModel - 0.8 / CNY_PER_USD) < 1e-12, `got ${cnyModel}, expected ${0.8 / CNY_PER_USD}`);
  check("...and a USD-priced model is not divided again",
    Math.abs(estimateCallCostUsd("gpt-6-luna", { cachedTokens: 0, promptTokens: 1e6, completionTokens: 0 }) - 0.10) < 1e-12);

  // Every price must be a real triple, or the arithmetic silently yields NaN.
  for (const [model, entry] of Object.entries(MODEL_PRICES_PER_1M)) {
    check(`${model}: declares the currency it is billed in`,
      entry.cur === "USD" || entry.cur === "CNY", `got ${JSON.stringify(entry.cur)}`);
    check(`${model}: price is [hit, miss, out], all finite and non-negative`,
      Array.isArray(entry.price) && entry.price.length === 3 &&
      entry.price.every(v => Number.isFinite(v) && v >= 0));
    check(`${model}: a cache hit is cheaper than a miss`,
      entry.price[0] < entry.price[1], "otherwise the cache is costing the player money");
  }

  // The panel is the only consumer, and it must not render a missing number as 0.
  const panel = readFileSync(join(ROOT, "src", "platforms", "UsagePanel.jsx"), "utf8");
  check("UsagePanel distinguishes an unreported cache rate from 0%",
    /cacheHitRate === null/.test(panel));
  for (const lang of ["zh", "en", "ko"]) {
    check(`UsagePanel has ${lang} strings`, new RegExp(`\\n  ${lang}: \\{`).test(panel));
  }
  // The meter is read at render time, so a stale import would show zeroes forever.
  const app = readFileSync(join(ROOT, "src", "App.jsx"), "utf8");
  check("the settings overlay mounts UsagePanel", /<UsagePanel\b/.test(app));
}

// ============================================================ LAYER L
// The live harness's prose graders, unit-tested offline.
//
// These had never been tested at all — only run live, where a grader that can
// never fire is indistinguishable from a clean run. Every case below is either
// prose a player actually reported or the correct form it must NOT flag, since
// 3 of the 4 live flags this project has ever seen were grader bugs.
async function layerL() {
  section("LAYER L — live-harness prose graders (offline)");
  const g = await import("./graders.mjs");

  const cast = {
    members: [
      { id: "irene", name: "Irene", name_kr: "裴珠泃" },
      { id: "seulgi", name: "Seulgi", name_kr: "姜涩琪" },
      { id: "yeri", name: "Yeri", name_kr: "金倭宏" },
    ],
    playerName: "林夏",
  };
  const none = (arr) => arr.length === 0;

  // --- narrated-honorific. Reported from hand play, v1.3.9.
  check("flags an honorific in narration",
    g.narratedHonorifics("你走进练习室，Irene欧尼正站在窗边。", cast, "zh")
      .includes("narrated-honorific:欧尼"),
    "this is the exact line that was reported");
  check("does NOT flag the same honorific inside dialogue",
    none(g.narratedHonorifics("“Irene欧尼，今天练到这么晚吗？”", cast, "zh")),
    "dialogue is where address forms belong — flagging it would invert the rule");
  check("does NOT flag a plain name in narration",
    none(g.narratedHonorifics("你走进练习室，Irene正站在窗边。", cast, "zh")),
    "this is the corrected form");
  check("flags narrated honorifics in en too",
    g.narratedHonorifics("Irene-unnie was standing by the window.", cast, "en").length > 0);
  check("does NOT flag en dialogue",
    none(g.narratedHonorifics('"Irene-unnie, still here?" you asked.', cast, "en")));
  // Mixed narration + dialogue in one round is the normal case, and the one
  // that produced a false positive on real-name-vocative in v1.3.7.
  check("narration after a closing quote is still read as narration",
    g.narratedHonorifics("“晚安。”你说。Irene欧尼点了点头。", cast, "zh").length > 0);
  check("dialogue before narration does not leak into it",
    none(g.narratedHonorifics("“Irene欧尼，晚安。”你说。她点了点头。", cast, "zh")));

  // --- name-ya-vocative. zh only; en/ko keep the form.
  check("flags a name+呀 vocative",
    g.nameYaVocative("“Irene呀，你来了，吃饭了吗？”", cast, "zh").length > 0,
    "the reported pattern: Korean ԏ is a vocative suffix, Chinese 呀 is sentence-final");
  check("does NOT flag standalone 呀 as an exclamation",
    none(g.nameYaVocative("“呀！Irene你真是胆子大了。”", cast, "zh")),
    "this is the correct Korean-flavoured use and must survive");
  check("does NOT flag 哎呀, an ordinary Chinese interjection",
    none(g.nameYaVocative("“哎呀，新人妹妹也在努力呢。”", cast, "zh")),
    "appeared in a real live round and is correct Chinese");
  check("does not apply to en, which has no competing 呀",
    none(g.nameYaVocative("Irene呀", cast, "en")));

  // --- the two pre-existing graders, never unit-tested until now.
  check("sinicized-honorific flags <name>姐 in zh",
    g.sinicizedHonorifics("Irene姐轻轻笑了。", cast, "zh").length > 0);
  check("...and does not flag the correct 欧尼",
    none(g.sinicizedHonorifics("Irene欧尼轻轻笑了。", cast, "zh")));
  check("...and does not flag an unrelated 姐姐 in narration",
    none(g.sinicizedHonorifics("走廊尽头有个陌生姐姐。", cast, "zh")),
    "anchored to a cast name, so ordinary prose is safe");
  check("real-name-vocative flags a legal name used to address someone",
    g.selfNameErrors("“裴珠泃，谢谢你的咖啡。”", cast).length > 0);
  check("...and does not flag a self-introduction",
    none(g.selfNameErrors("“我叫姜涩琪，请多指教。”", cast)),
    "the v1.3.7 false positive");
  check("...and does not flag a real name in narration",
    none(g.selfNameErrors("裴珠泃转过头来。", cast)),
    "narration may use real names freely");

  // The harness must actually call them, or the layer tests dead code.
  const harness = readFileSync(join(ROOT, "test", "playthrough.mjs"), "utf8");
  for (const fn of ["narratedHonorifics", "nameYaVocative", "sinicizedHonorifics", "selfNameErrors"]) {
    check(`playthrough.mjs calls ${fn}`, new RegExp(`bad\\.push\\(\\.\\.\\.${fn}\\(`).test(harness));
  }
}

// ============================================================ main
(async () => {
  console.log("\x1b[1mSmoke test — LLM client, error classifier, Aliyun router\x1b[0m");
  const modes = ["OFFLINE", LIVE && "LIVE", LIVE_FREE && "LIVE-FREE"].filter(Boolean).join(" + ");
  console.log(`mode: ${modes} · provider: ${MODEL_ID} · key: ${API_KEY ? "loaded" : "absent"}`);

  installMemoryStorage();

  let bundle;
  try { bundle = await buildBundle(); }
  catch (e) { console.error("\nesbuild bundle failed:\n", e.stderr?.toString() || e.message); process.exit(1); }

  const mod = await import("file://" + bundle.replace(/\\/g, "/"));
  const cfg = await import("file://" + join(ROOT, "src/config/modelConfigs.js").replace(/\\/g, "/"));
  const { MODEL_CONFIGS, ALIYUN_PAID_MODELS, ALIYUN_FREE_ROUTE } = cfg;

  await layerA(mod, MODEL_CONFIGS, ALIYUN_PAID_MODELS, cfg);
  await layerB(mod.callLLM, MODEL_CONFIGS, mod);
  layerC();
  await layerD();
  layerE(mod);
  await layerEi18n();
  await layerF(mod, ALIYUN_FREE_ROUTE);
  await layerG(mod, MODEL_CONFIGS);
  await layerH(mod, ALIYUN_FREE_ROUTE, cfg.getAliyunModelFamily);
  await layerI();
  await layerJ();
  await layerK();
  await layerL();

  console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32mALL PASS" : "\x1b[31mFAILURES"}\x1b[0m  ${pass} passed, ${fail} failed`);
  if (fail) { console.log("failed:\n  - " + failures.join("\n  - ")); process.exit(1); }
})();
