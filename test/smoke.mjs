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
//   I  offline  address protocol, KKT lock, edited stories, world + roster load
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

  // --- the save now records where its cast came from (v1.4.0 step 4) ---
  //
  // A slot carried the chosen member ids and nothing else, so loading a TWICE
  // save while Red Velvet was selected produced Red Velvet's config under
  // TWICE ids. Optional chaining all the way down meant no crash — just a
  // prompt whose main member was undefined.
  check("loadSave migrates the save before reading anything out of it",
    /migrateSave\(save, language/.test(loadSaveBody));
  check("loadSave sets the group the save was actually played with",
    /setSelectedGroup\(migrated\.groupId\)/.test(loadSaveBody),
    "without this a save loads under whichever group happened to be selected");
  check("loadSave resolves its cast through the roster, not a bare group load",
    /resolveRoster\(migrated\.roster/.test(loadSaveBody) && !/loadGroupConfig/.test(loadSaveBody));
  // The group effect reads phaseRef to decide whether to clear the chosen
  // members, and the effect mirroring phase into it has not run yet. Loading
  // from the cover page would still read "cover" and wipe the resolved cast.
  check("loadSave pins phaseRef before switching group, or the group effect clears the cast",
    loadSaveBody.indexOf('phaseRef.current = "game"') !== -1
      && loadSaveBody.indexOf('phaseRef.current = "game"') < loadSaveBody.indexOf("setSelectedGroup("),
    "phaseRef must be pinned first");
  // Identifying a pre-v1.4.0 save's cast means fetching the library, so the
  // load can fail. It must fail whole: a half-applied load leaves the player in
  // a game assembled out of two different saves.
  check("loadSave finishes every fallible step before it touches state",
    loadSaveBody.indexOf("await resolveRoster") < loadSaveBody.indexOf("setForm("));
  check("a save whose cast cannot be resolved aborts rather than half-loading",
    loadSaveBody.indexOf("showNotif(\"This save's cast could not be loaded\"")
      < loadSaveBody.indexOf("preRoundSnapshotRef.current = null"),
    "the failure path must return before the first setter");

  check("startNewGame records the roster it is starting",
    /setRoster\(\(pendingRoster && \{ \.\.\.pendingRoster, name: [\s\S]{0,80}\}\)\s*\r?\n?\s*\|\| buildClassicRoster\(/.test(app),
    "the builder's roster, named, or one composed from the form");
  // Two doors, and the builder's roster wins. Rebuilding it from the form would
  // throw away the NPC slots the player assigned and flatten a cross-group cast
  // into whichever single group happened to be selected. The order in that
  // expression IS the behaviour, so it is pinned rather than merely mentioned.
  check("a roster built by the builder is preferred over one composed from the form",
    app.indexOf("setRoster((pendingRoster &&") > 0
      && !/setRoster\(buildClassicRoster\([^)]*\) \|\| pendingRoster/.test(app),
    "pendingRoster must come first");
  // The name is applied at START, not held in pendingRoster: the effect that
  // resolves that roster depends on it, so folding it in would re-resolve the
  // whole cast on every keystroke.
  check("the cast name is applied when the game starts, not stored in the roster state",
    /name: castName\.trim\(\) \|\| DEFAULT_CAST_NAME/.test(app)
      && !/setPendingRoster\(\{ \.\.\.pendingRoster, name/.test(app),
    "re-resolving per keystroke would refetch every group in the cast");
  check("Setup lets the player name the cast, and shows the agency it derives",
    /t\.cast\.castName\b/.test(app) && /agencyFor\(castName/.test(app),
    "naming the agency is what stops the model inventing one");
  // The classic door must still be able to start: leaving a builder roster in
  // place would make a group pick silently resolve to the previous custom cast.
  check("choosing the classic door clears any roster the builder left behind",
    /setDoor\("classic"\); setPendingRoster\(null\);/.test(app),
    "otherwise startNewGame prefers a cast the player is no longer looking at");
  // Scoped to loadSave's own body: the same two calls appear in the builder's
  // onBack handler, so a whole-file match passed with the line deleted from
  // loadSave entirely.
  check("loading a save clears the builder's roster too",
    /setPendingRoster\(null\); setDoor\("classic"\);/.test(loadSaveBody),
    "a save carries its own roster and that one is authoritative");

// --- the two doors --------------------------------------------------------
  // Both end at Setup holding a roster, which is what keeps "one engine, two
  // doors" true: nothing downstream of resolveRoster knows which was used.
  check("the cover offers a second door into the roster builder",
    /setDoor\("custom"\)/.test(app) && /setPhase\("roster"\)/.test(app));
  // The builder's Generate button spends the player's key, so the key page has
  // to come first when there is none — §4.5 assumes the key already exists.
  check("the custom door routes through the key page when there is no key",
    /setDoor\("custom"\);[\s\S]{0,300}if \(apiKey\?\.trim\(\)\) setPhase\("roster"\); else setPhase\("keyInput"\);/.test(app),
    "cardGenerator runs on the key the player already entered");
  check("...and the key page then continues into the builder, not Setup",
    /door === "custom"\) setPhase\("roster"\)/.test(app));
  // The door is session state. A remembered "custom" would drop a returning
  // player into a builder they never asked for.
  check("the door is not persisted",
    !/saveToStorage\([^)]*door/.test(app) && !/rv_sim_door/.test(app));

  // The custom door must not have its cast overwritten by whichever group is
  // still selected from a previous classic run - two effects would otherwise
  // race for `members`.
  check("the group effect stands down while a builder roster is pending",
    /if \(pendingRoster\) \{[\s\S]{0,200}return;/.test(app),
    "otherwise loadGroupConfig overwrites the builder's cast at Setup");
  check("the builder's roster is resolved so Setup sees the same members shape",
    /resolveRoster\(pendingRoster, language\)/.test(app));
  // Deriving the form from the roster's own slots is what lets mainMember,
  // allTargetMembers, createInitialStats and the stats bar stay untouched.
  check("...and the form's main and subs are derived from the roster's slots",
    /setForm\(f => \(\{ \.\.\.f, mainMember: r\.mainId, subMembers: r\.subIds \}\)\)/.test(app),
    "everything downstream reads the form, so the form has to agree with the builder");
  // A roster that cannot be resolved must say so rather than fall back to a
  // default cast: loadGroupIndex's catch returning a hardcoded Red Velvet entry
  // is what hid the v1.3.5 path bug for a whole release.
  check("a builder roster that cannot be resolved aborts to the cover with a notice",
    /roster resolve failed/.test(app) && /setPendingRoster\(null\);\s*\n?\s*setPhase\("cover"\)/.test(app),
    "never fall back to a cast the player did not choose");
  // Setup asks only what the builder did not: identity, name, birth year, pace.
  check("Setup hides the member pickers when the builder already chose the cast",
    /\{pendingRoster \? \(/.test(app) && /t\.cast\.changeCast/.test(app),
    "asking twice is what makes that page long");
  check("...and Back from Setup returns to the builder, not the cover",
    /setPhase\(pendingRoster \? "roster" : "cover"\)/.test(app),
    "dropping the player at the cover discards a cast they spent time on");
  // NPC identity comes from the roster now. getNpcMembers stays in groupLoader
  // as the anchor smoke measures migration against, but App derives nothing.
  // A call or an import, not any mention: the comment explaining why the
  // derivation is gone names the function, and a check that cannot tell those
  // apart fails on its own documentation.
  check("App derives no NPC list of its own",
    !/getNpcMembers\s*\(/.test(app) && !/import \{[^}]*getNpcMembers/.test(app),
    "the roster names NPCs; deriving them again is a second source of truth");


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

  // Setup collects the birth year itself. Age is one lossy step from the only
  // number the address protocol compares, and the loss is ~50/50 by
  // construction — see the note above playerBirthYear in mainAgent.js.
  check("setup collects a birth year, not an age",
    /placeholder=\{language === "zh" \? "出生年份"/.test(app) && !/\? "年龄"/.test(app));
  check("the start gate requires a plausible birth year",
    /canStart = [^\n]*validBirthYear\(form\.birthYear\)/.test(app),
    "a bare truthiness test would accept the year 12");
  // The seed that fixes an identity backstory for the life of a save hashes
  // form.age, so setup must keep writing it. Dropping the field would re-roll
  // every ex-girlfriend backstory, which is the bug v1.3.9 closed.
  check("setup still writes the frozen `age` the backstory seed hashes",
    /setBirthYear = \(v\) => setForm\([\s\S]{0,200}age: validBirthYear\(v\)/.test(app));

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

  // What a new slot records. saveMigrator backfills these for older saves, but
  // a slot written today must not need migrating at all.
  for (const field of ["schema", "groupId", "worldId", "roster"]) {
    check(`a new save slot records ${field}`,
      new RegExp(`(^|[\\s,{])${field}[,:]`, "m").test(saveBody),
      "a save that does not say which cast it used has to guess on load");
  }

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
  section("LAYER I — address protocol, KKT lock, edited stories, world + roster + save migration, custom cast (offline)");
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
        'export * from "./src/rag/rosterResolver.js";',
        'export * from "./src/rag/saveMigrator.js";',
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

  // `habit` (step 5), `speech_style` (step 6) and `tags` (v1.4.2) go on the
  // whitelist before any group JSON declares them, so the content arrives
  // working instead of arriving silently dropped — precisely what happened to
  // `birthday`.
  check("the whitelist carries habit, speech_style and tags through parseGroupConfig",
    members.every((m) => typeof m.habit === "string"
      && typeof m.speech_style === "string" && Array.isArray(m.tags)),
    JSON.stringify(members.map((m) =>
      `${m.name}:${typeof m.habit}/${typeof m.speech_style}/${Array.isArray(m.tags)}`)));
  // Served through a stub rather than read from a file ON PURPOSE, even now
  // that every group JSON declares a habit. This asserts the field survives
  // parseGroupConfig for an ARBITRARY value, independently of what the library
  // happens to contain — which is the check that would have caught the
  // birthday bug. The content sweep below is the separate question.
  const withHabit = await (async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const p = join(ROOT, "public", String(url).replace(/^\//, ""));
      if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
      const doc = JSON.parse(readFileSync(p, "utf8"));
      if (doc.members?.[0]) {
        doc.members[0].habit = "hums when concentrating";
        doc.members[0].tags = ["dancer", "leader"];
      }
      return { ok: true, status: 200, json: async () => doc };
    };
    try { return await loader.loadGroupConfig("red_velvet", "en"); }
    finally { globalThis.fetch = real; }
  })();
  check("a habit declared in group JSON reaches the parsed member",
    withHabit.members[0].habit === "hums when concentrating"
      && JSON.stringify(withHabit.members[0].tags) === JSON.stringify(["dancer", "leader"]),
    `habit=${withHabit.members[0].habit} tags=${JSON.stringify(withHabit.members[0].tags)}`);

  // --- step 5 content: habit across the whole library -----------------------
  // Swept through loadGroupConfig in all three languages, never by reading the
  // JSON. A fixture read off disk tests the formatter, not the feature.
  // These are aggregate checks that NAME their offenders, rather than one
  // check per member: 57 members x 3 languages would bury the suite.
  const LIB_LANGS = ["zh", "en", "ko"];
  const index = await fromDisk(() => loader.loadGroupIndex());
  check("the group index lists the whole library, not the Red Velvet fallback",
    index.length >= 9, `${index.length} groups — a short index means the fetch stub missed`);

  const library = {};
  for (const g of index) {
    library[g.id] = {};
    for (const lang of LIB_LANGS) {
      library[g.id][lang] = (await fromDisk(() => loader.loadGroupConfig(g.id, lang))).members;
    }
  }
  const everyMember = [];
  for (const [gid, langs] of Object.entries(library))
    for (const [lang, ms] of Object.entries(langs))
      for (const m of ms) everyMember.push({ gid, lang, ...m });

  const noHabit = everyMember.filter((m) => !m.habit || !m.habit.trim());
  check("every member in every group reaches the prompt with a habit",
    noHabit.length === 0,
    noHabit.map((m) => `${m.gid}/${m.lang}:${m.id}`).join(", ") || `${everyMember.length} checked`);

  // A habit renders as ONE line in the member profile block. A newline would
  // split it in two and silently reshape the section for that cast only.
  const multiline = everyMember.filter((m) => /[\r\n]/.test(m.habit || ""));
  check("no habit carries a line break",
    multiline.length === 0, multiline.map((m) => `${m.gid}/${m.lang}:${m.id}`).join(", "));

  // The three language files are authored together; a member present in one
  // and absent from another means a file was edited alone.
  const idSetMismatch = Object.entries(library).filter(([, langs]) => {
    const [a, b, c] = LIB_LANGS.map((l) => langs[l].map((m) => m.id).join(","));
    return !(a === b && b === c);
  });
  check("the three language files of a group agree on its member ids",
    idSetMismatch.length === 0, idSetMismatch.map(([g]) => g).join(", "));

  // Member ids are NOT unique across the library — `x` is a crossover roster
  // sharing seven of them (the finding that reshaped step 4's group scan). A
  // habit is a physical tic and belongs to the PERSON, so the shared ids must
  // agree; disagreement means one file was edited and its twin forgotten.
  const crossover = [];
  for (const lang of LIB_LANGS) {
    const seen = {};
    for (const m of everyMember.filter((e) => e.lang === lang)) (seen[m.id] ||= []).push(m);
    for (const [id, ms] of Object.entries(seen)) {
      if (ms.length < 2) continue;
      if (new Set(ms.map((m) => m.habit)).size !== 1)
        crossover.push(`${lang}:${id} (${ms.map((m) => m.gid).join("+")})`);
    }
  }
  check("a member in two groups carries the same habit in both",
    crossover.length === 0, crossover.join(", "));

  // Within one cast the habits are what make members distinguishable in a
  // scene. Two identical ones is a copy-paste that reads as a real profile.
  const dupes = [];
  for (const [gid, langs] of Object.entries(library))
    for (const lang of LIB_LANGS) {
      const hs = langs[lang].map((m) => m.habit);
      if (new Set(hs).size !== hs.length) dupes.push(`${gid}/${lang}`);
    }
  check("no two members of one cast share a habit",
    dupes.length === 0, dupes.join(", "));
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

  // --- birth year is collected, not derived (v1.4.0 step 4).
  //
  // Through v1.3.9 the player's birth year was GAME_YEAR - age, which assumes
  // her birthday has already passed this year and is therefore wrong for about
  // half of all players. The reported case is pinned here exactly: born
  // 1999-11-19, entering age 26, which derives 2000 and makes Yeri (b.1999) her
  // senior when the two are peers. The age it is given contradicts the birth
  // year on purpose — only an implementation that reads the birth year passes.
  const contradicting = prompt(form({ birthYear: "1999", age: "26" }));
  const yeriContra = addressOfIn(contradicting, "Yeri");
  check("the player's own birth year decides seniority, not one derived from her age",
    /same birth year as Summer/.test(yeriContra), yeriContra);
  // The ageLine for a peer says "no unnie in either direction", so the word
  // itself is present and cannot be the test. What must be absent is an
  // address FORM — `-unnie"` — and the senior marking that produced it.
  check("...so a same-year member is offered no unnie form, in either direction",
    !/-unnie"/.test(yeriContra) && !/OLDER than Summer/.test(yeriContra), yeriContra);
  check("the age in the prompt is rendered from the birth year, not read from the form",
    prompt(form({ birthYear: "1996", age: "99" })).includes("age 30, born 1996"),
    "the form's age is a frozen setup token; birth year is the live value");

  // Migration safety, in miniature. saveMigrator writes birthYear as
  // GAME_YEAR - age for every save written before v1.4.0, so a legacy save must
  // build the prompt it already had, byte for byte — otherwise every player in
  // flight has their honorifics move under them on the next round.
  check("a legacy form migrated to a birth year builds a byte-identical prompt",
    prompt(form({ birthYear: "1995" })) === prompt(form()),
    "age 31 in GAME_YEAR 2026 is b.1995; migration must reproduce it exactly");

  // backstorySeed hashes form.age, and only form.age, so that a birth year
  // arriving at migration cannot re-roll an identity background mid-save —
  // which is the v1.3.9 bug wearing a different hat. Seniority lines are
  // stripped because those are supposed to move with the birth year; nothing
  // else may.
  const stripSeniority = (s) => s.split("\n")
    .filter((l) => !/^ {2}(Age|Address): /.test(l)).join("\n")
    .replace(/age \d+, born \d{4}/, "");
  check("a birth year cannot re-roll the identity backstory",
    stripSeniority(prompt(form({ identity: "主线成员前女友", birthYear: "1990" })))
    === stripSeniority(prompt(form({ identity: "主线成员前女友", birthYear: "2000" }))),
    "the backstory seed moved with the birth year");

  // --- step 5: the habit renders, and its ABSENCE renders nothing ----------
  // The member profile section only, so an unrelated block cannot mask or
  // trip these.
  // Cut back to the start of the NEXT banner box, not to its title: slicing at
  // "6. CAST IDENTITY" ends mid-border and leaves a dangling "║ " that the
  // trailing-whitespace guard below correctly reads as a violation.
  const profilesOf = (text) => text.slice(
    text.indexOf("5. MEMBER PROFILES"),
    text.lastIndexOf("╔", text.indexOf("6. CAST IDENTITY")));
  const ireneHabit = members.find((m) => m.id === "irene").habit;
  check("a member's habit reaches the member profile block",
    profilesOf(p).includes(`\n  Habit: ${ireneHabit}`), addressOfIn(p, "Irene"));
  check("every member of the cast carries exactly one Habit line",
    (profilesOf(p).match(/^ {2}Habit: /gm) || []).length === members.length,
    `${(profilesOf(p).match(/^ {2}Habit: /gm) || []).length} lines / ${members.length} members`);
  // Placement is meaning here: Habit is the staging handle for the three prose
  // fields, not a fourth differentiator sitting among them.
  check("Habit renders below Queer Texture",
    /\n {2}Queer Texture: [^\n]*\n {2}Habit: /.test(profilesOf(p)));

  // A member with no habit must render NOTHING — not `  Habit: ` with a
  // trailing space, which no reviewer sees and which costs the whole cached
  // prefix. Custom members (step 6) are exactly this case.
  const strippedMembers = members.map(({ habit, ...rest }) => rest);
  const noHabitPrompt = buildSystemPrompt(
    form(), strippedMembers, "irene", ["yeri"], GROUP, "", "qwen", "en", worldFor.en);
  check("a member with no habit renders no Habit line at all",
    !/Habit:/.test(noHabitPrompt), profilesOf(noHabitPrompt).slice(0, 300));
  const trailing = profilesOf(noHabitPrompt).split("\n").filter((l) => /[ \t]$/.test(l));
  check("...and leaves no trailing whitespace where the line would have been",
    trailing.length === 0, JSON.stringify(trailing.slice(0, 3)));
  // One habit missing from a cast must not disturb the members around it.
  const oneMissing = buildSystemPrompt(
    form(), members.map((m) => (m.id === "yeri" ? { ...m, habit: "" } : m)),
    "irene", ["yeri"], GROUP, "", "qwen", "en", worldFor.en);
  check("one habit-less member does not disturb the rest of the cast",
    (profilesOf(oneMissing).match(/^ {2}Habit: /gm) || []).length === members.length - 1
      && profilesOf(oneMissing).includes(`\n  Habit: ${ireneHabit}`),
    profilesOf(oneMissing).split("\n").filter((l) => /[ \t]$/.test(l)).join("|"));

  // --- step 6: a member built from the REQUIRED tier alone -------------------
  // docs/V140_PLAN.md §4.4 requires exactly three fields of a custom member:
  // name, birthday, private_personality. Everything else is optional, so the
  // prompt has to survive a profile that has nothing else — and this is the
  // branch NO golden fixture can contain, because all 175 library member
  // records are complete. Before step 6 this rendered four defects in one
  // block: `undefined` for emoji and animal, and a trailing space after
  // `Public:` and `Queer Texture:`.
  const ireneMember = members.find((m) => m.id === "irene");
  const REQUIRED_TIER = {
    id: "c_req", name: "Lin Xia", birthday: "1999-04-02",
    private_personality: "expresses affection by quietly fixing things",
  };
  const bare = buildSystemPrompt(
    form(), [ireneMember, REQUIRED_TIER], "irene", ["c_req"], GROUP, "", "qwen", "en", worldFor.en);
  const bareBlock = profilesOf(bare).split("\n\n").find((b) => b.includes("Lin Xia")) || "";
  check("a required-tier member renders no trailing whitespace",
    profilesOf(bare).split("\n").filter((l) => /[ \t]$/.test(l)).length === 0,
    JSON.stringify(profilesOf(bare).split("\n").filter((l) => /[ \t]$/.test(l)).slice(0, 4)));
  // Anywhere in the prompt, not just her block: an absent field reaching any
  // other section as the literal string is the same defect wearing a hat.
  check("...and puts the literal string undefined nowhere in the prompt",
    !bare.includes("undefined"),
    bare.split("\n").filter((l) => l.includes("undefined")).slice(0, 3).join(" | "));
  check("...and renders only the lines she actually has",
    bareBlock.split("\n").length === 4
      && /^Lin Xia \[SUB - Romanceable\]$/.test(bareBlock.split("\n")[0])
      && bareBlock.includes("\n  Private: expresses affection"),
    JSON.stringify(bareBlock));
  // The header degrades in two independent places, so check them apart: no
  // emoji must not leave a leading space, and no name_kr must not leave `()`.
  const headerOf = (m) => {
    const pr = buildSystemPrompt(
      form(), [ireneMember, m], "irene", [m.id], GROUP, "", "qwen", "en", worldFor.en);
    return (profilesOf(pr).split("\n\n").find((b) => b.includes(m.name)) || "").split("\n")[0];
  };
  check("no emoji leaves no leading space on the header",
    headerOf({ ...REQUIRED_TIER, name_kr: "林夏" }) === "Lin Xia(林夏) [SUB - Romanceable]",
    headerOf({ ...REQUIRED_TIER, name_kr: "林夏" }));
  check("no name_kr leaves no empty parentheses on the header",
    headerOf({ ...REQUIRED_TIER, emoji: "🎻" }) === "🎻 Lin Xia [SUB - Romanceable]",
    headerOf({ ...REQUIRED_TIER, emoji: "🎻" }));

  // Every optional field, one at a time, over the WHOLE cast: dropping it must
  // remove its label and leave no trailing whitespace behind. Parametric on
  // purpose — a field added to the profile block later is covered only if it is
  // added to this list, and the list is short enough to keep honest.
  const OPTIONAL_LINES = [
    ["animal_plastic", "Animal"], ["public_image", "Public"],
    ["private_personality", "Private"], ["queer_texture", "Queer Texture"],
    ["speech_style", "Speech Style"], ["habit", "Habit"],
    ["hidden_conflict", "Hidden Conflict"],
  ];
  const strippedOffenders = [];
  for (const [field, label] of OPTIONAL_LINES) {
    // "" and undefined must behave identically: an empty string produces the
    // same trailing space as a missing key, and the editor will write both.
    for (const empty of ["", undefined]) {
      const pr = buildSystemPrompt(
        form(), members.map((m) => ({ ...m, [field]: empty })),
        "irene", ["yeri"], GROUP, "", "qwen", "en", worldFor.en);
      const block = profilesOf(pr);
      if (block.includes(`  ${label}: `)) strippedOffenders.push(`${field}:label-remains`);
      if (block.split("\n").some((l) => /[ \t]$/.test(l))) strippedOffenders.push(`${field}:trailing`);
      if (pr.includes("undefined")) strippedOffenders.push(`${field}:undefined`);
    }
  }
  check("every optional profile line vanishes cleanly when empty or absent",
    strippedOffenders.length === 0, strippedOffenders.slice(0, 6).join(", "));

  // speech_style is on the whitelist ahead of any group JSON declaring it, so
  // nothing else proves it can render at all.
  const withSpeech = buildSystemPrompt(
    form(), members.map((m) => (m.id === "irene" ? { ...m, speech_style: "clipped, trails off" } : m)),
    "irene", ["yeri"], GROUP, "", "qwen", "en", worldFor.en);
  check("a speech_style renders below Queer Texture and above Habit",
    /\n {2}Queer Texture: [^\n]*\n {2}Speech Style: clipped, trails off\n {2}Habit: /
      .test(profilesOf(withSpeech)),
    (profilesOf(withSpeech).match(/^ {2}(Queer Texture|Speech Style|Habit): .*/gm) || [])
      .slice(0, 3).join(" / "));

  // The real path: a custom entry is snapshotted inline by resolveRoster and so
  // NEVER passes through parseGroupConfig, which is where the `|| ""` defaults
  // live. Hand-built members above cannot prove that, and per the v1.3.7 lesson
  // a check that skips the loader tests the formatter rather than the feature.
  const customRoster = {
    worldId: "kpop_idol", groupId: "red_velvet",
    entries: [
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "main" },
      { src: "custom", memberId: "c_req", slot: "sub", lang: "en", profile: REQUIRED_TIER },
    ],
  };
  const resolvedCustom = await fromDisk(() => loader.resolveRoster(customRoster, "en"));
  check("resolveRoster carries a custom member through beside a library one",
    resolvedCustom.members.map((m) => m.id).join(",") === "irene,c_req"
      && resolvedCustom.mainId === "irene" && resolvedCustom.subIds.join() === "c_req",
    JSON.stringify(resolvedCustom.members.map((m) => m.id)));
  const resolvedPrompt = buildSystemPrompt(
    form(), resolvedCustom.members, resolvedCustom.mainId, resolvedCustom.subIds,
    resolvedCustom.groupConfig, "", "qwen", "en", worldFor.en);
  check("a roster-resolved custom member reaches the prompt with no defect",
    !resolvedPrompt.includes("undefined")
      && profilesOf(resolvedPrompt).split("\n").every((l) => !/[ \t]$/.test(l)),
    profilesOf(resolvedPrompt).split("\n")
      .filter((l) => /[ \t]$/.test(l) || l.includes("undefined")).slice(0, 4).join(" | "));

  // --- a Kakao written into the story as well as delivered ------------------
  // The prohibition used to live ONLY inside the LOCKED-channel bullet, which
  // reads as permission for an unlocked member — specification by contrast.
  // That bullet landed in v1.3.6, which is when a rare bug became a regular
  // one. The rule is now unconditional and stated before the locked case.
  check("the story is forbidden a Kakao transcript for EVERY member, not just locked ones",
    /KKT IS DELIVERED BY THE APP, NEVER BY THE STORY/.test(p)
      && /for EVERY member, the unlocked ones included/.test(p),
    "the rule must not be reachable only through the LOCKED branch");
  check("the locked-channel bullet no longer carries the story prohibition alone",
    !/A LOCKED member[^\n]*the story MUST NOT mention/.test(p),
    "scoping it to LOCKED is what implied unlocked members may be narrated");
  const kktRuleAt = p.indexOf("KKT IS DELIVERED BY THE APP");
  check("the universal rule is stated before the locked exception",
    kktRuleAt !== -1 && kktRuleAt < p.indexOf("KKT IS A LOCKED CHANNEL"));
  check("the story-generation rules name the Kakao transcript too",
    /NO SOCIAL MEDIA IN STORY[^\n]*Kakao transcript/.test(p));

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

  // --- roster resolver (v1.4.0 step 3) ------------------------------------
  //
  // The classic path is not a separate code path from the roster builder; it
  // builds a roster implicitly. That claim is only worth anything if resolving
  // one reproduces today's cast exactly, so this proves it against the real
  // group config rather than against a fixture.
  const rvCfg = await fromDisk(() => loader.loadGroupConfig("red_velvet", "en"));
  const allIds = rvCfg.members.map((m) => m.id);
  const classic = loader.buildClassicRoster("red_velvet", "irene", ["yeri"], allIds);
  const resolved = await fromDisk(() => loader.resolveRoster(classic, "en"));

  check("a classic roster resolves to the same cast, in the same order",
    JSON.stringify(resolved.members.map((m) => m.id)) === JSON.stringify(allIds),
    `${JSON.stringify(resolved.members.map((m) => m.id))} vs ${JSON.stringify(allIds)}`);
  check("a classic roster resolves to members field-for-field identical",
    JSON.stringify(resolved.members) === JSON.stringify(rvCfg.members),
    "resolveRoster changed a member the prompt reads");
  check("the resolver reports the same slots the classic path implies",
    resolved.mainId === "irene"
      && JSON.stringify(resolved.subIds) === JSON.stringify(["yeri"])
      && JSON.stringify(resolved.npcIds.sort())
        === JSON.stringify(allIds.filter((i) => i !== "irene" && i !== "yeri").sort()),
    `main=${resolved.mainId} subs=${resolved.subIds} npcs=${resolved.npcIds}`);
  check("the resolver returns the group config the lore comes from",
    resolved.groupConfig?.group?.name === rvCfg.group.name,
    String(resolved.groupConfig?.group?.name));

  // The one that matters: same prompt, byte for byte, whichever door was used.
  check("a prompt built from a resolved roster is byte-identical to today's",
    buildSystemPrompt(form(), resolved.members, resolved.mainId, resolved.subIds,
      resolved.groupConfig, "", "qwen", "en", worldFor.en)
    === buildSystemPrompt(form(), rvCfg.members, "irene", ["yeri"],
      rvCfg, "", "qwen", "en", worldFor.en),
    "the roster path and the classic path disagree");

  // getNpcMembers derives NPCs as "everyone not chosen"; a roster names them.
  // Both must agree for the classic case, or step 4's migration has no anchor.
  check("explicit NPCs match what getNpcMembers derives today",
    JSON.stringify(resolved.npcIds.sort())
      === JSON.stringify(loader.getNpcMembers(rvCfg.members, "irene", ["yeri"])
        .map((m) => m.id).sort()),
    "the roster and the derived NPC list disagree");

  // Cross-group rosters are the reason the resolver exists; it must fetch each
  // group once and keep roster order rather than group order.
  const cross = {
    worldId: "kpop_idol",
    entries: [
      { src: "library", groupId: "twice", memberId: "nayeon", slot: "main" },
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "sub" },
      { src: "custom", memberId: "c_1", slot: "npc",
        profile: { name: "Mina K", emoji: "🎧", birthday: "1997-03-02" } },
    ],
  };
  const xr = await fromDisk(() => loader.resolveRoster(cross, "en"));
  check("a cross-group roster resolves in roster order",
    JSON.stringify(xr.members.map((m) => m.id)) === JSON.stringify(["nayeon", "irene", "c_1"]),
    JSON.stringify(xr.members.map((m) => m.id)));
  check("a custom member is snapshotted inline, not looked up",
    xr.members[2].name === "Mina K" && xr.members[2].id === "c_1", "");
  // --- REGRESSION: a cross-group cast was described as the main member's group -
  // Reported from phone play. Jisoo (BLACKPINK) as main, Irene (Red Velvet) and a
  // custom member as subs, Mina and Sana (TWICE) as NPCs. Round 1 put Jennie, Rose
  // and Lisa in the story and set the company to YG.
  //
  // This guard used to assert the OLD behaviour — that the lore follows the main
  // member's group — which is precisely the bug. Section 4 handed over
  // "[BLACKPINK Background]" plus full prose for all four BLACKPINK members, three
  // of whom were not in the roster, contradicting section 6's rule two sections
  // earlier and with richer detail. "YG" was in no file: the model inferred the
  // agency from being told the cast was BLACKPINK.
  const xLore = xr.groupConfig.groupLore;
  check("a cross-group cast is not described as the main member's group",
    !/TWICE is a \d+-member group/.test(xLore) && !xLore.includes("[TWICE Background]"),
    xLore.split("\n")[0]);
  // The origin groups are not named at all. Naming them is the leak: the model
  // completes a group it has been told about.
  check("...and the origin groups are never named",
    !/TWICE/.test(xLore) && !/Red Velvet/.test(xLore),
    xLore.split("\n").filter((l) => /TWICE|Red Velvet/.test(l)).join(" | "));
  // No member outside the roster may be mentioned. nayeon's TWICE bandmates are
  // the ones that would leak.
  const outsiders = ["Momo", "Sana", "Jeongyeon", "Jihyo", "Seulgi", "Wendy", "Joy", "Yeri"];
  check("...and no member outside the roster appears in the lore",
    outsiders.every((n) => !xLore.includes(n)),
    outsiders.filter((n) => xLore.includes(n)).join(", "));
  check("...while every member who IS in the roster does",
    ["Nayeon", "Irene", "Mina K"].every((n) => xLore.includes(n)),
    xLore);
  // The cast is presented as a group in its own right, with a named agency — the
  // setting's machinery (secrecy, dorms, schedules, phase beats) is all group
  // machinery, and a named agency is what stops one being invented.
  check("a cross-group cast is presented as its own group, under a named agency",
    xLore.includes("[X Background]") && xLore.includes("X Entertainment")
      && /X is a 3-member group/.test(xLore),
    xLore.split("\n").slice(0, 2).join(" / "));
  check("...and the exclusion is stated in the lore itself, not left to section 6",
    /ONLY the members listed in MEMBER PROFILES/.test(xLore),
    "section 4 was contradicting section 6, so section 4 has to carry the rule too");
  check("the cast's display name follows its lore",
    xr.groupConfig.group.name === "X", String(xr.groupConfig.group.name));

  // A player-supplied name replaces the default everywhere, agency included.
  const named = await fromDisk(() => loader.resolveRoster({ ...cross, name: "Aurora" }, "en"));
  check("a named cast uses that name for the group and derives the agency from it",
    named.groupConfig.groupLore.includes("[Aurora Background]")
      && named.groupConfig.groupLore.includes("Aurora Entertainment")
      && named.groupConfig.group.name === "Aurora",
    named.groupConfig.groupLore.split("\n").slice(0, 2).join(" / "));

  // A SUBSET of one group is still that group — but the exclusion has to be said,
  // or "BLACKPINK is a 4-member group" while naming one member invites the model
  // to supply the other three itself. Same leak, quieter.
  const subset = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "main" },
      { src: "library", groupId: "red_velvet", memberId: "yeri", slot: "sub" },
    ],
  }, "en"));
  const sLore = subset.groupConfig.groupLore;
  check("a subset of one group keeps that group's name",
    sLore.includes("[Red Velvet Background]") && subset.groupConfig.group.name === "Red Velvet",
    sLore.split("\n")[0]);
  check("...and names only the members who are in it",
    sLore.includes("Irene") && sLore.includes("Yeri")
      && !sLore.includes("Seulgi") && !sLore.includes("Wendy") && !sLore.includes("Joy"),
    sLore.split("\n").filter((l) => /Seulgi|Wendy|Joy/.test(l)).join(" | "));
  check("...and says out loud that nobody else exists",
    /ONLY these members of Red Velvet exist in this story/.test(sLore),
    sLore.split("\n")[2]);

  // An all-custom cast has no group config at all. buildSystemPrompt reads
  // groupConfig.groupLore unconditionally, so this threw a TypeError before the
  // first round — and it is reachable, because a custom member can be the main.
  const allCustom = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [{ src: "custom", memberId: "c_9", slot: "main", lang: "en",
      profile: { name: "Li Fei", birthday: "1999-01-01", private_personality: "quiet" } }],
  }, "en"));
  check("an all-custom cast resolves instead of throwing",
    allCustom.groupConfig !== null && typeof allCustom.groupConfig.groupLore === "string"
      && allCustom.groupConfig.groupLore.includes("Li Fei"),
    JSON.stringify(allCustom.groupConfig?.group));

  // An override edits the copy, never the library.
  const overridden = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [{ src: "library", groupId: "red_velvet", memberId: "irene",
      slot: "main", override: { public_image: "REWRITTEN" } }],
  }, "en"));
  check("an override applies to the resolved member",
    overridden.members[0].public_image === "REWRITTEN", "");

  // Reloading through loadGroupConfig would re-fetch and could never catch a
  // write-through, so this asks the question inside ONE resolve: name the same
  // library member twice, override only the first. An implementation that
  // Object.assign'd onto the shared config object would change both.
  const aliasing = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [
      { src: "library", groupId: "red_velvet", memberId: "irene",
        slot: "main", override: { public_image: "REWRITTEN" } },
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "npc" },
    ],
  }, "en"));
  check("an override copies rather than writing through to the library",
    aliasing.members[0].public_image === "REWRITTEN"
      && aliasing.members[1].public_image !== "REWRITTEN",
    `second copy reads: ${aliasing.members[1]?.public_image}`);

  // A roster naming a member the group no longer has must shrink the cast, not
  // insert a nameless one — a blank profile reaches the prompt as a real member.
  const ghost = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "main" },
      { src: "library", groupId: "red_velvet", memberId: "no_such_member", slot: "sub" },
    ],
  }, "en"));
  check("a roster entry the library no longer has is dropped, not faked",
    ghost.members.length === 1 && ghost.members[0].id === "irene",
    JSON.stringify(ghost.members.map((m) => m.id)));

  // ---- save migration (v1.4.0 step 4) --------------------------------
  //
  // docs/V140_PLAN.md §9.4 pencilled these into Layer J. They are here instead:
  // the anchor they are measured against — "explicit NPCs match what
  // getNpcMembers derives today" — is twenty lines up, and a gate reads better
  // next to the thing it is a gate on.
  //
  // The fixture is a real v1.3.8 slot, and it is TWICE rather than Red Velvet
  // because Red Velvet is both the app's default selection and the migrator's
  // last-resort fallback. A Red Velvet save would pass every check below with
  // the group scan doing nothing whatsoever.
  const v138 = () => JSON.parse(
    readFileSync(join(ROOT, "test", "fixtures", "save-v138.json"), "utf8"));

  const warnsFrom = async (fn) => {
    const real = console.warn;
    const seen = [];
    console.warn = (...a) => seen.push(a.join(" "));
    try { return [await fn(), seen]; } finally { console.warn = real; }
  };

  const migrated = await fromDisk(() => loader.migrateSave(v138(), "en"));

  check("a v1.3.8 save comes back declaring schema 14",
    migrated.schema === loader.SAVE_SCHEMA && loader.SAVE_SCHEMA === 14,
    String(migrated.schema));
  check("...and the world it was always played in",
    migrated.worldId === "kpop_idol", String(migrated.worldId));
  check("...and the group it was played with, found by scanning the library",
    migrated.groupId === "twice",
    `${migrated.groupId} — red_velvet here means the scan did nothing`);

  // Migration reproduces; it does not fix. GAME_YEAR 2026 minus age 29 is the
  // 1997 the prompt has been deriving on every build since this save was made.
  check("age becomes the birth year the save was already producing",
    migrated.form.birthYear === "1997", String(migrated.form.birthYear));
  check("...and the age itself is left alone, because the backstory seed hashes it",
    migrated.form.age === "29", String(migrated.form.age));

  // THE GATE (docs/V140_PLAN.md, "Pick up here"): a pinned v1.3.8 save must
  // migrate and resolve to the same member set the app derives today.
  const twiceCfg = await fromDisk(() => loader.loadGroupConfig("twice", "en"));
  const fromSave = await fromDisk(() => loader.resolveRoster(migrated.roster, "en"));
  check("a migrated save resolves to exactly the cast it had, in the same order",
    JSON.stringify(fromSave.members.map((m) => m.id))
      === JSON.stringify(twiceCfg.members.map((m) => m.id)),
    JSON.stringify(fromSave.members.map((m) => m.id)));
  check("a migrated save's NPCs are the ones getNpcMembers derives today",
    JSON.stringify(fromSave.npcIds.sort())
      === JSON.stringify(loader.getNpcMembers(twiceCfg.members, "nayeon", ["jihyo", "tzuyu"])
        .map((m) => m.id).sort()),
    JSON.stringify(fromSave.npcIds));
  check("a migrated save keeps its main and sub slots",
    fromSave.mainId === "nayeon"
      && JSON.stringify(fromSave.subIds) === JSON.stringify(["jihyo", "tzuyu"]),
    `main=${fromSave.mainId} subs=${fromSave.subIds}`);

  // The claim migration lives or dies on: a game in flight sees no change.
  check("a migrated save builds the prompt it already had, byte for byte",
    buildSystemPrompt(migrated.form, fromSave.members, fromSave.mainId, fromSave.subIds,
      fromSave.groupConfig, "", "qwen", "en", worldFor.en)
    === buildSystemPrompt(v138().form, twiceCfg.members, "nayeon", ["jihyo", "tzuyu"],
      twiceCfg, "", "qwen", "en", worldFor.en),
    "migration moved a prompt that was supposed to stay put");

  // Idempotent, and not by trusting the schema number: each field is filled
  // only when absent, so a save half-written by a build between the two shapes
  // is completed rather than rejected.
  const twice_ = await fromDisk(() => loader.migrateSave(migrated, "en"));
  check("migrating an already-migrated save changes nothing",
    JSON.stringify(twice_) === JSON.stringify(migrated), "");
  // And costs nothing: a save carrying a roster must not re-scan the library.
  let rescanned = false;
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async (...a) => { rescanned = true; return realFetch2?.(...a); };
  try { await loader.migrateSave(migrated, "en"); } catch { /* the point is the flag */ }
  globalThis.fetch = realFetch2;
  check("...and does not re-scan the library to do it", !rescanned);

  // An identity or pace the world no longer declares is somebody's run, not a
  // lookup miss. Blanking it would erase the premise they chose.
  const odd = v138();
  odd.form.identity = "退役练习生的妹妹";
  odd.form.pace = "made up in 2024";
  const oddOut = await fromDisk(() => loader.migrateSave(odd, "en"));
  check("an identity the world does not declare survives migration verbatim",
    oddOut.form.identity === "退役练习生的妹妹", String(oddOut.form.identity));
  check("...and so does an unknown pace", oddOut.form.pace === "made up in 2024");

  // A save with no usable age gets no birth year rather than a fabricated one:
  // buildSystemPrompt's legacy fallback covers it, and an invented 2006 in a
  // save field would read as something the player chose.
  const ageless = v138();
  delete ageless.form.age;
  const agelessOut = await fromDisk(() => loader.migrateSave(ageless, "en"));
  check("a save with no age gets no invented birth year",
    agelessOut.form.birthYear === undefined, String(agelessOut.form.birthYear));

  // Member ids are NOT unique across the library: `x` is a crossover roster
  // sharing seven ids with the groups those members debuted in. Matching on the
  // main member alone would hand the player a cast she never chose.
  const solo = v138();
  solo.form = { ...solo.form, mainMember: "irene", subMembers: [] };
  const [soloOut, soloWarns] = await warnsFrom(
    () => fromDisk(() => loader.migrateSave(solo, "en")));
  check("a cast that several groups could explain is reported, not picked silently",
    soloWarns.some((w) => w.includes("red_velvet") && w.includes("x")),
    JSON.stringify(soloWarns));
  check("...and resolves to something real either way",
    ["red_velvet", "x"].includes(soloOut.groupId), String(soloOut.groupId));

  const [prefOut] = await warnsFrom(() => fromDisk(
    () => loader.migrateSave(solo, "en", { preferGroupId: "x" })));
  check("the selected group breaks a tie between groups that both fit",
    prefOut.groupId === "x", String(prefOut.groupId));

  // A sub member settles it without any hint, which is the common case.
  const withSub = v138();
  withSub.form = { ...withSub.form, mainMember: "irene", subMembers: ["sana"] };
  const crossOut = await fromDisk(() => loader.migrateSave(withSub, "en"));
  check("a sub member the home group lacks identifies the crossover roster",
    crossOut.groupId === "x", String(crossOut.groupId));
  const homeSub = v138();
  homeSub.form = { ...homeSub.form, mainMember: "irene", subMembers: ["yeri"] };
  const homeOut = await fromDisk(() => loader.migrateSave(homeSub, "en"));
  check("...and a sub the crossover roster lacks identifies the home group",
    homeOut.groupId === "red_velvet", String(homeOut.groupId));

  // Nothing in the library contains this cast. Say so: the resolve that follows
  // will drop members it cannot find, and a silent Red Velvet is how that
  // becomes "the game replaced my cast" with nothing a player can report.
  const orphan = v138();
  orphan.form = { ...orphan.form, mainMember: "nobody_at_all", subMembers: [] };
  const [orphanOut, orphanWarns] = await warnsFrom(
    () => fromDisk(() => loader.migrateSave(orphan, "en")));
  check("a cast no group contains is warned about, loudly",
    orphanWarns.some((w) => w.includes("no group contains")), JSON.stringify(orphanWarns));
  check("...and still produces a loadable save rather than throwing",
    orphanOut.groupId === "red_velvet" && Array.isArray(orphanOut.roster?.entries),
    String(orphanOut.groupId));

  // --- step 6 commit 6: correcting a migrated birth year --------------------
  //
  // Migration reproduces `GAME_YEAR - age` and is therefore still wrong for
  // about half of all legacy saves, which nothing can recover from the save
  // itself. The only honest fix is to let the player say the year — so this is
  // the counterpart to every "migration does not fix it" check above.
  //
  // `migrated.form` here is the real v1.3.8 fixture: age 29, birth year 1997.
  // 1996 is the reported shape of the bug — a birthday later in the year, so
  // the derived year is one too high and every member born in 1996 is wrongly
  // marked her senior.
  const corrected = loader.correctBirthYear(migrated.form, "1996");
  check("a player can correct the birth year her save only ever implied",
    corrected.birthYear === "1996", String(corrected.birthYear));
  // THE one that matters. backstorySeed hashes form.age and nothing else, so an
  // age recomputed here would re-roll an identity backstory mid-save — the
  // v1.3.9 drift wearing a third hat. Setup's handler writes both fields on
  // purpose; this one must write exactly one.
  check("...without touching the age the backstory seed is frozen on",
    corrected.age === migrated.form.age && corrected.age === "29",
    `age moved to ${corrected.age}`);
  check("...and without disturbing anything else in the form",
    JSON.stringify({ ...corrected, birthYear: null })
      === JSON.stringify({ ...migrated.form, birthYear: null }),
    "the correction is one field wide");

  // Re-confirming the year already on record must be free: every change to this
  // field rewrites the ~5,500-token static prompt. Identity of the object is
  // the check, because that is what lets the caller skip setForm entirely.
  check("re-confirming the same year returns the very same form object",
    loader.correctBirthYear(migrated.form, migrated.form.birthYear) === migrated.form,
    "an unchanged year must not cost a prompt-cache miss");
  check("...and so does a year outside the playable range",
    loader.correctBirthYear(migrated.form, "1500") === migrated.form
      && loader.correctBirthYear(migrated.form, "2030") === migrated.form
      && loader.correctBirthYear(migrated.form, "") === migrated.form,
    "a correction may not write a year Setup would have refused");

  // The loop closed: the corrected year has to reach the address protocol, or
  // the affordance is a field that stores a number nobody reads.
  const promptOf = (f) => buildSystemPrompt(f, fromSave.members, fromSave.mainId,
    fromSave.subIds, fromSave.groupConfig, "", "qwen", "en", worldFor.en);
  check("the corrected year reaches the prompt as the player's age",
    promptOf(corrected).includes("age 30, born 1996")
      && promptOf(migrated.form).includes("age 29, born 1997"),
    "the prompt renders the age FROM the birth year");
  // Sana is born 1996. On the migrated year the player is her junior and is
  // told to say "Sana-unnie"; on the corrected one they are peers and no unnie
  // form exists in either direction. That flip IS the bug being fixed — one
  // year of error, a relationship pointing the wrong way.
  // Scoped to section 5, and walked to her own Address line rather than taken
  // at a fixed offset. Both matter here: a whole single group puts its lore in
  // section 4 verbatim, and that lore names her too, so an unscoped search
  // finds a block that has no Address line in it at all.
  const sanaAt = (f) => {
    const p5 = promptOf(f);
    const lines = p5.slice(p5.indexOf("5. MEMBER PROFILES")).split("\n");
    const i = lines.findIndex((l) => l.includes("Sana("));
    const j = lines.slice(i, i + 14).findIndex((l) => l.startsWith("  Address: "));
    return i === -1 || j === -1 ? "" : lines[i + j];
  };
  check("...and flips the honorific direction it decides",
    /Sana-unnie/.test(sanaAt(migrated.form))
      && !/-unnie/.test(sanaAt(corrected)) && /plain given name/.test(sanaAt(corrected)),
    `${sanaAt(migrated.form)} -> ${sanaAt(corrected)}`);
  // Everything that is not seniority must stay byte-identical, or correcting a
  // year silently rewrites the run's premise as well as its honorifics.
  //
  // Pinned to `主线成员前女友` deliberately: it is the only identity whose
  // background is drawn from backstorySeed, so it is the only one where an `age`
  // recomputed by the correction would be VISIBLE as a different breakup reason
  // and a different keepsake. Against any other identity this check cannot fail,
  // and a check that cannot fail is not a check — the fixture's own identity is
  // one of those, which is why the form is overridden here.
  const stripAges = (s) => s.split("\n")
    .filter((l) => !/^ {2}(Age|Address): /.test(l)).join("\n")
    .replace(/age \d+, born \d{4}/, "");
  const exForm = { ...migrated.form, identity: "主线成员前女友" };
  check("...and moves nothing else in the prompt, backstory included",
    stripAges(promptOf(loader.correctBirthYear(exForm, "1996"))) === stripAges(promptOf(exForm)),
    "a correction is not allowed to re-roll the identity background");

  // --- step 6 commit 2: the custom-cast palette and the photo store ---------
  // Both are pure functions over a plain object so they can be tested here at
  // all. The quota rules are the half that can lose a player's data, and
  // putting them behind the canvas would leave them testable only by hand.
  const storeBundle = join(OUT, "stores.mjs");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/rag/customCast.js";',
        'export * from "./src/utils/imageStore.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: storeBundle, logLevel: "silent",
  });
  const store = await import("file://" + storeBundle.replace(/\\/g, "/") + "?t=" + Date.now());

  // `src/utils.js` and `src/utils/` both exist now. Every `from "./utils"` in
  // src/ must still reach the FILE — a src/utils/index.js would silently
  // re-point all of them, and the app would lose STORAGE_KEYS with no error.
  check("src/utils.js still wins over the src/utils/ directory",
    typeof store.loadPhotos === "function" && typeof store.PHOTO_MAX_CHARS === "number",
    "imageStore imported STORAGE_KEYS through ../utils.js");
  check("no src/utils/index.js exists to hijack `from \"./utils\"`",
    !existsSync(join(ROOT, "src/utils/index.js")));

  // --- the palette ---------------------------------------------------------
  const REQ = { name: "Lin Xia", birthday: "1999-04-02",
                private_personality: "fixes things quietly" };
  for (const f of ["name", "birthday", "private_personality"]) {
    const without = { ...REQ, [f]: "" };
    const r = store.upsertMember([], { id: "c_1", profile: without });
    check(`a custom member without ${f} is refused`,
      r.ok === false && r.reason === "missing" && r.missing.includes(f),
      JSON.stringify(r.missing || r.reason));
  }
  // birthday especially: the whole address protocol is a birth-year comparison
  // and a member without one falls back to 2000-01-01, which makes honorifics
  // uniform across the cast. That is the v1.3.6 -> v1.3.7 failure returning one
  // custom member at a time, which is why it is REQUIRED and not recommended.
  check("a complete custom member is accepted",
    store.upsertMember([], { id: "c_1", profile: REQ }).ok === true);

  const one = store.upsertMember([], { id: "c_1", profile: REQ }).cast;
  check("...and is stored under the entry id, not anything in the profile body",
    one[0].id === "c_1" && one[0].profile.id === "c_1",
    `${one[0].id} / ${one[0].profile.id}`);
  const renamed = store.upsertMember(one,
    { id: "c_1", profile: { ...REQ, id: "irene" } }).cast;
  check("an edited profile cannot rename itself onto another member's id",
    renamed[0].id === "c_1" && renamed[0].profile.id === "c_1",
    `${renamed[0].id} / ${renamed[0].profile.id}`);

  // The whitelist is applied on write: the stored shape stays the documented
  // one even if a later editor version puts something else in scope.
  const junk = store.upsertMember([], {
    id: "c_1", profile: { ...REQ, apiKey: "sk-secret", notes: "x", habit: "hums" },
  }).cast[0].profile;
  check("an unrecognised field never reaches the stored profile",
    !("apiKey" in junk) && !("notes" in junk) && junk.habit === "hums",
    JSON.stringify(Object.keys(junk)));
  const blanks = store.upsertMember([], {
    id: "c_1", profile: { ...REQ, habit: "   ", queer_texture: "" },
  }).cast[0].profile;
  check("a blank optional field is dropped rather than stored as an empty string",
    !("habit" in blanks) && !("queer_texture" in blanks),
    JSON.stringify(Object.keys(blanks)));

  check("cosmetic fields are auto-assigned so the player never has to pick",
    Boolean(junk.emoji && junk.color && junk.accent && junk.ig),
    JSON.stringify([junk.emoji, junk.color, junk.accent, junk.ig]));

  // An id collision would merge two people's affections, KKT channel and
  // appearance history silently — step 4 found library ids are not unique even
  // across the library, so the prefix is doing real work.
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(store.newMemberId(Date.now() + i, () => i / 200));
  check("generated member ids are prefixed and collision-free",
    ids.size === 200 && [...ids].every((id) => id.startsWith("c_")),
    `${ids.size}/200 unique`);

  let full = [];
  for (let i = 0; i < store.CAST_MAX; i++) {
    full = store.upsertMember(full, { id: `c_${i}`, profile: REQ }).cast;
  }
  const overflow = store.upsertMember(full, { id: "c_over", profile: REQ });
  check("the palette refuses member 21 rather than silently dropping one",
    overflow.ok === false && overflow.reason === "full" && overflow.cast.length === store.CAST_MAX,
    `${overflow.cast.length} stored`);
  // A full palette must still be editable, or the last member in is frozen.
  check("...but a member already in a full palette can still be edited",
    store.upsertMember(full, { id: "c_0", profile: { ...REQ, name: "Renamed" } }).ok === true);
  check("removing a member shortens the palette",
    store.removeMember(full, "c_0").length === store.CAST_MAX - 1);

  // The snapshot rule: a roster entry carries the profile by value, so deleting
  // the palette member afterwards cannot reach a running save.
  const entry = store.toRosterEntry(one[0], "sub");
  const afterDelete = store.removeMember(one, "c_1");
  check("a roster entry snapshots the profile rather than referencing it",
    entry.src === "custom" && entry.profile.name === "Lin Xia"
      && afterDelete.length === 0 && entry.profile.name === "Lin Xia",
    JSON.stringify(entry.profile.name));

  // --- the photo store -----------------------------------------------------
  const img = (chars) => "data:image/webp;base64," + "A".repeat(chars);
  check("a photo under the cap is stored",
    store.putPhoto({}, "irene", img(100)).ok === true);
  check("a non-image is refused",
    store.putPhoto({}, "irene", "javascript:alert(1)").reason === "not_an_image");
  check("an oversized photo is refused rather than written",
    store.putPhoto({}, "irene", img(store.PHOTO_MAX_CHARS + 1)).reason === "too_large");
  // The limit is on the STORED STRING because that is what the quota counts; a
  // data URL is ~37% larger than the image it carries.
  check("...and the cap is measured on the data URL, not the decoded image",
    store.putPhoto({}, "irene", img(store.PHOTO_MAX_CHARS - 40)).ok === true,
    `limit ${store.PHOTO_MAX_CHARS} chars`);

  let photos = {};
  for (let i = 0; i < store.PHOTO_MAX_COUNT; i++) {
    photos = store.putPhoto(photos, `m_${i}`, img(50)).photos;
  }
  const photoOver = store.putPhoto(photos, "m_new", img(50));
  check("photo 31 is refused rather than evicting someone else's",
    photoOver.ok === false && photoOver.reason === "full"
      && Object.keys(photoOver.photos).length === store.PHOTO_MAX_COUNT,
    `${Object.keys(photoOver.photos).length} stored`);
  check("...but replacing an existing photo in a full store still works",
    store.putPhoto(photos, "m_0", img(60)).ok === true,
    "a full store must not freeze the photos already in it");

  check("removing a photo drops exactly one",
    Object.keys(store.removePhoto(photos, "m_0")).length === store.PHOTO_MAX_COUNT - 1);
  check("removing a photo nobody has changes nothing",
    Object.keys(store.removePhoto(photos, "nope")).length === store.PHOTO_MAX_COUNT);
  check("orphaned photos are pruned when their member is deleted",
    Object.keys(store.pruneOrphans(photos, ["m_1", "m_2"])).sort().join() === "m_1,m_2",
    JSON.stringify(Object.keys(store.pruneOrphans(photos, ["m_1", "m_2"]))));
  check("photoBytes counts the stored characters",
    store.photoBytes({ a: "12345", b: "123" }) === 8);

  // Corrupt or absent storage must read as empty, never throw: the same
  // tolerance aliyunRoute.js applies to a malformed route state.
  //
  // Wrapped, because a throw here would abort the whole suite and take every
  // later layer with it. A regression has to report as one red check, not as a
  // crash that hides how much else still works.
  const tolerates = (fn) => {
    for (const bad of [null, undefined, [], "nonsense", 42]) {
      try { if (!fn(bad)) return `rejected ${JSON.stringify(bad) ?? "undefined"}`; }
      catch (e) { return `threw on ${JSON.stringify(bad) ?? "undefined"}: ${e.message}`; }
    }
    return null;
  };
  const badPhotos = tolerates((bad) => store.putPhoto(bad, "irene", img(10)).ok === true);
  check("a corrupt photo map is treated as empty", badPhotos === null, badPhotos);
  const badCast = tolerates((bad) => store.removeMember(bad, "x").length === 0);
  check("a corrupt palette is treated as empty", badCast === null, badCast);
  const badUpsert = tolerates((bad) => store.upsertMember(bad, { id: "c_1", profile: REQ }).ok);
  check("a corrupt palette still accepts a new member", badUpsert === null, badUpsert);
  const badPrune = tolerates((bad) => Object.keys(store.pruneOrphans(bad, ["a"])).length === 0);
  check("pruning a corrupt photo map yields an empty map", badPrune === null, badPrune);

  // --- step 6 commit 3: the card generator ---------------------------------
  // The call is an ACCELERATOR, NEVER A GATE: every failure has to resolve to a
  // blank form so a dead provider, an exhausted free route or a missing key
  // cannot block character creation. That is the whole contract, and it is the
  // one thing a live test would exercise least often.
  const cardBundle = join(OUT, "cardGen.mjs");
  await esbuild.build({
    stdin: {
      contents: 'export * from "./src/agent/cardGenerator.js";',
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: cardBundle, logLevel: "silent",
  });
  const cg = await import("file://" + cardBundle.replace(/\\/g, "/") + "?t=" + Date.now());

  const FULL_CARD = {
    name: "Lin Xia", birthday: "1999-04-02",
    private_personality: "fixes things quietly", public_image: "the calm one",
    queer_texture: "she notices hands first", speech_style: "clipped, trails off",
    habit: "tunes a string that is already in tune", animal_plastic: "heron - still, then sudden",
    hidden_conflict: "she was the reason the last group split",
  };

  // Tolerance, in the same spirit as the round parser. A card has no long
  // escaped prose field, so none of parseLLMOutput's story repair applies -
  // these are the shapes a model actually returns.
  check("a bare JSON card parses",
    cg.parseCard(JSON.stringify(FULL_CARD)).name === "Lin Xia");
  check("a fenced JSON card parses",
    cg.parseCard("```json\n" + JSON.stringify(FULL_CARD) + "\n```").habit.length > 0);
  check("an unlabelled fence parses",
    cg.parseCard("```\n" + JSON.stringify(FULL_CARD) + "\n```").name === "Lin Xia");
  // Fence stripping has to happen BEFORE the brace slice, and this is the case
  // that proves it: trailing prose containing braces moves lastIndexOf("}") past
  // the card, so the slice alone would extract "{habit}" and parse nothing.
  // Without this the fence handling is redundant with the slice and a mutation
  // removing it stays green - which is exactly what it did.
  check("a fenced card survives trailing prose that contains braces",
    cg.parseCard("```json\n" + JSON.stringify(FULL_CARD)
      + "\n```\nAdjust the {habit} field if you like.").name === "Lin Xia",
    JSON.stringify(cg.parseCard("```json\n" + JSON.stringify(FULL_CARD)
      + "\n```\nAdjust the {habit} field if you like.")));
  check("prose around the object is discarded",
    cg.parseCard("Here you go!\n" + JSON.stringify(FULL_CARD) + "\nHope that helps.")
      .name === "Lin Xia");
  check("an object left open by truncation is closed and parsed",
    cg.parseCard('{"name":"Lin Xia","birthday":"1999-04-02"')?.name === "Lin Xia",
    "a card cut mid-object still carries usable fields");

  // §4.5: missing fields stay empty rather than failing the call. Six of nine
  // fields is still a head start, and refusing it hands the player a blank form
  // for no reason.
  const partial = cg.parseCard('{"name":"Lin Xia","habit":"hums"}');
  check("a partial card keeps what it has and does not invent the rest",
    partial.name === "Lin Xia" && partial.habit === "hums"
      && Object.keys(partial).length === 2,
    JSON.stringify(partial));
  check("a field the schema does not list is dropped",
    !("apiKey" in cg.parseCard('{"name":"Lin Xia","apiKey":"sk-secret"}')),
    "the card parser is a whitelist too");
  check("a blank field is not stored as an empty string",
    !("habit" in cg.parseCard('{"name":"Lin Xia","habit":"   "}')));
  // A habit renders as ONE line in the profile block, exactly as in the group
  // library, so a model that returns a wrapped one must not break the shape.
  check("a multi-line habit is folded onto one line",
    cg.parseCard('{"habit":"taps the rim\\n  twice, always"}').habit
      === "taps the rim twice, always",
    JSON.stringify(cg.parseCard('{"habit":"taps the rim\\n  twice, always"}').habit));
  for (const junk of ["", "   ", "no json here", "[1,2,3]", '"a string"', "null", null, 42]) {
    if (Object.keys(cg.parseCard(junk)).length !== 0) {
      check("unparseable output yields an empty card, never a throw", false, JSON.stringify(junk));
    }
  }
  check("unparseable output yields an empty card, never a throw", true);

  // The prompt's two non-stylistic constraints.
  const cardPrompt = cg.buildCardPrompt("a reserved cellist", { name: "K-pop Idol" }, "ko");
  // The INSTRUCTION, not merely the word: the language name also appears inside
  // the schema's field hints, so `includes("Korean")` stayed true even with the
  // instruction removed. A guard that cannot fail is not a guard.
  check("the card prompt instructs the model in the player's language",
    /Write every field in Korean\./.test(cardPrompt) && !/in Chinese/.test(cardPrompt),
    "custom profiles are authored in one language and never translated (§5)");
  // A player can type a real idol's name into the box, and the fields being
  // asked for are private personality, queer texture and hidden conflict.
  // Without this the feature generates invented claims about a real person's
  // private life — the exact thing the habit sourcing rule forbids.
  // Whitespace-normalized: the prompt is a hard-wrapped template literal, so a
  // phrase can legitimately straddle a newline and a raw substring match would
  // fail on a reflow that changed nothing the model sees.
  const flat = cardPrompt.replace(/\s+/g, " ");
  check("the card prompt refuses to write about a real person",
    /ORIGINAL FICTIONAL CHARACTER/.test(flat)
      && /no claim about any real individual/i.test(flat),
    flat.slice(0, 160));
  check("the card prompt carries the world's setting",
    cg.buildCardPrompt("x", { name: "Campus" }, "en").includes("Campus"));
  check("...and prefers world.setting once v1.4.1 adds it",
    cg.buildCardPrompt("x", { name: "Campus", setting: "a music conservatory" }, "en")
      .includes("a music conservatory"));

  // --- the contract: every failure is a blank form -------------------------
  const withFetch = async (impl, fn) => {
    const real = globalThis.fetch;
    globalThis.fetch = impl;
    try { return await fn(); } finally { globalThis.fetch = real; }
  };
  const ok200 = (content) => async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }),
    text: async () => "",
  });
  // generateCard's contract is that it NEVER throws. Calling it bare would let a
  // regression abort the suite and hide every layer after it, so a throw is
  // captured and reported as the failure it is.
  const safeGenerate = async (args) => {
    try { return await cg.generateCard(args); }
    catch (e) { return { threw: `${e?.kind || "?"}: ${e?.message || e}` }; }
  };
  const err = (status, body) => async () => ({
    ok: false, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const cardOk = await withFetch(ok200(JSON.stringify(FULL_CARD)), () => cg.generateCard({
    description: "a reserved cellist who never sleeps before 3am",
    world: { name: "K-pop Idol" }, language: "en", apiKey: "sk-test", modelId: "deepseek",
  }));
  check("a good response produces a usable card",
    cardOk.ok === true && cardOk.profile.name === "Lin Xia"
      && cardOk.profile.habit.length > 0,
    JSON.stringify(cardOk.reason || Object.keys(cardOk.profile)));

  // No key at all: callLLM throws `auth` before any request is made. This is the
  // most likely real failure, because the editor is reachable before the key
  // page on a loaded save.
  const noKey = await safeGenerate({
    description: "a reserved cellist", world: { name: "K-pop Idol" }, apiKey: "",
  });
  check("a missing key yields a blank form and the auth kind",
    noKey.ok === false && noKey.reason === "auth"
      && Object.keys(noKey.profile).length === 0,
    JSON.stringify(noKey));

  const authFail = await withFetch(
    err(401, { error: { code: "invalid_api_key", message: "no" } }),
    () => safeGenerate({
      description: "a reserved cellist", world: {}, apiKey: "sk-bad", modelId: "deepseek",
    }));
  check("a rejected key yields a blank form, not an exception",
    authFail.ok === false && authFail.reason === "auth"
      && Object.keys(authFail.profile).length === 0,
    JSON.stringify(authFail));

  // The reason is an LLMError KIND, so the caller can render the same localized
  // line the game already uses for that failure rather than inventing a second
  // vocabulary for it.
  const { default: zh } = await import("../src/i18n/zh.js");
  check("every reason the generator returns has a translation already",
    ["auth", "balance", "rate_limit", "timeout", "bad_response", "unknown"]
      .every((k) => typeof zh.errors?.[k] === "string" && zh.errors[k].length > 0),
    "reusing t.errors is the reason the kind is returned instead of a message");

  // A 200 whose content cannot yield a single field is unusable. It is reported
  // as bad_response rather than as a card, because an empty card rendered as
  // success looks like the model refused to answer.
  const garbage = await withFetch(ok200("I'm afraid I can't help with that."),
    () => safeGenerate({
      description: "a reserved cellist", world: {}, apiKey: "sk-test", modelId: "deepseek",
    }));
  check("a 200 carrying no card is reported as bad_response, not as success",
    garbage.ok === false && Object.keys(garbage.profile).length === 0
      && garbage.reason === "bad_response",
    JSON.stringify(garbage));

  // The usability callback is what makes that a RETRY rather than a shrug: it is
  // the same mechanism that stops a degenerate round reaching the player, and in
  // free mode it is what walks to another model. Without it the call would
  // return the useless content once and give up, which no assertion on the
  // returned reason can distinguish — only the attempt count can.
  let attempts = 0;
  await withFetch(async (...a) => { attempts++; return ok200("nothing usable here")(...a); },
    () => safeGenerate({
      description: "a reserved cellist", world: {}, apiKey: "sk-test", modelId: "deepseek",
    }));
  check("an unusable card is retried, not accepted on the first attempt",
    attempts > 1, `${attempts} attempt(s) - the validateContent callback is what drives this`);

  // Too short to work from: refused locally without spending a call.
  let called = 0;
  const shortDesc = await withFetch(
    async (...a) => { called++; return ok200("{}")(...a); },
    () => safeGenerate({ description: "hi", world: {}, apiKey: "sk-test" }));
  check("a description too short to use spends no API call",
    shortDesc.ok === false && shortDesc.reason === "no_description" && called === 0,
    `fetch called ${called} times`);

  check("the generator asks for no field that reaches no prompt",
    !cg.CARD_FIELDS.includes("mbti") && !cg.CARD_FIELDS.includes("role")
      && !cg.CARD_FIELDS.includes("emoji") && !cg.CARD_FIELDS.includes("tags")
      && cg.CARD_FIELDS.includes("habit"),
    JSON.stringify(cg.CARD_FIELDS));

  // A generated card must satisfy the palette's own rules, or the fast path
  // ends at a form that refuses to save. This is the seam between commits 2
  // and 3 and nothing else crosses it.
  const generated = cg.parseCard(JSON.stringify(FULL_CARD));
  check("a generated card satisfies the palette's required tier",
    store.missingRequired(generated).length === 0,
    JSON.stringify(store.missingRequired(generated)));
  const stored = store.upsertMember([], { id: "c_gen", profile: generated });
  check("...and can be stored without further editing",
    stored.ok === true && stored.cast[0].profile.name === "Lin Xia",
    JSON.stringify(stored.reason || "ok"));

  // --- step 6 commit 4: the member editor ----------------------------------
  // Source-string checks, the same shape as the Layer G key-page guards: a JSX
  // overlay cannot be rendered offline, but the invariants worth protecting here
  // are structural rather than visual, and each one below is a bug that would
  // otherwise only show up in a hand test.
  const editorSrc = readFileSync(join(ROOT, "src/platforms/MemberEditor.jsx"), "utf8");

  // Compile it. Nothing else does yet — App.jsx imports it in commit 5 — so
  // until then a JSX syntax error or a bad import path would ship silently: the
  // Vite build only compiles what the module graph reaches. React and the DOM
  // stay external because this proves the file PARSES and its imports RESOLVE,
  // not that it renders.
  let editorCompiled = "";
  try {
    await esbuild.build({
      entryPoints: [join(ROOT, "src/platforms/MemberEditor.jsx")],
      bundle: true, format: "esm", platform: "neutral", write: false,
      external: ["react"], jsx: "automatic", logLevel: "silent",
      define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
    });
    editorCompiled = "ok";
  } catch (e) {
    editorCompiled = (e.errors || []).map((x) => x.text).join(" | ") || e.message;
  }
  check("MemberEditor.jsx compiles and its imports resolve",
    editorCompiled === "ok", editorCompiled);

  // EVERY field the generator can fill must be editable, or the model writes
  // something the player has no way to correct.
  const stepFields = [...editorSrc.matchAll(/^\s*\["([^\]]+)\],?$/gm)]
    .flatMap((m) => m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")));
  const uneditable = cg.CARD_FIELDS.filter((f) => !stepFields.includes(f));
  check("every field the card generator fills is editable in the editor",
    uneditable.length === 0, `not editable: ${uneditable.join(", ")}`);

  // A `const Field = ...` declared in the render body is a new component TYPE on
  // every render, so React remounts the input on each keystroke and the field
  // loses focus after one character. This was written that way first; the guard
  // exists so it cannot come back, since nothing else would catch it offline.
  check("form fields are rendered by a function, not a nested component",
    /const renderField = \(/.test(editorSrc) && !/const Field = \(/.test(editorSrc),
    "a nested component type remounts the input and steals focus every keystroke");

  // Save must be reachable from any step. Gating it on the last step is what
  // makes a wizard worse than the form it replaced, and step 3 is optional only.
  check("Save is gated on the required fields, not on reaching the last step",
    /const canSave = missing\.length === 0;/.test(editorSrc)
      && !/step === 2 && canSave/.test(editorSrc),
    "canSave must not mention the step index");

  // --- REGRESSION: the birth year field could not be typed into --------------
  // Reported from the first phone test. The editor derived the input's value from
  // `profile.birthday`, so one keystroke stored "1-01-01" and fed
  // `"1-01-01".slice(0, 4)` — "1-01" — back into a type="number" input, which
  // cannot render that. The field blanked on every keypress and was unfillable.
  //
  // THE BUG WAS IN THE ROUND TRIP, not in either direction alone, and the guard
  // that was here only checked the write. It asserted the stored FORMAT and never
  // that the value could be read back — so it passed against completely broken
  // behaviour. This simulates the typing.
  const typeYear = (keystrokes) => {
    let draft = "", birthday = "";
    for (const raw of keystrokes) {
      draft = String(raw).replace(/\D/g, "").slice(0, 4);
      birthday = store.birthdayFromYear(draft);
    }
    return { shown: draft, birthday };
  };
  const partials = ["1", "19", "199"].map((k) => typeYear([k]));
  check("a partially typed year renders as itself, not as a sliced date",
    partials.every((p, i) => p.shown === ["1", "19", "199"][i]),
    JSON.stringify(partials.map((p) => p.shown)));
  check("...and stores no birthday until the year is complete",
    partials.every((p) => p.birthday === ""),
    "a two-digit year must not reach the address protocol");
  check("...and a complete year stores a date the prompt can parse",
    typeYear(["1", "19", "199", "1999"]).birthday === "1999-01-01"
      && parseInt("1999-01-01".split("-")[0]) === 1999,
    JSON.stringify(typeYear(["1", "19", "199", "1999"])));
  // The read-back direction, which is the half that was broken.
  check("the year shown for an existing member is the year, not a slice of the date",
    store.birthYearOf("1999-01-01") === "1999" && store.birthYearOf("1-01-01") === "1"
      && store.birthYearOf("") === "" && store.birthYearOf(undefined) === "",
    JSON.stringify([store.birthYearOf("1999-01-01"), store.birthYearOf("1-01-01")]));
  // An incomplete year leaves the profile invalid, so Save cannot commit one.
  check("an incomplete year leaves the member unsaveable",
    store.missingRequired({ name: "X", private_personality: "Y",
      birthday: store.birthdayFromYear("19") }).includes("birthday"),
    "the required-field check is what stops a half-typed year being stored");
  check("a year outside 1980-2012 is flagged but a partial one is not",
    store.validBirthYear("1999") && !store.validBirthYear("1899")
      && !store.validBirthYear("19"),
    "still-typing must not read as invalid");
  // type="number" refuses any value it cannot parse, which is what made the
  // partial year impossible to display. The field is text with a numeric keypad.
  // Comments stripped first. Both this file's mentions of type="number" are in
  // the comments explaining why it is NOT used, and a check that cannot tell a
  // comment from code fails on its own documentation — the same trap the
  // getNpcMembers guard in Layer G calls out.
  const editorCode = editorSrc
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check("the year input is a text field with a numeric keypad, not type=number",
    /inputMode="numeric"/.test(editorCode) && !/type="number"/.test(editorCode),
    "iOS shows the same keypad either way; only one of them can render \"19\"");
  check("the editor renders its own year draft rather than deriving it",
    /value=\{yearDraft\}/.test(editorSrc) && /const \[yearDraft, setYearDraft\]/.test(editorSrc),
    "deriving it from profile.birthday is the bug");
  // A generated card fills birthday directly, so the draft has to be synced or
  // the player sees a year she cannot edit.
  check("a generated birthday is pushed into the year draft",
    /setYearDraft\(birthYearOf\(next\.birthday\)\)/.test(editorSrc),
    "otherwise the profile holds a year the field does not show");

  // A generated value must never overwrite something the player typed, or
  // pressing Generate twice destroys their edits.
  check("generated fields merge under what the player already typed",
    /\{ \.\.\.res\.profile, \.\.\.p \}/.test(editorSrc),
    "player values must win the spread");

  // The editor owns no storage: it hands a profile to onSave so the palette can
  // enforce its own cap and report a refusal.
  check("the editor writes nothing to storage itself",
    !/saveToStorage|localStorage/.test(editorSrc),
    "persistence belongs to the caller, which is what lets the cap be reported");

  // A failed generation has to surface the game's own line for that kind, not a
  // second vocabulary for the same failures.
  check("a failed generation renders the existing t.errors line for its kind",
    /t\?\.errors\?\.\[res\.reason\]/.test(editorSrc));

  // Localization: no visible string may be hardcoded in the component. Every one
  // comes off t.cast, and all three languages must carry the same keys.
  const castKeys = {};
  for (const lang of ["zh", "en", "ko"]) {
    const { default: pack } = await import(`../src/i18n/${lang}.js`);
    castKeys[lang] = pack.cast;
    check(`t.cast exists in ${lang} with the editor's step labels`,
      Array.isArray(pack.cast?.steps) && pack.cast.steps.length === 3,
      JSON.stringify(pack.cast?.steps));
  }
  const keyShape = (o) => JSON.stringify(Object.keys(o).sort());
  check("t.cast has the same keys in zh, en and ko",
    keyShape(castKeys.zh) === keyShape(castKeys.en)
      && keyShape(castKeys.en) === keyShape(castKeys.ko),
    `zh ${keyShape(castKeys.zh).length} / en ${keyShape(castKeys.en).length} / ko ${keyShape(castKeys.ko).length}`);
  check("...and the same field labels",
    keyShape(castKeys.zh.fields) === keyShape(castKeys.en.fields)
      && keyShape(castKeys.en.fields) === keyShape(castKeys.ko.fields),
    JSON.stringify(Object.keys(castKeys.zh.fields)));
  // Every field the editor renders needs a label in every language, or a player
  // in one language sees a raw field name like `queer_texture`.
  const unlabelled = [];
  for (const lang of ["zh", "en", "ko"]) {
    for (const f of [...stepFields, "birthYear"]) {
      if (!castKeys[lang].fields?.[f]) unlabelled.push(`${lang}:${f}`);
    }
  }
  check("every editable field has a label in all three languages",
    unlabelled.length === 0, unlabelled.slice(0, 6).join(", "));
  check("t.cast.missing interpolates the field list in all three languages",
    ["zh", "en", "ko"].every((l) => typeof castKeys[l].missing === "function"
      && castKeys[l].missing("X").includes("X")),
    "it names what is still required, so it has to carry the names");

  // --- step 6 commit 5: the roster builder and the second door -------------
  const builderSrc = readFileSync(join(ROOT, "src/platforms/RosterBuilder.jsx"), "utf8");
  let builderCompiled = "";
  try {
    await esbuild.build({
      entryPoints: [join(ROOT, "src/platforms/RosterBuilder.jsx")],
      bundle: true, format: "esm", platform: "neutral", write: false,
      external: ["react"], jsx: "automatic", logLevel: "silent",
      define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
    });
    builderCompiled = "ok";
  } catch (e) {
    builderCompiled = (e.errors || []).map((x) => x.text).join(" | ") || e.message;
  }
  check("RosterBuilder.jsx compiles and its imports resolve",
    builderCompiled === "ok", builderCompiled);

  // THE constraint of this component. Step 4 established that member ids are not
  // unique across the library — `x` shares seven with the groups those members
  // debuted in — and affections, KKT channels and memberAppearances are all keyed
  // by id. A roster holding one id twice would silently merge two people's state,
  // so the picks map is keyed BY ID, which makes that impossible to express.
  check("the builder keys its picks by member id, so one id cannot appear twice",
    /out\[member\.id\] = /.test(builderSrc)
      && !/\$\{tab\}\/\$\{member\.id\}/.test(builderSrc)
      && !/`\$\{[^}]*groupId[^}]*\}\/\$\{/.test(builderSrc),
    "a composite group/id key would let the same person into the cast twice");

  // The roster shaping itself lives in customCast.js so it can be tested as
  // behaviour rather than asserted as a regex — it is the part of the builder
  // that has to be right, and it feeds resolveRoster directly.
  const PICKS = {
    irene: { slot: "npc", src: "library", groupId: "red_velvet" },
    sana: { slot: "sub", src: "library", groupId: "twice" },
    c_1: { slot: "main", src: "custom", lang: "zh", profile: { name: "Lin Xia" } },
    yeri: { slot: "sub", src: "library", groupId: "red_velvet" },
  };
  const built = store.rosterFromPicks(PICKS, "kpop_idol");
  // Entry order IS prompt order, and prompt order is a cache boundary: the same
  // cast in a different order is the same game and a total cache miss. Iterating
  // the picks object would tie it to insertion order instead.
  check("the built roster orders entries main, then subs, then NPCs",
    built.entries.map((e) => e.slot).join(",") === "main,sub,sub,npc",
    built.entries.map((e) => `${e.memberId}:${e.slot}`).join(" "));
  check("...and that order is stable however the picks were inserted",
    JSON.stringify(store.rosterFromPicks(
      Object.fromEntries(Object.entries(PICKS).reverse()), "kpop_idol").entries.map((e) => e.slot))
      === JSON.stringify(built.entries.map((e) => e.slot)),
    "object key order must not reach the prompt");
  check("a custom pick is snapshotted inline and a library pick stays a reference",
    built.entries[0].src === "custom" && built.entries[0].profile?.name === "Lin Xia"
      && built.entries[1].src === "library" && built.entries[1].profile === undefined,
    JSON.stringify(built.entries.map((e) => e.src)));
  // The group whose lore the prompt uses: the main member's, which is the only
  // defensible answer for a mixed cast until composed lore lands in v1.4.1.
  // The MAIN's group is listed SECOND here on purpose. With her first, a buggy
  // "first pick with a group" would return the right answer by luck and the check
  // would pass against a broken implementation — which is exactly what it did.
  check("a cross-group roster takes its groupId from the main member's group",
    store.rosterFromPicks({
      irene: { slot: "sub", src: "library", groupId: "red_velvet" },
      sana: { slot: "main", src: "library", groupId: "twice" },
    }).groupId === "twice",
    "the main member's group is the one whose lore the prompt renders");
  check("...and falls back to any picked group when the main is a custom member",
    built.groupId === "twice" || built.groupId === "red_velvet",
    `custom main, so groupId came from a library pick: ${built.groupId}`);
  check("an empty pick set yields an empty roster rather than throwing",
    store.rosterFromPicks({}).entries.length === 0
      && store.rosterFromPicks().entries.length === 0);

  // The real path: what the builder emits must resolve. Nothing else proves the
  // two halves fit, and per the v1.3.7 lesson it goes through resolveRoster.
  const builtResolved = await fromDisk(() => loader.resolveRoster(store.rosterFromPicks({
    sana: { slot: "main", src: "library", groupId: "twice" },
    irene: { slot: "sub", src: "library", groupId: "red_velvet" },
    c_9: { slot: "npc", src: "custom", lang: "en", profile: REQUIRED_TIER },
  }), "en"));
  // Note the custom member resolves as `c_9`, the PICK's id, even though the
  // profile body carries `c_req`. The pick key wins all the way down — the same
  // rule upsertMember enforces — so a profile can never rename itself onto
  // another member's id and merge her affections.
  check("a roster the builder emits resolves to the cast it names",
    builtResolved.members.map((m) => m.id).join(",") === "sana,irene,c_9"
      && builtResolved.mainId === "sana" && builtResolved.subIds.join() === "irene"
      && builtResolved.npcIds.join() === "c_9",
    JSON.stringify({ ids: builtResolved.members.map((m) => m.id), main: builtResolved.mainId }));
  // Asserted on the ENTRY, not on the resolved member: resolveRoster re-applies
  // `id: e.memberId` on its own, so a snapshot carrying the wrong id is invisible
  // downstream. That is defence in depth and worth keeping, but it means only an
  // entry-level check can see whether toRosterEntry holds up its end.
  const collide = store.rosterFromPicks({
    c_9: { slot: "main", src: "custom", lang: "en", profile: { id: "irene", name: "Lin Xia" } },
  });
  check("a snapshotted profile cannot carry an id other than its pick's",
    collide.entries[0].memberId === "c_9" && collide.entries[0].profile.id === "c_9",
    JSON.stringify(collide.entries[0]));
  check("...and the resolved member agrees, which is the second layer of the same rule",
    builtResolved.members[2].id === "c_9" && builtResolved.members[2].name === "Lin Xia",
    JSON.stringify(builtResolved.members[2]));
  check("...across groups, with a custom member alongside two library ones",
    builtResolved.members.length === 3 && builtResolved.groupConfig !== null,
    "a cross-group cast is the case the whole roster split exists for");

  // Exactly one main, always. Promoting a second demotes the first rather than
  // dropping her, because resolveRoster takes idsWith("main")[0] and a second
  // main would simply be ignored — the player would see her pick do nothing.
  check("promoting a second main demotes the first instead of dropping her",
    /if \(slot === "main"\)/.test(builderSrc) && /out\[id\] = \{ \.\.\.p, slot: "sub" \}/.test(builderSrc),
    "resolveRoster reads only the first main, so two mains lose one silently");

  // --- the slot control, redesigned after the first phone test ---------------
  // It was tap-to-cycle: none -> main -> sub -> npc -> none, shown as symbols.
  // Reported as confusing, and rightly — the player could not tell WHAT they were
  // assigning, and removing someone meant tapping forward through every remaining
  // state. It is now one named button per role.
  check("roles are assigned by name, not by cycling through symbols",
    /const assign = \(member, slot\) =>/.test(builderSrc)
      && !/const CYCLE =/.test(builderSrc) && !/const MARK =/.test(builderSrc),
    "a cycle hides both what the next state is and how to get back to none");
  // The BUTTON's own form, `{c.roles?.[s] || s}`, which the legend and the cast
  // summary do not share — a bare `c.roles` match passed with the button's label
  // replaced by a single letter, because the other two still mention it.
  check("the role buttons are labelled from t.cast.roles",
    builderSrc.includes("{c.roles?.[s] || s}"),
    "the words are what make the control legible");
  check("tapping the role a member already holds removes her",
    /if \(cur === slot\) \{ delete out\[member\.id\]; return out; \}/.test(builderSrc),
    "there must always be one tap that undoes one tap");
  check("the cast summary can remove a member without finding her tab again",
    /onClick=\{\(\) => unassign\(p\.id\)\}/.test(builderSrc)
      && /onClick=\{\(\) => setPicks\(\{\}\)\}/.test(builderSrc),
    "an x per member, plus a clear-all");
  // The legend is shown only while the cast is empty — which is exactly when the
  // player does not yet know what main, sub and npc mean.
  check("the three roles are explained before anything is picked",
    /c\.roleHints\?\.\[s\]/.test(builderSrc)
      && /chosen\.length === 0 \? \(/.test(builderSrc),
    "\"no idea what the player is choosing for\" was the actual report");
  // Deleting an authored member is not undoable and its button sits beside Edit on
  // a small card.
  check("deleting a custom member asks first, and names her",
    /setConfirmDelete\(m\.id\)/.test(builderSrc)
      && /c\.confirmDelete\?\.\(nameOf\(confirmDelete\)\)/.test(builderSrc),
    "\"are you sure\" beside a grid of twelve faces is not an answerable question");

  // Roster order is prompt order, and prompt order is a cache boundary: the same
  // cast in a different order is the same game and a total cache miss. Iterating
  // the picks object directly would make the order depend on insertion, so the
  // slots are walked in a fixed sequence.
  // The ordering itself is asserted as behaviour above, on rosterFromPicks. This
  // only pins that the builder delegates to it rather than re-deriving an order
  // of its own, which would be a second source of truth for a cache boundary.
  check("the builder delegates roster shaping rather than ordering entries itself",
    /rosterFromPicks\(picks, world\?\.id/.test(builderSrc)
      && !/entries:/.test(builderSrc),
    "prompt order is a cache boundary and belongs in one place");

  // Editing a picked member has to refresh the snapshot, or the roster carries
  // her profile as it was before the edit.
  check("editing a picked custom member refreshes her snapshot in the roster",
    /setPicks\(\(prev\) => \(prev\[entry\.id\]/.test(builderSrc),
    "custom entries are snapshotted, so a stale one ships the pre-edit profile");

  // A deleted member's photo would otherwise sit in a capped store forever and
  // eventually refuse a photo for a member who exists.
  check("deleting a custom member prunes her photo",
    /pruneOrphans\(photos, next\.map/.test(builderSrc));

  // The photo store is keyed by member id, and a photo can be picked on step 1
  // before anything is saved — so the CALLER mints the id. Minting it at submit
  // time instead would store the image under one id and the member under another.
  check("the builder mints the member id before opening the editor",
    /setEditing\(\{ id: newMemberId\(\), profile: \{\}, isNew: true \}\)/.test(builderSrc),
    "otherwise a photo added on step 1 is orphaned the moment the member is saved");
  check("...and the editor never mints one of its own",
    !/newMemberId/.test(editorSrc),
    "two sources for the id is how the photo and the member end up disagreeing");

  // Every string is localized, and the builder must not invent its own English.
  check("the builder hardcodes no visible English string",
    !/>[A-Z][a-z]+ [a-z]+</.test(builderSrc.replace(/\{[^}]*\}/g, "")),
    "every label comes off t.cast");
  const builderKeys = [...builderSrc.matchAll(/\bc\.([a-zA-Z]+)/g)].map((m) => m[1]);
  const missingKeys = [...new Set(builderKeys)]
    .filter((k) => !["fields", "hints"].includes(k))
    .filter((k) => ["zh", "en", "ko"].some((l) => castKeys[l][k] === undefined));
  check("every t.cast key the builder reads exists in all three languages",
    missingKeys.length === 0, missingKeys.join(", "));

  // --- the on-device console -----------------------------------------------
  // iOS Safari has no reachable devtools, and this project's two most
  // phone-specific failures — localStorage quota and provider errors — are both
  // reported through console.error, so they are invisible where they happen.
  const dbgBundle = join(OUT, "debugConsole.mjs");
  await esbuild.build({
    stdin: {
      contents: 'export * from "./src/tools/debugConsole.js";',
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: dbgBundle, logLevel: "silent",
  });
  const dbg = await import("file://" + dbgBundle.replace(/\\/g, "/") + "?t=" + Date.now());

  // THE check. The buffer exists to be copied off the phone and pasted into a bug
  // report, so a key that ever reaches a log line must not travel with it. Nothing
  // in src/ logs a key today; this is what keeps that true after someone adds a
  // log line without having read the rule.
  const KEYS = [
    ["sk-ws-abc123def456ghi", "Aliyun"],
    ["sk-sp-abc123def456ghi", "Aliyun Token Plan"],
    ["sk-abcdef1234567890", "DeepSeek / OpenAI"],
    ["AIzaSyABCDEF1234567890xyz", "Gemini"],
  ];
  const leaked = KEYS.filter(([k]) => dbg.redact(`calling with ${k} now`).includes(k));
  check("every provider's key shape is redacted out of the log",
    leaked.length === 0, leaked.map(([k, n]) => `${n}:${k}`).join(", "));
  // A token the sk- rule CANNOT match, or this passes on the other rule's work
  // and says nothing about the header rule — which is what it did at first.
  const jwt = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.Dk3sVq";
  check("...and an Authorization header is redacted too",
    !dbg.redact(jwt).includes("eyJhbGciOiJIUzI1NiJ9"), dbg.redact(jwt));
  // Replaced, not removed: a log that silently drops the key reads as though no
  // key was involved, which is a different bug report.
  check("a redacted key leaves a marker rather than vanishing",
    dbg.redact("key=sk-ws-abc123def456ghi").includes("REDACTED"),
    dbg.redact("key=sk-ws-abc123def456ghi"));
  check("ordinary prose containing sk- is not mangled",
    dbg.redact("the sk- prefix identifies a key") === "the sk- prefix identifies a key",
    "a redactor that eats prose makes every log harder to read");

  // The capture layer wraps console. If it ever swallows a call, it makes the
  // desktop console worse in exchange for making the phone better.
  const realLog = console.log, realErr = console.error, realWarn = console.warn,
        realInfo = console.info;
  const seen = [];
  try {
    console.log = (...a) => seen.push(["log", a.join(" ")]);
    console.error = (...a) => seen.push(["error", a.join(" ")]);
    console.warn = (...a) => seen.push(["warn", a.join(" ")]);
    console.info = (...a) => seen.push(["info", a.join(" ")]);
    // A DOM-free stand-in for the two globals the capture layer also hooks.
    globalThis.window = { addEventListener() {} };
    dbg.installDebugCapture();
    console.log("plain line");
    console.error("boom sk-ws-abc123def456ghi");
    // A cyclic object is ordinary here (React elements, fetch responses) and a
    // throw inside the capture layer would take out the log call it wraps.
    const cyclic = { a: 1 }; cyclic.self = cyclic;
    console.warn("cyclic:", cyclic);
    console.log("fn:", () => 1);
  } finally {
    console.log = realLog; console.error = realErr;
    console.warn = realWarn; console.info = realInfo;
    delete globalThis.window;
  }
  check("capture always calls through to the real console",
    seen.length === 4 && seen[0][1] === "plain line",
    JSON.stringify(seen.map((s) => s[0])));
  const log = dbg.getDebugLog();
  check("...and records every level it wrapped",
    log.length === 4 && log.map((e) => e.level).join(",") === "log,error,warn,log",
    JSON.stringify(log.map((e) => e.level)));
  check("a key logged by accident is redacted in the buffer, not just on export",
    !JSON.stringify(log).includes("sk-ws-abc123"),
    "redaction at capture time, so the buffer itself is safe to hand over");
  check("a cyclic object is captured rather than throwing",
    log[2].text.includes("circular"), log[2].text.slice(0, 80));
  check("a function argument is captured rather than throwing",
    log[3].text.includes("function"), log[3].text.slice(0, 60));
  dbg.clearDebugLog();
  check("the buffer can be cleared", dbg.getDebugLog().length === 0);

  // Bounded: a long session must not grow the buffer without limit, and the
  // NEWEST entries are the ones worth keeping because a bug is reported right
  // after it happens.
  const dbgSrc = readFileSync(join(ROOT, "src/tools/debugConsole.js"), "utf8");
  check("the buffer is a bounded ring that drops the oldest entries",
    /buffer\.splice\(0, buffer\.length - MAX_ENTRIES\)/.test(dbgSrc),
    "an unbounded log on a phone is a memory leak with a UI");
  check("capture is installed before React renders",
    /installDebugCapture\(\)/.test(readFileSync(join(ROOT, "src/main.jsx"), "utf8")),
    "a boot-time throw happens before any component could install a handler");
  // Opt-in, and off by default: the launcher must not appear for ordinary players.
  // Layer G owns the App.jsx source guards, but these belong with the rest of the
  // debug checks, so the file is read locally rather than the block being split.
  const appSrc = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  check("the debug panel is gated behind an explicit flag",
    /debugEnabled\(\)/.test(appSrc) && /\{debugOn && !showDebug &&/.test(appSrc),
    "no player should meet a debug button they did not ask for");
  // Eruda is a third-party script running next to a stored API key. It has to
  // stay a separate, deliberate opt-in rather than riding along with ?debug=1.
  check("Eruda is a separate opt-in and is pinned to a version",
    /q !== "eruda"\) return false/.test(dbgSrc)
      && /eruda@\d+\.\d+\.\d+\/eruda\.min\.js/.test(dbgSrc),
    "an unpinned CDN URL lets a third party choose what runs beside the key");
  check("...and nothing loads Eruda unless it is asked for by name",
    !/loadEruda\(\)/.test(readFileSync(join(ROOT, "src/main.jsx"), "utf8")),
    "the built-in panel is the default precisely because it needs no third party");

  // --- step 6 commit 6: the birth-year correction, as wired ----------------
  // The behaviour is tested by running correctBirthYear above; these three say
  // the UI reaches it, and reaches the right one.
  const settingsBody = appSrc.slice(appSrc.indexOf("{showSettings && ("));
  check("the settings panel offers the birth-year correction",
    /t\.settings\?\.birthYearTitle/.test(settingsBody)
      && /applyBirthYearCorrection/.test(settingsBody),
    "a correction nobody can find fixes nothing");
  // THE regression this pair exists for: Setup's handler mints `age` and this
  // one must not. Calling setBirthYear here would re-roll the identity
  // backstory of every save it touched.
  const applyBody = appSrc.slice(appSrc.indexOf("const applyBirthYearCorrection"),
    appSrc.indexOf("useEffect(() => {", appSrc.indexOf("const applyBirthYearCorrection")));
  check("the correction goes through correctBirthYear, not Setup's handler",
    /correctBirthYear\(form, birthYearDraft\)/.test(applyBody)
      && !/setBirthYear\(/.test(applyBody) && !/age:/.test(applyBody),
    "Setup writes both fields on purpose; the correction writes one");
  // iOS ate a whole field to type="number" in this step already (the member
  // editor's birthday). Comments are stripped first — the one explaining why
  // it is not a number input would otherwise trip this.
  const noComments = settingsBody.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const yearInput = noComments.slice(noComments.indexOf("value={birthYearDraft}"),
    noComments.indexOf("value={birthYearDraft}") + 260);
  check("...and the year field is typable on a phone",
    /inputMode="numeric"/.test(yearInput) && !/type="number"/.test(yearInput),
    yearInput.slice(0, 120));

  // The notice has to be decided from the save as it arrived, not from the
  // migrated copy — migration fills the field, so reading `migrated.form` there
  // would mean the estimate is never announced to anyone.
  const loadBody = appSrc.slice(appSrc.indexOf("const loadSave"), appSrc.indexOf("const sendMessage"));
  check("a save that carried no birth year is flagged as carrying an estimate",
    /setBirthYearEstimated\(!save\.form\?\.birthYear/.test(loadBody),
    "read before the migrated form replaces it, or nothing is ever flagged");
  // One range, one validator. A second copy is how Setup and the correction
  // start disagreeing about which years are legal.
  check("the playable year range is defined once, in constants",
    /PLAYER_BIRTH_YEAR_MIN[,\s}][^\n]*from "\.\/config\/constants"/.test(appSrc)
      && !/const PLAYER_BIRTH_YEAR_MIN\s*=/.test(appSrc),
    "App.jsx must not carry its own copy of the bounds");

  for (const lang of ["zh", "en", "ko"]) {
    const { default: pack } = await import(`../src/i18n/${lang}.js`);
    const s = pack.settings || {};
    check(`[${lang}] the birth-year row is translated`,
      ["birthYearTitle", "birthYearApply", "birthYearHint", "birthYearEstimated",
       "birthYearSaved"].every((k) => typeof s[k] === "string" && s[k].length > 0),
      JSON.stringify(Object.keys(s)));
    check(`[${lang}] ...and the out-of-range hint names both bounds`,
      typeof s.birthYearRange === "function"
        && s.birthYearRange(1946, 2008).includes("1946") && s.birthYearRange(1946, 2008).includes("2008"),
      String(s.birthYearRange?.(1946, 2008)));
  }
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

  // kkt-transcribed-in-story. The prose below is the real round a player
  // reported on DeepSeek Official in zh: the model delivered the Kakao AND
  // wrote it into the story, so she read it twice. The existing grader runs
  // only when NOTHING was delivered and could never have seen this.
  const kktRound = { irene: ["到家了吗", "粥的事……我不是随便说的", "下次见面，别道歉。"] };
  const transcribed = "她伸手替你把被子拉高。\n\n---\n\n【手机屏幕亮起】\n\n"
    + "**📱 KKT · 裴珠泃**\n到家了吗\n粥的事……我不是随便说的\n下次见面，别道歉。";
  check("kkt-transcribed-in-story flags a delivered Kakao written into the prose",
    g.kktTranscribed(transcribed, kktRound).length > 0, JSON.stringify(g.kktTranscribed(transcribed, kktRound)));
  check("...and names the member whose messages were duplicated",
    g.kktTranscribed(transcribed, kktRound)[0] === "kkt-transcribed-in-story:irene");
  // The delivered line ends in 。 and the prose re-punctuates it as it reflows
  // the sentence, so an exact match would miss. Isolated to ONE message, or it
  // passes on a different one and proves nothing — which is what it did first.
  check("...and still flags when the model reflows the trailing punctuation",
    g.kktTranscribed("“下次见面，别道歉”，她在心里默念。",
      { irene: ["下次见面，别道歉。"] }).length > 0,
    "trailing punctuation must be stripped before matching");
  // kktUpdate carries plain strings today and {sender, content} after
  // memoryPool normalizes; the grader is fed both shapes across the codebase.
  check("...and reads the {sender, content} shape as well as a plain string",
    g.kktTranscribed("她低头看屏幕：到家了吗，粥我煮好了。",
      { irene: [{ sender: "irene", content: "到家了吗，粥我煮好了" }] }).length > 0,
    "normalized KKT entries are objects, not strings");
  check("...and does not flag a round whose prose merely mentions the app",
    none(g.kktTranscribed("KKT的窗口一直没有亮。", kktRound)),
    "naming the app is legitimate — the locked-channel rule tells it to");
  check("...and does not flag a short message that is ordinary dialogue",
    none(g.kktTranscribed("“好。”她说。", { irene: ["好。"] })),
    "under the verbatim floor, or every 응/ok in dialogue would fire");
  check("...and does not flag when nothing was delivered",
    none(g.kktTranscribed(transcribed, {})),
    "that is the sibling check's job, and it must not double-report");

  // The harness must actually call them, or the layer tests dead code.
  const harness = readFileSync(join(ROOT, "test", "playthrough.mjs"), "utf8");
  for (const fn of ["narratedHonorifics", "nameYaVocative", "sinicizedHonorifics", "selfNameErrors",
                    "kktTranscribed"]) {
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
