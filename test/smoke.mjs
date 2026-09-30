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

import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { EXPECTED, bumpFile, readCurrentVersion } from "../scripts/bump-version.mjs";
import { MIRRORED_TREES, MIRRORS, buildProbePlan, classifyResponse } from "../scripts/verify-mirrors.mjs";
import { classifyWorktree, parseWorktreeList, auditWorktrees, classifyHotfixBranch } from "../scripts/worktree-hygiene.mjs";
import { PLAYER_BIRTH_YEAR_MIN, PLAYER_BIRTH_YEAR_MAX, validPlayerBirthYear } from "../src/config/constants.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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

    // 5. everything exhausted. Every rejection here is instant, so ONE round
    //    discovers the whole route — and the verdict is therefore true when it
    //    is finally given, which is the whole point: free_all_exhausted tells
    //    the player to start paying, so it may not be raised on a route that
    //    was never walked. See 5c for what that cost before.
    fresh();
    calls = mockFetch(() => FREE_EXHAUSTED);
    r = await run(KEY, { mode: "free" });
    eq("all exhausted -> free_all_exhausted", r.error?.kind, "free_all_exhausted");
    eq("...having tried every model, since none of them cost any waiting", calls.length, R.length);
    eq("free_all_exhausted carries the last skip cause", r.error?.cause?.kind, "free_exhausted");
    eq("...naming the model it came from", r.error?.cause?.model, R.at(-1));
    calls = mockFetch(() => FREE_EXHAUSTED);
    r = await run(KEY, { mode: "free" });
    eq("an empty route then costs one call — the hourly recovery probe", calls.length, 1);
    eq("...and still reports free_all_exhausted", r.error?.kind, "free_all_exhausted");

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
    check("...even though 24 spent models were skipped after it", calls.length === R.length, `${calls.length} calls`);

    // 5c. Four spent models at the head of the route must not cost the round.
    // MAX_MODELS_PER_ROUND bounds how long the player waits; an instant
    // rejection costs no waiting and earns a lasting mark, so it may not spend
    // that budget. Measured on the dev key 2026-09-27: five of its six
    // exhausted models sit in the first five route entries, so the first walk
    // on a fresh key hash burned all four attempts in 1.6s and told the player
    // "All free-credit models are used up. Switch to Paid mode to keep
    // playing." — with 22 healthy models never tried.
    fresh();
    calls = mockFetch((m) => (R.indexOf(m) < 4 ? FREE_EXHAUSTED : ok));
    r = await run(KEY, { mode: "free" });
    eq("four spent models at the head -> the round is still served", r.content, '{"story":"ok"}');
    eq("...by the fifth model", calls.join(","), R.slice(0, 5).join(","));
    eq("...so the player is never told to start paying", r.error, undefined);

    // 5d. ...but a SLOW failure still spends the budget, because waiting is
    // exactly what the cap exists to bound. bad_response is the slow skip: it
    // costs MAX_BAD_RETRIES same-model attempts before the walk moves on.
    fresh();
    const EMPTY_BODY = { status: 200, body: { choices: [{ message: { content: "" } }] } };
    calls = mockFetch(() => EMPTY_BODY);
    r = await run(KEY, { mode: "free" });
    eq("four slow failures stop the round at four models", new Set(calls).size, 4);
    eq("...and the kind is the failure that happened, not free_all_exhausted", r.error?.kind, "bad_response");

    // 5e. The first model that can actually make the player wait gets the full
    // limit. Keying the short leash off the attempt COUNT put the first genuine
    // candidate on 30s whenever a spent model preceded it — so on this key every
    // round was decided in 30s by a model the route reached fifth.
    fresh();
    const armedTimers = [];
    const stubbedST = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => { if (ms >= 20000) armedTimers.push(ms); return stubbedST(fn, ms, ...a); };
    calls = mockFetch((m) => (R.indexOf(m) < 2 ? FREE_EXHAUSTED : ok));
    r = await run(KEY, { mode: "free" });
    globalThis.setTimeout = stubbedST;
    eq("two spent models then a healthy one -> served", r.content, '{"story":"ok"}');
    eq("...and every attempt got the full first-attempt timeout", armedTimers.join(","), "90000,90000,90000");

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
  // ── the run boundary ──────────────────────────────────────────────────────
  // There are TWO ways into a run and everything the previous one left behind
  // has to go on both. They had drifted three ways - New Game re-applied the
  // abandoned run's social and its notification dots, Load left `topMember`
  // pointing at the other run's member, and neither closed an open modal - so
  // it is one function now and these guards are written against the
  // requirement (nothing of the old run survives) rather than against the line
  // that used to do it.
  const newGameBody = app.slice(app.indexOf("const startNewGame"), app.indexOf("const loadSave"));
  const beginRunBody = app.slice(app.indexOf("const beginRun = ("), app.indexOf("const startNewGame"));
  check("the run boundary drops the previous run's pending social",
    /resetPendingSocial\(\)/.test(beginRunBody));
  check("...and its pre-round snapshot, so ↺ Retry cannot restore the other run",
    /preRoundSnapshotRef\.current = null/.test(beginRunBody));
  check("...and its notification strip, which is also where the top-bar dots come from",
    /setActiveNotifications\(\[\]\)/.test(beginRunBody),
    "hasNotifDot reads this same array");
  check("...and its top member, or the bar shows her scored against an id this run has no affection for",
    /setTopMember\(topMember\)/.test(beginRunBody));
  check("...and any achievement or special-event modal left open",
    /setAchievement\(null\)/.test(beginRunBody) && /setSpecialEvent\(null\)/.test(beginRunBody));
  // Count the call sites. A second boundary that cleared by hand is exactly how
  // the two drifted in the first place, so the absence is half the check.
  check("both ways into a run go through it, and neither clears anything by hand",
    /beginRun\(\{/.test(loadSaveBody) && /beginRun\(\{/.test(newGameBody)
      && !/resetPendingSocial\(\)/.test(loadSaveBody) && !/setActiveNotifications/.test(loadSaveBody)
      && !/resetPendingSocial\(\)/.test(newGameBody) && !/setActiveNotifications/.test(newGameBody),
    "New Game and Load must both hand beginRun what the run starts with");
  // The bug itself: round 1 of a new game POPPED the buffer, which on a new game
  // holds the abandoned game's last round - so the run opened with somebody
  // else's Instagram post and notification dots already on the phone.
  check("a new game does not display the abandoned run's social",
    !/popPendingSocial\(\)/.test(newGameBody),
    "round 1 has no previous round of its OWN; the buffer is the last game's");
  check("...and the only reader of that buffer is a round that follows one",
    (app.match(/popPendingSocial\(\)/g) || []).length === 1,
    "sendMessage, and nothing else");

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
  // Derived rather than anchored on one line: the first thing in the body that
  // looks like a state setter, whichever it happens to be after a refactor.
  const firstSetter = loadSaveBody.search(/\n\s*set[A-Z]/);
  check("a save whose cast cannot be resolved aborts rather than half-loading",
    firstSetter > 0
      && loadSaveBody.indexOf("showNotif(\"This save's cast could not be loaded\"") < firstSetter
      && /could not be loaded"[^\n]*\);[\s\S]{0,40}return;/.test(loadSaveBody),
    "the failure path must return before the first setter");

  // ── the setup pages fit on one 844px screen ──────────────────────────────
  // The page ran past the frame and the Start button sat below the fold behind
  // half a row of identities, on the one screen whose whole job is to be
  // completed. The header was four stacked lines; it is one row now.
  //
  // DERIVED OVER EVERY PAGE THAT CARRIES ONE, not pinned to Setup. §22.2 split
  // this flow in two, and the old slice took `app.indexOf(setupCss)` - the FIRST
  // match, which is now the player-info page - so one guard was silently reading
  // a different screen than the one it was named after. A header that has to be
  // one row on one page has to be one row on both.
  // Bounded at the NEXT phase, or at the game screen for the last one: a slice
  // running to EOF folds the game screen into the final phase, which would let a
  // control rendered in game satisfy a check about a setup page. No control named
  // below appears there today, which is exactly why this was worth fixing now -
  // harmless-today is how a guard comes to pass against a real regression later.
  const phaseBlock = (id) => {
    const at = app.indexOf(`if (phase === "${id}") {`);
    if (at < 0) return "";
    const ends = [app.indexOf('if (phase === "', at + 10),
      app.indexOf("// \u2500\u2500 Game Main Screen", at + 10)].filter((x) => x > 0);
    return app.slice(at, ends.length ? Math.min(...ends) : app.length);
  };
  const SETUP_PAGES = ["playerInfo", "setup"];
  const fatHeads = [];
  for (const id of SETUP_PAGES) {
    const block = phaseBlock(id);
    const from = block.indexOf("<style>{th.setupCss}</style>");
    if (from < 0) { fatHeads.push(`${id}: no setupCss, so this page is not the one`); continue; }
    // To the first LABEL, which is what "above the first field" means on either
    // page - Setup's first field is a cast picker and player info's is a name.
    const to = block.indexOf('className="s-l"', from);
    const head = block.slice(from, to < 0 ? block.length : to);
    // COUNT THE SYMPTOM, not a proxy for it. The old check counted every
    // `<div style=` in the slice, which is one on Setup and two on player info
    // only because the latter's first label is nested in a caption row - a
    // difference about markup, not about whether the header stacks. What stacked
    // was a header ROW: a wrapping flex line of 10px muted text. There is one.
    const rows = (head.match(/flexWrap: \"wrap\"[^>]*fontSize: 10/g) || []).length;
    if (/<h2 /.test(head) || rows !== 1) fatHeads.push(`${id}: ${rows} header rows, h2=${/<h2 /.test(head)}`);
  }
  check("every setup page's header is one row rather than a stack",
    fatHeads.length === 0, fatHeads.join(" | "));
  const setupHead = phaseBlock("setup").slice(
    phaseBlock("setup").indexOf("<style>{th.setupCss}</style>"),
    phaseBlock("setup").indexOf("{/* The custom door already chose"));
  // Shortening a screen by deleting affordances is the easy wrong answer, so
  // both halves are asserted: the switch still reaches the key page, and a
  // MISSING key - the actionable state, unlike a configured one - still shouts.
  check("...and the model switch survived the trim",
    /setPhase\("keyInput"\)/.test(setupHead) && /MODEL_CONFIGS\[selectedModel\]/.test(setupHead));
  check("...and a missing key is still called out in red",
    /\{!apiKey && <span style=\{\{ color: "#d07070" \}\}>/.test(setupHead));

  check("startNewGame records the roster it is starting",
    /\(pendingRoster && \{ \.\.\.pendingRoster, name: [\s\S]{0,80}\}\)\s*\r?\n?\s*\|\| buildClassicRoster\(/.test(app)
      && /setRoster\(\w+\);/.test(app),
    "the builder's roster, named, or one composed from the form");
  // Two doors, and the builder's roster wins. Rebuilding it from the form would
  // throw away the NPC slots the player assigned and flatten a cross-group cast
  // into whichever single group happened to be selected. The order in that
  // expression IS the behaviour, so it is pinned rather than merely mentioned.
  check("a roster built by the builder is preferred over one composed from the form",
    app.indexOf("(pendingRoster && { ...pendingRoster") > 0
      && !/buildClassicRoster\([^)]*\) \|\| pendingRoster/.test(app),
    "pendingRoster must come first");

  // --- §22.5 commit 4b: the Start-boundary restaging sweep -------------------
  //
  // §22.1's defect is the DEFAULT path - 57 of 57 library members describe
  // themselves through idol work - so the sweep runs for the whole cast on both
  // doors rather than for whoever opened an editor. Written on the call, not on a
  // flag: the `--provider` lesson is that a guard on the argument list passes while
  // the value stays hardcoded one line below it.
  check("the Start boundary restages the whole cast into the world it is starting in",
    /generateCastDetail\(\{[\s\S]{0,120}members, world,/.test(app),
    "a fix that reaches only players who open an editor does not reach the defect");
  // In the world the library was authored for, the prose is already about this
  // world: restaging it would replace correct text with generated text and spend a
  // call per member doing it.
  check("...and only in a world the library was not written for",
    /if \(world && !world\.castLore\?\.useRole\) \{[\s\S]{0,400}generateCastDetail\(/.test(app),
    "kpop_idol needs no restaging and must not pay for one");
  // THE EXPENSIVE HALF. The roster is what the save carries and what every later
  // round re-resolves, so stamping only the roster would send un-restaged prose in
  // round 1 and the restaged version from round 2 - a drift of the whole
  // ~5,500-token cached prefix, which is the ex-girlfriend Math.random() defect
  // with a network call in it.
  check("...and round 1 is built from the restaged cast, not the cast before it",
    /members: roundMembers,/.test(app)
      && /roundMembers = members\.map\(m => applyWorldDetail\(/.test(app),
    "round 1 and round 2 must build the same static prompt");
  check("...and the roster the save records is the stamped one",
    /roundRoster = withCastDetail\(builtRoster, detailById, world\.id\)/.test(app)
      && /setRoster\(roundRoster\);/.test(app),
    "generated text must reach the save or buildSystemPrompt stops being a function of it");
  // The name is applied at START, not held in pendingRoster: the effect that
  // resolves that roster depends on it, so folding it in would re-resolve the
  // whole cast on every keystroke.
  check("the cast name is applied when the game starts, not stored in the roster state",
    /name: castName\.trim\(\) \|\| DEFAULT_CAST_NAME/.test(app)
      && !/setPendingRoster\(\{ \.\.\.pendingRoster, name/.test(app),
    "re-resolving per keystroke would refetch every group in the cast");
  // v1.4.1 step 3: the field still asks for one name, and WHAT that name names is
  // the world's. Written on the world fields rather than on a label string: a
  // guard reading `t.cast.orgName` would pass while the noun came from a literal,
  // which is the whole defect - "Group name" is right for one world of four.
  check("Setup names the cast's organisation, with the noun the WORLD supplies",
    /t\.cast\.orgName\(world\.castLore\.orgNoun\)/.test(app)
      && /world\.castLore\.orgHint\.replace\("\{org\}"/.test(app)
      && /orgNameFor\(castName\.trim\(\), world\.castLore\.orgSuffix\)/.test(app),
    "naming the organisation is what stops the model inventing one");
  // Comments stripped first. The prose explaining this fix names the very strings
  // the check bans, and a guard that fails on its own documentation has now cost
  // this suite three separate debugging sessions.
  const appCode = app
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check("...and no screen carries a hardcoded word for it",
    !/t\.cast\.castName\b/.test(appCode) && !/agencyFor\(/.test(appCode)
      && !/已加载组合/.test(appCode) && !/Group loaded/.test(appCode),
    "a literal noun here is right for kpop_idol and wrong for the other three");
  // --- the world picker, v1.4.1 step 3 -------------------------------------
  // It took the slot the pace picker vacated, which is WHY both cover doors get
  // worlds without merging the entry pages: they both pass through Setup.
  check("Setup carries a world picker fed by the world INDEX",
    /loadWorldIndex\(\)\.then\(list => \{/.test(app) && /worldList\.map\(w =>/.test(app)
      && /setSelectedWorld\(w\.id\)/.test(app),
    "a hardcoded world list is what step 7 would then have to edit in code");
  // Same correction the group index gets: a remembered id the index no longer
  // carries must not be left pointing at a world that cannot be fetched.
  check("...and a remembered world the index no longer lists falls back",
    /if \(!list\.find\(w => w\.id === selectedWorld\)\) setSelectedWorld\(DEFAULT_WORLD_ID\)/.test(app),
    "rv_sim_world can hold whatever a previous build left there");
  // Persisted only AFTER the world it names has loaded, so a world that cannot be
  // fetched is not the one the next session opens on.
  check("...and the pick persists only once that world has actually loaded",
    /loadWorld\(selectedWorld, language\)\.then\(w => \{[\s\S]{0,400}?saveToStorage\("rv_sim_world", selectedWorld\)/.test(app),
    "persisting on click remembers a world the player never reached");
  check("...and the world load is keyed on the SELECTION, not on the default",
    !/loadWorld\(DEFAULT_WORLD_ID, language\)/.test(app)
      && /\}, \[selectedWorld, language\]\);/.test(app),
    "a picker whose value nothing loads is a control that does nothing");
  // A save records its worldId. Loading it under whichever world is selected now
  // hands it another world's identities, phase beats and address register - the
  // same bug as a TWICE save loaded under Red Velvet's config, one field over.
  check("loadSave restores the world the save was played in",
    /setSelectedWorld\(migrated\.worldId\)/.test(app)
      && app.indexOf("phaseRef.current = \"game\"") < app.indexOf("setSelectedWorld(migrated.worldId)"),
    "and after phaseRef is pinned, or the identity effect clears a valid identity");

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
    /setDoor\("custom"\);[\s\S]{0,600}if \(apiKey\?\.trim\(\)\) setPhase\("playerInfo"\); else setPhase\("keyInput"\);/.test(app),
    "cardGenerator runs on the key the player already entered");

  // ── THE CAST SCREENS COME AFTER THE WORLD IS CHOSEN - §22.2 ──────────────
  // `generateCard` reads `world` from App state, and the builder used to be
  // entered straight from the cover - so it described a member "in this world"
  // using the world LEFT IN localStorage BY THE LAST SESSION. Asking first is
  // what makes the generator's input correct by construction.
  //
  // Written as what must NOT happen, at the two entry points that could do it,
  // because that is the defect: a screen before the world is chosen jumping
  // straight to a screen that can generate. Derived over both doors, so neither
  // can regress alone - the org-suffix lesson.
  const earlyJumps = [];
  for (const id of ["cover", "keyInput"]) {
    const block = phaseBlock(id);
    if (!block) { earlyJumps.push(`${id}: block not found, so this proves nothing`); continue; }
    for (const dest of ["roster", "setup"]) {
      if (block.includes(`setPhase("${dest}")`)) earlyJumps.push(`${id} -> ${dest}`);
    }
    if (!block.includes('setPhase("playerInfo")')) earlyJumps.push(`${id} reaches no player-info page`);
  }
  check("neither door reaches a cast screen before the world is chosen",
    earlyJumps.length === 0, earlyJumps.join(" | "));
  // ...and the page that asks for it will not move on without one, or the world
  // is merely ASKED rather than settled - `world` is null for the width of a
  // fetch, so a gate without it lets a Continue through mid-switch.
  check("...and the player-info page will not continue until the world has loaded",
    /const canContinue = [^\n]*\bworld\b/.test(phaseBlock("playerInfo")),
    "an identity is a position inside a world, so the grid means nothing without one");
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
    /resolveRoster\(pendingRoster, language, world\)/.test(app));
  // Counted, not tested for presence. Section 4's framing is the world's since
  // v1.4.1 step 4, so a call site that forgot the third argument does not render a
  // lecture hall as an agency - it throws - but a call site handed the WRONG world
  // renders plausible, wrong prose. Three sites today; a fourth must not slip in
  // with two arguments.
  const rosterCalls = app.match(/resolveRoster\(/g) || [];
  const rosterCallsWithWorld = app.match(/resolveRoster\([^;]*?,\s*\w*[Ww]orld\)/g) || [];
  check("every resolveRoster call in App.jsx is handed a world",
    rosterCalls.length >= 3 && rosterCallsWithWorld.length === rosterCalls.length,
    `${rosterCallsWithWorld.length} of ${rosterCalls.length} call sites`);
  // ...and loadSave uses the SAVE's world, not whichever one the player was last
  // looking at. `world` state still holds the previous one at this point, and it
  // decides what section 4 says about this cast.
  check("loadSave resolves the roster against the world the save was played in",
    /loadWorld\(migrated\.worldId, language\)/.test(loadSaveBody)
      && /resolveRoster\(migrated\.roster, language, saveWorld\)/.test(loadSaveBody),
    "resolving a chaebol save against the idol world describes a family compound"
    + " as a group under an Entertainment agency");
  // ...and fetches it BEFORE the first setter, because it is a fetch and can fail.
  // The load is all-or-nothing: a failure must leave the player where she was.
  check("...and fetches it inside the try, before the FIRST setter of any kind",
    loadSaveBody.indexOf("loadWorld(migrated.worldId")
      < loadSaveBody.search(/\bset[A-Z]\w*\(/),
    "a half-applied load leaves a game assembled out of two different saves");
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
  check("...and Back from Setup returns to the builder, or to player info",
    /setPhase\(pendingRoster \? "roster" : "playerInfo"\)/.test(app),
    "back is ONE step: the cover discards a cast, and player info is the step this page lost its controls to");

  // ── the four player-info controls live on ONE page, and it is not Setup ──
  // Both directions, because a copy left behind is the failure: two pages asking
  // for the birth year means two wheels, and a wheel is only seeded on the page
  // that was remembered - which is the v1.4.1 year-wheel bug with a second way in.
  const PLAYER_CONTROLS = [
    ["the name field", /placeholder=\{language === "zh" \? "名字"/],
    ["the birth-year wheel", /<YearWheel value=\{form\.birthYear\}/],
    ["the world picker", /worldList\.map\(w =>/],
    ["the identity grid", /world\.identities\.map\(i =>/],
  ];
  const misplaced = [];
  for (const [what, re] of PLAYER_CONTROLS) {
    if (!re.test(phaseBlock("playerInfo"))) misplaced.push(`${what} is not on the player-info page`);
    if (re.test(phaseBlock("setup"))) misplaced.push(`${what} is STILL on the cast page`);
  }
  check("name, birth year, world and identity are asked once, before the cast",
    misplaced.length === 0, misplaced.join(" | "));
  // A WHEEL ALWAYS DISPLAYS A VALUE, so the seed has to fire on the page that
  // MOUNTS the wheel. The existing scan proves some screen writes DEFAULT_YEAR;
  // this proves the phase it writes it for is the phase the wheel is on, which is
  // the half that moved in §22.2 and the half the original bug was.
  const seedPhase = (app.match(/if \(phase === "(\w+)" && !form\.birthYear\)/) || [])[1];
  check("the birth year is seeded for the phase that renders the wheel",
    Boolean(seedPhase) && /<YearWheel value=\{form\.birthYear\}/.test(phaseBlock(seedPhase)),
    `seeded for "${seedPhase}", which does not render the wheel`);
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
  // Counted against the call sites, not tested for presence in one of them. This was
  // two copies of the same filter — clipboard/TXT here, PDF inside exportPdf — and the
  // PDF copy had drifted: it filtered only `!m.hidden`, so it carried error notices
  // into the exported story, numbered its rounds off a different filter, and missed the
  // `╚` fix. The old guard read the other copy and could see none of it.
  check("story export skips tagged error messages",
    /const storyRounds = \(\) => messages[\s\S]{0,200}!m\.error/.test(app),
    "the one definition both exports use must drop error notices");
  const exportUses = (app.match(/storyRounds\(\)/g) || []).length;
  check("...and both exports go through that one definition",
    exportUses >= 2 && !/messages\s*\n?\s*\.filter\(m => m\.role === "assistant" && !m\.hidden\)\s*\n?\s*\.map/.test(app),
    `${exportUses} call sites — clipboard/TXT and PDF`);

  // The stats box the player reads every round. Two defects, both of the same shape
  // as the blank line in section 6 of the prompt: an absent value rendered as an
  // empty line rather than as nothing.
  //
  // A solo run has no sub members, and the empty string in their place put a BLANK
  // LINE inside the box — which split the box into two `\n\n` paragraphs, and the
  // export filter only dropped paragraphs beginning with `╔`. So every exported
  // round of a solo game carried a stray `╚══════════════════════════════╝`.
  const boxBody = app.slice(app.indexOf("function buildStatsBox"), app.indexOf("function buildStatsBox") + 1400);
  check("the stats box drops absent lines instead of rendering them empty",
    /\]\.filter\(Boolean\)\.join\("\\n"\)/.test(boxBody) && !/subLines \|\| ""/.test(boxBody),
    "an empty sub-member line splits the box in two and leaks its border into exports");
  // Both borders count as BOX, not as prose. Since v1.4.1 the filter splits the
  // box off instead of dropping it - the PDF prints it as the round header - so
  // the thing that must not regress is which paragraphs are classified as the
  // box, not whether they are discarded.
  const roundsBody = app.slice(app.indexOf("const BOX_EDGES"), app.indexOf("const extractStoryText"));
  check("...and the export filter knows the box's closing border too",
    /BOX_EDGES = \["╔", "╚"\]/.test(roundsBody)
      && /isStatsBoxPart = \(para\) => BOX_EDGES\.some/.test(roundsBody),
    "the filter is what breaks silently when the box format moves");

  // ── the PDF prints the round header the player actually reads ────────────
  // It printed a bar saying `Round 9` above prose whose own header box - the
  // affections, the stats, the scene, the chapter - was filtered out on the way.
  // The box already carries the round number, so the bar is a second and poorer
  // answer to the same question and survives only where there is no box.
  check("the PDF prints the stats box as the round header",
    /class="card-stats">[\s\S]{0,30}\$\{esc\(r\.statsBox\)\}/.test(app)
      && /\.card-stats\{/.test(app),
    "what the player sees at the top of every round");
  // The band is the LIGHTER thing on the card now, and its text has to be
  // picked for it. `.card-head` carried a hardcoded pink chosen for a near-black
  // band, and on the light theme the old band put #3a2510 text on #3a2210 - the
  // printed stats box was very nearly invisible. Asked for from hand play,
  // 2026-09-29.
  check("...and the header band takes the theme's own text colour",
    /\.card-head\{background:\$\{headBg\};color:\$\{headColor\}/.test(app)
      && !/color:#f8c8d8;font-size:11px/.test(app),
    "a colour picked for one theme's band cannot be hardcoded across both");
  // Centred as a BLOCK, not line by line: the frame's lines are equal width only
  // if every CJK glyph in the monospace fallback is exactly two columns, which is
  // the one thing box-drawing output cannot assume. text-align:center would
  // centre each line on its own and pull the frame apart.
  check("...and the box is centred in its band as one block",
    /\.card-stats\{[\s\S]{0,90}justify-content:center/.test(app)
      && !/\.card-stats\{[\s\S]{0,90}text-align:center/.test(app),
    "per-line centring ragged by a font is worse than left-aligned");
  // THE ROUNDS FLOW AND THE FRAME DOES NOT SPLIT, which is two halves of one
  // requirement: avoid-break on the card pushed any round that would not fit
  // whole onto the next page, so a two-page export was mostly white paper - and
  // simply dropping it would let a page break land inside the box-drawing frame,
  // where half a frame is not a frame. Asked for from hand play, 2026-09-29.
  check("the PDF lets rounds flow rather than starting each on its own page",
    !/\.card\{[\s\S]{0,180}page-break-inside:avoid/.test(app),
    "a round that does not fit whole left the rest of the page blank");
  // Both properties, and the modern one is matched on its OWN boundary: plain
  // `break-inside:avoid` is a SUBSTRING of `page-break-inside:avoid`, so a guard
  // written without the [;{] could not fail when the standard property was the
  // one deleted. Caught by mutation, not by reading it.
  check("...and never splits the stats box across a page",
    /\.card-stats\{[\s\S]{0,140}page-break-inside:avoid/.test(app)
      && /\.card-stats\{[\s\S]{0,140}[;{]break-inside:avoid/.test(app),
    "the frame is drawn out of box-drawing characters and only reads whole");
  check("...and the plain bar survives only for a round that has no box at all",
    /\$\{r\.statsBox[\s\S]{0,200}: `<div class="card-head">Round \$\{r\.n\}<\/div>`\}/.test(app),
    "an edited-down story, or a turn written before the box existed");
  // The scene name is the model's text and lands in the header, so it needs the
  // same escaping the prose has always had - one escaper, both halves.
  check("...and the header is escaped exactly like the prose",
    /esc\(r\.statsBox\)/.test(app) && /esc\(r\.text\)/.test(app),
    "a scene containing < must not become markup");
  // Clipboard and TXT were NOT asked to change, and a shared filter is where
  // that kind of change leaks. `text` must still exclude the box.
  check("...while clipboard and TXT still export prose alone",
    /text: paras[\s\S]{0,160}!isStatsBoxPart\(para\) && !isOptionLine\(para\)/.test(roundsBody)
      && !/statsBox/.test(app.slice(app.indexOf("const extractStoryText"), app.indexOf("const exportClipboard"))),
    "the box is a 30-column frame; it only lines up in a fixed-width font");
  // `chapter` is an internal token — start/develop/climax/resolve — and it was
  // printed raw beside four fields that all carry a localized label, so a Chinese
  // player read `🎭: [start]` every round.
  check("the chapter is localized rather than printed as its internal token",
    /t\.stats\.chapters\?\.\[stats\.chapter\]/.test(boxBody),
    (boxBody.split("\n").find((l) => l.includes("🎭")) || "").trim());
  for (const lang of ["zh", "en", "ko"]) {
    const src = readFileSync(join(ROOT, `src/i18n/${lang}.js`), "utf8");
    const chapters = (src.match(/chapters:\s*\{([^}]*)\}/) || [, ""])[1];
    check(`[${lang}] every chapter getChapterByRound can return has a label`,
      ["start", "develop", "climax", "resolve"].every((c) => new RegExp(`\\b${c}:`).test(chapters)),
      chapters.trim() || "no chapters table");
  }
  // The four tokens are the function's whole range; a fifth added there needs a label
  // in three files, and would otherwise render raw exactly as the others used to.
  const chapterFn = readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8")
    .match(/function getChapterByRound[\s\S]*?\n\}/)[0];
  check("getChapterByRound returns only the four the i18n tables cover",
    [...chapterFn.matchAll(/return "([a-z]+)"/g)].map((m) => m[1]).sort().join(",")
      === "climax,develop,resolve,start",
    [...chapterFn.matchAll(/return "([a-z]+)"/g)].map((m) => m[1]).join(","));
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
  // Asserted on the RANGE the control offers rather than on its placeholder,
  // which is what the previous version pinned and what step 8's wheel moved into
  // a label. The range is the part that can be wrong in a way nobody notices:
  // handing Setup the custom-cast bounds (1980-2012) would let a player be 14.
  check("setup collects a birth year, not an age",
    /<YearWheel[\s\S]{0,400}min=\{PLAYER_BIRTH_YEAR_MIN\} max=\{PLAYER_BIRTH_YEAR_MAX\}/.test(app)
    && !/\? "年龄"/.test(app));
  check("the start gate requires a plausible birth year",
    /canStart = [^\n]*validBirthYear\(form\.birthYear\)/.test(app),
    "a bare truthiness test would accept the year 12");
  // The seed that fixes an identity backstory for the life of a save hashes
  // form.age, so setup must keep writing it. Dropping the field would re-roll
  // every ex-girlfriend backstory, which is the bug v1.3.9 closed.
  check("setup still writes the frozen `age` the backstory seed hashes",
    /setBirthYear = \(v\) => setForm\([\s\S]{0,200}age: validBirthYear\(v\)/.test(app));

  // A WHEEL ALWAYS DISPLAYS A VALUE, so a screen that mounts one has to SEED the
  // field it displays rather than fall back for display alone. Setup did not, and
  // the third phone pass reported the consequence: a fresh run showed 2000 in the
  // wheel while form.birthYear was "", so Start refused with "please complete all
  // options" and nothing on screen was left to fill. The member editor had been
  // seeded for exactly this reason one release earlier.
  //
  // DERIVED from the wheels that exist, not from a list of screens: strip the
  // import and the `value=` attribute, and DEFAULT_YEAR must still be written
  // somewhere in the file. A third wheel cannot ship unseeded.
  const wheelScreens = [];
  const unseeded = [];
  const walkWheels = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const wp = join(dir, e.name);
      if (e.isDirectory()) { walkWheels(wp); continue; }
      if (!/\.(js|jsx)$/.test(e.name) || e.name === "YearWheel.jsx") continue;
      const src = readFileSync(wp, "utf8");
      if (!/<YearWheel/.test(src)) continue;
      const rel = wp.replace(join(ROOT, "src"), "").replace(/\\/g, "/").replace(/^\//, "");
      wheelScreens.push(rel);
      // COMMENTS FIRST. The first version of this guard read the comment
      // explaining the seed as if it were the seed, so the mutation that removes
      // the seed reported GREEN — the third time a guard in this repo has passed
      // against its own documentation.
      const seedOnly = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/[^\n]*$/gm, "")
        .replace(/^import[^\n]*DEFAULT_YEAR[^\n]*$/gm, "")
        .replace(/value=\{[^}]*\}/g, "");
      if (!/DEFAULT_YEAR/.test(seedOnly)) unseeded.push(rel);
    }
  };
  walkWheels(join(ROOT, "src"));
  check("every screen with a year wheel seeds the year the wheel opens on",
    wheelScreens.length >= 2 && unseeded.length === 0,
    unseeded.length ? unseeded.join(", ") : `the scan found ${wheelScreens.length} wheels, so it proves nothing`);

  // The other half, and it fails independently: with the field seeded, a display
  // fallback can only ever hide the seed failing. An unselected wheel is visible
  // and reportable; a highlighted year the form does not hold is not.
  check("Setup's wheel displays the stored year and no substitute for it",
    /<YearWheel value=\{form\.birthYear\}/.test(app),
    "a `|| DEFAULT_YEAR` here is the lie the player cannot act on");

  // And the seed has to be a year the gate accepts, or seeding reproduces the bug
  // it fixes. DEFAULT_YEAR is parsed from source because YearWheel.jsx is JSX and
  // Node cannot import it; the range and the predicate are the real modules.
  const wheelSrc = readFileSync(join(ROOT, "src", "platforms", "YearWheel.jsx"), "utf8");
  const defaultYear = Number((wheelSrc.match(/export const DEFAULT_YEAR = (\d+)/) || [])[1]);
  check("the year every wheel opens on is one the start gate accepts",
    Number.isFinite(defaultYear)
      && validPlayerBirthYear(String(defaultYear))
      && defaultYear >= PLAYER_BIRTH_YEAR_MIN && defaultYear <= PLAYER_BIRTH_YEAR_MAX,
    `DEFAULT_YEAR ${defaultYear} against ${PLAYER_BIRTH_YEAR_MIN}-${PLAYER_BIRTH_YEAR_MAX}`);

  // THE LATCH THAT SUPPRESSES THE WHEEL'S OWN SCROLL MUST BE CLEARED ON EVERY
  // EXIT, and seeding the value is what made that matter. The parking effect set
  // the latch on one path and cleared it only from a timeout, which the effect's
  // own cleanup cancels — so a `value` change arriving inside that 120ms window
  // left the next run taking the early return, clearing nothing, and the latch
  // set for the life of the component. Every scroll the player made was then
  // discarded: the wheel moved and the bold row did not follow it, and only a
  // tap could change the value. Reported from the fourth phone pass, one commit
  // after Setup began seeding on mount.
  //
  // REPRODUCED IN A REAL BROWSER, not reasoned about: a scratchpad harness
  // bundles this module, drives the state sequence with layout already settled,
  // and reads which row is aria-selected after a scroll. Unfixed it logs
  // `EARLY ... latch=true` then `SCROLL latch=true` and the selection never
  // moves; fixed, all four arms land on the target. That harness needs Chrome,
  // so it is NOT in this suite — what is here is the invariant it established.
  //
  // DERIVED from the effect's own shape rather than pinned to today's three
  // clears: every `return` inside the effect must be matched by a clear, except
  // the `if (!el)` guard that runs before the latch can be set. A fourth early
  // return added without a clear fails this.
  const parkEffect = (wheelSrc.match(/\/\/ Park the wheel on[\s\S]*?\n  \}, \[value, idxOf\]\);/) || [""])[0];
  const parkReturns = (parkEffect.match(/\breturn\b/g) || []).length;
  const parkClears = (parkEffect.match(/selfScroll\.current = false/g) || []).length;
  check("the wheel clears its self-scroll latch on every exit",
    parkEffect.length > 0
      && (parkEffect.match(/selfScroll\.current = true/g) || []).length === 1
      && parkClears >= parkReturns - 1,
    `${parkClears} clears against ${parkReturns} returns — a latch left set discards every scroll the player makes`);

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
  // Matched on `setSaves(` rather than on the argument's name: this guard broke
  // when the local was renamed from `updated` to `res.saves`, and a guard that
  // fails on a rename teaches people to loosen it rather than to read it.
  check("SaveOverlay writes before it renders the new slot",
    saveBody.includes("setSaves(")
      && saveBody.indexOf("saveToStorage(") < saveBody.indexOf("setSaves("),
    "setSaves ran first, which is what made a failed save invisible");
  check("SaveOverlay surfaces a quota notice", /t\.save\.quota/.test(overlay));

  // What a new slot records. saveMigrator backfills these for older saves, but
  // a slot written today must not need migrating at all.
  for (const field of ["schema", "groupId", "worldId", "roster"]) {
    check(`a new save slot records ${field}`,
      new RegExp(`(^|[\\s,{])${field}[,:]`, "m").test(saveBody),
      "a save that does not say which cast it used has to guess on load");
  }

  // ...and WHERE that world comes from, which the loop above cannot see: it
  // asserts the field is PRESENT, and the field was present and wrong. The slot
  // recorded `roster.worldId`, and a roster is stamped by the builder one screen
  // BEFORE the player picks a world at Setup - so a chaebol run saved kpop_idol,
  // and loading it brought back the idol world's canon places, all four social
  // platforms and an idol system prompt. Reported from hand play, 2026-09-29.
  // The world a run is played in is the loaded `world` object every prompt that
  // round was built from, and only the run knows it.
  check("a save records the world the run is being played in",
    /worldId: worldId \|\| DEFAULT_WORLD_ID/.test(saveBody)
      && !/roster\?\.worldId/.test(overlay),
    "the roster is stamped a screen earlier and drifts from what is played");
  // Two mount sites. One of two is the extractStoryText failure exactly.
  const saveMounts = app.match(/<SaveOverlay [^>]*>/g) || [];
  check("...and App hands that world to every SaveOverlay it mounts",
    saveMounts.length >= 2 && saveMounts.every((m) => /worldId=\{world\?\.id\}/.test(m)),
    `${saveMounts.filter((m) => !/worldId=/.test(m)).length} of ${saveMounts.length} mounts pass no world`);
  // ...and the slot the player READS says which world it was, because the panel
  // is the screen she picks from and two runs of one cast in two worlds were
  // indistinguishable there. The label leads, so it survives the ellipsis when a
  // row is too narrow. Asked for from hand play, 2026-09-29.
  check("a save slot is labelled with the world it was played in",
    /name: `\$\{worldLabel \? worldLabel \+ " " : ""\}\$\{t\.stats\.week\.label\}/.test(saveBody),
    "week and main member alone cannot tell two worlds apart");
  check("...and App derives that label from the world index, at every mount",
    /const worldLabel = \(\(\) => \{[\s\S]{0,320}worldList\.find\(\(x\) => x\.id === world\?\.id\)/.test(app)
      && saveMounts.every((m) => /worldLabel=\{worldLabel\}/.test(m)),
    "the index is what carries the emoji and the per-language name");

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

  // A version number inside a `src/` comment is HISTORY — "v1.4.0 step 6 - the
  // custom cast", "a pre-v1.4.0 save" — exactly as it is in CLAUDE.md, which is
  // anchored for this reason. Only a cover description is state. This went
  // unnoticed until v1.4.0 because it is the first version the code documents
  // itself against while also being the version being bumped to: the count
  // above read five cover strings in App.jsx where there are three, and the
  // next bump would have relabelled every one of those comments.
  //
  // Probed on a literal, not on the real file: the real file is what the loop
  // above already reads, and the rule has to hold for a comment nobody has
  // written yet.
  const bumpProbe = (line) => bumpFile("src/App.jsx", line, version, "0.0.0").count;
  check("a version number in a src comment is history and is left alone",
    bumpProbe(`  // a pre-v${version} save keeps the year it implied\n`) === 0,
    "rewriting it would move when something happened, which is worse than the drift the bump prevents");
  check("...while a cover description is state and is rewritten",
    bumpProbe(`  zh: { desc: "LLM . v${version}" },\n`) === 1,
    "the cover is how a player tells you what build they are running");

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
  // MIRRORED_TREES is imported from scripts/verify-mirrors.mjs rather than
  // written here. This guard proves the two trees MATCH offline; that script
  // proves a live host can SERVE them. Two copies of the list is how the
  // offline guard and the live verifier come to cover different trees.
  for (const tree of MIRRORED_TREES) {
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

  // --- GitHub Pages serves the root THROUGH Jekyll, and Jekyll hides `_*` ---
  //
  // The loop above proves the two trees MATCH. It says nothing about whether
  // the host can serve them, and on Pages it could not: Jekyll excludes every
  // path whose name begins with `_` or `.`, so `worlds/_registers/<lang>.json`
  // returned 404 on Pages alone while both build-from-source mirrors served it.
  // That file is the address-form register EVERY world resolves through, and
  // `parseWorld` throws on a register nobody ships rather than defaulting - so
  // `loadWorld` rejected into `.catch(console.error)`, `world` stayed null, and
  // Setup rendered a full-screen "Loading..." for ever. Reported from a phone
  // on 2026-09-30, hours after v1.4.1 shipped.
  //
  // v1.4.1 step 1 introduced the first underscore-prefixed path anything
  // FETCHES. `groups/_template/` had been unserved on Pages since the repo
  // began and cost nothing, because no code reads it - which is why three
  // releases of mirror checks never surfaced the rule.
  //
  // `.nojekyll` is the whole fix: it turns Jekyll off and Pages serves the
  // tree verbatim. No path is renamed, so no world file's `country.register`
  // pointer moves.
  //
  // DERIVED from the trees, not written about `_registers`: a later
  // `rosters/_shared/` is covered the day it lands, and a tree needing no
  // marker keeps the check silent instead of asserting a file for its own sake.
  const jekyllHidden = MIRRORED_TREES.flatMap((tree) =>
    walkTree(tree)
      .filter((f) => f.split("/").some((seg) => /^[_.]/.test(seg)))
      .map((f) => `${tree}/${f}`));
  check("every mirrored data file is reachable on a Jekyll-served root",
    jekyllHidden.length === 0 || existsSync(join(ROOT, ".nojekyll")),
    `GitHub Pages 404s these: ${jekyllHidden.join(", ")} - add an empty .nojekyll at the repo root`);

  // A marker that is not COMMITTED reaches no host, and Pages serves only what
  // is committed. `.gitignore` carries deliberately broad secret patterns
  // (`.env.*`, `*.local`), so a dotfile at the root is exactly the thing that
  // can sit on disk, satisfy the check above, and be absent from the tree
  // players are served. Vacuous by design when the file does not exist - that
  // case is the previous check's, and one failure per defect is the point.
  check(".nojekyll is committed, not merely present on disk",
    !existsSync(join(ROOT, ".nojekyll"))
      || execFileSync("git", ["ls-files", "--", ".nojekyll"], { cwd: ROOT, encoding: "utf8" }).trim() !== "",
    "an untracked .nojekyll fixes nothing on Pages - git add it");

  // --- the live verifier's two pure functions ---
  //
  // scripts/verify-mirrors.mjs is the instrument that WOULD have caught the
  // Jekyll bug: it fetches every mirrored data file from all three hosts. It
  // cannot run in this suite, because deploy.sh gates on smoke and a check
  // needing three public hosts to answer would block a release on a bad
  // connection. So its two decisions are pure, exported, and tested here -
  // the addSaveSlot / membersNamedIn pattern, for the same reason: the
  // alternative is a rule only a live run can exercise, and a harness nothing
  // exercises is a harness that rots. playthrough.mjs was dead for four
  // steps that way.
  //
  // Written from the requirement, not the implementation: what must hold is
  // that a DATA file is probed and not only the bundle, which is precisely
  // what the v1.4.1 post-deploy check got wrong.
  const planned = buildProbePlan({
    treeFiles: ["worlds/_registers/zh.json", "groups/index.json"],
    assetRefs: ["assets/index-abc123.js", "assets/index-abc123.css"],
  }).map((e) => e.path);
  check("the live verifier probes data files, not just the bundle",
    planned.includes("worlds/_registers/zh.json") && planned.includes("groups/index.json"),
    `buildProbePlan dropped the data files: ${planned.join(", ")}`);
  check("the live verifier probes the bundle and the page too",
    planned.includes("assets/index-abc123.js") && planned.includes(""),
    `buildProbePlan covers ${planned.join(", ")}`);

  // A 200 is not proof the file is there. MEASURED 2026-09-30: Cloudflare
  // Pages answers a missing data path with 200 text/html and the app's own
  // index.html, byte for byte, so a status-only check calls a missing
  // register SERVED. Pages 404s and Vercel 404s; the host that would hide
  // this defect is one of the two that were right about the Jekyll one.
  const spa = classifyResponse({ kind: "json", status: 200, body: "<!DOCTYPE html><html><head></head></html>" });
  check("a 200 serving the SPA shell instead of JSON is a failure",
    spa.ok === false && /not-json/.test(spa.reason),
    `classifyResponse accepted the app shell as a JSON file: ${JSON.stringify(spa)}`);
  // Note the 404 body is VALID JSON on purpose. The first version of this
  // check passed body: "" - JSON.parse("") throws, so the not-json branch
  // produced ok:false and covered for the status branch, and deleting the
  // status check left this guard GREEN. Two enforcements of one rule is two
  // neither of which can be shown to work; cropRect cost an hour to the same
  // shape. A host serving a JSON error document is the real case.
  const notFound = classifyResponse({ kind: "json", status: 404, body: '{"error":"not found"}' });
  check("a non-200 fails on its status, whatever its body parses as",
    notFound.ok === false && /HTTP 404/.test(notFound.reason)
      && classifyResponse({ kind: "json", status: 200, body: '{"korea":{}}' }).ok === true,
    `classifyResponse read a 404 carrying valid JSON as: ${JSON.stringify(notFound)}`);

  // The host list is the verifier's, and exactly one mirror serves the
  // committed tree. That asymmetry IS the diagnosis - when one mirror fails
  // and two do not, the fault is in what makes that one different - so it is
  // a field on the data rather than a sentence in a comment.
  check("exactly one mirror serves the committed tree",
    MIRRORS.filter((m) => m.servesCommittedTree).length === 1
      && MIRRORS.find((m) => m.servesCommittedTree).id === "pages",
    `servesCommittedTree: ${MIRRORS.filter((m) => m.servesCommittedTree).map((m) => m.id).join(", ") || "none"}`);

  // --- hotfix worktree hygiene ---
  //
  // A hotfix off main is worked in a second checkout so dev's in-flight work
  // is neither stashed nor one command away from deploy.sh. The v1.4.1 one was
  // created in a SESSION-SCOPED TEMP DIRECTORY, and git's registration in
  // .git/worktrees/ outlives the directory - so the repo keeps advertising a
  // path that no longer exists, and because a worktree LOCKS its branch,
  // `git branch -d` is refused by a checkout nobody can find.
  //
  // The rule lives in scripts/worktree-hygiene.mjs with two consumers - that
  // script's report and these checks - rather than once in bash and once here.
  const REPO_ROOT = "C:/Users/Yuhan/repo";
  const wt = (path, extra = {}) => classifyWorktree({ path, branch: "hotfix/x", repoRoot: REPO_ROOT, ...extra });

  check("a worktree in a temp directory is reported as wrong",
    wt("C:/Users/Yuhan/AppData/Local/Temp/claude/abc/scratchpad/main-hotfix").ok === false,
    "a temp-dir worktree outlives its own checkout and locks its branch - it must not pass");

  check("a worktree inside the repo is reported as wrong",
    wt("C:/Users/Yuhan/repo/worktrees/hotfix-x").ok === false,
    "a nested worktree shows as untracked and every tree scan walks it");
  // The path deliberately contains neither `temp` nor `scratchpad`: the first
  // fixture here did, so the temp rule matched first and this check stayed
  // green when the nested rule was deleted.

  check("a worktree registered but gone from disk is reported as wrong",
    wt("D:/elsewhere/repo-hotfix-x", { existsOnDisk: false }).ok === false,
    "a pruned directory still locks its branch, which is the state that blocks cleanup");

  // Pinned regression: the first version of this rule lived in bash and
  // compared git's `C:/foo` against bash's `/c/foo`, so it classified the
  // PRIMARY checkout as a stranger and its inside-the-repo branch was
  // unreachable. Both spellings must read as the same directory.
  check("the primary checkout is recognised whichever way its path is spelled",
    classifyWorktree({ path: "C:/Users/Yuhan/repo", repoRoot: "/c/Users/Yuhan/repo" }).kind === "primary"
      && classifyWorktree({ path: "/c/Users/Yuhan/repo", repoRoot: "C:\\Users\\Yuhan\\repo" }).kind === "primary",
    "a path-style mismatch makes the primary checkout look like debris and kills the nested check");

  check("a sibling worktree outside the repo is fine",
    wt("C:/Users/Yuhan/repo-hotfix-registers-404").ok === true,
    "the recommended location must not be reported as a problem");

  const parsed = parseWorktreeList([
    "worktree C:/a", "HEAD abc", "branch refs/heads/dev", "",
    "worktree C:/b", "HEAD def", "detached", "",
  ].join("\n"));
  check("the porcelain parser reads every entry and its branch",
    parsed.length === 2 && parsed[0].branch === "dev" && parsed[1].branch === null,
    `parsed ${JSON.stringify(parsed)}`);

  // LIVE, and deliberately narrow. Only a worktree INSIDE the repo fails the
  // suite: it is untracked in a tree deploy.sh stages from, and the mirror and
  // secret scans would walk a second copy of the app. A temp-dir worktree is
  // untidy and harmless at deploy time, and removing it deletes files - so it
  // is `hotfix-worktree.sh status`'s business, not a blocked release's.
  const liveAudit = auditWorktrees(
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: ROOT, encoding: "utf8" }), ROOT);
  const nested = liveAudit.filter((w) => w.kind === "nested");
  check("no git worktree is registered inside this repo",
    nested.length === 0,
    `${nested.map((w) => w.path).join(", ")} - move it beside the repo: scripts/hotfix-worktree.sh new <slug>`);

  // A hotfix branch is temporary BY DESIGN - off main, one bug, merged, gone -
  // and the only thing that makes the last step happen is someone noticing. So
  // the report states what is true rather than issuing a verdict: `ahead` is
  // commits not in main and does NOT mean unshipped. The v1.4.1 year-wheel fix
  // reached main through dev while its abandoned hotfix branch still read 1
  // ahead, because a reimplementation is a different commit - a tool that
  // called that branch unfinished would be wrong, and one that called it
  // merged would invite -D on work nobody had checked.
  check("a hotfix branch contained in main is reported as safe to delete",
    classifyHotfixBranch({ branch: "hotfix/x", ahead: 0, containedInMain: true }).state === "merged",
    "a finished hotfix must be visibly finished, or it accumulates");
  check("a hotfix branch NOT in main is never reported as merged",
    classifyHotfixBranch({ branch: "hotfix/x", ahead: 1, containedInMain: false }).state === "open",
    "reporting an unmerged branch as merged invites git branch -D on unreviewed work");

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
  const { buildSystemPrompt, buildDynamicTail, buildHistoryLedger, buildTailRules,
          collapseHistoryIfNeeded, updateMemory, validateAndFixOutput, membersNamedIn,
          createEmptyMemory, discoveredPlaceIn, recordPlace, placeKey, PLACES_MAX } =
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
  const resolvedCustom = await fromDisk(() => loader.resolveRoster(customRoster, "en", worldFor.en));
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

  // --- the ROLE CONTRACT: the player's identity and the members' are not
  //     interchangeable. Reported from hand play in both directions at once — a
  //     Chaebol player's 会长 claimed by Irene ("作为会长，我…") and narrated as a
  //     third person ("走向会长办公室"), while the player was handed the members'
  //     practice schedule back.
  const roleAt = p.indexOf("ROLE CONTRACT");
  check("section 6 carries a ROLE CONTRACT", roleAt !== -1,
    "the SPEAKER CONTRACT governs pronouns and names and says nothing about roles");
  // Beside the speaker contract and before REGISTER: this is a "who is who" rule,
  // and the two are read together.
  check("...next to the speaker contract, not in some other section",
    roleAt > p.indexOf("SPEAKER CONTRACT") && roleAt < p.indexOf("REGISTER:"));
  const roleBlock = p.slice(roleAt, p.indexOf("REGISTER:"));
  check("...stating that the player's identity is hers and no member's",
    /identity above describes HER position in this world and no one else's/.test(roleBlock)
      && /No member holds it, is described by it, or speaks as if she held it/.test(roleBlock),
    roleBlock.slice(0, 120));
  check("...that a role's title names the player alone",
    /the title names Summer alone/.test(roleBlock),
    "会长 reaches the prompt only as an address form, so nothing said it NAMES her");
  check("...and that narration may not send a member off to it as a third person",
    /third person elsewhere in the building/.test(roleBlock));
  check("the members' working life is marked as theirs, not the player's",
    /working life — practice, schedules, comebacks, the dorm, this company — is THEIRS/.test(roleBlock)
      && /no place in their schedule/.test(roleBlock),
    roleBlock.slice(0, 200));

  // The load-bearing qualifier. A 练习生 player really is a trainee at this
  // company and a 韩娱艺人 really has a comeback of her own, so a FLAT denial
  // would break the writing for 2 of the 8 identities. The denial is scoped to
  // this group's working day, and conditional on her identity not placing her in
  // it. An earlier draft of this rule asserted it absolutely, and reading the
  // golden diff is what caught that.
  check("...and that denial is conditional, not absolute",
    /Unless that identity places her inside this group's working day/.test(roleBlock),
    "a trainee player has practice; the rule must not deny it");
  // The identity LABEL must not be quoted into the rule: "no member says 'as the
  // 韩娱艺人, I…'" is false, because a member of a K-pop group is one.
  check("...and the rule never quotes the identity label back at the model",
    !roleBlock.includes("韩娱艺人")
      && (!form().identity || !roleBlock.includes(form().identity)),
    "an identity a member also satisfies makes the rule read as a falsehood");

  // --- v1.4.0 step 6: a full read of the rendered prompt, and what it found.
  // Each of these was a statement about the setting that contradicted another
  // statement, or was debris. None threw an error; all of them reached the model
  // on every round.
  check("no editing debris is left in the prompt",
    !/\/\/ Change to:/.test(p),
    "`// Change to:` sat at the very end of every prompt ever sent");
  // The schema's own example named SM, so every cast was handed SM's name
  // whatever company they are under — the same leak class as the YG bug, except
  // written into the prompt as an example to follow.
  check("the scene example names no record company",
    !/SM Practice Room/.test(p),
    "an example is an instruction");
  // The prohibition that landed beside that fix was absolute — "Do not name a
  // record company here" — and it is wrong for the classic door, whose section 4
  // lore names SM as a matter of real history. Live play in step 7 produced
  // `scene: "SM娱乐大楼顶层会议室"` on a Red Velvet roster: the model resolved the
  // contradiction toward the richer context, as it always does, and was right to.
  // The harness already encoded the distinction the prompt did not — realAgencyNames
  // runs only with --cast, because a whole group's own lore legitimately names its
  // agency. One sentence now covers both doors by pointing at the single source.
  check("the company rule points at section 4 rather than forbidding all companies",
    /The only organisation that exists in this story is the one section 4 names/.test(p)
      && !/Do not name a record company/.test(p),
    "an absolute ban contradicted section 4 on the classic door, and lost");

  // Section 1 is headed HIGHEST PRIORITY and used to ask for Korean "rarely,
  // with a translation in parentheses", giving "unnie" as the example — which
  // section 6 spells 欧尼, glosses never, and wants frequent. The highest-priority
  // section won, which is why this mattered.
  //
  // SWEPT OVER ALL THREE LANGUAGES, and that is not padding: `p` is the English
  // prompt, the contradiction lived in the zh and en rules separately, and the
  // first version of this guard checked only `p` — so mutating the zh rule left
  // it green and only the zh golden moved. A per-language rule needs a
  // per-language check.
  const langRuleOf = (lang) => prompt(form(), lang).split("\n")
    .find((l) => /ALL generated content MUST be in/.test(l)) || "";
  for (const lang of ["zh", "en", "ko"]) {
    const rule = langRuleOf(lang);
    check(`[${lang}] the language rule does not compete with the address table`,
      !/translation in parentheses/.test(rule) && !/may appear rarely/.test(rule),
      rule.slice(0, 160));
  }
  for (const lang of ["zh", "en"]) {
    check(`[${lang}] ...it defers to section 6 instead`,
      /follow section 6's table exactly/.test(langRuleOf(lang)),
      "two rules for one thing means the model picks, and it picked the wrong one");
  }
  // ko is deliberately not in that list: its address forms ARE the native
  // Korean, so it has no transliteration table to defer to.
  check("[ko] the language rule has no address table to defer to",
    /DO NOT output Chinese characters/.test(langRuleOf("ko"))
      && !/section 6's table/.test(langRuleOf("ko")),
    langRuleOf("ko").slice(0, 120));
  // It carried a different contradiction instead, found in the second read: "DO
  // NOT output English characters" forbade the one thing the prompt requires,
  // since every member in MEMBER PROFILES is named by her LATIN stage name and
  // section 6's own ko narration example is "Joy는 창가에 서 있다". Section 1 is
  // headed HIGHEST PRIORITY, so the two could only resolve one way.
  check("[ko] the language rule does not forbid the members' own Latin names",
    !/DO NOT output English/.test(langRuleOf("ko"))
      && /MEMBER PROFILES spells her/.test(langRuleOf("ko")),
    langRuleOf("ko").slice(0, 200));
  const koPrompt = prompt(form(), "ko");
  check("[ko] ...which is the spelling section 6 then demonstrates",
    /In narration a member is her name alone: "Irene/.test(koPrompt)
      && /\bIrene\(/.test(koPrompt),
    "an example in Latin under a rule banning Latin");
  // That example used to read "<name>는 창가에 서 있다" — a topic particle chosen by
  // the name's PRONUNCIATION, so it was right for Joy and wrong for Irene (아이린은).
  // An example is an instruction, and this one taught the error in the same section
  // that was fixing a different one.
  check("[ko] the narration example carries no name-dependent particle",
    !/Irene는 |Irene은 |Irene이 |Irene가 /.test(koPrompt),
    (koPrompt.split("\n").find((l) => l.includes("stage name alone")) || "").slice(-90));
  check("...and section 6 still asks for them often enough to be texture",
    /Keep them frequent enough to feel Korean/.test(p),
    "that is the line the old language rule contradicted");

  // Round was listed among the "4 stats" the model may change, beside three it
  // genuinely may; and section 10 said stat changes were "NOT mandatory" while
  // the schema RULES demanded at least one non-zero.
  check("the round counter is not offered as a stat to change",
    /📅Round is a counter the app keeps/.test(p) && !/Player 4 stats/.test(p),
    "statChanges carries selfId/secrecy/mood and nothing else");
  check("...and the stat rule no longer contradicts the schema",
    !/NOT mandatory/.test(p) && /move at least one\b/.test(p),
    "section 10 said optional, RULES said at least one non-zero");
  // A "- Stages:" fragment left from an earlier edit, mid-sentence.
  check("the relationship-stage line is not doubled up",
    !/Relationship stages: - Stages:/.test(p));
  // Section 9 and the tail have to name the same seven stages in the same order,
  // or the model is handed two vocabularies for one scale. Both are localized as
  // of step 6; this is the line that ties them together.
  check("...and it points at the tail that will carry those names",
    /\[Affections\] in CURRENT STATE gives each member's score and her stage by these exact names/.test(p),
    "otherwise the model sees stage names it was never given");

  // Ownership: `Identity: 财阀` sat as a bare label in a flat run of
  // Identity/Pace/Main Member/Sub Members, so the player's occupation was in the
  // same unowned list as the roster.
  check("the player's identity line names its owner",
    /\nSummer's identity: /.test(p) && !/\nIdentity: /.test(p),
    "an unowned label is one the model may attach to anyone");

  // --- v1.4.0 step 7: a SECOND full read of the rendered prompt, on the same
  // reasoning as the first — if one setting statement was unclear, others are.
  // Each of these throws no error and fails no other test.

  // The key enumeration listed 7 of the 8 keys the schema requires. A contract
  // that enumerates is read as exhausting its subject, which is the third time
  // that has bitten here (dialogue once exempt from the pronoun rule, address
  // forms once had no narration scope, roles were once not mentioned at all).
  check("the EXACTLY-ONCE key list covers every key in the schema",
    /Every key \(scene, statChanges, affectionChanges, story, summary, socialContent, kktMessages, options\)/.test(p),
    "scene was required by the schema and absent from the list that guards it");

  // The schema's key order is the model's GENERATION order, and kktMessages used
  // to sit immediately before story — so the last thing in context before the
  // prose began was a Kakao the model had just written, and it wrote the scene
  // around it. Live: 3 of 20 rounds transcribed Irene's Kakao into the prose,
  // phone buzz included, against a rule that is unconditional and stated first.
  // This is the same failure the KKT rules were restructured for twice; the third
  // attempt changes the ORDER rather than the wording, because the wording already
  // says "before she has looked at her phone".
  //
  // Social content gains the same way: written after the story, it can react to
  // the round instead of being composed before the round exists.
  const keyOrder = ["scene", "statChanges", "affectionChanges", "story", "summary",
                    "socialContent", "kktMessages", "options"];
  const schemaBlock = p.split("JSON SCHEMA - MUST FOLLOW EXACTLY")[1] || "";
  const positions = keyOrder.map((k) => schemaBlock.indexOf(`"${k}"`));
  check("the schema asks for story before socialContent and kktMessages",
    positions.every((n) => n > 0) && positions.every((n, i) => i === 0 || n > positions[i - 1]),
    keyOrder.map((k, i) => `${k}@${positions[i]}`).join(" "));
  check("...and says so, since a model emits keys in the order it is shown them",
    /The story comes BEFORE socialContent and kktMessages/.test(p),
    "the order alone is an implicit instruction; this one is explicit");
  // Social content written before the story could only ever be about no particular
  // day. Now that it follows the story, say what it should be about.
  check("social content is tied to the round it belongs to",
    /ALL of it comes out of THIS round/.test(p),
    "four platforms of filler is worse than three platforms and a gap");

  // BubbleOverlay renders `📸 {photoDesc}` inside a frame it draws from `hasPhoto`.
  // `photoDesc` was in no schema, so the frame could only ever be empty — and the
  // example pinned `hasPhoto` to false in both places it appears, so it never fired
  // either. A UI feature that could not be reached and could not have rendered.
  check("the bubble schema asks for the photo description the overlay renders",
    /"bubble":\[\{"content":"msg","hasPhoto":false,"photoDesc":""\}\]/.test(p),
    (p.split("\n").find((l) => l.includes('"bubble"')) || "").slice(0, 140));
  check("...and says when to set the flag",
    /Set hasPhoto true only when she would really attach a picture/.test(p),
    "an example showing false twice is an instruction to always say false");
  const overlaySrc = readFileSync(join(ROOT, "src/platforms/BubbleOverlay.jsx"), "utf8");
  for (const field of ["hasPhoto", "photoDesc"]) {
    check(`BubbleOverlay still reads ${field}`, overlaySrc.includes(field),
      "if the overlay stops rendering it, the schema should stop asking for it");
  }
  // The pair is one feature, so a post claiming a photo with nothing to describe is
  // normalised away rather than drawn as an empty frame.
  const bubbled = validateAndFixOutput({
    story: "x".repeat(60), options: ["A. a", "B. b", "C. c", "D. d"],
    socialContent: {
      irene: { bubble: [{ content: "hi", hasPhoto: true, photoDesc: "  " }] },
      yeri: { bubble: [{ content: "hey", hasPhoto: true, photoDesc: "the sunset from the van" }] },
      // A bare string INSIDE the array, which is the branch inside the map. A bare
      // string as the whole `bubble` value is converted one step earlier, so using
      // that as the input left this check unable to fail — it passed against a
      // mutation that deleted the branch it was written for.
      joy: { bubble: ["a bare string"] },
    },
  });
  check("a photo with nothing to describe is not a photo",
    bubbled.socialContent.irene.bubble[0].hasPhoto === false,
    JSON.stringify(bubbled.socialContent.irene.bubble[0]));
  check("...and a described one survives",
    bubbled.socialContent.yeri.bubble[0].hasPhoto === true
      && bubbled.socialContent.yeri.bubble[0].photoDesc === "the sunset from the van",
    JSON.stringify(bubbled.socialContent.yeri.bubble[0]));
  check("...and a bare string still becomes a post",
    bubbled.socialContent.joy.bubble[0].content === "a bare string"
      && bubbled.socialContent.joy.bubble[0].hasPhoto === false,
    JSON.stringify(bubbled.socialContent.joy.bubble[0]));
  // The newline repair in parseLLMOutput is what keeps a model emitting raw
  // newlines inside `story` parseable, and it was anchored on the key that
  // FOLLOWS story — so it broke silently every time the schema was reordered.
  check("the story-field repair does not name the key that follows story",
    /"story":\\s\*"\(\[\\s\\S\]\*\?\)"\\s\*,\\s\*"\[a-zA-Z_\]\\w\*"/
      .test(readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8")),
    "an order-coupled repair is a repair that stops working when the order changes");

  // Invisible to a reviewer and worth the whole ~5,500-token cached prefix. This
  // one is the wart the goldens caught during the step 3 extraction and that the
  // extraction then reproduced faithfully, because its gate was that nothing move.
  check("no prompt line ends in a space",
    p.split("\n").every((l) => !/ $/.test(l)),
    p.split("\n").filter((l) => / $/.test(l)).join(" | ").slice(0, 160));

  // `a young WLW woman` against a field that accepts 18 to 80: a player born 1950
  // was described to the model as a young woman of 76.
  check("the player is not described as young regardless of her age",
    /THE PLAYER: Summer — a WLW woman, age /.test(p) && !/young WLW/.test(p),
    "PLAYER_BIRTH_YEAR_MIN is GAME_YEAR - 80");

  // ------------------------------------------------- the story mode, in the TAIL
  //
  // v1.4.0 step 7 wired the pace’s authored rule into section 6, because until
  // then the player could choose a pace and the model was sent only its id.
  // v1.4.1 step 2 keeps the rule and moves it OUT of section 6 into the dynamic
  // tail, because the four-way story mode is a live Settings switch: a rule in
  // the cached prefix means every toggle costs ~5,500 tokens on the next round.
  //
  // So the load-bearing assertion is the NEGATIVE one. Nothing the mode can say
  // may appear in the static prompt, in any language - that is the claim the
  // whole move rests on, and it is what fails if a mode rule is ever put back
  // into buildSystemPrompt.
  for (const lang of ["zh", "en", "ko"]) {
    const staticPrompt = prompt(form(), lang);
    const leaked = loader.MODE_IDS.filter((id) => staticPrompt.includes(worldFor[lang].modes[id]));
    check(`[${lang}] no story-mode rule reaches the static system prompt`,
      leaked.length === 0,
      `${leaked.join(", ")} - a live setting in the cached prefix costs the whole prefix on every toggle`);
    // ...and the pace it replaced is gone from section 6 entirely, rather than
    // surviving as a bare id beside it. Two rules about how the story is driven
    // is the "a prompt is not append-only" failure this repo keeps recording.
    check(`[${lang}] section 6 names no pace at all`,
      !staticPrompt.includes("Progression Pace:") && !staticPrompt.includes("[Pace:"),
      (staticPrompt.split("\n").find((l) => l.includes("Pace")) || "").slice(0, 100));
  }
  // The positive half: every mode sends its own rule, in every language.
  for (const lang of ["zh", "en", "ko"]) {
    for (const id of loader.MODE_IDS) {
      const tail = buildTailRules(worldFor[lang], id, "default");
      check(`[${lang}] story mode "${id}" sends its authored rule in the tail`,
        tail.includes(worldFor[lang].modes[id]),
        JSON.stringify(tail).slice(0, 120));
    }
  }
  // `free` is the one that has to be stated separately. It is the DEFAULT mode and
  // the one that means "no authored plot events", so sending no line at all would
  // look deliberate - and it would silently strip a free-mode game of the
  // slow-burn texture every legacy slow-burn player has today.
  check("free mode sends a rule rather than nothing",
    buildTailRules(worldFor.en, "free", "default").trim().length > 40,
    JSON.stringify(buildTailRules(worldFor.en, "free", "default")));
  // A mode id read back out of localStorage can be anything a previous build or a
  // hand edit left there. It resolves to free, which is a visible, correct mode -
  // not to silence, which is indistinguishable from the wiring being broken.
  check("an unrecognized story mode falls back to free rather than to silence",
    buildTailRules(worldFor.en, "no-such-mode", "default")
      === buildTailRules(worldFor.en, "free", "default"),
    JSON.stringify(buildTailRules(worldFor.en, "no-such-mode", "default")));
  // THE TWO DIALS MUST NOT SHARE A LABEL. Time Speed wrote `[Pacing] slow - ...`
  // and the story mode was about to write a second, different quantity under the
  // same name: worse than the [Stage Changes] id-vs-name case, because the model
  // would have to work out which line meant what. Renamed in the same commit.
  const bothDials = buildTailRules(worldFor.en, "pressure", "slow");
  check("the two tail dials carry different labels, and neither is [Pacing]",
    bothDials.includes("[Story Mode:") && bothDials.includes("[Time Speed]")
      && !bothDials.includes("[Pacing]"),
    JSON.stringify(bothDials).slice(0, 200));
  check("...on two separate lines, so neither can be read as qualifying the other",
    bothDials.split("\n").filter(Boolean).length === 2,
    JSON.stringify(bothDials));
  // Unchanged behaviour, asserted because the rename touched this branch: the
  // default time speed sends nothing, so an ordinary round carries one line.
  check("the default time speed adds no line",
    buildTailRules(worldFor.en, "free", "default").split("\n").filter(Boolean).length === 1,
    JSON.stringify(buildTailRules(worldFor.en, "free", "default")));
  check("a fast round says so",
    buildTailRules(worldFor.en, "free", "fast").includes("[Time Speed] fast"),
    JSON.stringify(buildTailRules(worldFor.en, "free", "fast")));
  // Authored data reaching the prompt verbatim, so the same rule as the prompt’s
  // own lines applies: no line ends in a space.
  for (const lang of ["zh", "en", "ko"]) {
    const dirty = loader.MODE_IDS.filter((id) =>
      buildTailRules(worldFor[lang], id, "slow").split("\n").some((l) => / $/.test(l)));
    check(`[${lang}] no story-mode rule carries stray whitespace`,
      dirty.length === 0, dirty.join(", "));
  }

  // The identity had the same defect and the same cause: `Alex's identity: 财阀`
  // in an English prompt, an internal key in a language she does not read, while
  // Setup showed her "Chaebol".
  const IDENTITY_NAMES = {
    zh: { 财阀: "财阀会长", Staff: "助理", 主线成员前女友: "主线成员前女友" },
    en: { 财阀: "Chaebol", Staff: "Staff", 主线成员前女友: "Ex-Girlfriend" },
    ko: { 财阀: "재벌", Staff: "직원", 主线成员前女友: "전 여자친구" },
  };
  for (const [lang, expected] of Object.entries(IDENTITY_NAMES)) {
    for (const [id, name] of Object.entries(expected)) {
      check(`[${lang}] identity ${id} reaches the model as "${name}"`,
        prompt(form({ identity: id }), lang).includes(`'s identity: ${name}`),
        (prompt(form({ identity: id }), lang).split("\n")
          .find((l) => l.includes("'s identity:")) || "").slice(0, 80));
    }
  }
  // This used to tie `t.identities[id]` to `world.identities[].name` — two
  // hand-maintained copies of one string, whose drift is invisible because both
  // sides render something plausible. v1.4.1 step 3 **deleted the second copy**:
  // Setup renders the world's own `name`, so what the player picked and what
  // section 6 prints are the same characters by construction. What is left worth
  // asserting is that the string is fit to be a button label at 390px, which the
  // old check got for free from the UI table it compared against.
  for (const lang of ["zh", "en", "ko"]) {
    const unlabelled = worldFor[lang].identities.filter((i) => !i.name);
    check(`[${lang}] every world identity carries the name Setup shows`,
      worldFor[lang].identities.length > 0 && unlabelled.length === 0,
      unlabelled.map((i) => i.id).join(", ") || "an identity with no name falls back to its id");
    // The id is CJK in every language (it is stored in every save and can never be
    // renamed), so a missing `name` renders Chinese into an English player's picker.
    const untranslated = lang === "zh" ? []
      : worldFor[lang].identities.filter((i) => i.name === i.id && /[\u4e00-\u9fff]/.test(i.id));
    check(`[${lang}] ...and it is not the stored id showing through`,
      untranslated.length === 0, untranslated.map((i) => i.id).join(", "));
    const tooLong = worldFor[lang].identities.filter((i) => i.name.length > 24);
    check(`[${lang}] ...short enough to be a button in a two-column grid`,
      tooLong.length === 0, tooLong.map((i) => `${i.name} (${i.name.length})`).join(", "));
  }

  // A custom identity resolves to no world entry at all, and must still print.
  check("a custom identity prints the player's own words",
    prompt(form({ identity: "a florist two streets over" }))
      .includes("'s identity: a florist two streets over"),
    "form.identity is free text once App.jsx resolves H");

  // Section 6's cast block had three ways to render an empty line or an empty
  // pair of brackets, and every one of them is reachable: a solo run has no subs,
  // an all-romanceable roster has no NPCs, a custom main member has no name_kr,
  // and a custom identity has no background. Same class as the member profile
  // block in step 6 — and the goldens cannot catch it, since the library never
  // produces these.
  const castBlockOf = (text) => text.split("-- SPEAKER CONTRACT")[0]
    .split("6. CAST IDENTITY & ADDRESS")[1] || "";
  const soloPrompt = buildSystemPrompt(form(), members, "irene", [], GROUP, "", "qwen", "en", worldFor.en);
  check("a roster with no sub members renders no blank line for them",
    !/\n\n/.test(castBlockOf(soloPrompt).replace(/^[\s\S]*?═╝\n/, "").trimEnd())
      && !soloPrompt.includes("Sub Members:"),
    JSON.stringify(castBlockOf(soloPrompt).slice(-400)));
  const allRomanceable = buildSystemPrompt(
    form(), members.slice(0, 2), "irene", [members[1].id], GROUP, "", "qwen", "en", worldFor.en);
  check("...nor a roster with no NPC members",
    !/\n\n/.test(castBlockOf(allRomanceable).replace(/^[\s\S]*?═╝\n/, "").trimEnd())
      && !allRomanceable.includes("NPC Members:"),
    JSON.stringify(castBlockOf(allRomanceable).slice(-300)));
  const bareMain = [{ id: "c_1", name: "Haru", birthday: "1997-03-02",
                      private_personality: "quiet, watchful" }, members[1]];
  const barePrompt = buildSystemPrompt(
    form({ identity: "a florist" }), bareMain, "c_1", [], GROUP, "", "qwen", "en", worldFor.en);
  check("a custom main member with no Korean name renders no empty brackets",
    barePrompt.includes("Main Member: Haru\n") && !/Main Member: Haru\(\)/.test(barePrompt),
    (barePrompt.split("\n").find((l) => l.startsWith("Main Member:")) || ""));
  check("...and a custom identity with no background renders no blank line",
    !/\n\n/.test(castBlockOf(barePrompt).replace(/^[\s\S]*?═╝\n/, "").trimEnd()),
    JSON.stringify(castBlockOf(barePrompt).slice(-300)));

  // The work override points the title in opposite directions for a trainee and
  // for everyone else, so the shared "it relaxes toward her given name" clause
  // named the wrong person in one of the two.
  const overrideOf = (identity) => prompt(form({ identity })).split("\n")
    .find((l) => l.startsWith("Work override:")) || "";
  check("the staff work override relaxes toward the PLAYER's name",
    /relaxing toward "Summer" as they grow close/.test(overrideOf("Staff")),
    overrideOf("Staff"));
  check("the trainee work override relaxes toward the MEMBER's name",
    /relaxing toward a member's plain name/.test(overrideOf("练习生"))
      && !/toward "Summer"/.test(overrideOf("练习生")),
    overrideOf("练习生"));
  check("...and neither leaves the ambiguous shared clause behind",
    !/It relaxes toward her given name/.test(p + overrideOf("Staff") + overrideOf("练习生")),
    "whose given name was never stated");

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
      /In narration a member is her name alone[\s\S]{0,200}NEVER/.test(src),
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

  // The stage label in [Affections] follows the player's language. It used to be
  // Chinese for everyone, so an English game sent the model 有印象 while section 9
  // of its own prompt called that stage "Acquaintance".
  check("[Affections] names the stage in the player's language",
    /Irene:42\(Interest\)/.test(buildDynamicTail(mem(), members, ["irene"], "en"))
      && /Irene:42\(관심\)/.test(buildDynamicTail(mem(), members, ["irene"], "ko")),
    buildDynamicTail(mem(), members, ["irene"], "en"));
  check("...and defaults to Chinese, so a three-argument caller is unchanged",
    /Irene:42\(产生兴趣\)/.test(buildDynamicTail(mem(), members, ["irene"])),
    buildDynamicTail(mem(), members, ["irene"]));
  // buildDynamicTail taking a language means nothing if executeRound never hands
  // it one — the whole localization would then be reachable only from a test.
  check("executeRound passes the player's language to the dynamic tail",
    /buildDynamicTail\(memory, members, roundMemberIds, language\)/
      .test(readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8")),
    "a defaulted parameter nobody supplies is dead code");

  // --- v1.4.0 step 7: the tail's two unclear lines.
  //
  // [Affections] listed every member, but only main and subs have a score — so
  // every NPC read `0(Stranger)` for the whole game, telling the model in round 30
  // that the main member's groupmate, who has been in most scenes, is a stranger.
  // `members` here is the full roster; ["irene"] is the round roster.
  const npcFree = buildDynamicTail(mem(), members, ["irene"], "en");
  check("[Affections] lists only the members who have a score",
    /\[Affections\][^\n]*Irene:42/.test(npcFree)
      && !/\[Affections\][^\n]*Yeri/.test(npcFree),
    (npcFree.split("\n").find((l) => l.startsWith("[Affections]")) || ""));
  check("...and still lists everyone when no round roster is given",
    /Yeri/.test(buildDynamicTail(mem(), members, [], "en").split("\n")
      .find((l) => l.startsWith("[Affections]")) || ""),
    "a two- or three-argument caller must keep today's behaviour");

  // --- [Rounds Absent], the fact that makes section 3's rotation rule applicable.
  // Live runs showed the rule comprehensively ignored across three languages — a
  // romanceable member appearing once in twenty rounds — because nothing told the
  // model how long anyone had been away.
  //
  // The number is rounds of ABSENCE, the unit the rule is written in: 0 means she was
  // in the previous round, 4 means she has missed the last four.
  const rotationMem = {
    ...mem(),
    playerStats: { ...mem().playerStats, week: 10 },
    memberAppearances: { irene: [7, 9], seulgi: [4], joy: [8] },
  };
  const rot = buildDynamicTail(rotationMem, members, ["irene", "seulgi"], "en");
  const rotLine = rot.split("\n").find((l) => l.startsWith("[Rounds Absent]")) || "(absent)";
  check("[Rounds Absent] counts rounds missed, not the round last seen",
    /🐰Irene:0\b/.test(rotLine) && /🐻Seulgi:5\b/.test(rotLine), rotLine);
  check("...marks members outside the round roster as npc",
    /Joy\(npc\):1\b/.test(rotLine) && !/Irene\(npc\)/.test(rotLine), rotLine);
  check("...and says never for a member the prose has not named yet",
    /Wendy(\(npc\))?:never/.test(rotLine), rotLine);
  // Round 1 has no appearances at all, and a line reading `never` five times is noise.
  check("the line is omitted before anyone has appeared",
    !buildDynamicTail(mem(), members, ["irene"], "en").includes("[Rounds Absent]"),
    "every value would read never");
  // The replaced mechanism must be gone rather than left beside the new one: two
  // labels counting the same quantity in different units is how [Stage Changes]
  // printed an id beside a name.
  const poolSrc = readFileSync(join(ROOT, "src/agent/memoryPool.js"), "utf8");
  const agentSrc = readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8");
  check("npcAppearances is gone rather than left beside it",
    !/\[NPC Appearances\]/.test(poolSrc)
      && !/npcAppearances[,:]/.test(poolSrc.replace(/\/\/[^\n]*/g, ""))
      && !/npcAppearances/.test(agentSrc.replace(/\/\/[^\n]*/g, "")),
    "a field nothing writes that feeds a line nothing renders");
  // Appearances are observed, not drawn. The lottery ran AFTER the LLM call and logged
  // whoever it picked, so a member the story never mentioned was recorded as present.
  check("appearances come from the prose, not from pickPrimaryMember",
    /memberAppearances: Object\.fromEntries\(namedInStory/.test(agentSrc)
      && !/memberAppearances: \{ \[primaryId\]/.test(agentSrc),
    "the model chooses who appears; the engine drew a name afterwards");
  // Behavioural from here down. These were source regexes, and a source regex over this
  // function passed happily while it reported false absences for a quarter of a 25-round
  // run — which is exactly the failure mode the regexes were supposed to guard.
  const RV = [
    { id: "irene", name: "Irene", name_kr: "裴珠泫" },
    { id: "seulgi", name: "Seulgi", name_kr: "姜涩琪" },
    { id: "wendy", name: "Wendy", name_kr: "孙胜完" },
  ];
  check("...and a name that is a substring of another's cannot claim her appearance",
    JSON.stringify(membersNamedIn("Irene靠在窗边。", [
      { id: "rene", name: "Rene", name_kr: "" }, ...RV,
    ])) === JSON.stringify(["irene"]),
    JSON.stringify(membersNamedIn("Irene靠在窗边。", [{ id: "rene", name: "Rene" }, ...RV])));
  // The bug this feature shipped with: narration naming her by her real name, which it
  // may do freely, counted as ABSENT — so the tail told the model "Seulgi:5" about a
  // member who was in the previous scene. Measured at 29 of 75 (round, member) pairs.
  check("a member named only by her localized real name still counts as present",
    JSON.stringify(membersNamedIn("那是涩琪和胜完刻意放轻的脚步声。", RV).sort())
      === JSON.stringify(["seulgi", "wendy"]),
    JSON.stringify(membersNamedIn("那是涩琪和胜完刻意放轻的脚步声。", RV)));
  check("...by her full real name too",
    JSON.stringify(membersNamedIn("裴珠泫并没有真的睡着。", RV)) === JSON.stringify(["irene"]),
    JSON.stringify(membersNamedIn("裴珠泫并没有真的睡着。", RV)));
  check("...and in Korean and English renderings of the same field",
    membersNamedIn("주현은 창가에 서 있다.", [{ id: "irene", name: "Irene", name_kr: "배주현" }]).length === 1
      && membersNamedIn("Ju-hyun looked up.", [{ id: "irene", name: "Irene", name_kr: "Bae Ju-hyun" }]).length === 1,
    "the given-name form is what prose actually writes");
  check("...while a member the prose never mentions stays absent",
    membersNamedIn("练习室空无一人。", RV).length === 0,
    JSON.stringify(membersNamedIn("练习室空无一人。", RV)));
  // A one-character given name is not used as an alias: too short to be specific, and a
  // single CJK character occurs inside ordinary words constantly.
  check("...and a one-character given name is not treated as an alias",
    membersNamedIn("这件事很难。", [{ id: "x", name: "Zed", name_kr: "难" }]).length === 0,
    "a single character is not a name match");
  // The rule and the fact have to point at each other, or the tail line is a number
  // with no rule and the rule is a rule with no number.
  check("section 3's rotation rule points at the line that counts it",
    /\[Rounds Absent\] in CURRENT STATE counts this for you/.test(p),
    "a rule the model cannot apply is a rule it will not apply");
  check("...and section 8's NPC cooldown does too",
    /\[Rounds Absent\] marks them \(npc\) and counts the cooldown/.test(p),
    "the cooldown named information the model was never given");

  // --- the phone, the scene and the summary. Each of these moves a golden, and a
  // golden is not a specification: it records what the code does, not what is
  // required. The requirement belongs here.

  // Two rounds in 45 still transcribed a Kakao after the schema reorder, and both
  // routed AROUND the rule rather than ignoring it — one invented "a message through
  // the company's internal system". So the rule is stated as ownership, and it supplies
  // the substitute, because a prohibition with nothing behind it leaves the model
  // needing the beat and finding a loophole.
  check("the phone is owned by the app, whatever the channel is called",
    /HER PHONE BELONGS TO THE APP, NOT TO THE STORY/.test(p)
      && /whatever the channel is called/.test(p)
      && /Not Kakao, not a company system, not an unnamed message/.test(p),
    "naming only Kakao is what let a company messaging system through");
  check("...and the rule offers what to write instead",
    /she leaves something instead: a note pushed under the door/.test(p),
    "the model reaches for the beat; give it one it is allowed to have");

  // `scene` is printed as one line of a 30-character box on a 390px phone, and "a
  // short location description" was answered with 250-character paragraphs and with
  // the same string five rounds running.
  check("the scene rule states a shape, not just that it is short",
    /scene: ONE SHORT PHRASE — a place and a time, nothing else/.test(p)
      && /printed inside a one-line status box/.test(p),
    "\"short\" was not a bound");
  check("...and requires it to move",
    /never repeat the previous round's scene word for word/.test(p),
    "five consecutive rounds carried a byte-identical scene");
  // ...and points at section 11's list, where the rule about preferring it lives.
  // The schema is where the model looks when it is filling the field in, so the
  // pointer belongs here as well as there - that is the KKT Channels shape, not a
  // duplicated rule: the canon list and the preference are stated once, in 11.
  check("...and points at the canon list rather than restating the rule",
    /Take the place from section 11's canon list/.test(p),
    "a list the schema never mentions is a list the model meets 200 lines earlier");

  // The summary is the collapse target, so it becomes the permanent ledger entry.
  // zh delivered a median 303 characters of 2-4 sentences against "~100".
  check("the summary carries a bound and the reason for it",
    /ONE sentence, 100-150 characters, in English/.test(p)
      && /replaces the whole story in your memory of this round three rounds from now/.test(p),
    "a number with no reason behind it was read as a suggestion");
  check("...and the schema and the RULES agree on that bound",
    (p.match(/100-150 characters/g) || []).length >= 2,
    "two statements of one number is how they start disagreeing");

  // [Stage Changes] printed the raw member id while [Affections] one line above
  // printed the display name, so the model had to match `irene` to `🐰Irene`. A
  // custom member's id is a timestamp, which matches nothing at all.
  const staged = buildDynamicTail(
    { ...mem(), stageChanges: [{ memberId: "irene", from: "Stranger", to: "Acquaintance" }] },
    members, ["irene"], "en");
  check("[Stage Changes] names the member the way every other line does",
    /\[Stage Changes\] 🐰Irene: Stranger→Acquaintance/.test(staged),
    (staged.split("\n").find((l) => l.startsWith("[Stage Changes]")) || ""));
  check("...and falls back to the id for a member no longer in the roster",
    /\[Stage Changes\] gone:/.test(buildDynamicTail(
      { ...mem(), stageChanges: [{ memberId: "gone", from: "a", to: "b" }] },
      members, ["irene"], "en")),
    "a save can name a member the roster has dropped");

  // The prompt and the tail must agree, and this is the only check that ties the
  // two together: section 9 prints stageNamesFor(language), the tail emits it.
  // stageConfig has no Vite-only globals, so it imports directly.
  const stageCfg = await import("../src/config/stageConfig.js");
  for (const lang of ["zh", "en", "ko"]) {
    const names = stageCfg.stageNamesFor(lang);
    const line = prompt(form(), lang).split("\n")
      .find((l) => l.startsWith("- Relationship stages")) || "";
    check(`[${lang}] section 9 lists exactly the names the tail will emit`,
      names.every((n) => line.includes(n)), line.slice(0, 150));
  }

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
  // The ledger is the cacheable block, so an empty `Choice: ` line is the same
  // invisible trailing byte that has cost the whole prefix before. Every App.jsx
  // path supplies a choice — round 1 sends "Game start" — so this guards the
  // renderer against a legacy or hand-built entry rather than a case the app makes.
  const noChoice = buildHistoryLedger({
    history: [{ round: 0, type: "full", text: "story zero" }],
  });
  check("a full entry with no choice renders no empty Choice line",
    !/Choice:/.test(noChoice) && noChoice.split("\n").every((l) => !/ $/.test(l)),
    JSON.stringify(noChoice));
  check("...and one with a choice still renders it",
    /\nChoice: B\. walk over$/.test(buildHistoryLedger({
      history: [{ round: 0, type: "full", text: "story zero", choice: "B. walk over" }],
    })),
    JSON.stringify(buildHistoryLedger({
      history: [{ round: 0, type: "full", text: "s", choice: "B. walk over" }],
    })));

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

  // The check above boots the bundle; this one says the harness can FEED it.
  //
  // playthrough.mjs stubs fetch for the app's data trees and served only
  // `/groups/`. Step 3 added `/worlds/`, so every world fetch fell through to a
  // real fetch on a relative URL and the harness died with "Failed to parse URL"
  // before its first round — dead across steps 3, 4, 5 and 6, which were all
  // validated offline. That is the SECOND silent death of this harness; the first
  // was BASE_URL in v1.3.5, which is what the bootability check above exists for.
  //
  // So the trees are DERIVED from src/ rather than listed here. A new loader that
  // fetches `${base()}rosters/` fails this check until the harness serves it,
  // which is the whole point — the same reason Layer C loops over mirrored trees
  // instead of naming them.
  const fetchedTrees = new Set();
  (function scanForTrees(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) scanForTrees(p);
      else if (/\.(js|jsx)$/.test(e.name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/\$\{base\(\)\}([a-z_]+)\//g)) {
          fetchedTrees.add(m[1]);
        }
      }
    }
  })(join(ROOT, "src"));
  const harnessSrc = readFileSync(join(ROOT, "test", "playthrough.mjs"), "utf8");
  const servedDecl = (harnessSrc.match(/SERVED_TREES\s*=\s*\[([^\]]*)\]/) || [, ""])[1];
  const servedTrees = [...servedDecl.matchAll(/"\/([a-z_]+)\/"/g)].map((m) => m[1]);
  check("src/ fetches at least the two data trees this test knows about",
    fetchedTrees.has("groups") && fetchedTrees.has("worlds"),
    `the scan found ${[...fetchedTrees].join(", ") || "nothing"} — a broken scan would pass the next check vacuously`);
  const unserved = [...fetchedTrees].filter((t) => !servedTrees.includes(t));
  check("the live harness serves every data tree src/ fetches from disk",
    unserved.length === 0,
    `playthrough.mjs does not serve ${unserved.join(", ")} — it will die on a relative URL before round 1`);

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
  for (const lang of ["zh", "en", "ko"]) {
    const ids = worlds[lang].identities.map((i) => i.id);
    check(`[${lang}] the world declares every identity id that can sit in a save`,
      SAVED_IDENTITY_IDS.every((id) => ids.includes(id)),
      `missing: ${SAVED_IDENTITY_IDS.filter((id) => !ids.includes(id)).join(", ")}`);
    check(`[${lang}] every identity carries a non-empty background`,
      worlds[lang].identities.every((i) => typeof i.background === "string" && i.background.length > 40),
      worlds[lang].identities.filter((i) => !(i.background?.length > 40)).map((i) => i.id).join(", "));
    check(`[${lang}] every identity carries the name the prompt prints`,
      worlds[lang].identities.every((i) => typeof i.name === "string" && i.name.length > 0),
      worlds[lang].identities.filter((i) => !i.name).map((i) => i.id).join(", "));
    // The world declares a rule for every story mode and NOTHING for the paces
    // they replaced. A leftover `paces` array would be authored four more times
    // in step 7 for three worlds that never read it - the shape this repo
    // already tracks as NPC_APPEARANCE_CHANCE.
    check(`[${lang}] every story mode carries a rule`,
      loader.MODE_IDS.every((id) => typeof worlds[lang].modes[id] === "string"
        && worlds[lang].modes[id].length > 20),
      JSON.stringify(worlds[lang].modes).slice(0, 120));
    check(`[${lang}] the world carries no leftover pace list`,
      worlds[lang].paces === undefined, JSON.stringify(worlds[lang].paces || "").slice(0, 80));
  }

  // ---------------------------------------------------- Korean particles
  // A Korean particle is chosen by the sound the word in front of it ends in, and
  // the word in front of it here is interpolated — the member the player picked,
  // or one of four keepsakes. So ko.json could not write one form, and what it
  // wrote instead reached the model as broken Korean: `Joy는` (right) beside
  // `Irene는` (wrong, 아이린은), `미숙함로` (wrong, 미숙함으로), and a literal
  // `편지을/를` — an unresolved template in every Korean ex-girlfriend prompt.
  const rkp = loader.resolveKoreanParticles;
  const PARTICLE_CASES = [
    // Hangul decides exactly: the jongseong is arithmetic.
    ["어린 시절의 미숙함으로/로 인해", "어린 시절의 미숙함으로 인해"],
    ["가족의 압력으로/로 인해", "가족의 압력으로 인해"],
    ["그녀가 쓴 편지을/를", "그녀가 쓴 편지를"],
    ["함께 찍은 사진을/를", "함께 찍은 사진을"],
    ["그녀가 준 팔찌을/를", "그녀가 준 팔찌를"],
    ["사진이/가 있다", "사진이 있다"],
    ["팔찌이/가 있다", "팔찌가 있다"],
    // ㄹ is the one jongseong that takes 로, not 으로.
    ["서울으로/로 갔다", "서울로 갔다"],
    ["서울은/는 크다", "서울은 크다"],
    // A Latin name does not carry the answer and guessing is worse than not
    // trying: Irene reads 아이린 and ends in a consonant though its last letter is
    // a vowel; Winter reads 윈터 and ends in a vowel though its last letter is not.
    // The parenthetical dual is what Korean writes for a variable noun.
    ["Irene은/는 왔다", "Irene은(는) 왔다"],
    ["Joy이/가 왔다", "Joy이(가) 왔다"],
    ["Winter과/와 함께", "Winter과(와) 함께"],
    // Inert on text with no pair at all, which is every zh and en world file.
    ["这里没有韩语助词", "这里没有韩语助词"],
    ["nothing to resolve here", "nothing to resolve here"],
  ];
  for (const [input, expected] of PARTICLE_CASES) {
    check(`particle: ${input} -> ${expected}`, rkp(input) === expected, rkp(input));
  }

  // The resolver means nothing unless the rendered background goes through it.
  const koBg = (id, seed = 0) =>
    loader.renderIdentityBackground(worlds.ko, id, "Irene", seed);
  check("[ko] the rendered identity background has no unresolved particle pair",
    worlds.ko.identities.every((i) => !/[은이을과]\/[는가를와]|으로\/로/.test(koBg(i.id))),
    worlds.ko.identities.filter((i) => /\//.test(koBg(i.id))).map((i) => i.id).join(", "));
  check("[ko] ...and none of the four keepsakes leaves a wrong one",
    [0, 1 << 16, 2 << 16, 3 << 16].every((seed) => {
      const bg = koBg("主线成员前女友", seed);
      return /(편지를|사진을|팔찌를|CD을\(를\)) 간직/.test(bg) && !bg.includes("을/를");
    }),
    [0, 1 << 16, 2 << 16, 3 << 16]
      .map((s) => (koBg("主线成员前女友", s).match(/아직도 (.+?) 간직/) || [])[1]).join(" | "));
  check("[ko] ...and every breakup reason takes 으로, not 로",
    [0, 1, 2, 3].every((seed) => /으로 인해/.test(koBg("主线成员前女友", seed))),
    [0, 1, 2, 3].map((s) => (koBg("主线成员前女友", s).match(/몇 년 전 (.+?) 인해/) || [])[1]).join(" | "));
  // Every site in the file has to be written as a pair, or the resolver never sees
  // it and the bare particle ships as it did before.
  const bareParticle = /\{(?:name|reason|keepsake)\}(?:은|는|이|가|을|를|과|와|로)(?![/(])/;
  check("[ko] no placeholder in the world file is followed by a bare particle",
    worlds.ko.identities.every((i) => !bareParticle.test(i.background)),
    worlds.ko.identities.filter((i) => bareParticle.test(i.background)).map((i) => i.id).join(", "));
  // zh and en carry no pairs, so the resolver must be a no-op on them — proof it
  // cannot corrupt a language it was not written for.
  for (const lang of ["zh", "en"]) {
    check(`[${lang}] the resolver changes nothing in this world's backgrounds`,
      worlds[lang].identities.every((i) =>
        rkp(i.background) === i.background), "");
  }

  // --------------------------------------------- what App.jsx actually forwards
  // `executeRound` does not receive `form.identity`. App.jsx rewrites it first:
  //
  //   identity: form.identity === "H" ? (form.customIdentity || "Custom")
  //                                   : (IDENTITIES.find(i => i.id === form.identity)?.label || form.identity)
  //
  // That reads as a mapping from id to label and is currently an identity function,
  // because every entry in IDENTITIES has `label` equal to `id`. Localizing those
  // labels is the obvious next thing anyone would do — `src/i18n/*.js` already
  // carries an `identities` table for exactly that — and it would silently empty the
  // identity BACKGROUND and the WORK TITLE out of every real game, because
  // `getIdentity(world, "Chaebol")` finds nothing. **No existing test would notice:**
  // the goldens, the harness and every check in this file pass the raw id, which is
  // the one thing the app does not pass.
  //
  // So the requirement is not "label equals id". It is: whatever App.jsx forwards
  // must be an id the world declares.
  // v1.4.1 step 3 DELETED that list rather than guarding it, which is the `PACES`
  // lesson one field over: the picker's options are `world.identities` plus the one
  // id no world declares, and `formForRound` forwards `form.identity` unchanged. So
  // "what App.jsx forwards is an id the world declares" is true by construction,
  // and what is left to assert is that the construction is still the one in place.
  const setupSrc = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  check("Setup no longer carries its own copy of the identity list",
    !/const IDENTITIES = \[/.test(setupSrc) && !/t\.identities\[/.test(setupSrc),
    "a second list of identity ids is exactly what PACES was");
  check("...and the picker's options come from the world, plus the custom id",
    /world\.identities\.map\(i => \(\{ id: i\.id, label: i\.name \|\| i\.id \}\)\)/.test(setupSrc)
      && /\{ id: CUSTOM_IDENTITY_ID, label: t\.setup\.customIdentityOption \}/.test(setupSrc),
    "the option list is the world's list or it is a second copy of it");
  check("...and what it forwards for a world identity is that id, unchanged",
    /identity: form\.identity === CUSTOM_IDENTITY_ID\s*\r?\n?\s*\? \(form\.customIdentity \|\| "Custom"\)\s*\r?\n?\s*: form\.identity,/.test(setupSrc),
    "an id-to-label mapping here is what emptied the background out of every game");
  // The one id the app owns, named once. A literal "H" in a second place is how
  // the four copies of the `formForRound` expression drifted in the first place.
  check("...and the custom id is a named constant, not a literal in four places",
    /const CUSTOM_IDENTITY_ID = "H";/.test(setupSrc)
      && (setupSrc.match(/=== "H"/g) || []).length === 0,
    (setupSrc.match(/=== "H"/g) || []).length + ' literal === "H" comparisons remain');
  // A world change can leave `form.identity` holding an id the new world never
  // declares, which renders no background and no work title while still looking
  // chosen. Cleared against the world that LOADED - and only when genuinely
  // absent, because 主线成员前女友 keeps one id across all four worlds so that
  // switching keeps a route every world has.
  check("a world change clears an identity the new world does not declare",
    /world\.identities\.some\(i => i\.id === f\.identity\)/.test(setupSrc)
      && /\{ \.\.\.f, identity: "", customIdentity: "" \}/.test(setupSrc)
      && /\}, \[world\]\);/.test(setupSrc),
    "an id no world declares prints an empty identity block");
  check("...and keeps one it does, so a shared route survives the switch",
    /!f\.identity \|\| f\.identity === CUSTOM_IDENTITY_ID\s*\r?\n?\s*\|\| world\.identities\.some/.test(setupSrc),
    "clearing unconditionally is what the ex-girlfriend's single id exists to avoid");
  // Counted, and counted against the number of call sites. This was four copies of
  // one expression, and the count is what found that the fourth had drifted: the
  // epilogue omitted the `"H"` branch, so a player who wrote her own identity
  // reached the ending with the literal placeholder `[自定义]` in section 6. A
  // presence test passes while three of four copies are wrong; a mutation proved it.
  const roundCalls = (setupSrc.match(/await executeRound\(\{/g) || []).length;
  const helperUses = (setupSrc.match(/form: formForRound\(\),/g) || []).length;
  check("every executeRound call site builds its form the same one way",
    roundCalls >= 4 && helperUses === roundCalls,
    `${roundCalls} executeRound calls, ${helperUses} using formForRound()`);
  // The helper BODY, extracted first. A single unbounded `[\s\S]*?` across the whole
  // file reaches the Setup page's own `form.identity === "H"` render condition, so
  // the check passed against a helper that had stopped resolving it — the third time
  // an over-wide pattern in this suite has matched something other than its subject.
  const helperBody = (setupSrc.match(/const formForRound = \(\) => \(\{[\s\S]*?\n  \}\);/) || [""])[0];
  check("...and that one way resolves the custom-identity escape hatch",
    helperBody.includes("form.identity === CUSTOM_IDENTITY_ID") && helperBody.includes("form.customIdentity"),
    helperBody.replace(/\s+/g, " ").slice(0, 160) || "formForRound not found — the anchor moved");

  // PACES AND t.paces ARE GONE, and these guards are written so that bringing
  // either back fails. They were a fourth copy of the pace list, read as
  // `t.paces.map((p, i) => ... PACES[i])` - two hand-maintained lists coupled by
  // POSITION, so a language with a shorter list mislabelled the rest and a world
  // with its own pace ids would have stored one the world never declared. The
  // four universal story-mode ids delete the coupling instead of guarding it.
  check("Setup no longer carries its own copy of the pace list",
    !/const PACES = /.test(setupSrc) && !setupSrc.includes("t.paces"),
    "PACES came back - the world owns the list, and the ids are universal");
  for (const lang of ["zh", "en", "ko"]) {
    const i18nSrc = readFileSync(join(ROOT, `src/i18n/${lang}.js`), "utf8");
    check(`[${lang}] i18n carries no positional pace array`,
      !/^\s*paces:\s*\[/m.test(i18nSrc), "t.paces is the list PACES was coupled to");
    // The identity labels were a second copy of `world.identities[].name`, which a
    // check could only tie together - and step 7 would have owed 21 more rows
    // across three languages for ids the world files already name per language.
    // A coupling deleted is worth more than a coupling asserted.
    check(`[${lang}] i18n carries no second copy of the identity names`,
      !/^\s*identities:\s*\{/m.test(i18nSrc) && /customIdentityOption: "/.test(i18nSrc),
      "t.identities duplicated the world's own per-language names");
    // The label the world's noun is dropped into, and the stale copy of the line
    // that used to hardcode it. `ragLoading` said "Group loaded" in all three and
    // was already read by nothing - pickMainHint's shape, one file over.
    check(`[${lang}] the cast field's label is a template around the world's noun`,
      /orgName: \(noun\) => `/.test(i18nSrc) && /orgLoaded: \(noun\) => `/.test(i18nSrc)
        && !/castName: "/.test(i18nSrc) && !/ragLoading:/.test(i18nSrc),
      "a fixed noun here is right for one world of four");
    check(`[${lang}] the world picker has a label`,
      /\n\s*world: "[^"]{2,}"/.test(i18nSrc), "the picker renders t.setup.world");
    // Keyed by id instead, so a missing translation is a hole in a row rather
    // than a silent off-by-one in every label after it. Same argument as
    // RELEASE_NOTES holding all three languages side by side.
    const missing = loader.MODE_IDS.filter((id) =>
      !new RegExp(`\\n\\s*${id}:\\s*"[^"]{10,}"`).test(i18nSrc));
    check(`[${lang}] every story mode has a label`,
      missing.length === 0, `missing: ${missing.join(", ")}`);
  }
  // What App.jsx FORWARDS has to be a mode the world declares. Written on the
  // call rather than on the control, which is the identity lesson one field up:
  // `IDENTITIES.find(...).label` is an identity function today, so a guard
  // reading the picker would pass while the value reaching executeRound was
  // something else entirely.
  check("every executeRound call site forwards the story mode",
    (setupSrc.match(/aliyunOptions\(\), timeSpeed, storyMode,/g) || []).length === roundCalls,
    `${roundCalls} call sites, ${(setupSrc.match(/timeSpeed, storyMode,/g) || []).length} forwarding both dials` +
    " - the epilogue site is the one that has drifted before");
  // ...and the value it forwards comes from the seeding rule, which is the only
  // thing allowed to decide it.
  check("the story mode state is seeded through seededStoryMode",
    /useState\(\(\) =>\s*\n?\s*seededStoryMode\(/.test(setupSrc)
      && /const seededStoryMode = \(legacyPace\) =>/.test(setupSrc),
    "a second reader of rv_sim_story_mode is a second answer to what the mode is");
  // ...and loadSave seeds from the slot it is about to play, once, persisting it.
  // Without that, a player loading a pre-mode save is silently moved to free mode
  // whatever pace she has been playing for thirty rounds.
  check("loadSave seeds the story mode from the save it is loading",
    /seededStoryMode\(migrated.form\?.pace\)/.test(setupSrc)
      && /saveToStorage\("rv_sim_story_mode"/.test(setupSrc),
    "a seed that is not persisted runs again on every load and is not a seed");

  // THE SEEDING RULE ITSELF, behaviourally. Three mutations to the pace map went
  // green before these existed - not because a neighbouring check covered them,
  // but because nothing tested the mapping at all. The structural guards above
  // assert that App calls the rule; these assert that the rule is right.
  for (const [pace, mode] of [["慢热现实向", "free"], ["浪漫情感向", "romance"],
    ["高压舆论向", "pressure"], ["修罗海王向", "dramatic"]]) {
    check(`the legacy pace ${pace} seeds story mode "${mode}"`,
      loader.resolveStoryMode(null, pace) === mode,
      loader.resolveStoryMode(null, pace));
  }
  // A brand-new player has no pace and no mode, and free is what the game has
  // always been: no authored plot events, the relationship is the plot.
  check("no pace and no stored mode seeds free",
    loader.resolveStoryMode(null, undefined) === "free" && loader.resolveStoryMode(null, "") === "free",
    loader.resolveStoryMode(null, undefined));
  // A pace from a world that has been re-authored is somebody’s save, not a bug.
  check("a pace the world no longer declares seeds free rather than nothing",
    loader.resolveStoryMode(null, "made up in 2024") === "free",
    loader.resolveStoryMode(null, "made up in 2024"));
  // A CHOSEN MODE ALWAYS WINS. This is the half that matters once the seed has
  // run: the legacy field stays in the save forever, so a rule that preferred it
  // would silently overwrite her choice on every load.
  check("a stored mode wins over the save’s legacy pace",
    loader.resolveStoryMode("free", "高压舆论向") === "free"
      && loader.resolveStoryMode("dramatic", "慢热现实向") === "dramatic",
    loader.resolveStoryMode("free", "高压舆论向"));
  // ...but a stored value that is not a mode is not a choice. localStorage can
  // hold anything a previous build left there.
  check("a stored value that is not a mode falls through to the pace",
    loader.resolveStoryMode("浪漫情感向", "高压舆论向") === "pressure"
      && loader.resolveStoryMode("", "修罗海王向") === "dramatic",
    loader.resolveStoryMode("浪漫情感向", "高压舆论向"));
  // Every mode id is reachable as a stored value, or a mode exists that the
  // player can never be in. Derived from MODE_IDS.
  check("every story mode id survives a round trip as a stored value",
    loader.MODE_IDS.every((id) => loader.resolveStoryMode(id, "高压舆论向") === id),
    loader.MODE_IDS.map((id) => loader.resolveStoryMode(id, "高压舆论向")).join(", "));

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
  //
  // `places` is half and half: the id, emoji and draws are structure, while the
  // name and the one-line description are what the model writes `scene` from, so
  // only the structural half is compared.
  // `castLore` is half and half for the same reason `places` is: `composed`,
  // `subset` and `orgSuffix` are prompt-facing English rule text, while `orgNoun`
  // and `orgHint` are what the PLAYER reads on Setup and are authored per language.
  const langIndependent = (w) => JSON.stringify([w.phases, w.npcArchetypes, w.tone,
    w.statNotes, w.platforms, w.useGroupLore, w.modes,
    [w.castLore.composed, w.castLore.subset, w.castLore.orgSuffix, w.castLore.useRole],
    w.places.map((p) => [p.id, p.emoji, p.draws])]);
  check("the language-independent half of the world is identical across zh/en/ko",
    langIndependent(worlds.zh) === langIndependent(worlds.en)
      && langIndependent(worlds.en) === langIndependent(worlds.ko),
    "the three world files disagree on language-independent rule text");
  // ...and the localized half must actually BE localized, or a field was pasted
  // into all three files and never translated. `setting` and `scenario` are prose
  // the model reads as story material, like an identity's background.
  for (const key of ["setting", "scenario"]) {
    check(`"${key}" is authored per language, not triplicated`,
      new Set(["zh", "en", "ko"].map((l) => worlds[l][key])).size === 3,
      `${key} is the same string in at least two of the three world files`);
  }
  // ...and the player-facing half must actually be translated, or it was pasted
  // into all three files. `orgSuffix` is the opposite case and is compared above:
  // it reaches the PROMPT, where section 4 is English in every language.
  for (const key of ["orgNoun", "orgHint"]) {
    check(`"castLore.${key}" is authored per language, not triplicated`,
      new Set(["zh", "en", "ko"].map((l) => worlds[l].castLore[key])).size === 3,
      `${key} is the same string in at least two of the three world files`);
  }
  // The suffix is REQUIRED, not defaulted. A default would render a campus cast
  // "under Hanseo Entertainment": plausible, wrong, and silent - the failure mode
  // this repo bans fallbacks for.
  const rosterSrc = readFileSync(join(ROOT, "src/rag/rosterResolver.js"), "utf8");
  check("orgNameFor takes the suffix from its caller rather than defaulting",
    /export const orgNameFor = \(castName, suffix\) =>/.test(rosterSrc)
      && !/orgNameFor = \(castName, suffix = /.test(rosterSrc),
    "a default suffix is a fallback that returns plausible data");
  check("...and joins, so a world whose name IS its org leaves no trailing space",
    loader.orgNameFor("Hanseo", "") === "Hanseo"
      && loader.orgNameFor("X", "Entertainment") === "X Entertainment"
      && loader.orgNameFor("", "Entertainment") === "X Entertainment",
    `"${loader.orgNameFor("Hanseo", "")}" / "${loader.orgNameFor("X", "Entertainment")}"`);

  // The noun is dropped into three sentence templates (`${noun}名`, `${noun} name`,
  // `${noun} 伍讠`), so a trailing space or a full sentence here renders as one.
  check("the org noun is one word, so the i18n templates can build the grammar",
    ["zh", "en", "ko"].every((l) => {
      const n = worlds[l].castLore.orgNoun;
      return n === n.trim() && !/[\s。.:：]/.test(n) && n.length <= 12;
    }),
    ["zh", "en", "ko"].map((l) => JSON.stringify(worlds[l].castLore.orgNoun)).join(" "));
  // A world's display name and an identity's must differ, or the Setup page offers
  // the same word twice for two different things - `chaebol` the world against
  // 财阀会长 the identity. The `[Stage Changes]` id-vs-name problem one layer up.
  for (const lang of ["zh", "en", "ko"]) {
    const wname = JSON.parse(readFileSync(join(ROOT, "public/worlds/index.json"), "utf8"))
      .map((w) => w.name?.[lang]).filter(Boolean);
    const collide = worlds[lang].identities.filter((i) => wname.includes(i.name));
    check(`[${lang}] no world's display name is also an identity's`,
      wname.length > 0 && collide.length === 0,
      collide.map((i) => i.name).join(", "));
  }

  check("every place is named and described in the player's language",
    ["zh", "en", "ko"].every((l) => worlds[l].places.every((p) => p.name && p.desc)),
    "a place with no name renders as a blank line in the canon list");
  check("place ids are unique within a world",
    new Set(worlds.zh.places.map((p) => p.id)).size === worlds.zh.places.length,
    worlds.zh.places.map((p) => p.id).join(", "));
  check("the world covers all four round phases",
    worlds.zh.phases.length === 4 && worlds.zh.phases[3].to === null,
    JSON.stringify(worlds.zh.phases.map((p) => `${p.from}-${p.to}`)));

  // --- every world in the index, not just kpop_idol -- v1.4.1 step 7 ----------
  //
  // The checks above name one world because one world existed. Step 7 adds three,
  // and nine more files is nine more chances for one of them to be the copy that
  // still says weverse. So this derives the list from `worlds/index.json` and the
  // languages from LIB_LANGS: a fifth world is covered by adding a folder, never
  // by remembering to extend a check. Same rule as Layer C's loop over mirrored
  // trees and the harness's SERVED_TREES scan.
  const WORLD_INDEX = JSON.parse(
    readFileSync(join(ROOT, "public/worlds/index.json"), "utf8"));
  const allWorlds = {};
  for (const row of WORLD_INDEX) {
    allWorlds[row.id] = {};
    for (const lang of ["zh", "en", "ko"]) {
      allWorlds[row.id][lang] = await fromDisk(() => loader.loadWorld(row.id, lang));
    }
  }
  check("the world index lists more than the one world this suite was written for",
    WORLD_INDEX.length >= 4, `${WORLD_INDEX.length} worlds`);
  // parseWorld falls back to the folder name when the document has no `world.id`,
  // so a document whose id disagrees with its index row loads quietly and is then
  // a different world everywhere the id is used - the save's `worldId`, `rv_sim_world`,
  // the picker. Asserting the load succeeded would be asserting that loadWorld throws.
  const idMismatch = Object.entries(allWorlds).filter(([id, w]) =>
    ["zh", "en", "ko"].some((l) => w[l].id !== id));
  check("every world document agrees with the index row that names it",
    idMismatch.length === 0, idMismatch.map(([id, w]) => `${id} -> ${w.zh.id}`).join(", "));

  // The English rule half is what the model reads as RULES; the other half is
  // prose the player or the model reads as content. Getting a field on the wrong
  // side is invisible - both render something plausible - so both directions are
  // asserted for every world, not just the one the fields were introduced in.
  const invariantHalf = (w) => JSON.stringify([w.phases, w.npcArchetypes, w.tone,
    w.statNotes, w.platforms, w.useGroupLore, w.modes, w.addressContext, w.castLife,
    [w.castLore.composed, w.castLore.subset, w.castLore.orgSuffix, w.castLore.useRole],
    w.places.map((p) => [p.id, p.emoji, p.draws]),
    w.identities.map((i) => [i.id, i.workTitle?.kr, i.workTitle?.direction, i.workTitle?.because])]);
  for (const [id, w] of Object.entries(allWorlds)) {
    check(`[${id}] the language-independent half is identical across zh/en/ko`,
      invariantHalf(w.zh) === invariantHalf(w.en) && invariantHalf(w.en) === invariantHalf(w.ko),
      `${id}'s three world files disagree on language-independent rule text`);
    for (const key of ["setting", "scenario"]) {
      check(`[${id}] "${key}" is authored per language, not triplicated`,
        new Set(["zh", "en", "ko"].map((l) => w[l][key])).size === 3,
        `${id}: ${key} is the same string in at least two of the three files`);
    }
    for (const key of ["orgNoun", "orgHint"]) {
      check(`[${id}] "castLore.${key}" is authored per language`,
        new Set(["zh", "en", "ko"].map((l) => w[l].castLore[key])).size === 3,
        `${id}: castLore.${key} is the same string in at least two files`);
    }
    // Three distinct names, not two: an identity pasted from the zh file into the
    // en one renders Chinese on an English Setup button, and `>= 2` would pass.
    const untranslated = w.zh.identities.filter((it, i) =>
      new Set(["zh", "en", "ko"].map((l) => allWorlds[id][l].identities[i].name)).size !== 3);
    check(`[${id}] every identity is NAMED in each language`,
      untranslated.length === 0, untranslated.map((it) => it.id).join(", "));
  }

  // The ONLY placeholders renderIdentityBackground substitutes are {name},
  // {reason} and {keepsake} — the first from the roster, the other two from two
  // separate bit ranges of backstorySeed. A world writing {transfer} renders the
  // literal "{transfer}" into the cached prefix with no error and no test, which
  // is the 편지을/를 class: plausible-looking text nobody reads. Scanned rather
  // than spot-checked, because it is exactly the kind of typo one file carries.
  // ── what the organisation is CALLED, in every world ──────────────────────
  // The noun and the suffix are two halves of one sentence the player reads on
  // Setup and the model reads in section 4, and they had drifted apart in two
  // of the four worlds: an office cast was told its COMPANY was `X Group`, and
  // a chaebol cast that the leading FAMILY was `X Group`. Reported from hand
  // play, 2026-09-29. The shape check below runs on all four because the one it
  // replaces ran on kpop_idol, which is where neither defect could occur.
  const badNoun = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      const n = w[lang].castLore.orgNoun;
      // It is dropped into `${noun} name` and `已加载${noun}: `, so a trailing
      // space or a sentence renders as one. Two words are legal - `family
      // business` is one thing - a sentence is not.
      if (n !== n.trim() || /[\u3002.:\uFF1A]/.test(n) || n.split(/\s+/).length > 2 || n.length > 16) {
        badNoun.push(`${id}/${lang}: ${JSON.stringify(n)}`);
      }
    }
  }
  check("every world's org noun is short enough for the i18n templates to build on",
    badNoun.length === 0, badNoun.join(", "));
  // Two pinned regressions, deliberately. Nothing derivable catches a suffix
  // that names the wrong KIND of thing - parseWorld takes any string, and the
  // goldens cannot see it because all three fixtures are whole single groups,
  // which take the subset template and never render {org} at all.
  check("an office cast works at a company, not at a Group",
    Object.values(allWorlds.office || {}).length === 3
      && Object.values(allWorlds.office).every((w) => w.castLore.orgSuffix === "Ltd."),
    Object.values(allWorlds.office || {}).map((w) => w.castLore.orgSuffix).join(" "));
  check("...and a chaebol name is labelled as the family's business rather than as the family",
    /\u4f01\u4e1a/.test(allWorlds.chaebol?.zh?.castLore?.orgHint || "")
      && /business/.test(allWorlds.chaebol?.en?.castLore?.orgHint || "")
      && /\uae30\uc5c5/.test(allWorlds.chaebol?.ko?.castLore?.orgHint || ""),
    "`X Group` is right for a chaebol and wrong for a bare family noun");

  // ── round 1 is a first meeting ───────────────────────────────────────────
  // Every member starts at Stranger, and the step-7 identities described a
  // relationship already under way - she had already covered for you, you were
  // already the last two to leave - so round 1 opened on a cast who behaved
  // like old colleagues and scored like strangers. Reported from hand play.
  //
  // ALL FOUR WORLDS, derived from the index rather than listed: kpop_idol
  // implied it in its own prose (`自然相识`, `新任Staff`) and the other three did
  // not, which is how the three new ones were authored without it. One wording
  // in every world is what makes this scannable at all - a world added later
  // fails this check until it says the same thing.
  const FIRST_MEETING_MARK = { zh: "[\u521D\u89C1]", en: "[First meeting]", ko: "[\uCCAB \uB9CC\uB0A8]" };
  const EX_IDENTITY = "\u4E3B\u7EBF\u6210\u5458\u524D\u5973\u53CB";
  const missingFirstMeeting = [];
  for (const id of Object.keys(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      for (const it of allWorlds[id]?.[lang]?.identities || []) {
        if (it.id === EX_IDENTITY) continue;
        if (!String(it.background).includes(FIRST_MEETING_MARK[lang])) {
          missingFirstMeeting.push(`${id}/${lang}:${it.id}`);
        }
      }
    }
  }
  check("every identity in every world opens on a first meeting",
    missingFirstMeeting.length === 0,
    missingFirstMeeting.join(", "));
  // ...and the ex-girlfriend does NOT, in any world. Her premise is a shared
  // past, and a blanket append would have contradicted it in the same
  // paragraph - which is the half a `does it contain the block` check on its
  // own would happily pass.
  const exToldItIsNew = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      const ex = w[lang].identities.find((i) => i.id === EX_IDENTITY);
      if (ex && String(ex.background).includes(FIRST_MEETING_MARK[lang])) exToldItIsNew.push(`${id}/${lang}`);
    }
  }
  check("...and the ex-girlfriend is never told she is meeting her for the first time",
    exToldItIsNew.length === 0, exToldItIsNew.join(", "));

  const RENDERABLE = new Set(["name", "reason", "keepsake"]);
  const strayPlaceholders = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      for (const it of w[lang].identities) {
        for (const m of String(it.background || "").matchAll(/\{(\w+)\}/g)) {
          if (!RENDERABLE.has(m[1])) strayPlaceholders.push(`${id}/${lang}:${it.id} {${m[1]}}`);
        }
      }
    }
  }
  check("no identity background carries a placeholder nothing substitutes",
    strayPlaceholders.length === 0, strayPlaceholders.join(", "));

  // ...and the two variant keys must actually be there wherever they are used,
  // or the same line renders the literal from the other direction.
  const missingVariants = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      for (const it of w[lang].identities) {
        const bg = String(it.background || "");
        for (const key of ["reason", "keepsake"]) {
          if (!bg.includes(`{${key}}`)) continue;
          const list = it.variants?.[key];
          if (!Array.isArray(list) || list.length === 0) missingVariants.push(`${id}/${lang}:${it.id}.${key}`);
        }
      }
    }
  }
  check("an identity using {reason} or {keepsake} declares the list it draws from",
    missingVariants.length === 0, missingVariants.join(", "));

  // Rendering it is the check the two above cannot make: a placeholder that
  // survives substitution reaches the model as a brace.
  const unrendered = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en", "ko"]) {
      for (const it of w[lang].identities) {
        for (const seed of [0, 1, 65536, 123456789]) {
          const out = loader.renderIdentityBackground(w[lang], it.id, "Irene", seed);
          if (/[{}]/.test(out)) unrendered.push(`${id}/${lang}:${it.id}@${seed}`);
        }
      }
    }
  }
  check("every identity background renders with no brace left in it",
    unrendered.length === 0, unrendered.slice(0, 6).join(", "));

  // The ex-girlfriend route ships in EVERY world, keeping one id across all four
  // so that switching worlds on Setup keeps the player's route instead of
  // silently clearing it (step 3 clears an identity the new world does not
  // declare). A world that spelled it `ex_of_main` would pass every other check
  // here and drop the identity on a world change, with a correct-looking cause.
  const EX_ID = "主线成员前女友";
  for (const [id, w] of Object.entries(allWorlds)) {
    check(`[${id}] declares the ex-girlfriend identity under the shared id`,
      w.zh.identities.some((i) => i.id === EX_ID),
      w.zh.identities.map((i) => i.id).join(", "));
    // No "declares seven identities" check: the number is today's data rather than
    // a property, and no single edit breaks it without tripping the loader first,
    // so it could only ever have reported GREEN. The ex-girlfriend id and the
    // uniqueness of the set are the parts that can actually go wrong.
    check(`[${id}] identity ids are unique`,
      new Set(w.zh.identities.map((i) => i.id)).size === w.zh.identities.length,
      w.zh.identities.map((i) => i.id).join(", "));
    // "H" is the APP's escape hatch, resolved upstream in formForRound. A world
    // declaring it would put a second, world-owned meaning on the one id that
    // branch tests for.
    check(`[${id}] does not declare the app's custom-identity id`,
      !w.zh.identities.some((i) => i.id === "H"), "H belongs to App.jsx, not to a world");
    check(`[${id}] declares at least one social platform`,
      Array.isArray(w.zh.platforms.social) && w.zh.platforms.social.length > 0,
      "an empty social list renders an empty schema object nothing can fill");
    check(`[${id}] places are ten, uniquely identified, named and described in every language`,
      w.zh.places.length === 10
        && new Set(w.zh.places.map((p) => p.id)).size === 10
        && ["zh", "en", "ko"].every((l) => w[l].places.every((p) => p.name && p.desc)),
      `${w.zh.places.length} places`);
    check(`[${id}] covers all four round phases and the last one is open-ended`,
      w.zh.phases.length === 4 && w.zh.phases[3].to === null,
      JSON.stringify(w.zh.phases.map((p) => `${p.from}-${p.to}`)));
  }

  // A world's display name and an identity's must differ ACROSS worlds, not only
  // inside one: `chaebol` the world against 财阀会长 the kpop identity is the
  // collision this was written for, and it is invisible from inside either file.
  for (const lang of ["zh", "en", "ko"]) {
    const wnames = WORLD_INDEX.map((w) => w.name?.[lang]).filter(Boolean);
    const collide = [];
    for (const [id, w] of Object.entries(allWorlds)) {
      for (const it of w[lang].identities) {
        if (wnames.includes(it.name)) collide.push(`${id}:${it.name}`);
      }
    }
    check(`[${lang}] no world's display name is also an identity's, in any world`,
      wnames.length === WORLD_INDEX.length && collide.length === 0, collide.join(", "));
  }

  // A work title points AT the player or AT the cast, and which way was a
  // hardcoded identity id in mainAgent.js until step 7 - so to_cast was one
  // Chinese literal and everything else pointed at the player. Four of step 7's
  // identities point the title at the cast, and every one of them would have
  // rendered the sentence backwards: the inverted age line again.
  const toCast = [], toPlayer = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const it of w.zh.identities) {
      if (!it.workTitle) continue;
      (it.workTitle.direction === "to_cast" ? toCast : toPlayer).push(`${id}:${it.id}`);
    }
  }
  check("both directions are actually used by the worlds on disk",
    toCast.length > 0 && toPlayer.length > 0, `to_cast: ${toCast.join(", ")} | to_player: ${toPlayer.join(", ")}`);
  // No check that a to_cast entry carries `because`, or that a to_player one does
  // not: parseWorld throws on both, so the only mutation that could break such a
  // check breaks the load first and the suite never reaches it. A check that
  // duplicates a validator cannot fail. What CAN fail independently is the
  // rendering, which is asserted on the campus prompt below.

  // Korean particle pairs are resolved at render time and are meaningless in a
  // language that has none. A pair in a zh or en world file is a paste from the
  // ko one and would reach the model as a literal slash.
  const strayPairs = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    for (const lang of ["zh", "en"]) {
      for (const it of w[lang].identities) {
        if (/\u0000/.test(it.background || "")) continue;
        for (const pair of ["은/는", "이/가", "을/를", "과/와", "으로/로"]) {
          if (String(it.background || "").includes(pair)) strayPairs.push(`${id}/${lang}:${it.id}`);
        }
      }
    }
  }
  check("no zh or en world file carries a Korean particle pair",
    strayPairs.length === 0, strayPairs.join(", "));
  // ...and the ko files must actually use them, or the resolver has nothing to do
  // and the author wrote one fixed form for a variable word - the bug that put
  // "미숙함로" and a literal "편지을/를" in every Korean prompt.
  // Asserted on the two places the particle genuinely CANNOT be authored: the
  // breakup reason and the keepsake are each one of four Korean nouns, so the
  // particle after them changes with the roll. `some identity uses a pair` was the
  // first version of this check and it could not fail - a world has several
  // backgrounds, and removing one pair leaves the others standing.
  const EX_KO = [["{reason}", "으로/로"], ["{keepsake}", "을/를"]];
  const koMissingPair = [];
  for (const [id, w] of Object.entries(allWorlds)) {
    const ex = w.ko.identities.find((i) => i.id === EX_ID);
    for (const [token, pair] of EX_KO) {
      if (!String(ex?.background || "").includes(token + pair)) koMissingPair.push(`${id}:${token}`);
    }
  }
  check("every world's ko ex-girlfriend background pairs its particles",
    koMissingPair.length === 0, koMissingPair.join(", "));

  // The payoff. A non-idol world's prompt must not assert idol facts about the
  // cast, and until step 7 five sentences did: the ROLE CONTRACT enumerated
  // `practice, schedules, comebacks, the dorm, this company`, section 7 named
  // `the practice she just left`, and the scene rule exemplified `Practice room`.
  // Section 4 says these people are students two sections earlier, so the model
  // was handed the contradiction directly - the [BLACKPINK Background] shape.
  //
  // Asserted on the RENDERED prompt of a real non-idol world, not on the world
  // file: the file being right is what the checks above cover, and this is the
  // consumer. The member profiles are the idol LIBRARY's own prose and are the
  // player's choice of cast, so only the sections the world owns are scanned.
  const campusWorld = allWorlds.campus?.en;
  if (campusWorld) {
    const campusRoster = loader.buildClassicRoster("red_velvet", "irene", ["seulgi"],
      members.map((m) => m.id));
    const campusCast = await fromDisk(() => loader.resolveRoster(campusRoster, "en", campusWorld));
    const campusPrompt = buildSystemPrompt(form({ identity: "peer_student" }), campusCast.members,
      "irene", ["seulgi"], campusCast.groupConfig, "", "qwen", "en", campusWorld);
    const roleContract = campusPrompt.slice(campusPrompt.indexOf("ROLE CONTRACT"),
      campusPrompt.indexOf("REGISTER:"));
    // A dorm is a campus place too - the words that are idol-only are `comeback`
    // and `practice`, and those are what must not survive into a lecture hall.
    check("[campus] the ROLE CONTRACT does not give the cast comebacks and practice",
      !/comeback|practice/i.test(roleContract), roleContract.slice(0, 200));
    check("[campus] ...and states what their life in THIS world actually is",
      roleContract.includes(campusWorld.castLife.theirs)
        && roleContract.includes(campusWorld.castLife.notHers),
      "the world's own castLife never reached the rendered contract");
    check("[campus] the scene rule's example is this world's, not a practice room",
      campusPrompt.includes(`"${campusWorld.castLife.sceneExample}"`)
        && !campusPrompt.includes('"Practice room, 10PM"'),
      campusWorld.castLife.sceneExample);
    check("[campus] the social rule names a beat from this world",
      campusPrompt.includes(campusWorld.castLife.recentBeat),
      campusWorld.castLife.recentBeat);
    check("[campus] the Instagram like count is scaled to this cast's reach",
      campusPrompt.includes(`"likes":${campusWorld.castLife.socialReach}`)
        && !/"likes":800000/.test(campusPrompt),
      "a schema example is an instruction, and 800000 is an idol's number");
    // Step 6's trimming, rendering for the first time against real content
    // rather than a synthetic world: a world that declares neither must carry
    // neither, in all five places the catalog feeds.
    check("[campus] no undeclared platform reaches the prompt",
      !/bubble|Bubble|weverse|Weverse/.test(campusPrompt),
      "campus declares instagram and kakaotalk only");
    check("[campus] ...and the ones it does declare all reach it",
      /Instagram: Photo social/.test(campusPrompt) && /KKT \(KakaoTalk\)/.test(campusPrompt)
        && /"instagram":null/.test(campusPrompt),
      "a declared platform missing from the schema is a post nobody can write");
  // ...and the same question asked of EVERY world rather than of the one world
  // it was first asked of. The two checks above are pinned to campus, which is
  // the world where a chaebol defect cannot appear - the shape the org-suffix
  // scan had to learn one batch earlier. A player reported chaebol showing all
  // four platform buttons; that was the wrong world being LOADED rather than the
  // wrong prompt being built, but a per-world scan is what says so.
  {
    const MARKERS = {
      bubble: /bubble/i, weverse: /weverse/i,
      instagram: /instagram/i, kakaotalk: /KakaoTalk|KKT/,
    };
    const platformStrays = [];
    for (const [id, byLang] of Object.entries(allWorlds)) {
      const w = byLang.en;
      if (!w) continue;
      const declared = new Set([...(w.platforms?.social || []), w.platforms?.private].filter(Boolean));
      const roster = loader.buildClassicRoster("red_velvet", "irene", ["seulgi"], members.map((m) => m.id));
      const cast = await fromDisk(() => loader.resolveRoster(roster, "en", w));
      const rendered = buildSystemPrompt(form({ identity: w.identities[0].id }), cast.members,
        "irene", ["seulgi"], cast.groupConfig, "", "qwen", "en", w);
      for (const [plat, re] of Object.entries(MARKERS)) {
        const present = re.test(rendered);
        if (present !== declared.has(plat)) {
          platformStrays.push(`${id}: ${plat} ${present ? "reaches the prompt undeclared" : "declared but missing"}`);
        }
      }
    }
    check("every world's prompt carries exactly the platforms that world declares",
      platformStrays.length === 0, platformStrays.join(" | "));
  }
  // --- docs/V140_PLAN.md 22.1: idol prose in a non-idol world ---------------
  //
  // `castLore.useRole` keeps the STRUCTURED `role` out of section 4, and step 7
  // stopped there - so the prose one field over went on saying the same thing.
  // 57 of 57 library members carry idol vocabulary in a world-agnostic prose
  // field (80 instances, `public_image` 56 of them), which is why a chaebol
  // heiress posted about a recording session and being the maknae from a family
  // compound. The interim rule tells the model how to READ that prose; 22.2
  // fixes the data - and NARROWS this rule rather than deleting it, because
  // `generateCard` is an accelerator and never a gate, so a run can always hold a
  // member whose texture was not translated. The narrowing is guarded below.
  //
  // Derived over every world rather than asserted about campus, which is the
  // lesson the org-suffix scan and the platform loop above both had to learn: a
  // guard pinned to one instance of the class it is about is a sample. Both
  // directions are one comparison against `useRole`, so a fifth world is covered
  // the day it lands - and the idol world must NOT be told that this story is
  // not an idol story.
  {
    const TRAITS_RULE = /TRAITS, NEVER FOR FACTS/;
    const wrongSide = [];
    const noSubstitute = [];
    const misplaced = [];
    for (const [id, byLang] of Object.entries(allWorlds)) {
      const w = byLang.en;
      if (!w) continue;
      const roster = loader.buildClassicRoster("red_velvet", "irene", ["seulgi"],
        members.map((m) => m.id));
      const cast = await fromDisk(() => loader.resolveRoster(roster, "en", w));
      const rendered = buildSystemPrompt(form({ identity: w.identities[0].id }), cast.members,
        "irene", ["seulgi"], cast.groupConfig, "", "qwen", "en", w);
      // Section 5 up to the first profile. Scoping matters for the substitute:
      // `castLife.theirs` already renders in the ROLE CONTRACT, so an unscoped
      // search would pass on the OTHER section's copy and prove nothing here.
      const head = rendered.slice(rendered.indexOf("CRITICAL: \u2605"),
        rendered.indexOf("\n  Age: "));
      const wants = w.castLore.useRole === false;
      if (TRAITS_RULE.test(rendered) !== wants) {
        wrongSide.push(id + ": useRole=" + w.castLore.useRole + " and the rule is "
          + (wants ? "missing" : "present"));
      }
      if (!wants) continue;
      // The load-bearing half. A prohibition with no substitute gets routed
      // around - CLAUDE.md records that twice, and the second time the model
      // INVENTED a channel to escape a list of named ones. The substitute has to
      // be THIS world's, so a hardcoded one fails here.
      if (!head.includes(w.castLife.theirs)) {
        noSubstitute.push(`${id}: the rule never names ${JSON.stringify(w.castLife.theirs)}`);
      }
      // A rule about how to read the prose is read too late if it follows it.
      if (!TRAITS_RULE.test(head)) misplaced.push(id);
    }
    check("the traits-not-facts rule reaches every non-idol world and no idol one",
      wrongSide.length === 0, wrongSide.join(" | "));
    check("...and supplies that world's own life as the substitute, not a prohibition alone",
      noSubstitute.length === 0, noSubstitute.join(" | "));
    check("...and sits BEFORE the profiles it tells the model how to read",
      misplaced.length === 0, misplaced.join(" | "));

    // §22.2 NARROWS the rule to the members it is true of. Three states, and each
    // one is a different promise: gone once everybody is translated, scoped and
    // naming whom when it is a subset, and byte-identical to today when nobody is -
    // which is what lets this land without moving a golden, since no fixture
    // contains a translated member. Same technique step 6 used to exercise the
    // platform trimming before any world on disk could.
    const nonIdol = Object.values(allWorlds).map((b) => b.en)
      .find((w) => w && w.castLore.useRole === false);
    if (!nonIdol) {
      check("a non-idol world exists to exercise the narrowed rule against", false,
        "without one every check below would pass vacuously");
    } else {
      const roster = loader.buildClassicRoster("red_velvet", "irene", ["seulgi"],
        members.map((m) => m.id));
      const cast = await fromDisk(() => loader.resolveRoster(roster, "en", nonIdol));
      const render = (ms) => buildSystemPrompt(form({ identity: nonIdol.identities[0].id }),
        ms, "irene", ["seulgi"], cast.groupConfig, "", "qwen", "en", nonIdol);
      const done = (m) => ({ ...m, world_position: "restaged" });
      const none = render(cast.members);
      const all = render(cast.members.map(done));
      const some = render(cast.members.map((m, i) => (i === 0 ? m : done(m))));
      check("the traits-not-facts rule disappears once every member has been translated",
        !TRAITS_RULE.test(all),
        "a rule about data that is no longer sent is the append-only failure");
      check("...and stays for a run where even one member has not been",
        TRAITS_RULE.test(some) && TRAITS_RULE.test(none),
        "generateCard is an accelerator and never a gate, so this state is reachable");
      // Scoped to the CLAUSE. Searching the whole prompt for the translated
      // member's name finds her sub-member line and fails on prose that is
      // correct - the name is a claim about who still needs the rule only here.
      const clauseIn = (pr) => (pr.match(/This applies to [^\n]*?are literal\./) || [""])[0];
      check("...naming exactly her, and saying the others' lines are literal",
        clauseIn(some).includes(cast.members[0].name)
          && cast.members.slice(1).every((m) => !clauseIn(some).includes(m.name)),
        JSON.stringify(clauseIn(some)));
      check("...and says nothing about whom when nobody has been translated, so no golden moves",
        !/and to no one else/.test(none) && !/are literal/.test(none),
        "every fixture is in this state; a clause here would move three goldens");
    }
  }

    // Direction, rendered. `prof_of_cast` points the title at the player and
    // `junior_student` points it at the cast, and before step 7 the second one
    // could only have come out backwards.
    const overrideFor = (identity) => {
      const pr = buildSystemPrompt(form({ identity }), campusCast.members, "irene", ["seulgi"],
        campusCast.groupConfig, "", "qwen", "en", campusWorld);
      return pr.split(String.fromCharCode(10)).find((l) => l.startsWith("Work override:")) || "";
    };
    // In a ko world file `form` is already Hangul, so the gloss would translate a
    // word into itself: `"선배님" (선배님)`. Invisible in zh and en, which is
    // why the ko fixture is the one that showed it.
    const koCampus = allWorlds.campus.ko;
    const koOverride = buildSystemPrompt(
      form({ identity: "junior_student", name: "Nari" }), campusCast.members, "irene", ["seulgi"],
      campusCast.groupConfig, "", "qwen", "ko", koCampus)
      .split(String.fromCharCode(10)).find((l) => l.startsWith("Work override:")) || "";
    check("[campus/ko] a work title whose gloss would repeat it is printed once",
      koOverride.includes('"선배님"')
        && !koOverride.includes('"선배님" (선배님)'),
      koOverride);
    check("[campus] a title pointed at the player relaxes toward HER name",
      /she addresses Summer as .*relaxing toward "Summer"/.test(overrideFor("prof_of_cast")),
      overrideFor("prof_of_cast"));
    check("[campus] a title pointed at the cast relaxes toward the MEMBER name",
      /Summer also uses .* for them/.test(overrideFor("junior_student"))
        && /relaxing toward a member.s plain name/.test(overrideFor("junior_student")),
      overrideFor("junior_student"));
    check("[campus] ...and both are set on campus rather than on the job",
      /on campus/.test(overrideFor("prof_of_cast"))
        && /on campus/.test(overrideFor("junior_student"))
        && !/on the job|at work/.test(overrideFor("prof_of_cast") + overrideFor("junior_student")),
      overrideFor("prof_of_cast"));
  }


  // --- section 11: the canon places and the opening, v1.4.1 step 4 ----------
  //
  // The list has to be a FACT in the prompt, not only a rule about one. That is the
  // [Rounds Absent] lesson: a rule the model has no information to apply is inert,
  // and `prefer this list` is such a rule until the list is actually there.
  for (const lang of ["zh", "en", "ko"]) {
    const p = prompt(form(), lang);
    const missing = worlds[lang].places.filter((pl) => !p.includes(pl.name));
    check(`[${lang}] every canon place the world declares reaches the prompt`,
      missing.length === 0, missing.map((pl) => pl.id).join(", "));
    check(`[${lang}] ...with the one-line description that tells them apart`,
      worlds[lang].places.every((pl) => p.includes(`${pl.name} \u2014 ${pl.desc}`)),
      "a bare list of names says nothing about which place suits which scene");
    check(`[${lang}] the opening scenario reaches the prompt`,
      p.includes(worlds[lang].scenario),
      "round 1 has nothing to open on");
    // Every note of every stat, because section 10 asks the model to move them and
    // said nothing anywhere about what moves them in THIS world.
    check(`[${lang}] all three stat notes reach section 10`,
      ["selfId", "secrecy", "mood"].every((k) => p.includes(worlds[lang].statNotes[k])),
      ["selfId", "secrecy", "mood"].filter((k) => !p.includes(worlds[lang].statNotes[k])).join(", "));
  }

  const pEn = prompt(form(), "en");
  // The rule, and the fact it points at. Fact in the tail (the choice string says
  // where she went), rule in the cached part, rule pointing at the fact - the shape
  // [KKT Channels] and [Rounds Absent] both already use.
  check("section 11 states the prefer-this-list rule, with the escape hatch",
    /prefer this list when you choose a scene/.test(pEn)
      && /Invent somewhere new only when the story genuinely needs/.test(pEn),
    "a canon list with no rule is a list the model may ignore, and one with no"
    + " escape hatch is a prohibition it will route around");
  check("...and says that where she is decides who is there",
    /WHERE SHE IS DECIDES WHO IS THERE/.test(pEn)
      && /Habit and Private Personality/.test(pEn),
    "going somewhere was supposed to be how you run into someone");
  check("...and points that rule at [Rounds Absent] rather than restating it",
    /a member \[Rounds Absent\] shows has been away is a reason to put her there/.test(pEn),
    "the absence rule lives in section 3; duplicating it is how two rules disagree");
  check("the opening is framed as the first scene, not as this round's brief",
    /round 1 begins here/.test(pEn)
      && /From round 2 on this has already happened and is never replayed/.test(pEn),
    "at round 20 an unqualified opening reads as an instruction to open again");
  // It CANNOT be round-conditional - buildSystemPrompt takes no round - and that is
  // why it is safe in the cached prefix. What a future edit could still do is put
  // the place in the tail as well, which is the same fact twice and the second copy
  // is the one that drifts. That is the [NPC Appearances] failure exactly.
  const tailSrc = readFileSync(join(ROOT, "src/agent/memoryPool.js"), "utf8");
  check("no [Place] line is added to the dynamic tail beside the choice string",
    !/\[Place/.test(tailSrc) && !/\[Location/.test(tailSrc),
    "the choice string already carries where she went; a second copy drifts");
  // `draws` is the affinity matrix's input (plan section 7.3, reader in v1.4.2), not
  // prose. Printing it hands the model a lookup table for exactly the judgement
  // section 7.4 argues the model makes better than a table.
  const drawTags = [...new Set(worlds.en.places.flatMap((pl) => pl.draws || []))];
  // Asserted as the WHOLE line rather than by hunting for a tag string: several
  // tags are ordinary words the prompt uses elsewhere (`manager` and `staff` are
  // npcArchetypes), so a substring search would fail for the wrong reason. A place
  // line that renders exactly emoji + name + desc cannot be carrying anything else.
  check("a place renders as emoji, name and description, and nothing else",
    drawTags.length > 0 && worlds.en.places.every((pl) =>
      pEn.includes(`\n${pl.emoji} ${pl.name} \u2014 ${pl.desc}\n`)),
    "`draws` is the v1.4.2 affinity matrix input, not prose for the model");

  // The section numbers are load-bearing: the prompt refers to its own sections by
  // number in five places (`section 4 names`, `Section 6 SPEAKER CONTRACT`,
  // `section 7`, `section 11`). Inserting places at 8 - which the plan's own table
  // said - would have renumbered three sections and silently repointed all of them.
  const headings = pEn.split("\n").map((l) => /^\u2551 (\d+)\. /.exec(l))
    .filter(Boolean).map((m) => Number(m[1]));
  check("the prompt's sections are numbered 1..11 in order, each exactly once",
    JSON.stringify(headings) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    JSON.stringify(headings));
  check("places sit after the stat system and before the JSON schema",
    pEn.indexOf("10. STAT SYSTEM") < pEn.indexOf("11. PLACES")
      && pEn.indexOf("11. PLACES") < pEn.indexOf("JSON SCHEMA"),
    "the schema must be the last thing the model reads before the memory context");
  // Two spellings of one quantity is what the [Stage Changes] id-vs-name bug was.
  check("a stat note names the stat exactly as section 10 names it one line above",
    /\u{1F308}Self-Identity: /u.test(pEn) && /\u{1F512}Secrecy: /u.test(pEn)
      && /\u{1F4AB}Mood: /u.test(pEn),
    "the notes list and the editable-stats line must use one face per stat");

  // --- v1.4.1 step 5: discovered places, and the one thing they must never do --
  //
  // 6.1's hard invariant: a list that grows mid-game must never enter the static
  // system prompt, because the round it changed would invalidate the whole
  // ~5,500-token cached prefix. The plan's step-5 row said to mutation-verify this by
  // "making buildSystemPrompt read memory.places" - it takes no `memory` argument at
  // all, so that mutation cannot be written, and a check built on it would be vacuous.
  // The guard therefore sits on every route by which the value COULD leak: the two
  // builders that do take memory, and the one argument through which memory text
  // reaches the cached prefix.
  const DISCOVERED = "Noraebang basement B2";
  const memPlaces = {
    playerStats: null, affections: { irene: 40 }, kktMessages: {}, stageChanges: [],
    memberAppearances: {}, places: [{ name: DISCOVERED, round: 7 }],
    history: [{ round: 1, type: "full", text: "a story", choice: "A. go", summary: "gist" }],
  };
  check("a discovered place does not reach the history ledger",
    !buildHistoryLedger(memPlaces).includes(DISCOVERED),
    "the ledger is the cacheable prefix; a growing list in it breaks every entry after it");
  check("a discovered place does not reach the dynamic tail either",
    !buildDynamicTail(memPlaces, members, ["irene"], "en").includes(DISCOVERED),
    "the tail is cheap, but the choice string already says where she went - a second copy drifts");
  // `memoryContext` is the static prompt's only text input, and executeRound passes it
  // the empty string. That is the route a future edit would reach for.
  const mainAgentSrc = readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8");
  check("executeRound builds the system prompt with no memory text at all",
    /buildSystemPrompt\(form, members, mainId, subIds, groupConfig, '', selectedModel, language, world\)/
      .test(mainAgentSrc),
    "the third-from-last argument is the only way a client-side list could reach the cached prefix");

  // The discovery rule, per language and against the REAL world data: a scene is a
  // discovery when it names none of that language's canon places. Both sides are the
  // player's language, so this is never a cross-language comparison.
  for (const lang of ["zh", "en", "ko"]) {
    const canonNames = worlds[lang].places.map((pl) => pl.name);
    const canonMissed = canonNames.filter((n) => discoveredPlaceIn(n, worlds[lang]) !== "");
    check(`[${lang}] a scene naming a canon place discovers nothing`,
      canonMissed.length === 0, canonMissed.join(", "));
  }
  check("a canon place is still canon with a time on the end of it",
    discoveredPlaceIn("Practice room B, 10PM", worlds.en) === ""
      && discoveredPlaceIn("\u7ec3\u4e60\u5ba4\uff0c\u51cc\u66682\u70b9", worlds.zh) === "",
    "section 11 asks for a place AND a time, so the time is on almost every scene");
  check("a scene the world does not declare is recorded as a discovery",
    discoveredPlaceIn("Noraebang basement, 1am", worlds.en) === "Noraebang basement",
    discoveredPlaceIn("Noraebang basement, 1am", worlds.en));
  // Without this, `Rooftop, 2am` and `Rooftop, 3am` are two rows on one map.
  check("...with the time stripped, so one place is one row whatever hour it is",
    discoveredPlaceIn("Noraebang basement, 1am", worlds.en)
      === discoveredPlaceIn("Noraebang basement, 3am", worlds.en)
      && discoveredPlaceIn("\u70e7\u8089\u5e97\u5305\u623f\uff0c\u51cc\u66682\u70b9", worlds.zh)
        === "\u70e7\u8089\u5e97\u5305\u623f",
    "the trailing segment carrying a digit is the time");
  // A word list of time words per language is exactly what this avoids, so a spelled-out
  // time survives - deliberately, and stated in the plan rather than left to be found.
  check("...and a time that is only digits is not recorded as a place at all",
    discoveredPlaceIn("22:00", worlds.en) === "" && discoveredPlaceIn("", worlds.en) === "",
    "a place has a name; a name has at least one letter in it");

  // recordPlace is pure and exported for the reason addSaveSlot is: the alternative is
  // reaching the cap by playing thirty rounds by hand.
  check("a new place is appended with the round it was found in",
    JSON.stringify(recordPlace([], "Rooftop bar", 4)) === JSON.stringify([{ name: "Rooftop bar", round: 4 }]),
    JSON.stringify(recordPlace([], "Rooftop bar", 4)));
  const placeOnce = recordPlace([], "Rooftop bar", 4);
  check("...and the same place found again is not a second row",
    recordPlace(placeOnce, "rooftop bar.", 9) === placeOnce,
    "case and punctuation are not identity; the same array object is returned");
  check("placeKey folds case, spacing and punctuation and nothing else",
    placeKey("Rooftop, B2") === placeKey("rooftop b2")
      && placeKey("Rooftop") !== placeKey("Rooftop stairwell"),
    "two spellings of one place is one row; two places are two");
  // Eviction would take away somewhere the player can currently tap. addSaveSlot's
  // choice, for addSaveSlot's reason - and asserted on the CONTENTS, because refusing
  // and evicting both leave PLACES_MAX rows and a length check passes against the bug.
  const placesAtCap = Array.from({ length: PLACES_MAX }, (_, i) => ({ name: `P${i}`, round: i }));
  const placesRefused = recordPlace(placesAtCap, "One more", 99);
  check("at the cap a new place is refused rather than evicting the oldest",
    placesRefused === placesAtCap && placesRefused[0].name === "P0"
      && !placesRefused.some((p) => p.name === "One more"),
    "an evicted place is one the player can no longer go back to");

  check("a new game starts with an empty discovered list",
    Array.isArray(createEmptyMemory().places) && createEmptyMemory().places.length === 0,
    "the map has to have somewhere to put them");
  // Every save written before step 5 has no `places` key at all, which is why there is
  // no schema bump and no saveMigrator row: the readers take `|| []` and recordPlace
  // accepts undefined.
  const placeLegacyMem = { ...memPlaces };
  delete placeLegacyMem.places;
  let placeLegacyOk = false;
  try {
    updateMemory(placeLegacyMem, { discoveredPlace: { name: "Old bridge", round: 2 } });
    placeLegacyOk = placeLegacyMem.places.length === 1 && placeLegacyMem.places[0].name === "Old bridge";
  } catch { placeLegacyOk = false; }
  check("a save written before step 5 gains a place without a migration",
    placeLegacyOk, JSON.stringify(placeLegacyMem.places));

  // updateMemory is the single writer, the same rule memberAppearances follows. Two
  // writers of one record is how the tail's member lines came to disagree.
  check("executeRound hands the discovery to updateMemory rather than writing it",
    /discoveredPlace: foundPlace \? \{ name: foundPlace, round: roundNum \} : null/.test(mainAgentSrc)
      && /const foundPlace = discoveredPlaceIn\(parsed.scene, world\)/.test(mainAgentSrc),
    "`parsed.scene` rather than newStats.scene: that one falls back to the previous round");
  const appSrcPlaces = readFileSync(join(ROOT, "src/App.jsx"), "utf8")
    .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check("App.jsx never writes memory.places itself",
    !/\.places\s*=[^=]/.test(appSrcPlaces),
    "the round path owns the record; the UI only reads it");

  // The picker rides the existing choice channel (7.1): no schema field, no tail entry.
  // THE TWO ROUND BUTTONS ON THE INPUT ROW WEAR ONE SET OF COLOURS. They both
  // submit a choice and they are the same size, and they said `tappable` two
  // different ways - a bordered neutral circle against an accent fill three
  // elements over. Asserted as a PAIR, because either one alone is a colour
  // scheme nobody can be wrong about; what was wrong was that there were two.
  const inputRow = appSrcPlaces.slice(appSrcPlaces.indexOf("{editingIdx === null && ("),
    appSrcPlaces.indexOf("{/* Overlays */}"));
  const roundButtons = inputRow.match(/width: 34, height: 34[^}]*\}/g) || [];
  check("the place and send buttons are one pair, not two colour schemes",
    roundButtons.length === 2
      && roundButtons.every((b) => /th\.accentGrad/.test(b) && /th\.newGameDisabled/.test(b)),
    `${roundButtons.length} round buttons on the input row`);
  check("...and neither of them is dimmed on top of the disabled fill",
    !roundButtons.some((b) => /opacity/.test(b)),
    "the disabled fill IS the signal; dimming it as well made the row look faulty");

  check("the map submits an ordinary choice through sendMessage",
    /onPick=\{\(name\) => \{ setOverlay\(null\); sendMessage\(placeChoiceText\(name\)\); \}\}/.test(appSrcPlaces),
    "a second input path per round is what 7.1 exists to avoid");
  check("...and it is handed the world's canon list and the save's discovered one",
    /canon=\{world\?\.places \|\| \[\]\}/.test(appSrcPlaces)
      && /discovered=\{memoryRef\.current\?\.places \|\| \[\]\}/.test(appSrcPlaces),
    "canon comes from the world, discovered from the save, and neither from the other");
  check("the map button sits in the input row and is disabled until the world loads",
    /setOverlay\(\{ type: \"map\" \}\)/.test(appSrcPlaces)
      && /disabled=\{loading \|\| !world\}/.test(appSrcPlaces),
    "a picker with no world behind it has nothing to list");

  // The sentence is a per-language template, because Korean needs a particle and the
  // word in front of a particle is a variable here. Composing it at the call site is the
  // unresolved-particle defect one layer out from where it was fixed.
  const i18nPacks = {};
  for (const lang of ["zh", "en", "ko"]) {
    i18nPacks[lang] = (await import("file://" + join(ROOT, `src/i18n/${lang}.js`)
      .replace(/\\/g, "/"))).default;
  }
  const goFor = (lang) => i18nPacks[lang].map.go;
  for (const lang of ["zh", "en", "ko"]) {
    check(`[${lang}] the place sentence is a template naming the place`,
      typeof goFor(lang) === "string" && goFor(lang).includes("{place}"),
      String(goFor(lang)));
  }
  const goIn = (lang, place) =>
    loader.resolveKoreanParticles(goFor(lang).replace("{place}", place));
  check("ko picks the particle from the place name's last syllable",
    goIn("ko", "\uc5f0\uc2b5\uc2e4") === "\uc5f0\uc2b5\uc2e4\ub85c \ud5a5\ud55c\ub2e4"
      && goIn("ko", "\uc624\uc0c1") === "\uc624\uc0c1\uc73c\ub85c \ud5a5\ud55c\ub2e4",
    `${goIn("ko", "\uc5f0\uc2b5\uc2e4")} / ${goIn("ko", "\uc624\uc0c1")}`);
  check("...and leaves no unresolved pair in any language",
    ["zh", "en", "ko"].every((lang) =>
      worlds[lang].places.every((pl) => !goIn(lang, pl.name).includes("/"))),
    "a literal \uc73c\ub85c/\ub85c in the player's own choice string is the defect this function fixes");
  check("the resolver is inert on zh and en, which carry no pair",
    goIn("zh", "\u5c4b\u9876") === goFor("zh").replace("{place}", "\u5c4b\u9876")
      && goIn("en", "Rooftop") === goFor("en").replace("{place}", "Rooftop"),
    "a resolver that can rewrite a language it was not written for is worse than none");

  // ===== v1.4.1 step 6: the platforms belong to the world ==================
  //
  // `world.platforms` names ids; src/config/platformConfig.js says what each one is.
  // Every world on disk declares all three social platforms today, so the trimming is
  // exercised against a synthetic instagram-only world here - which is also the only way
  // to test it before step 7's content exists.
  const platMod = await import("../src/config/platformConfig.js?t=" + Date.now());
  const PLAT = platMod.PLATFORMS;

  for (const [pid, entry] of Object.entries(PLAT)) {
    check(`the ${pid} catalog entry is complete`,
      entry.id === pid && typeof entry.ui === "string" && typeof entry.icon === "string"
        && typeof entry.promptName === "string" && typeof entry.badge === "string"
        && typeof entry.rules === "function" && typeof entry.formatRules === "function",
      JSON.stringify(Object.keys(entry)));
    check(`...and ${pid} carries a schema fragment only if it is a social platform`,
      entry.private ? entry.schema === null : typeof entry.schema === "string",
      String(entry.schema));
  }
  check("the social and private id sets partition the catalog",
    [...platMod.SOCIAL_PLATFORM_IDS, ...platMod.PRIVATE_PLATFORM_IDS].sort().join()
      === Object.keys(PLAT).sort().join()
      && platMod.SOCIAL_PLATFORM_IDS.every((id) => !platMod.PRIVATE_PLATFORM_IDS.includes(id)),
    platMod.SOCIAL_PLATFORM_IDS.join() + " | " + platMod.PRIVATE_PLATFORM_IDS.join());
  // Not `every id a world declares is in the catalog` - parseWorld validates exactly that
  // and throws first, so such a check cannot fail and would be decoration. What can fail,
  // and what makes the throw worth having, is the other end: a catalog entry the app has
  // no overlay for would put a button in the top bar that opens nothing.
  const platAppRaw = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  const platNoOverlay = Object.values(PLAT)
    .filter((e) => !platAppRaw.includes(`overlay?.type === "${e.ui}"`));
  check("every platform in the catalog has an overlay App.jsx can open",
    platNoOverlay.length === 0, platNoOverlay.map((e) => e.id + " -> " + e.ui).join(", "));

  // The prompt renders the declared platforms and nothing else. kpop_idol declares all
  // three in this order, which is why the goldens do not move.
  const platPromptFor = (w, lang = "en") =>
    buildSystemPrompt(form(), members, "irene", ["yeri"], GROUP, "", "qwen", lang, w);
  const platFull = platPromptFor(worldFor.en);
  check("the schema asks for every platform the world declares, in its order",
    platFull.includes('{"bubble":[{"content":"msg","hasPhoto":false,"photoDesc":""}],"instagram":null,"weverse":null}'),
    platFull.split("\n").find((l) => l.includes('"bubble"')) || "(no socialContent line)");
  check("...and section 7 carries one rule line per declared platform",
    /- Bubble: member-to-fan/.test(platFull) && /- Instagram: Photo social/.test(platFull)
      && /- Weverse: Fan community/.test(platFull),
    "a platform the world declares with no rule is a key the model fills blind");

  // The trimmed world: Instagram and KakaoTalk only, which is what campus, office and
  // chaebol ship in step 7.
  const platTrim = (lang) => ({
    ...worldFor[lang],
    platforms: { social: ["instagram"], private: "kakaotalk" },
  });
  const platThin = platPromptFor(platTrim("en"));
  check("a world declaring one social platform asks for one",
    platThin.includes('"instagram":null') && !platThin.includes('"bubble":[')
      && !platThin.includes('"weverse":null'),
    platThin.split("\n").find((l) => l.includes("instagram")) || "(no socialContent line)");
  check("...and section 7 loses the rules for the platforms it does not have",
    /- Instagram: Photo social/.test(platThin)
      && !/- Bubble: member-to-fan/.test(platThin) && !/- Weverse: Fan community/.test(platThin),
    "a rule for a platform with no key is a rule the model cannot follow");
  check("...and the RULES block loses their format lines too",
    /- socialContent\.instagram: MUST be an object/.test(platThin)
      && !/- socialContent\.bubble:/.test(platThin) && !/- socialContent\.weverse:/.test(platThin),
    "a format rule naming a key the schema does not have is the other half of the defect");
  check("...and section 1 names the platforms that exist, not a fixed four",
    platThin.includes("DO NOT output Korean in instagram/KKT content")
      && platFull.includes("DO NOT output Korean in bubble/instagram/weverse/KKT content"),
    platThin.split("\n").find((l) => l.includes("DO NOT output Korean")) || "(no social rule)");
  check("...and the Hangul clause names a platform the world has",
    /- For Chinese\/English: instagram\/social content/.test(platThin)
      && /- For Chinese\/English: bubble\/social content/.test(platFull),
    platThin.split("\n").find((l) => l.includes("For Chinese/English")) || "(no Hangul clause)");
  check("the private channel survives a world that trims every social platform",
    /- KKT \(KakaoTalk\): Private chat/.test(platThin)
      && /- KKT IS DELIVERED BY THE APP/.test(platThin)
      && /- KKT IS A LOCKED CHANNEL/.test(platThin)
      && /- kktMessages: Object with member IDs/.test(platThin),
    "KKT is gated on affection, not on the social list");
  check("...and trimming platforms removes no section from the prompt",
    (platThin.match(/^║ (\d+)\. /gm) || []).length
      === (platFull.match(/^║ (\d+)\. /gm) || []).length,
    "the section numbering is referred to by number from five places");

  // A world file is authored HERE, so a platform the app cannot render is a typo that must
  // fail loudly - the unknown-register rule. A MODEL naming one is the opposite case and is
  // filtered below. The two sit together on purpose: the asymmetry is the design.
  const platGood = JSON.parse(readFileSync(
    join(ROOT, "public", "worlds", "kpop_idol", "zh.json"), "utf8"));
  const platRegs = JSON.parse(readFileSync(
    join(ROOT, "public", "worlds", "_registers", "zh.json"), "utf8"));
  const platParse = (platforms) => {
    try { loader.parseWorld({ ...platGood, platforms }, "kpop_idol", "zh", platRegs); return null; }
    catch (e) { return e.message; }
  };
  const badSocial = platParse({ social: ["instagram", "mastodon"], private: "kakaotalk" });
  check("parseWorld rejects a social platform the app has no overlay for",
    badSocial !== null && badSocial.includes("mastodon"),
    badSocial || "parsed without complaint");
  const badPriv = platParse({ social: ["instagram"], private: "signal" });
  check("parseWorld rejects a private channel the app has no overlay for",
    badPriv !== null && badPriv.includes("signal"),
    badPriv || "parsed without complaint");
  check("...and accepts a world that declares a SUBSET of the platforms",
    platParse({ social: ["instagram"], private: "kakaotalk" }) === null,
    "trimming is the feature; only an unknown id is an error");

  // filterSocialByPlatforms - pure and exported, tested directly rather than only through
  // a round, the same reason addSaveSlot and membersNamedIn are.
  const platRaw = {
    irene: { bubble: [{ content: "hi" }], instagram: { caption: "x" }, weverse: { content: "y" } },
    yeri: { weverse: { content: "z" } },
  };
  const platKept = platMod.filterSocialByPlatforms(platRaw, ["instagram"]);
  check("an undeclared platform is dropped from the model's social content",
    !("bubble" in platKept.irene) && !("weverse" in platKept.irene),
    JSON.stringify(Object.keys(platKept.irene)));
  check("...and a declared one is kept exactly as the model wrote it",
    platKept.irene?.instagram?.caption === "x", JSON.stringify(platKept.irene?.instagram));
  check("...and a declared platform the model omitted is NOT invented",
    !("instagram" in (platKept.yeri || {})) && Object.keys(platKept.yeri || {}).length === 0,
    JSON.stringify(platKept.yeri));
  check("...and the member survives even when every platform she carried is dropped",
    "yeri" in platKept, JSON.stringify(Object.keys(platKept)));
  check("...and the model's own object is not mutated",
    "bubble" in platRaw.irene && "weverse" in platRaw.yeri,
    "a filter that mutates its input makes the raw response unreadable afterwards");
  let platEmpty = null;
  try {
    platEmpty = JSON.stringify(platMod.filterSocialByPlatforms({}, ["instagram"]))
      + JSON.stringify(platMod.filterSocialByPlatforms(undefined, ["instagram"]));
  } catch (e) { platEmpty = e.message; }
  check("...and an empty response filters to an empty object rather than throwing",
    platEmpty === "{}{}", platEmpty);

  // executeRound filters ONCE and both readers take the filtered value. One of two is the
  // failure mode here, and it is extractStoryText's.
  const platAgentSrc = readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8");
  check("executeRound filters the model's social content against the world",
    (platAgentSrc.match(/filterSocialByPlatforms\(/g) || []).length === 1
      && /const socialContent = filterSocialByPlatforms\(parsed\.socialContent \|\| \{\}, declaredSocial\)/
        .test(platAgentSrc),
    "the filter is the only thing between an undeclared platform and a live notification");
  check("...and nothing downstream reads the unfiltered response",
    (platAgentSrc.match(/parsed\.socialContent/g) || []).length === 1,
    "both the notification derivation and the feed write must read the filtered object");
  check("...and the private channel's notification names the catalog's overlay key",
    /const privateUi = platformsOf\(world\)\.private\?\.ui/.test(platAgentSrc)
      && !/roundNotifs\.push\(\{ platform: "kakao"/.test(platAgentSrc),
    "the world says kakaotalk and the overlay is kakao - a literal here gets that mapping wrong");
  check("...and the notifications iterate the declared list, not three named platforms",
    /for \(const pid of declaredSocial\)/.test(platAgentSrc)
      && !/roundNotifs\.push\(\{ platform: "weverse"/.test(platAgentSrc),
    "a hand-written list of three is the list that goes out of date");

  // The group library no longer claims to own platforms. Read through loadGroupConfig,
  // never off the JSON: a fixture tests the formatter and not the feature.
  const platGroupCfg = await fromDisk(() => loader.loadGroupConfig("red_velvet", "en"));
  check("a loaded group config carries no platform fields",
    platGroupCfg.group.socialPlatforms === undefined
      && platGroupCfg.group.privateChat === undefined,
    JSON.stringify(Object.keys(platGroupCfg.group)));
  const platTreeHits = [];
  for (const tree of ["public/groups", "groups"]) {
    for (const e of readdirSync(join(ROOT, tree), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = join(ROOT, tree, e.name);
      const dir = e.name;
      for (const f of readdirSync(d)) {
        if (!f.endsWith(".json")) continue;
        if (/social_platforms|private_chat/.test(readFileSync(join(d, f), "utf8"))) {
          platTreeHits.push(tree + "/" + dir + "/" + f);
        }
      }
    }
  }
  check("no group file in either tree still declares platforms",
    platTreeHits.length === 0, platTreeHits.slice(0, 4).join(", "));
  check("...nor the template, which is where the next group would inherit them",
    !/social_platforms|private_chat/.test(
      readFileSync(join(ROOT, "src/rag/groupConfigTemplate.json"), "utf8")),
    "a dead key in the template is how the next author is taught to set it");
  check("...nor the config an all-custom cast synthesises",
    !/socialPlatforms|privateChat/.test(
      readFileSync(join(ROOT, "src/rag/rosterResolver.js"), "utf8")),
    "the branch with no group file is where a default quietly reappears");

  // The top bar is the world's platform list. Comment-stripped, so a guard cannot pass on
  // the prose that explains it - which has happened twice in this file.
  const platAppSrc = readFileSync(join(ROOT, "src/App.jsx"), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check("the top bar's icons are built from the world's declared platforms",
    /const \{ social, private: priv \} = platformsOf\(world\)/.test(platAppSrc)
      && /\{platformBar\.map\(b => \{/.test(platAppSrc),
    "four literals in the JSX would draw four buttons in a world that declares two");
  check("...with the private channel last and the only one that can be locked",
    /priv \? \[\{ icon: priv\.icon, type: priv\.ui, badge: priv\.badge, locked: !kktUnlocked\[form\.mainMember\] \}\] : \[\]/
      .test(platAppSrc)
      && /social\.map\(\(p\) => \(\{ icon: p\.icon, type: p\.ui, badge: p\.badge, locked: false \}\)\)/
        .test(platAppSrc),
    "a social platform has no unlock and the private one has nothing else");
  check("...and the notification strip reads its label from the catalog",
    !/const pn = \{ bubble:/.test(platAppSrc)
      && /platformBar\.find\(b => b\.type === n\.platform\)\?\.badge/.test(platAppSrc),
    "a second list of four labels is the list that disagrees with the first");
  check("...and App.jsx names no platform id of its own any more",
    !/type: "weverse"/.test(platAppSrc) && !/type: "bubble"/.test(platAppSrc),
    "the catalog owns the icons, so a fifth platform is one entry and not six edits");

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
  // Address forms left the world file in v1.4.1: a world names a REGISTER and the
  // tables live in one place, so four worlds set in Korea are not four copies.
  const registers = JSON.parse(readFileSync(
    join(ROOT, "public", "worlds", "_registers", "zh.json"), "utf8"));
  const parseW = (cfg, reg = registers) => loader.parseWorld(cfg, "kpop_idol", "zh", reg);

  for (const key of ["country", "setting", "tone", "statNotes", "platforms", "castLore",
    "useGroupLore", "identities", "modes", "phases", "places", "scenario",
    "npcArchetypes"]) {
    const broken = { ...good };
    delete broken[key];
    let msg = null;
    try { parseW(broken); } catch (e) { msg = e.message; }
    check(`parseWorld rejects a world missing "${key}"`,
      msg !== null && msg.includes(key), msg || "parsed without complaint");
  }
  // The Setup field's three strings, v1.4.1 step 3. `orgSuffix` MAY be empty - a
  // university's name is already the university - so it is rejected for not being
  // a string rather than for being falsy, which is the `ya: null` distinction two
  // blocks down. A missing `{org}` is rejected because the hint is the only place
  // the player is shown the organisation name the model will be given.
  for (const [key, bad, why] of [
    ["orgNoun", undefined, "missing"], ["orgNoun", "", "empty"],
    ["orgHint", undefined, "missing"], ["orgHint", "debuts as one group", "carrying no {org}"],
    ["orgSuffix", undefined, "missing"], ["orgSuffix", 7, "not a string"],
  ]) {
    const broken = { ...good, castLore: { ...good.castLore } };
    if (bad === undefined) delete broken.castLore[key]; else broken.castLore[key] = bad;
    let msg = null;
    try { parseW(broken); } catch (e) { msg = e.message; }
    check(`parseWorld rejects castLore.${key} ${why}`,
      msg !== null && msg.includes(key), msg || "parsed without complaint");
  }
  // ...and an EMPTY suffix is accepted, because rejecting it would force every
  // non-idol world to invent a second word for its own name.
  // Caught, so tightening the check above to truthiness fails THIS check by name
  // instead of throwing out of the suite. A guard that reports a stack trace is
  // a guard whose subject nobody can read off the output.
  let emptySuffixOk = false;
  try {
    emptySuffixOk = parseW({ ...good, castLore: { ...good.castLore, orgSuffix: "" } })
      .castLore.orgSuffix === "";
  } catch { emptySuffixOk = false; }
  check("parseWorld accepts an empty orgSuffix, which is a real value",
    emptySuffixOk, "a college's name is already the college");

  // v1.4.1 step 4. Two fields whose reader arrived with them: `castLore.useRole`,
  // which decides whether an idol position reaches the prompt at all, and the three
  // `statNotes` keys section 10 now prints one line each from.
  //
  // `useRole` is checked for being a BOOLEAN, not for truthiness, so a world that
  // simply forgot it fails rather than reading as a decision nobody made - and the
  // mutation that proves it has to break the CONDITION, because a validator deleted
  // while the data stays valid can fire for nothing.
  for (const bad of [undefined, "true", 1, null]) {
    const broken = { ...good, castLore: { ...good.castLore } };
    if (bad === undefined) delete broken.castLore.useRole;
    else broken.castLore.useRole = bad;
    let msg = null;
    try { parseW(broken); } catch (e) { msg = e.message; }
    check(`parseWorld rejects castLore.useRole = ${JSON.stringify(bad)}`,
      msg !== null && msg.includes("useRole"), msg || "parsed without complaint");
  }
  // ...and accepts `false`, which is the answer for every world but this one. Guarded
  // because a truthiness check would reject it while passing every other test here.
  let falseRoleOk = false;
  try {
    falseRoleOk = parseW({ ...good, castLore: { ...good.castLore, useRole: false } })
      .castLore.useRole === false;
  } catch { falseRoleOk = false; }
  check("parseWorld accepts castLore.useRole = false",
    falseRoleOk, "three of the four worlds have no cast position at all");
  for (const k of ["selfId", "secrecy", "mood"]) {
    for (const [bad, why] of [[undefined, "missing"], ["", "empty"]]) {
      const broken = { ...good, statNotes: { ...good.statNotes } };
      if (bad === undefined) delete broken.statNotes[k]; else broken.statNotes[k] = bad;
      let msg = null;
      try { parseW(broken); } catch (e) { msg = e.message; }
      check(`parseWorld rejects statNotes.${k} ${why}`,
        msg !== null && msg.includes(k), msg || "parsed without complaint");
    }
  }

  for (const tok of ["unnie", "ya", "nim", "ssi", "sep"]) {
    const brokenReg = JSON.parse(JSON.stringify(registers));
    delete brokenReg.korea.tokens[tok];
    let msg = null;
    try { parseW(good, brokenReg); } catch (e) { msg = e.message; }
    check(`parseWorld rejects a token table missing "${tok}"`,
      msg !== null && msg.includes(tok), msg || "parsed without complaint");
  }
  for (const id of loader.MODE_IDS) {
    const brokenModes = JSON.parse(JSON.stringify(good));
    delete brokenModes.modes[id];
    let msg = null;
    try { parseW(brokenModes); } catch (e) { msg = e.message; }
    check(`parseWorld rejects a world missing story mode "${id}"`,
      msg !== null && msg.includes(id), msg || "parsed without complaint");
  }
  // A world pointing at a register nobody ships must fail loudly. The alternative
  // is a prompt with no address protocol in it at all, which throws no error and
  // reads as the model simply choosing not to use honorifics.
  let noReg = null;
  try { parseW({ ...good, country: { ...good.country, register: "tokyo" } }); }
  catch (e) { noReg = e.message; }
  check("parseWorld rejects a world naming a register that does not exist",
    noReg !== null && noReg.includes("tokyo"), noReg || "parsed without complaint");
  let noField = null;
  try { parseW({ ...good, country: { id: "korea", name: "x" } }); }
  catch (e) { noField = e.message; }
  check("parseWorld rejects a country that names no register",
    noField !== null && noField.includes("country.register"),
    noField || "parsed without complaint");
  // ...and it resolves the table ONTO the world, because buildSystemPrompt reads
  // `world.addressForms` and must not learn that the data moved.
  check("parseWorld resolves the register onto world.addressForms",
    parseW(good).addressForms.tokens.unnie === registers.korea.tokens.unnie
      && parseW(good).addressForms.guide === registers.korea.guide,
    "the resolved table is not the one the register ships");
  // `ya: null` is meaningful data, not a missing field — the zh table ships it.
  let nullYa = null;
  try { parseW(good); } catch (e) { nullYa = e.message; }
  check("parseWorld accepts a null ya, which is a real value and not an absence",
    nullYa === null, nullYa || "");

  // --- the world index ----------------------------------------------------
  //
  // The index is the picker's lazy-load boundary. Both halves are checked, and
  // the second is the one that keeps going wrong elsewhere in this repo: a list
  // a human has to remember to update. It is DERIVED from the folders instead.
  const worldIndex = JSON.parse(readFileSync(
    join(ROOT, "public", "worlds", "index.json"), "utf8"));
  check("the world index is a non-empty array",
    Array.isArray(worldIndex) && worldIndex.length > 0, JSON.stringify(worldIndex).slice(0, 60));
  for (const row of worldIndex) {
    check(`world index row "${row.id}" has a folder carrying all three languages`,
      ["zh", "en", "ko"].every((l) =>
        existsSync(join(ROOT, "public", "worlds", row.id, `${l}.json`))),
      "the picker would offer a world that 404s on tap");
    check(`world index row "${row.id}" names and describes itself in all three languages`,
      ["zh", "en", "ko"].every((l) => row.name?.[l] && row.blurb?.[l]),
      JSON.stringify(row.name));
  }
  check("every world folder is listed in the index",
    readdirSync(join(ROOT, "public", "worlds"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .every((d) => worldIndex.some((r) => r.id === d.name)),
    "a world with files and no index row is a world no player can choose");
  // Every register a world names must exist in all three language files, or a
  // Korean player gets an address protocol an English player does not.
  const registerIds = new Set(["zh", "en", "ko"].map((l) => worlds[l].country.register));
  check("every language resolves the same register for a given world",
    registerIds.size === 1, [...registerIds].join(", "));
  for (const l of ["zh", "en", "ko"]) {
    const table = JSON.parse(readFileSync(
      join(ROOT, "public", "worlds", "_registers", `${l}.json`), "utf8"));
    check(`[${l}] the register file carries "${worlds[l].country.register}"`,
      Boolean(table[worlds[l].country.register]), Object.keys(table).join(", "));
  }

  // --- roster resolver (v1.4.0 step 3) ------------------------------------
  //
  // The classic path is not a separate code path from the roster builder; it
  // builds a roster implicitly. That claim is only worth anything if resolving
  // one reproduces today's cast exactly, so this proves it against the real
  // group config rather than against a fixture.
  const rvCfg = await fromDisk(() => loader.loadGroupConfig("red_velvet", "en"));
  const allIds = rvCfg.members.map((m) => m.id);
  const classic = loader.buildClassicRoster("red_velvet", "irene", ["yeri"], allIds);
  const resolved = await fromDisk(() => loader.resolveRoster(classic, "en", worldFor.en));

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
  const xr = await fromDisk(() => loader.resolveRoster(cross, "en", worldFor.en));
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

  // --- section 4's PREAMBLE, not just its lore ------------------------------
  // The preamble said "reference group history, inside jokes, shared memories, and
  // past events" for every roster. Sound for a real group, whose lore carries a
  // dated History block — but a composed cast has no history at all, so the same
  // sentence is an instruction to invent one, and the nearest history the model
  // knows belongs to the real groups the members came from. That is the leak the
  // composed lore exists to close, asked for in the preamble.
  check("a composed roster is marked as such, for section 4's preamble",
    xr.groupConfig.loreComposed === true, String(xr.groupConfig.loreComposed));
  const xPrompt = buildSystemPrompt(
    form({ mainMember: "nayeon", subMembers: ["irene"] }), xr.members, xr.mainId, xr.subIds,
    xr.groupConfig, "", "qwen", "en", worldFor.en);
  check("...and its preamble does not ask for a history it does not have",
    !/reference group history/.test(xPrompt)
      && /It has NO published history/.test(xPrompt),
    xPrompt.split("\n").find((l) => l.includes("published history")) || "(preamble not found)");
  check("...and it forbids borrowing a real group's past outright",
    /Never borrow a real group's history, discography or agency/.test(xPrompt),
    "inventing a past is fine; importing BLACKPINK's is the bug");

  // The classic door must keep the original preamble verbatim — that is what the
  // goldens pin, and it is the whole basis of "one engine, two doors".
  const twiceForWhole = await fromDisk(() => loader.loadGroupConfig("twice", "en"));
  const wholeRoster = loader.buildClassicRoster(
    "twice", "nayeon", ["jihyo"], twiceForWhole.members.map((m) => m.id));
  const wholeGroup = await fromDisk(() => loader.resolveRoster(wholeRoster, "en", worldFor.en));
  check("a whole single group is NOT marked composed",
    wholeGroup.groupConfig.loreComposed === false, String(wholeGroup.groupConfig.loreComposed));
  const wholePrompt = buildSystemPrompt(
    form({ mainMember: "nayeon", subMembers: ["jihyo"] }), wholeGroup.members, wholeGroup.mainId,
    wholeGroup.subIds, wholeGroup.groupConfig, "", "qwen", "en", worldFor.en);
  check("...and keeps the established-world preamble, word for word",
    wholePrompt.includes("This is the established world-setting. Draw from it freely — reference group history, inside jokes, shared memories, and past events to enrich scene texture and continuity.")
      && !/published history/.test(wholePrompt),
    "the classic door's section 4 is what the goldens pin");

  // The all-custom branch is checked further down, where its fixture already
  // lives — it synthesises the config rather than spreading a real one, so
  // loreComposed is set in a second place and needs its own assertion there.

  // A player-supplied name replaces the default everywhere, agency included.
  const named = await fromDisk(() => loader.resolveRoster({ ...cross, name: "Aurora" }, "en", worldFor.en));
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
  }, "en", worldFor.en));
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
    sLore.split("\n")[3]);
  // The fandom is its own template ELEMENT now, not a clause appended in code, so a
  // world with no fanbase simply does not author the line.
  check("...and carries the fandom the group config declares",
    /^Fandom: ReVeluv \(Luvies\)\.$/m.test(sLore),
    sLore.split("\n").find((l) => l.startsWith("Fandom")) || "no Fandom line at all");

  // --- section 4's framing is the WORLD's, v1.4.1 step 4 -------------------
  //
  // It was four string literals in rosterResolver.js saying `N-member group under X
  // Entertainment` and `no other idol exists` - true of this world and false of a
  // lecture hall. The requirement is that the world decides, so the guard changes
  // the world and asserts the lore FOLLOWS, rather than matching today's sentences.
  const altWorld = parseW({ ...good, castLore: { ...good.castLore,
    composed: ["[{name} COHORT]", "{name} has {n} people enrolled at {org}."],
    orgSuffix: "College" } });
  const altLore = (await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol", name: "Hanseo",
    entries: [
      { src: "library", groupId: "twice", memberId: "nayeon", slot: "main" },
      { src: "library", groupId: "red_velvet", memberId: "irene", slot: "sub" },
    ] }, "zh", altWorld))).groupConfig.groupLore;
  check("a cross-source cast's lore is rendered from the WORLD's template",
    altLore.startsWith("[Hanseo COHORT]")
      && altLore.includes("Hanseo has 2 people enrolled at Hanseo College."),
    altLore.split("\n").slice(0, 2).join(" / "));
  check("...so the idol wording is not reachable from a world that does not say it",
    !/-member group under/.test(altLore) && !/No other idol exists/.test(altLore)
      && !/Entertainment/.test(altLore),
    altLore.split("\n").filter((l) => /idol|Entertainment|-member/.test(l)).join(" | "));
  // ...and the sentences are gone from src/ rather than merely unused there. A copy
  // left behind is the one a later edit reaches for.
  // Comments stripped FIRST. This guard failed on the comment explaining the very
  // deletion it checks for - the fourth time in this repo a source guard has read
  // its own documentation as code. Strip, then scan; a prose mention of a deleted
  // string is the record of why it went, not a copy of it.
  const rosterCode = rosterSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check("rosterResolver carries no copy of the sentences the world now owns",
    !/-member group under/.test(rosterCode) && !/No other idol exists/.test(rosterCode)
      && !/This story follows part of/.test(rosterCode),
    "a second copy of a template is what the world file was supposed to replace");

  // An unknown placeholder THROWS. A template is data, so a typo in a world file
  // would otherwise reach the model as a literal {labl} in section 4 - the
  // unresolved-particle class of defect, which renders as plausible text nobody reads.
  let typoMsg = null;
  try { loader.renderCastLore(["{labl} Background"], { label: "Red Velvet" }); }
  catch (e) { typoMsg = e.message; }
  check("an unknown placeholder in a cast-lore template throws",
    typoMsg !== null && typoMsg.includes("labl"), typoMsg || "rendered a literal {labl}");
  check("...and a line whose value is absent is dropped, not rendered with a gap",
    JSON.stringify(loader.renderCastLore(["A {x}", "Fandom: {f}.", "B {x}"],
      { x: "1", f: "" })) === JSON.stringify(["A 1", "B 1"]),
    JSON.stringify(loader.renderCastLore(["A {x}", "Fandom: {f}.", "B {x}"], { x: "1", f: "" })));

  // `useGroupLore: false` sends EVERY cast down the composed path, so a real group's
  // own idol history cannot reach a lecture hall. A whole single group then takes the
  // SUBSET template: it really is that group, and its real name is what she picked.
  const noLoreWorld = parseW({ ...good, useGroupLore: false });
  const wholeRv = { worldId: "kpop_idol", entries:
    ["irene", "seulgi", "wendy", "joy", "yeri"].map((id, i) => ({
      src: "library", groupId: "red_velvet", memberId: id,
      slot: i === 0 ? "main" : i === 1 ? "sub" : "npc" })) };
  const rvKept = await fromDisk(() => loader.resolveRoster(wholeRv, "zh", worlds.zh));
  const dropped = await fromDisk(() => loader.resolveRoster(wholeRv, "zh", noLoreWorld));
  check("a whole single group keeps its own lore when the world says it may",
    rvKept.groupConfig.loreComposed === false, "this is what keeps the goldens fixed");
  check("...and loses it entirely when the world says useGroupLore: false",
    dropped.groupConfig.loreComposed === true
      && dropped.groupConfig.groupLore !== rvKept.groupConfig.groupLore,
    "a Red Velvet cast in an office world was inheriting SM and a discography");
  check("...taking the subset template, which still calls her cast by its real name",
    dropped.groupConfig.groupLore.startsWith("[Red Velvet Background]"),
    dropped.groupConfig.groupLore.split("\n")[0]);

  // --- the idol role is filtered BY THE WORLD, v1.4.1 step 4 ---------------
  //
  // Yuhan's call: keep `role` in the library, never let it reach the model in a world
  // that has no such position. `Main Vocal` / `Maknae` is a position in an idol GROUP,
  // so a campus prompt would describe a student as a main vocal - the
  // [BLACKPINK Background] shape, a specific-sounding claim two sections from the rule
  // it contradicts.
  //
  // Asserted on the member's OWN role string rather than on a sample word, because
  // several role words (`leader`, `visual`) occur in ordinary prompt prose.
  const roleCast = { worldId: "kpop_idol", name: "Hanseo", entries: [
    { src: "library", groupId: "red_velvet", memberId: "irene", slot: "main" },
    { src: "library", groupId: "twice", memberId: "nayeon", slot: "sub" },
  ] };
  // Built in a try, because a validator tightened to truthiness would otherwise
  // THROW out of the suite here rather than failing by name - and a crash and a
  // failure are the same line of output to whoever reads it. On failure this falls
  // back to the real world, whose useRole is true, so the checks below fail by
  // finding the role rather than by vanishing.
  let noRoleWorld = null;
  try { noRoleWorld = parseW({ ...good, castLore: { ...good.castLore, useRole: false } }); }
  catch { noRoleWorld = null; }
  check("a world declaring castLore.useRole: false can be parsed at all",
    noRoleWorld !== null, "three of the four worlds have no cast position");
  const withRole = await fromDisk(() => loader.resolveRoster(roleCast, "zh", worlds.zh));
  const sansRole = await fromDisk(() =>
    loader.resolveRoster(roleCast, "zh", noRoleWorld || worlds.zh));
  const roleStrings = withRole.members.map((m) => m.role).filter(Boolean);
  check("a cast position reaches the prompt in a world that declares one",
    roleStrings.length === 2
      && roleStrings.every((r) => withRole.groupConfig.groupLore.includes(r)),
    JSON.stringify(roleStrings));
  check("...and reaches it NOWHERE in a world whose castLore.useRole is false",
    roleStrings.every((r) => !sansRole.groupConfig.groupLore.includes(r)),
    roleStrings.filter((r) => sansRole.groupConfig.groupLore.includes(r)).join(" | "));
  check("...while the world-neutral facts on the same line survive it",
    withRole.members.every((m) => !m.mbti || sansRole.groupConfig.groupLore.includes(m.mbti)),
    "mbti and animal_plastic are not idol positions and are not filtered");
  // The trailing-space class, one separator over: the goldens cannot catch it here,
  // because every one of the 175 library members declares a role.
  check("...leaving no dangling separator where the position would have been",
    !/ - ,/.test(sansRole.groupConfig.groupLore)
      && !/,,/.test(sansRole.groupConfig.groupLore)
      && !/[ ,]$/m.test(sansRole.groupConfig.groupLore),
    sansRole.groupConfig.groupLore.split("\n").filter((l) => / - ,|,,|[ ,]$/.test(l)).join(" | "));
  // ...and the field is still THERE. Stripping it at the loader would have taken an
  // idol position out of the idol world too, which is the half of Yuhan's
  // instruction a filter satisfies and a deletion does not.
  // §22.2: THE FILTERED SLOT IS FILLED, by `world_position` - what she does in THIS
  // world. Filtering the idol position left a non-idol world with nothing at all
  // saying what she does, and that is the most world-specific fact there is.
  //
  // They are ALTERNATIVES IN ONE EXPRESSION, so both directions are asserted on the
  // same cast: the idol world must render `role` and never the position, the non-idol
  // world the reverse. A cross-group cast is used because a whole single group in an
  // idol world takes its group lore verbatim and never reaches memberLine at all -
  // so a check written on the classic cast would pass without exercising anything.
  const POS = "SENTINEL-WORLD-POSITION";
  const posCast = { ...roleCast, entries: roleCast.entries.map((e) => ({ ...e, override: { world_position: POS } })) };
  const posIdol = await fromDisk(() => loader.resolveRoster(posCast, "zh", worlds.zh));
  const posSans = await fromDisk(() =>
    loader.resolveRoster(posCast, "zh", noRoleWorld || worlds.zh));
  check("a world-scoped position fills the slot the idol position was filtered out of",
    posSans.groupConfig.groupLore.includes(POS),
    "a non-idol world had nothing at all saying what she does");
  check("...and an idol world renders her idol position instead, never both",
    !posIdol.groupConfig.groupLore.includes(POS)
      && roleStrings.every((r) => posIdol.groupConfig.groupLore.includes(r)),
    "two answers to *what does she do* is the failure this repo records five of");
  check("`role` still reaches the app from the group library",
    withRole.members.every((m) => typeof m.role === "string" && m.role.length > 0),
    "the cast picker and the member editor read it; only the PROMPT is filtered");

  // §22.2 commit 4b: A RESTAGING IS AN OVERLAY STAMPED WITH ITS WORLD.
  //
  // Read off the RESOLVED MEMBER rather than off the builder or the stored roster:
  // the whole promise is about what the prompt is handed, and a stored object can
  // be perfectly shaped and never applied. The stale case uses a stamp naming a
  // world this cast is not being resolved in, which is the state a player produces
  // by changing the world after generating.
  const RESTAGED = "SENTINEL-RESTAGED-IMAGE";
  const stampedCast = (worldStamp) => ({ ...roleCast, entries: roleCast.entries.map((e) => ({
    ...e,
    override: { world_detail: { world: worldStamp, world_position: POS, public_image: RESTAGED } },
  })) });
  const freshRes = await fromDisk(() =>
    loader.resolveRoster(stampedCast(worlds.zh.id), "zh", worlds.zh));
  const staleRes = await fromDisk(() =>
    loader.resolveRoster(stampedCast("some-other-world"), "zh", worlds.zh));
  const libImages = withRole.members.map((m) => m.public_image);
  check("a restaging is applied in the world it was generated for",
    freshRes.members.every((m) => m.public_image === RESTAGED && m.world_position === POS),
    JSON.stringify(freshRes.members.map((m) => m.public_image)));
  // The proposal was a field per line plus a stamp beside them, and this is the
  // check it could not have passed: writing public_image in place destroys her own
  // sentence, and a CUSTOM member has no library record to restore it from.
  check("...and a stamp naming another world leaves her own lines exactly as they were",
    staleRes.members.every((m, i) => m.public_image === libImages[i] && !m.world_position),
    JSON.stringify(staleRes.members.map((m) => m.public_image)));
  // The overlay itself is not a prompt field. Section 5 and memberLine read named
  // fields, so it would render nothing either way - deleting it says so on purpose.
  check("...and the stamped object itself reaches no member the prompt is built from",
    freshRes.members.every((m) => !("world_detail" in m))
      && !freshRes.groupConfig.groupLore.includes("world_detail"),
    JSON.stringify(Object.keys(freshRes.members[0])));
  // The same rule isUsableDetail states and withCastDetail stores by. A detail with
  // prose and no position would count as restaged while rendering nothing at all in
  // the slot useRole empties - worse than the idol prose the interim rule covers.
  const noPos = await fromDisk(() => loader.resolveRoster({ ...roleCast, entries: roleCast.entries.map((e) => ({
    ...e, override: { world_detail: { world: worlds.zh.id, public_image: RESTAGED } } })) }, "zh", worlds.zh));
  check("...and a restaging with no world position is not applied at all",
    noPos.members.every((m, i) => m.public_image === libImages[i]),
    "world_position is the one marker, on every path that writes one");
  // Per-field lossy by design: parseWorldDetail keeps whatever arrived, so a blank
  // overriding a sentence is the one direction that loses text.
  const blankOne = await fromDisk(() => loader.resolveRoster({ ...roleCast, entries: roleCast.entries.map((e) => ({
    ...e, override: { world_detail: { world: worlds.zh.id, world_position: POS, public_image: "   " } } })) }, "zh", worlds.zh));
  check("...and a field the restaging left blank keeps her own line",
    blankOne.members.every((m, i) => m.public_image === libImages[i] && m.world_position === POS),
    JSON.stringify(blankOne.members.map((m) => m.public_image)));
  // The position the overlay carries has to reach memberLine, or the slot useRole
  // empties is filled in the data and empty in the prompt.
  const overlaidLore = await fromDisk(() =>
    loader.resolveRoster(stampedCast(worlds.zh.id), "zh", noRoleWorld || worlds.zh));
  check("...and an applied restaging fills the slot in the prompt, not only on the member",
    overlaidLore.groupConfig.groupLore.includes(POS),
    "a stamped position nothing renders is a field with no reader");

  // The world is REQUIRED, the same rule buildSystemPrompt follows. A default would
  // be a second copy of every string in public/worlds/, and a missing-wiring bug
  // would render a lecture hall as a K-pop agency instead of failing.
  let noWorldMsg = null;
  try { await loader.resolveRoster(roleCast, "zh"); } catch (e) { noWorldMsg = e.message; }
  check("resolveRoster refuses to run without a world",
    noWorldMsg !== null && /world is required/.test(noWorldMsg),
    noWorldMsg || "composed section 4 out of nothing");

  // An all-custom cast has no group config at all. buildSystemPrompt reads
  // groupConfig.groupLore unconditionally, so this threw a TypeError before the
  // first round — and it is reachable, because a custom member can be the main.
  const allCustom = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [{ src: "custom", memberId: "c_9", slot: "main", lang: "en",
      profile: { name: "Li Fei", birthday: "1999-01-01", private_personality: "quiet" } }],
  }, "en", worldFor.en));
  check("an all-custom cast resolves instead of throwing",
    allCustom.groupConfig !== null && typeof allCustom.groupConfig.groupLore === "string"
      && allCustom.groupConfig.groupLore.includes("Li Fei"),
    JSON.stringify(allCustom.groupConfig?.group));
  // This branch synthesises the config, so `loreComposed` is set in a second
  // place — and a cast with no real group behind it is the one where asking for
  // "group history, inside jokes, past events" is most obviously an invitation to
  // borrow somebody else's.
  check("...and is marked composed, so section 4 asks for no history it lacks",
    allCustom.groupConfig.loreComposed === true
      && /It has NO published history/.test(buildSystemPrompt(
        form({ mainMember: "c_9", subMembers: [] }), allCustom.members, allCustom.mainId,
        allCustom.subIds, allCustom.groupConfig, "", "qwen", "en", worldFor.en)),
    String(allCustom.groupConfig.loreComposed));

  // An override edits the copy, never the library.
  const overridden = await fromDisk(() => loader.resolveRoster({
    worldId: "kpop_idol",
    entries: [{ src: "library", groupId: "red_velvet", memberId: "irene",
      slot: "main", override: { public_image: "REWRITTEN" } }],
  }, "en", worldFor.en));
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
  }, "en", worldFor.en));
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
  }, "en", worldFor.en));
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
  const fromSave = await fromDisk(() => loader.resolveRoster(migrated.roster, "en", worldFor.en));
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
        'export * from "./src/utils.js";',
        'export * from "./src/config/stageConfig.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile: storeBundle, logLevel: "silent",
  });
  const store = await import("file://" + storeBundle.replace(/\\/g, "/") + "?t=" + Date.now());

  // --- save slots refuse, they do not evict (reported bug) -----------------
  // `[newSave, ...saves].slice(0, 10)` dropped the OLDEST slot on the eleventh
  // save. Because a slot id is Date.now(), no save ever replaced another, so a
  // player with ten saves lost a whole run every time she saved — silently, with
  // the list simply showing a different first entry. Pure and exported so the
  // rule is tested rather than reachable only by filling ten slots by hand.
  const slot = (id) => ({ id, name: `save ${id}`, messages: [] });
  const tenFull = Array.from({ length: store.SAVE_SLOT_MAX }, (_, i) => slot(1000 - i));
  check("the save-slot cap is ten", store.SAVE_SLOT_MAX === 10, String(store.SAVE_SLOT_MAX));
  const refused = store.addSaveSlot(tenFull, slot(2000));
  check("the eleventh save is REFUSED, not absorbed",
    refused.ok === false && refused.reason === "slots_full", JSON.stringify(refused.reason));
  // THE regression. Eviction and refusal both return a ten-item list, so length
  // proves nothing — what matters is that every id that was there still is.
  check("...and not one existing save is dropped to make room",
    JSON.stringify(refused.saves.map((s) => s.id)) === JSON.stringify(tenFull.map((s) => s.id)),
    "the oldest run used to disappear here");
  check("...and the list handed back is the very same one, so no phantom slot renders",
    refused.saves === tenFull,
    "SaveOverlay renders this array; a copy with the new save in it is the old bug");
  const added = store.addSaveSlot(tenFull.slice(0, 9), slot(2000));
  check("under the cap a save is added, newest first",
    added.ok && added.saves.length === 10 && added.saves[0].id === 2000,
    JSON.stringify(added.saves.map((s) => s.id).slice(0, 3)));
  // Overwrite frees the slot it takes, so it stays legal at the cap. Nothing does
  // this today; it is here so adding it later cannot bring the eviction back.
  const over = store.addSaveSlot(tenFull, { ...slot(1000), name: "overwritten" });
  check("...and overwriting an existing slot is still allowed when full",
    over.ok && over.saves.length === 10 && over.saves[0].name === "overwritten",
    JSON.stringify(over.reason));
  check("...while a malformed save is refused rather than stored",
    store.addSaveSlot(tenFull.slice(0, 2), null).ok === false
      && store.addSaveSlot(tenFull.slice(0, 2), { name: "no id" }).ok === false,
    "an id is what delete and overwrite match on");
  // A list written before the cap existed could hold more than ten. Trimming it
  // here would be the very loss being fixed, so the check is on the IDS: a
  // truncation keeps the same length once the new save is prepended, which is how
  // a length-only assertion passes against it.
  // 900, not 999: tenFull already contains 999, and a duplicate id let a
  // truncating mutation drop one copy while the check still found the other.
  const overLong = [...tenFull, slot(900)];
  const kept = store.addSaveSlot(overLong, slot(2000));
  check("...and a list longer than the cap is never truncated",
    overLong.every((s) => kept.saves.some((k) => k.id === s.id)),
    `lost ${overLong.filter((s) => !kept.saves.some((k) => k.id === s.id)).map((s) => s.id).join(",")}`);

  // Comments stripped first. Without that this fails on the comment explaining
  // that the slice was REMOVED — the same trap the member-editor's type="number"
  // guard and the getNpcMembers guard both document. Third time in this repo, so
  // treat it as the default when a guard asserts the ABSENCE of something.
  const saveSrc = readFileSync(join(ROOT, "src/platforms/SaveOverlay.jsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("SaveOverlay no longer slices the list to the cap",
    !/slice\(0,\s*10\)/.test(saveSrc) && /addSaveSlot\(saves, newSave\)/.test(saveSrc),
    "the slice WAS the bug");
  check("...and the save button is disabled at capacity",
    /disabled=\{atCapacity\}/.test(saveSrc) && /saves\.length >= SAVE_SLOT_MAX/.test(saveSrc),
    "only when slots are free is saving active");
  check("...with a persistent notice, not a toast",
    /t\.save\.slotsFull/.test(saveSrc) && /t\.save\.slotCount/.test(saveSrc),
    "the player has to be told what to delete or export");


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

  // ── her glyph, which with no photo is the only face she has ──────────────
  // Auto-assignment is the DEFAULT, not the rule: it was unchangeable, so a
  // custom member was whichever palette index she landed on - a violin - in the
  // top bar, the stats box and every tab strip for the life of the save.
  check("a chosen glyph beats the palette",
    store.withDefaults({ id: "c_1", emoji: "\u{1F430}" }, 0).emoji === "\u{1F430}",
    "the palette is what she gets for not choosing, not what she is held to");
  check("...and an unchosen one still falls back to it",
    store.EMOJI_PALETTE.includes(store.withDefaults({ id: "c_1" }, 0).emoji));
  // ONE GRAPHEME, not one code point. A flag is two code points, a skin tone is
  // two and a ZWJ family is seven, so slicing by code point stores half an emoji
  // and renders a stray modifier beside it.
  const FAMILY = "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F469}";
  check("a multi-code-point glyph survives whole",
    store.normalizeEmoji(FAMILY) === FAMILY && store.normalizeEmoji("\u{1F1F0}\u{1F1F7}") === "\u{1F1F0}\u{1F1F7}",
    JSON.stringify(store.normalizeEmoji(FAMILY)));
  check("...two glyphs are not both stored",
    [...store.normalizeEmoji("\u{1F430}\u{1F43B}")].length <= 2,
    JSON.stringify(store.normalizeEmoji("\u{1F430}\u{1F43B}")));
  // The LAST wins, and that is a UI rule: the box is never empty once she has a
  // glyph, so typing into it means `use this instead`. Keeping the first would
  // make the field ignore every key pressed after the one already in it.
  check("...and it is the newest one that wins, so the field can be retyped",
    store.normalizeEmoji("\u{1F430}\u{1F43B}") === "\u{1F43B}",
    JSON.stringify(store.normalizeEmoji("\u{1F430}\u{1F43B}")));
  check("...an empty field clears rather than storing whitespace",
    store.normalizeEmoji("   ") === "" && store.normalizeEmoji(undefined) === "",
    "a blank emoji falls back to the palette through withDefaults");

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
  // Step 8 removed `pruneOrphans`, which kept only the ids its caller listed and
  // was called with the CUSTOM PALETTE. Harmless while only an authored member
  // could have a photo; data loss once a library member can, because every
  // library id is absent from that list. The requirement is per-id removal, so
  // that is what is asserted — including the id that used to be collateral.
  check("deleting one member's photo leaves a library member's alone",
    Object.keys(store.removePhoto({ ...photos, irene: img(10) }, "m_0")).includes("irene"),
    "a photo may only be removed for the member it belongs to");
  check("the palette-wide photo prune is gone",
    store.pruneOrphans === undefined,
    "pruneOrphans(photos, paletteIds) deletes every library member's photo");
  check("photoBytes counts the stored characters",
    store.photoBytes({ a: "12345", b: "123" }) === 8);

  // --- step 8: the wallpaper store -----------------------------------------
  // The caps are an ARGUMENT rather than a module constant, so both stores share
  // one implementation of the four refusal rules. A second copy is the
  // extractStoryText failure: two copies drift, and the guard gets written
  // against whichever one is still correct.
  check("a wallpaper is refused at its own count cap, not the photo one",
    store.putPhoto(Object.fromEntries(
      Array.from({ length: store.WALL_MAX_COUNT }, (_, i) => [`w_${i}`, img(10)])),
      "extra", img(10), store.WALL_LIMITS).reason === "full",
    `WALL_MAX_COUNT=${store.WALL_MAX_COUNT} must bind before PHOTO_MAX_COUNT=${store.PHOTO_MAX_COUNT}`);
  check("...and that same map still accepts a PHOTO, because the caps differ",
    store.putPhoto(Object.fromEntries(
      Array.from({ length: store.WALL_MAX_COUNT }, (_, i) => [`w_${i}`, img(10)])),
      "extra", img(10), store.PHOTO_LIMITS).ok === true,
    "one shared cap would silently make the smaller store the limit for both");
  // Both directions, because one is not enough: pinning maxChars to the PHOTO
  // limit still refuses an image over the WALL limit, so the refusal half alone
  // passes against a wallpaper cap that is being ignored. The acceptance half is
  // what fails — and a wallpaper between the two caps is the ordinary case.
  check("a wallpaper may be larger than a photo",
    store.WALL_MAX_CHARS > store.PHOTO_MAX_CHARS
      && store.putPhoto({}, "w", img(store.PHOTO_MAX_CHARS + 1), store.WALL_LIMITS).ok === true,
    "a portrait wallpaper is ~3x the pixels of a square avatar and must not be held to its cap");
  check("...but not unbounded",
    store.putPhoto({}, "w", img(store.WALL_MAX_CHARS + 1), store.WALL_LIMITS).reason === "too_large",
    "the cap is a backstop for an image that resists compression");
  check("...and a photo is still held to the photo cap",
    store.putPhoto({}, "p", img(store.PHOTO_MAX_CHARS + 1), store.PHOTO_LIMITS).reason === "too_large",
    "one shared cap would raise the photo limit to the wallpaper's");
  // Two stores means two keys. A copy-paste here makes them ONE store, which
  // reads as photos mysteriously becoming wallpapers.
  check("the two image stores are under different keys",
    store.STORAGE_KEYS.CAST_WALLS && store.STORAGE_KEYS.CAST_WALLS !== store.STORAGE_KEYS.CAST_PHOTOS,
    `${store.STORAGE_KEYS.CAST_PHOTOS} vs ${store.STORAGE_KEYS.CAST_WALLS}`);
  const storeSrc = readFileSync(join(ROOT, "src/utils/imageStore.js"), "utf8");
  check("one canvas routine, so the WebP fallback has one home",
    (storeSrc.match(/createElement\("canvas"\)/g) || []).length === 1,
    "two is two places for a browser that cannot encode WebP to be forgotten");
  check("...and the wallpaper crop is portrait, to fill the overlay panel",
    store.WALL_H > store.WALL_W,
    `${store.WALL_W}x${store.WALL_H}`);

  // --- step 8, second pass: the player chooses the crop --------------------
  // `downscaleCover` picked the region itself — the largest centred rectangle
  // with the target ratio — which cut the head off a photo taken at arm's length
  // every time, with nothing on screen to say why. Reported from hand play as
  // "the ratio is not fixed", because that is what a crop you did not choose
  // looks like. The region is now the player's, and THE MATHS IS PURE so it can
  // be wrong here rather than only on a phone.
  //
  // A wide source against a square frame, so there is horizontal overflow to pan
  // through and none vertically. Every assertion below is written from what the
  // player should see, not from the formula.
  const WIDE = { iw: 800, ih: 400, fw: 200, fh: 200 };
  const TALL = { iw: 300, ih: 900, fw: 200, fh: 200 };
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const atRest = store.cropRect({ ...WIDE, zoom: 1, dx: 0, dy: 0 });
  check("confirming a crop untouched reproduces the old centred crop",
    atRest.sw === 400 && atRest.sh === 400 && atRest.sx === 200 && atRest.sy === 0,
    `${JSON.stringify(atRest)} — the cropper opens on the previous behaviour, so nothing regressed for a player who just taps through`);
  // BOTH ORIENTATIONS. Mutation-testing found that every assertion here used a
  // wide source against a square frame, where the vertical centring term is
  // exactly zero — so deleting it left the whole family green. A portrait source
  // is also the ordinary case for a photo of a person.
  const atRestTall = store.cropRect({ ...TALL, zoom: 1, dx: 0, dy: 0 });
  check("...on a portrait source too, which is what a photo of a person is",
    near(atRestTall.sw, 300) && near(atRestTall.sh, 300)
      && near(atRestTall.sx, 0) && near(atRestTall.sy, 300),
    `${JSON.stringify(atRestTall)} — expected the middle 300 rows of 900`);
  const zoomed = store.cropRect({ ...WIDE, zoom: 2, dx: 0, dy: 0 });
  check("zooming in keeps less of the source, centred on the same point",
    zoomed.sw === atRest.sw / 2 && zoomed.sh === atRest.sh / 2
      && zoomed.sx + zoomed.sw / 2 === atRest.sx + atRest.sw / 2,
    JSON.stringify(zoomed));
  // Direction matters and is easy to invert: dragging the image RIGHT reveals
  // what was off its left edge, so the kept region moves LEFT in source pixels.
  const panned = store.cropRect({ ...WIDE, zoom: 1, dx: 60, dy: 0 });
  check("dragging the image right keeps the part that was off to the left",
    panned.sx < atRest.sx && panned.sy === atRest.sy,
    `sx ${atRest.sx} -> ${panned.sx}`);
  check("...and dragging it down keeps the part that was above the frame",
    store.cropRect({ ...TALL, zoom: 1, dx: 0, dy: 60 }).sy < atRestTall.sy,
    `sy ${atRestTall.sy}`);
  check("...and a pan is refused on the axis with nothing to pan through",
    store.cropRect({ ...WIDE, zoom: 1, dx: 0, dy: 500 }).sy === atRest.sy
      && store.cropRect({ ...TALL, zoom: 1, dx: 500, dy: 0 }).sx === atRestTall.sx,
    "a square frame on a wide image has no vertical slack, so dragging down must not move the crop");
  // THE guard of this pair: a blank corner is a defect the player only sees once
  // the image is in the game. Absurd offsets at every zoom, both orientations.
  const escaped = [];
  for (const src of [WIDE, { iw: 300, ih: 900, fw: 200, fh: 200 }, { iw: 360, ih: 540, fw: 216, fh: 324 }]) {
    for (const zoom of [1, 1.37, 2, 4]) {
      for (const [dx, dy] of [[0, 0], [9e5, 9e5], [-9e5, -9e5], [9e5, -9e5]]) {
        const r = store.cropRect({ ...src, zoom, dx, dy });
        const ok = r.sx >= 0 && r.sy >= 0
          && r.sx + r.sw <= src.iw + 1e-6 && r.sy + r.sh <= src.ih + 1e-6
          && r.sw > 0 && r.sh > 0;
        if (!ok) escaped.push(`${src.iw}x${src.ih} z${zoom} (${dx},${dy}) -> ${JSON.stringify(r)}`);
      }
    }
  }
  check("the frame can never leave the image, at any zoom or offset",
    escaped.length === 0, escaped.slice(0, 2).join(" | "));
  // The preview is 244px and the output is 256 or 360 wide. If the region moved
  // with the preview's SIZE rather than its ratio, every crop would be off by
  // the difference and the frame would be lying about what it keeps.
  const small = store.cropRect({ iw: 800, ih: 400, fw: 100, fh: 100, zoom: 1.5 });
  const large = store.cropRect({ iw: 800, ih: 400, fw: 300, fh: 300, zoom: 1.5 });
  check("the kept region follows the frame's ratio, not the frame's size",
    Math.abs(small.sx - large.sx) < 1e-9 && Math.abs(small.sw - large.sw) < 1e-9,
    `${JSON.stringify(small)} vs ${JSON.stringify(large)} — the preview can be any size the screen allows`);
  check("the pan stops at the edge rather than being thrown away",
    // 800x400 covering a 200x200 frame displays at 400x200, so there are 200
    // pixels of horizontal slack and the centre may move by half of them.
    store.clampOffset(9e5, 0, 800, 400, 200, 200, 1).dx === 100
      && store.clampOffset(0, 9e5, 800, 400, 200, 200, 1).dy === 0,
    "a drag that snapped back to centre at the limit would read as the control being broken");

  // The wallpaper's ratio is the one it is SEEN at, and that is the panel's
  // scrolling content area — 360 wide by ~528 tall, once a 600px panel's 38px
  // title bar and 34px member strip come off. 9:16 shipped first and lost a sixth
  // of every upload to a crop nobody asked for.
  const PANEL_CONTENT = 360 / 528;
  const wallRatio = store.WALL_W / store.WALL_H;
  check("the wallpaper is stored at the ratio the chat panel shows it at",
    Math.abs(wallRatio - PANEL_CONTENT) < Math.abs(360 / 640 - PANEL_CONTENT),
    `${store.WALL_W}x${store.WALL_H} (${wallRatio.toFixed(3)}) vs the panel's ${PANEL_CONTENT.toFixed(3)}`);
  // Instagram is the one surface that cannot show the whole thing, and since the
  // second hand test it does not get to choose how much it takes. A fixed ratio
  // decided the post's height before the panel did — 4:5 is 450px of a 600px
  // panel that has already spent ~115px on its title bar, tab strip and post
  // header — so the caption and the like count sat below the fold on every post
  // and the player had to scroll to read the round's own output.
  const igSrc = readFileSync(join(ROOT, "src/platforms/InstagramOverlay.jsx"), "utf8");
  check("Instagram's post image is sized by the panel, not by a ratio of its own",
    !/aspectRatio/.test(igSrc) && /flex: "1 1 0", minHeight: \d+/.test(igSrc),
    "any fixed ratio decides the image's height before the panel's, which is what pushed the caption off");
  check("...inside a column that can give it the space that is left",
    /flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column"/.test(igSrc),
    "`flex: 1 1 0` on the image does nothing at all unless its parent is a flex column");
  // Written as "nothing below the image may shrink" rather than as a count of
  // pixels: the image is the only flexible box, so the caption is on screen iff
  // every one of its siblings is fixed. Four of them — header, actions, likes,
  // caption — and a fifth that shrinks is a caption that scrolls again.
  const igPost = igSrc.slice(igSrc.indexOf("{feed && feed.caption ?"), igSrc.indexOf("t.social.instagram.noPosts"));
  check("...and nothing below it can be squeezed off the fold instead",
    (igPost.match(/flexShrink: 0/g) || []).length >= 4,
    "the post header, the actions, the like count and the caption all have to hold their height");

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
  const badRemove = tolerates((bad) => Object.keys(store.removePhoto(bad, "a")).length === 0);
  check("removing from a corrupt photo map yields an empty map", badRemove === null, badRemove);

  // --- step 6 commit 3: the card generator ---------------------------------
  // The call is an ACCELERATOR, NEVER A GATE: every failure has to resolve to a
  // blank form so a dead provider, an exhausted free route or a missing key
  // cannot block character creation. That is the whole contract, and it is the
  // one thing a live test would exercise least often.
  const cgSrc = readFileSync(join(ROOT, "src/agent/cardGenerator.js"), "utf8");
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

  // --- §22.5 commit 4: restaging a member into the world she is cast in --------
  //
  // §22.1's defect is the library's prose, not its structured fields: 57 of 57 members
  // describe themselves through idol work in a world-agnostic field. The interim rule
  // tells the MODEL to read that prose for traits; this does it once at setup instead,
  // where it can be reviewed and costs nothing per round.
  const DETAIL = {
    world_position: "the family's in-house counsel",
    public_image: "line one\nline two",
    queer_texture: "  padded  ",
    nonsense: "not a field",
  };
  const parsedDetail = cg.parseWorldDetail(JSON.stringify(DETAIL));
  check("a world detail keeps only the fields it declares, one line each",
    parsedDetail.public_image === "line one line two"
      && parsedDetail.queer_texture === "padded"
      && !("nonsense" in parsedDetail),
    JSON.stringify(parsedDetail));
  check("...and is recovered from a fenced response the way a card is",
    cg.parseWorldDetail("```json\n" + JSON.stringify(DETAIL) + "\n```").world_position
      === DETAIL.world_position,
    "a model that fences its JSON must not cost the player the call");
  // ONE recovery, not two copies. `extractStoryText` is this repo's standing warning:
  // two copies drifted and the guard had been written against the one still correct.
  check("...through the SAME JSON recovery the card parser uses, not a second copy",
    (cgSrc.match(/parseJsonish\(/g) || []).length === 3
      && (cgSrc.match(/const fenced = /g) || []).length === 1,
    (cgSrc.match(/parseJsonish\(/g) || []).length + " references to one recovery");
  // The MARKER the prompt reads. A detail with prose and no position would count as
  // translated while rendering nothing in the slot `useRole` emptied - a member with
  // no statement of what she does at all, which is worse than the idol prose.
  check("a detail is usable only when it says what she does in this world",
    cg.isUsableDetail(parsedDetail) === true
      && cg.isUsableDetail({ public_image: "x", queer_texture: "y" }) === false
      && cg.isUsableDetail({ world_position: "   " }) === false,
    "world_position is the one field the narrowed interim rule keys on");
  // No new world field, which is why §4.5's `world.setting` is still not shipped: the
  // world already answers what a restaging needs, and reusing the fields the ROLE
  // CONTRACT and section 11 render is what stops the detail contradicting them.
  {
    const w = Object.values(allWorlds).map((b) => b.en).find((x) => x && x.castLore.useRole === false);
    const dp = w ? cg.buildWorldDetailPrompt({ name: "Yeri", public_image: "the maknae" }, w, "en") : "";
    check("the restaging prompt is built from fields the world already carries",
      Boolean(w) && dp.includes(w.castLife.theirs) && dp.includes(w.castLore.orgNoun)
        && dp.includes(w.scenario) && dp.includes(w.places[0].name),
      "a new prose field would be twelve world documents for something already there");
    check("...and hands her existing lines over as the source to restage",
      dp.includes("the maknae") && /KEEP WHO SHE IS/.test(dp),
      "a restaging with nothing to restage invents a stranger");
    check("...and forbids the idol facts the interim rule forbids at read time",
      /no stage/.test(dp) && /no comeback/.test(dp) && /maknae/.test(dp),
      "the two must forbid the same list or they are two rules about one thing");
  }
  // The sweep decision A costs the player a wait for, so: concurrent, per-member
  // fallback, and it SKIPS anyone already translated - which is what stops it
  // re-paying for the editor's work and overwriting a line the player corrected.
  {
    const swept = await cg.generateCastDetail({
      members: [{ id: "a", name: "A" }, { id: "b", name: "B", world_position: "already" }],
      world: { castLife: { theirs: "x" }, castLore: { orgNoun: "y" }, scenario: "z", places: [] },
      apiKey: "", modelId: "deepseek",
    });
    check("the cast sweep asks only for members who have not been restaged yet",
      swept.asked === 1,
      "re-asking overwrites a line the player reviewed and charges her for it");
    check("...and a failed member leaves the run startable rather than throwing",
      swept.failed === 1 && Object.keys(swept.detailById).length === 0,
      "an accelerator, never a gate - character creation cannot block on a provider");
  }

  check("the generator asks for no field that reaches no prompt",
    !cg.CARD_FIELDS.includes("mbti") && !cg.CARD_FIELDS.includes("role")
      && !cg.CARD_FIELDS.includes("emoji") && !cg.CARD_FIELDS.includes("tags")
      // animal_plastic left in v1.4.1 §22.2 for a DIFFERENT reason from those
      // four: it is rendered, and what it lost is the editor's box. A field the
      // model fills and the player cannot correct fails the next check below.
      && !cg.CARD_FIELDS.includes("animal_plastic")
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
  // The editor is where a glyph is chosen, and it must normalise on the way in:
  // an emoji keyboard can hand it two, and a paste can hand it a sentence.
  check("the editor writes the glyph through normalizeEmoji",
    /set\("emoji", normalizeEmoji\(e\.target\.value\)\)/.test(editorSrc),
    "the only unnormalised writer would be the one the player types into");
  check("...and offers the shared palette rather than a second copy of it",
    /EMOJI_PALETTE\.map\(/.test(editorSrc) && /EMOJI_PALETTE,/.test(editorSrc)
      && !/\["\u{1F3BB}"/u.test(editorSrc),
    "ten glyphs retyped in a component is the hand-maintained list this repo keeps losing");

  check("MemberEditor.jsx compiles and its imports resolve",
    editorCompiled === "ok", editorCompiled);

  // EVERY field the generator can fill must be editable, or the model writes
  // something the player has no way to correct.
  const stepArrays = [...editorSrc.matchAll(/^\s*\["([^\]]+)\],?$/gm)]
    .map((m) => m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")));
  const stepFields = stepArrays.flat();
  const uneditable = cg.CARD_FIELDS.filter((f) => !stepFields.includes(f));
  check("every field the card generator fills is editable in the editor",
    uneditable.length === 0, `not editable: ${uneditable.join(", ")}`);
  // TWO generations now, and the same invariant covers both: the restaging writes
  // five fields and the player must be able to correct every one of them. Derived
  // from WORLD_FIELDS, so a sixth field added to the restaging fails this until it
  // has a box.
  const unrestageable = loader.WORLD_FIELDS.filter((f) => !stepFields.includes(f));
  check("...and so is every field the restaging fills",
    unrestageable.length === 0, `not editable: ${unrestageable.join(", ")}`);
  // ONE BOX whose FIELD the world picks, mirroring memberLine's own expression.
  // Taking it away instead - which is what §22.3.2 reads as - would leave a custom
  // member in an idol world with no way to say what she does.
  check("the position box writes whichever field the prompt will read",
    /positionField = world\?\.castLore\?\.useRole \? "role" : "world_position"/.test(editorSrc)
      && /renderField\(positionField\)/.test(editorSrc),
    "role and world_position are alternatives in the editor exactly as in memberLine");
  // An edit goes where the text she is looking at came from. Asserted on the boxes,
  // because a renderField still reading `profile[f]` would silently write a base
  // field while displaying an overlaid one - the edit would vanish on save.
  check("a tab-2 box reads and writes the copy it is showing",
    /value=\{valueOf\(f\)\}/.test(editorSrc) && /onChange=\{\(e\) => setField\(f, e\.target\.value\)\}/.test(editorSrc)
      && !/value=\{profile\[f\] \|\| ""\}/.test(editorSrc),
    "a box that displays the overlay and writes the base loses the edit on save");
  // world_position has no home in the base profile - a base copy would apply in
  // every world - so typing one creates the overlay, stamped for this world.
  check("...and typing a position creates the stamped overlay rather than a loose field",
    /WORLD_FIELDS\.includes\(f\) && \(detailActive \|\| f === "world_position"\)/.test(editorSrc)
      && /keep = had && had\.world === worldId \? had : \{ world: worldId \}/.test(editorSrc),
    "a position stored outside the stamp leaks one world into every other");
  // Restaging a restaging compounds: the second pass describes a chaebol heiress as
  // if she had been one, and her own lines are gone from the input.
  check("a regeneration restages from her own lines, not from the previous restaging",
    /member: baseProfile\(\)/.test(editorSrc)
      && /delete o\[WORLD_DETAIL_KEY\]; return o; \}/.test(editorSrc),
    "the input has to be her own text or each retry drifts further from her");
  // A control that provably does nothing is worse than no control - the same
  // argument that hides tab 1's generate box for a library member.
  check("the restaging block is hidden in the world the library was written for",
    /restageable = Boolean\(world && !world\?\.castLore\?\.useRole\)/.test(editorSrc)
      && /\{restageable && \(/.test(editorSrc),
    "kpop_idol has nothing to restage");
  // Once per editor, from a ref. Without it every render of the tab fires a call,
  // which is the player's money and her rate limit.
  check("...and the tab generates once when it opens empty, not on every render",
    /if \(step !== 1 \|\| autoRan\.current\) return;/.test(editorSrc)
      && /autoRan\.current = true;\s*\r?\n\s*runDetail\(\);/.test(editorSrc),
    "a tab that opens empty beside a retry button has nothing to retry");
  // The overlay never overwrote anything, so dropping it IS the revert. Clearing
  // the boxes instead would delete her own text to undo a generation.
  check("...and reverting drops the overlay rather than clearing her own fields",
    /const dropDetail = \(\) => setProfile\(\(p\) => \{[\s\S]{0,120}delete o\[WORLD_DETAIL_KEY\]/.test(editorSrc),
    "a generation with no way back gets routed around");

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
  // Step 8: the year is picked from a bounded wheel, so the partial year the
  // text field could hold is not merely rejected downstream — it cannot be
  // produced. The requirement is the BOUND, not the control: a wheel handed the
  // player's range (1946-2008) would offer a 79-year-old idol.
  check("the editor picks a year from a wheel bounded by the idol range",
    /<YearWheel[\s\S]{0,400}min=\{BIRTH_YEAR_MIN\} max=\{BIRTH_YEAR_MAX\}/.test(editorCode),
    "an unbounded or wrongly bounded year reaches the address protocol");
  check("...and no free-text year input survives beside it",
    !/inputMode="numeric"/.test(editorCode),
    "two writers of one field is how they start disagreeing");
  check("the editor renders its own year draft rather than deriving it",
    /value=\{yearDraft/.test(editorSrc) && /const \[yearDraft, setYearDraft\]/.test(editorSrc),
    "deriving it from profile.birthday is the bug");
  // A wheel always DISPLAYS a year, so an unseeded new member shows one while
  // `birthday` is still empty — the field looks filled and Save stays disabled
  // with nothing to point at. The displayed value has to be the stored one.
  check("a new member's birthday is seeded to the year the wheel opens on",
    /seedYear = birthYearOf\([\s\S]{0,80}\|\| String\(DEFAULT_YEAR\)/.test(editorSrc)
    && /if \(!profile\.birthday\) set\("birthday", birthdayFromYear\(seedYear\)\)/.test(editorSrc),
    "a wheel showing 2000 over an empty birthday is a lie the player cannot act on");
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
    // DERIVED from the tabs the editor actually renders, not pinned to a count:
    // the three-step editor became two tabs in §22.2's commit 4b, and a hardcoded 3
    // is a guard that fails the change instead of the defect.
    check(`t.cast exists in ${lang} with one label per editor tab`,
      Array.isArray(pack.cast?.steps) && pack.cast.steps.length === stepArrays.length,
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
  //
  // Asserted as BEHAVIOUR against assignSlot, not as a regex over the component.
  // The rule used to be inline in a click handler and the guard matched
  // `out[member.id] =` in the source — which pinned where the code lived rather
  // than what it does, and went red the moment the logic was extracted to be
  // testable. What matters is that one member cannot occupy two slots.
  // GIVING THE CAST FACES IS A CARD, NOT A PILL. Every overlay, the top bar and
  // the chat wallpapers draw from the photo store, and its only entry point was
  // a 34px chip in a two-button row whose other button WIPES THE CAST. A
  // destructive control and the best thing on the screen should not be the same
  // shape. Reported from hand play, 2026-09-29.
  const imagesAt = builderSrc.indexOf("onClick={() => setShowImages(true)}");
  const imagesBtn = builderSrc.slice(imagesAt, builderSrc.indexOf("</button>", imagesAt));
  check("the cast-images entry is a full-width card, like the main-member slot",
    /width: "100%"/.test(imagesBtn) && /minHeight: 62/.test(imagesBtn),
    "the main-member slot is the size this screen uses for `the thing to tap`");
  // The two used to be siblings in one flex row, which is what made the bigger-
  // looking half the one that wipes the cast. The card closes before the row
  // holding Clear opens - asserted on what is BETWEEN them, since either button
  // read on its own looks fine.
  const betweenBtns = builderSrc.slice(imagesAt, builderSrc.indexOf("{c.clearCast}"));
  check("...and it no longer shares a row with the control that wipes the cast",
    /<\/button>[\s\S]*<div style=\{\{ display: "flex"[\s\S]*<button/.test(betweenBtns),
    "a mis-tap between adjacent targets was what made the previous builder unusable");
  // A number the player can see beats a cap that only speaks when it refuses -
  // which the save slots and the member palette each cost a bug to learn.
  // MAIN AND SUBS ONLY, on both halves of the fraction AND on the sheet the card
  // opens. An NPC's photo and wallpaper have no reader anywhere in the running
  // game: every surface that draws a face is built from `allTargetMembers`, which
  // is main plus subs, and an NPC posts no social and sends no Kakao to put a
  // face beside. An upload that can never be seen still spends one of the 30
  // photo or 8 wallpaper slots. Reported from hand play, 2026-09-29.
  check("...and it says how many of the members who CAN show a face have one",
    /facedIds = roster\.entries\.filter\(\(e\) => e\.slot !== "npc"\)/.test(builderSrc)
      && /const withPhoto = facedIds\.filter/.test(builderSrc)
      && /castCount\?\.\(withPhoto, facedIds\.length\)/.test(builderSrc),
    "an NPC has no surface that draws her, so counting her is counting nothing");
  check("...and the sheet it opens offers an upload for exactly those members",
    /rows=\{facedIds\.map/.test(builderSrc),
    "a row offering something no screen can ever show");

  const IRENE = { id: "irene", __groupId: "red_velvet" };
  const twoSlots = store.assignSlot(
    store.assignSlot({}, IRENE, "sub"), IRENE, "npc");
  check("a member assigned a second slot MOVES rather than appearing twice",
    Object.keys(twoSlots).length === 1 && twoSlots.irene.slot === "npc",
    JSON.stringify(twoSlots));
  check("...and the pick records the group she was browsed from, or she cannot resolve",
    twoSlots.irene.src === "library" && twoSlots.irene.groupId === "red_velvet",
    JSON.stringify(twoSlots.irene));
  check("no composite group/id key, which would let the same person in twice",
    !/\$\{tab\}\/\$\{member\.id\}/.test(builderSrc)
      && !/`\$\{[^}]*groupId[^}]*\}\/\$\{/.test(builderSrc));

  // The roster shaping itself lives in customCast.js so it can be tested as
  // behaviour rather than asserted as a regex — it is the part of the builder
  // that has to be right, and it feeds resolveRoster directly.
  const PICKS = {
    irene: { slot: "npc", src: "library", groupId: "red_velvet" },
    sana: { slot: "sub", src: "library", groupId: "twice" },
    c_1: { slot: "main", src: "custom", lang: "zh", profile: { name: "Lin Xia" } },
    yeri: { slot: "sub", src: "library", groupId: "red_velvet" },
  };
  const built = store.rosterFromPicks(PICKS);
  // A ROSTER CARRIES NO WORLD. It answers which of them are in this run and in
  // what slot; resolveRoster takes the world as its own argument. A `worldId` on
  // it was a second copy of the save's world, stamped one screen before the
  // player picks one - and a second copy of a fact is the one that drifts.
  check("a roster carries no world of its own to disagree with the save",
    !("worldId" in built)
      && !("worldId" in loader.buildClassicRoster("red_velvet", "irene", ["yeri"], ["irene", "yeri"])),
    "the builder cannot know a world the player picks one screen later");
  // Entry order IS prompt order, and prompt order is a cache boundary: the same
  // cast in a different order is the same game and a total cache miss. Iterating
  // the picks object would tie it to insertion order instead.
  check("the built roster orders entries main, then subs, then NPCs",
    built.entries.map((e) => e.slot).join(",") === "main,sub,sub,npc",
    built.entries.map((e) => `${e.memberId}:${e.slot}`).join(" "));
  check("...and that order is stable however the picks were inserted",
    JSON.stringify(store.rosterFromPicks(
      Object.fromEntries(Object.entries(PICKS).reverse())).entries.map((e) => e.slot))
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
  }), "en", worldFor.en));
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
  const secondMain = store.assignSlot(
    store.assignSlot({}, { id: "irene", __groupId: "red_velvet" }, "main"),
    { id: "seulgi", __groupId: "red_velvet" }, "main");
  check("promoting a second main demotes the first instead of dropping her",
    secondMain.seulgi.slot === "main" && secondMain.irene?.slot === "sub",
    JSON.stringify(secondMain));
  check("tapping the slot a member already holds removes her",
    Object.keys(store.assignSlot(
      store.assignSlot({}, IRENE, "sub"), IRENE, "sub")).length === 0,
    "there must always be one tap that undoes one tap");
  check("a custom pick carries her snapshot and language, not a library reference",
    store.assignSlot({}, { id: "c_1", __custom: true }, "npc",
      { lang: "ko", profile: { name: "Lin Xia" } }).c_1.src === "custom",
    "a library reference to a member who exists in no group resolves to nothing");
  check("an unknown slot name changes nothing",
    Object.keys(store.assignSlot({}, IRENE, "lead")).length === 0,
    "SLOTS is the whitelist; a typo must not create a fourth role");

  // --- §22.5 commit 3: ONE profile editor, and a library edit is a DIFF -----
  //
  // resolveRoster has honoured `entry.override` since v1.4.0; what commit 3 adds is
  // a way for a player to produce one. A SNAPSHOT would pass every structural check
  // here while silently giving up §4.2's by-reference rule - a corrected library
  // profile reaching a game in progress - so these go through resolveRoster and read
  // the resolved member rather than asserting on the builder's markup.
  //
  // Slices a named function out of the component by finding where the NEXT top-level
  // declaration starts, rather than by a hand-counted length: a source regex over the
  // whole file cannot tell the library path from the custom one four lines below it.
  const fnAfter = (src, marker) => {
    const at = src.indexOf(marker);
    if (at < 0) return "";
    const rest = src.slice(at + marker.length);
    const m = rest.match(/\r?\n {2}(?:const|function|\/\*\*) /);
    return marker + (m ? rest.slice(0, m.index) : rest);
  };

  const LIB_BASE = { id: "irene", name: "Irene", public_image: "AUTHORED", mbti: "ISFP" };
  const changed = (edits) => store.overrideFrom(LIB_BASE, { ...LIB_BASE, ...edits });
  check("an override records only what changed, so an untouched field still arrives by reference",
    JSON.stringify(changed({ public_image: "REWRITTEN" })) === JSON.stringify({ public_image: "REWRITTEN" }),
    JSON.stringify(changed({ public_image: "REWRITTEN" })));
  // THE GATE for this commit. It may not move a golden, and this is the property
  // that says so: a cast nobody edited must produce the entry it produced before the
  // editor existed - not the same entry carrying an empty override.
  check("...and a member nobody edited yields no override key at all",
    Object.keys(changed({})).length === 0
      && !("override" in store.rosterFromPicks({
        irene: { slot: "main", src: "library", groupId: "red_velvet" } }).entries[0]),
    "an empty override is still a key the entry did not carry before");
  // Diffing against the ALREADY-OVERRIDDEN copy compounds: a field changed and then
  // typed back would keep an entry saying it equals itself, so the entry would never
  // return to what an unedited cast produces.
  check("...and typing a field back to the library's own words removes it again",
    Object.keys(changed({ public_image: "AUTHORED" })).length === 0,
    "an override diffed against an overridden copy never shrinks");
  // Object.assign cannot DELETE, so a dropped key means the library's sentence comes
  // back and the edit is discarded. "" is how a clear is expressed, and it renders as
  // nothing because the profile block tests every optional field for CONTENT.
  check("a field the player CLEARED is recorded as empty rather than dropped",
    store.overrideFrom(LIB_BASE, { id: "irene", name: "Irene" }).public_image === "",
    "a dropped key restores the library's text and throws the edit away");

  const editedRoster = store.rosterFromPicks({
    irene: { slot: "main", src: "library", groupId: "red_velvet",
      override: { public_image: "REWRITTEN BY THE PLAYER" } },
    yeri: { slot: "sub", src: "library", groupId: "red_velvet" },
  });
  check("a library edit reaches the roster as an override and never as a snapshot",
    editedRoster.entries[0].override?.public_image === "REWRITTEN BY THE PLAYER"
      && editedRoster.entries[0].profile === undefined
      && !("override" in editedRoster.entries[1]),
    JSON.stringify(editedRoster.entries));
  const editedResolved = await fromDisk(
    () => loader.resolveRoster(editedRoster, "zh", worldFor.zh));
  const editedIrene = editedResolved.members.find((m) => m.id === "irene");
  check("...and resolves to the edited words while every untouched field stays the library's",
    editedIrene.public_image === "REWRITTEN BY THE PLAYER"
      && Boolean(editedIrene.private_personality) && Boolean(editedIrene.birthday)
      && Boolean(editedIrene.name_kr),
    JSON.stringify({ pub: editedIrene.public_image, kr: editedIrene.name_kr }));

  // --- §22.5 commit 4b: where a swept restaging is STORED ---------------------
  //
  // Each source keeps its own rule, unchanged: a custom member is snapshotted so
  // her detail goes in `profile`; a library member is by reference so hers goes in
  // `override`, beside whatever the editor already put there.
  const SWEEP_ROSTER = store.rosterFromPicks({
    irene: { slot: "main", src: "library", groupId: "red_velvet", override: { mbti: "EDITED" } },
    c_9: { slot: "sub", src: "custom", profile: { id: "c_9", name: "Nine" } },
    yeri: { slot: "npc", src: "library", groupId: "red_velvet" },
  });
  const swept = store.withCastDetail(SWEEP_ROSTER, {
    irene: { world_position: "in-house counsel", public_image: "A" },
    c_9: { world_position: "the driver" },
  }, "chaebol");
  const sweptOf = (id) => swept.entries.find((e) => e.memberId === id);
  check("a swept restaging lands where that member's own rule puts her",
    sweptOf("irene").override?.world_detail?.world_position === "in-house counsel"
      && sweptOf("irene").override?.mbti === "EDITED"
      && sweptOf("c_9").profile?.world_detail?.world_position === "the driver"
      && sweptOf("c_9").override === undefined,
    JSON.stringify(swept.entries));
  check("...and every stored restaging carries the world it was generated for",
    [sweptOf("irene")?.override?.world_detail, sweptOf("c_9")?.profile?.world_detail]
      .every((d) => d?.world === "chaebol"),
    "an unstamped detail applies in every world, which is the leak the stamp stops");
  // A failed generation must leave her in the state §22.1's narrowed rule covers,
  // and an empty stamp would say she had been restaged.
  check("...and a member the generation failed for is left byte-identical",
    sweptOf("yeri") === SWEEP_ROSTER.entries.find((e) => e.memberId === "yeri"),
    JSON.stringify(sweptOf("yeri")));
  // The palette's own boundary. A detail with no stamp would apply everywhere; one
  // with no position is the state applyWorldDetail declines to apply.
  check("the palette stores a stamped restaging and refuses an unstamped one",
    store.sanitizeProfile({ name: "N", world_detail: { world: "campus", world_position: "a junior" } })
      .world_detail?.world_position === "a junior"
      && !("world_detail" in store.sanitizeProfile({ name: "N", world_detail: { world_position: "a junior" } }))
      && !("world_detail" in store.sanitizeProfile({ name: "N", world_detail: { world: "campus" } })),
    JSON.stringify(store.sanitizeProfile({ name: "N", world_detail: { world: "campus" } })));
  // THE GATE, for the object the diff now has to see. String(obj) flattens every
  // detail to the same "[object Object]", so a generation would diff to nothing and
  // never reach the roster - and an unedited one must still diff to nothing, or the
  // entry stops being what a cast nobody touched produces.
  const DET = { world: "chaebol", world_position: "in-house counsel" };
  const DET2 = { world: "chaebol", world_position: "the family driver" };
  check("a restaging is recorded by the diff rather than flattened out of it",
    store.overrideFrom({ ...LIB_BASE, world_detail: DET }, { ...LIB_BASE, world_detail: DET2 })
      .world_detail?.world_position === DET2.world_position,
    "two details that compare equal make a retry the player paid for vanish");
  // The editor builds `{ world, ...detail }` and a stored one comes back in
  // WORLD_FIELDS order, so the SAME content arrives with its keys in two orders.
  // Comparing the raw objects reads that as an edit, and then a cast nobody touched
  // carries an override - which is the no-golden-moves gate, one commit on.
  check("...and one that has not changed still yields no override key, whatever its key order",
    Object.keys(store.overrideFrom({ ...LIB_BASE, world_detail: DET },
      { ...LIB_BASE, world_detail: { world_position: DET.world_position, world: DET.world } })).length === 0,
    "key order is not an edit");

  // ONE editor, TWO save paths, and the branch reads a FORWARDED value rather than
  // inferring which state opened it. Inference is how one of two call sites comes
  // to be wrong, which this repo has now recorded three times.
  check("the editor forwards which copy it was editing",
    /onSave\?\.\(\{[\s\S]{0,200}src: member\?\.src \|\| "custom"/.test(editorSrc),
    "the caller must not have to work out which state opened this");
  check("...and the builder branches on it before it can reach the palette",
    /entry\.src === "library"/.test(builderSrc)
      && builderSrc.indexOf('entry.src === "library"')
        < builderSrc.indexOf("upsertMember(cast, entry)"),
    "a library member copied into the palette is a second Irene with the same id");
  const libEditFn = fnAfter(builderSrc, "const saveLibraryEdit = (");
  check("a library edit writes nothing to the authored-member palette",
    libEditFn.length > 120 && !/upsertMember|saveCustomCast|setCast\(/.test(libEditFn),
    libEditFn ? "saveLibraryEdit reaches the palette" : "saveLibraryEdit not found, so this proves nothing");
  const libBaseFn = fnAfter(builderSrc, "const libraryBase = (");
  check("...and diffs against her library record rather than the overridden copy",
    /overrideFrom\(base, entry\.profile\)/.test(libEditFn)
      && libBaseFn.length > 80 && !/picks/.test(libBaseFn),
    "libraryBase reading picks would hand the diff the copy it is diffing");

  // HER FACE IS THE WAY IN (§22.2). Counting the call sites rather than testing that
  // the helper exists: the main-member card and the sub/NPC chip are two surfaces,
  // and a helper can exist, be correct, and be wired to one of them.
  const editTaps = (builderSrc.match(/editChosen\((?:id|ids\[0\])\)/g) || []).length;
  check("tapping a chosen member's face opens her profile, in both sections",
    editTaps >= 2, editTaps + " call sites");
  const PALETTE_ENTRY = { id: "c_1", lang: "ko", profile: { name: "Lin Xia" } };
  const LIB_PICK = { slot: "main", src: "library", groupId: "red_velvet" };
  check("...and it opens for a prebuilt member as well as an authored one",
    store.editorTargetFor("irene", LIB_PICK, { libraryBase: LIB_BASE })?.src === "library"
      && store.editorTargetFor("c_1", { slot: "sub", src: "custom" },
        { paletteEntry: PALETTE_ENTRY })?.src === "custom",
    "one editor for both doors is what §22.2 asks for");
  // Her library record with THIS RUN's override laid on top: editing her a second
  // time has to start from what the last edit produced, or the box shows the
  // library's words and saving writes them back over her own.
  // Dereferenced with ?. throughout: a mutation that returns null here would
  // otherwise throw, and a stack trace where a verdict belongs reads exactly like a
  // guard that cannot fail. Third time this repo has paid for that.
  const editedTarget = store.editorTargetFor("irene",
    { ...LIB_PICK, override: { public_image: "MINE" } }, { libraryBase: LIB_BASE });
  check("...and hands a prebuilt member her library record with this run's edits on top",
    editedTarget?.profile?.public_image === "MINE"
      && editedTarget?.profile?.mbti === "ISFP",
    JSON.stringify(editedTarget));
  // Group configs are fetched per tab, so a base we cannot see is a real state. An
  // empty profile would read as data loss AND would diff every field as a change,
  // which snapshots her by the back door.
  check("...and refuses rather than opening over an empty profile it would then snapshot",
    store.editorTargetFor("irene", LIB_PICK, {}) === null
      && store.editorTargetFor("irene", null, { libraryBase: LIB_BASE }) === null,
    "a null base must not become an override recording every field");
  // A custom pick can outlive its palette entry - deleted, or applied from a saved
  // roster, which snapshots her. The roster's copy is then the only one left and is
  // also the one the run will use.
  check("...and edits a custom member's own snapshot when her palette entry is gone",
    store.editorTargetFor("c_9",
      { slot: "sub", src: "custom", lang: "en", profile: { name: "Gone" } },
      {})?.profile?.name === "Gone",
    "a deleted palette entry must not empty the cast she is still in");
  check("...and the builder delegates that decision rather than branching itself",
    /editorTargetFor\(id, pick, \{/.test(fnAfter(builderSrc, "const editChosen = (")),
    "a source regex can see a branch written and not a branch reached");
  check("applying a saved cast brings its edits back with it",
    /e\.override/.test(fnAfter(builderSrc, "const applyRoster = (")),
    "the override is in the saved data and the reconstruction has to read it");

  // §22.3.3, BOTH halves, because either one alone is the wrong change: dropping the
  // field moves every golden for all 57 library members, and keeping the box
  // contradicts §22.2's tab 1. Comments are stripped, because this file explains the
  // decision by naming the field - the third guard here to pass against its own prose.
  check("animal_plastic has no box in the editor any more",
    !/animal_plastic/.test(editorSrc.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")),
    "§22.2 drops the box; cardGenerator drops it from CARD_FIELDS in the same commit");
  check("...and it is still stored and still reaches the prompt",
    store.PROFILE_FIELDS.includes("animal_plastic")
      && rosterSrc.includes("animal_plastic"),
    "removing the field itself would move every golden for all 57 library members");

  // --- the slot control, rebuilt role-first ----------------------------------
  // Two generations of this control are now recorded, because the SECOND one is
  // the interesting lesson. It began as tap-to-cycle on symbols, which nobody
  // could read. That was replaced by three named buttons ON EACH MEMBER CARD —
  // legible, and still wrong: up to twenty-seven adjacent ~18px targets at 390px,
  // each assigning a DIFFERENT role, so a mis-tap assigned the wrong part rather
  // than missing. It also inverted the task; a player picks her main first and
  // never asks "what is Yeri for".
  //
  // It is now three SECTIONS, and a member is added into one through a picker
  // sheet. These guards are written against that requirement — the player can
  // tell what each role is, fill one, and undo it — not against the markup.
  const pickerSrc = readFileSync(join(ROOT, "src/platforms/MemberPicker.jsx"), "utf8");
  check("the builder is organised by role, one section per slot",
    /SLOT_ORDER\.map\(/.test(builderSrc) && builderSrc.includes("{c.roles?.[s] || s}"),
    "the sections are titled from t.cast.roles, so the words are the control");
  // Now unconditional. The old legend appeared only while the whole cast was
  // empty, so it had vanished by the time the player reached the NPC decision —
  // which is the LAST one made and the least obvious of the three.
  check("every section explains its role whether or not it is filled",
    /c\.roleHints\?\.\[s\]/.test(builderSrc)
      && !/chosen\.length === 0 \? \(/.test(builderSrc),
    "the NPC hint has to survive picking a main");
  check("the picker names the role it is filling",
    /c\.pickFor\?\.\[slot\]/.test(pickerSrc) && /c\.roleHints\?\.\[slot\]/.test(pickerSrc),
    "a sheet of faces with no title does not say what the tap will do");
  // Cardinality drives the sheet: one main, so choosing her is the whole
  // interaction; many subs, so the sheet stays open and counts.
  check("choosing a main closes the picker, and a sub or NPC does not",
    /if \(slot === "main"\) onClose\?\.\(\)/.test(pickerSrc)
      && /slot !== "main" && \(/.test(pickerSrc),
    "adding four subs must not mean opening the sheet four times");
  check("a member held in another slot shows that role in the picker",
    /held \? c\.roles\?\.\[held\]/.test(pickerSrc),
    "tapping her MOVES her, so the next tap has to be predictable");
  check("a member can be removed from her section without reopening the picker",
    /onClick=\{\(\) => unassign\(id\)\}/.test(builderSrc)
      && /onClick=\{\(\) => setPicks\(\{\}\)\}/.test(builderSrc),
    "an x per chip, plus a clear-all");
  // Deleting an authored member is not undoable and its button sits beside Edit on
  // a small card in the picker, so the confirmation lives in the builder.
  check("deleting a custom member asks first, and names her",
    /onDelete\?\.\(m\.id\)/.test(pickerSrc)
      && /setConfirmDelete\(\{ kind: "member", id \}\)/.test(builderSrc)
      && /c\.confirmDelete\?\.\(nameOf\(confirmDelete\.id\)\)/.test(builderSrc),
    "\"are you sure\" beside a grid of twelve faces is not an answerable question");
  // ...and so does deleting a SAVED CAST, which had no way to be deleted at all.
  // One dialog for both, because a second would drift from this one - so it is
  // asked which kind of thing it is about rather than assuming a member.
  check("...and so does deleting a saved cast",
    /setConfirmDelete\(\{ kind: "roster", id: s\.id \}\)/.test(builderSrc)
      && /confirmDelete\.kind === "roster"[\s\S]{0,120}deleteRoster\(confirmDelete\.id\)/.test(builderSrc)
      && /c\.confirmDeleteRoster\?\./.test(builderSrc),
    "a saved cast is player data and must not die to one mis-tap");
  // The x is its OWN target. Tapping the bubble APPLIES the cast, so a
  // decorative glyph inside that button - which is what the member chips use,
  // where the whole chip IS the unassign control - would delete on apply.
  const savedRow = builderSrc.slice(builderSrc.indexOf("{saved.map((s) => ("),
    builderSrc.indexOf("{/* One section per role"));
  check("...and its x is a separate control from the bubble that applies it",
    /applyRoster\(s\.roster\)/.test(savedRow)
      && (savedRow.match(/<button/g) || []).length === 2,
    "one button cannot both apply and delete");
  // Deleting a saved cast must not touch the palette: the members in it are
  // referenced, and a player reading "delete X?" reasonably fears losing them.
  check("...and deleting one leaves the member palette alone",
    /const deleteRoster = \(id\) => \{[\s\S]{0,260}saved\.filter/.test(builderSrc)
      && !/const deleteRoster = \(id\) => \{[\s\S]{0,260}(saveCustomCast|removeMember)/.test(builderSrc),
    "a saved roster holds references, not the people");

  // --- what the player is shown a member CALLED ------------------------------
  // The picker shows the name she recognises, which is language-specific. The
  // prompt is unaffected and must stay so: `name` (the Latin stage name) is the
  // cast's canonical identity everywhere the model can see it, and
  // `membersNamedIn` reads it back out of the prose to decide who appeared.
  const utilsCast = join(OUT, "utils-cast.mjs");
  await esbuild.build({
    entryPoints: [join(ROOT, "src", "utils.js")],
    bundle: true, format: "esm", platform: "neutral", outfile: utilsCast, logLevel: "silent",
  });
  const u = await import("file://" + utilsCast.replace(/\\/g, "/") + "?t=" + Date.now());
  check("zh and ko show the localized real name, en the Latin stage name",
    u.displayNameIn({ name: "Irene", name_kr: "裴珠泿" }, "zh") === "裴珠泿"
      && u.displayNameIn({ name: "Irene", name_kr: "배주현" }, "ko") === "배주현"
      && u.displayNameIn({ name: "Irene", name_kr: "Bae Ju-hyun" }, "en") === "Irene",
    "en's name_kr is a romanized legal name, longer and not what she is known as");
  check("...falling back when a custom member left the optional real name blank",
    u.displayNameIn({ name: "Lin Xia" }, "zh") === "Lin Xia"
      && u.displayNameIn({ name: "Lin Xia" }, "ko") === "Lin Xia"
      && u.displayNameIn({}, "zh") === "");
  // THE guard on this feature. A display name reaching buildSystemPrompt would
  // move all three goldens and change who the model thinks is in the scene.
  check("the display name never reaches the prompt or the appearance scanner",
    !readFileSync(join(ROOT, "src/agent/mainAgent.js"), "utf8").includes("displayNameIn"),
    "mainAgent must keep using the Latin stage name as the canonical identity");

  // --- the saved-roster label ------------------------------------------------
  // `entry.name` and `entry.roster.name` look interchangeable and are not: the
  // second is the composed GROUP name, which rosterResolver renders into section
  // 4 as "<name> is an N-member group under <name> Entertainment".
  const labelled = store.savedRosterEntry({
    label: "  my Irene run  ", roster: store.rosterFromPicks(PICKS, "kpop_idol"), now: 111,
  });
  check("a saved roster's label is trimmed onto the entry",
    labelled.name === "my Irene run" && labelled.id === 111);
  check("...and NEVER onto roster.name, which the model is shown",
    labelled.roster.name === undefined,
    "a cast saved as \"my Irene run\" would debut under that name in the story");
  check("an empty label falls back to a name rather than saving a blank shelf entry",
    store.savedRosterEntry({ label: "   ", roster: {}, fallbackName: "Irene" }).name === "Irene");

  // --- the player's font scale has to reach these screens --------------------
  // It did not. `rv_sim_fontscale` is threaded into the story, the options, the
  // Bubble overlay and the Kakao overlay — and into neither cast screen, which
  // were also the smallest type in the app (down to 8px for a line the player has
  // to read, against 11-13 everywhere else). So a player who had asked for larger
  // text got it everywhere except where she needed it most.
  const sheetSrc = readFileSync(join(ROOT, "src/platforms/CastImageSheet.jsx"), "utf8");
  const CAST_FILES = {
    "RosterBuilder.jsx": builderSrc,
    "MemberPicker.jsx": pickerSrc,
    "MemberEditor.jsx": editorSrc,
    // Step 8's sheet is a fourth screen in the same flow, so it is held to the
    // same two rules: the player's font scale reaches it, and every size passes
    // through the floor. A screen added without being added here is a screen
    // that silently ignores the setting -- which is exactly what all three of
    // the others did until step 7.
    "CastImageSheet.jsx": sheetSrc,
  };
  const themeOut = join(OUT, "castTheme.mjs");
  await esbuild.build({
    entryPoints: [join(ROOT, "src/platforms/castTheme.js")],
    bundle: true, format: "esm", platform: "neutral", outfile: themeOut, logLevel: "silent",
  });
  const ct = await import("file://" + themeOut.replace(/\\/g, "/") + "?t=" + Date.now());

  const appForCast = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  check("App.jsx passes the player's font scale to the cast screens",
    /<RosterBuilder[\s\S]{0,400}?fontScale=\{fontScale\}/.test(appForCast),
    "the one call site, and the only place the setting can enter this flow");
  check("...and the builder forwards it to both the picker and the editor",
    /<MemberPicker[\s\S]{0,400}?fontScale=\{fontScale\}/.test(builderSrc)
      && /<MemberEditor[\s\S]{0,400}?fontScale=\{fontScale\}/.test(builderSrc),
    "a sheet that ignores the setting is the same bug one level down");
  const unscaled = [];
  for (const [file, src] of Object.entries(CAST_FILES)) {
    if (!/fontScale = 1/.test(src)) unscaled.push(`${file}: no fontScale prop`);
    if (!/scaleFont/.test(src)) unscaled.push(`${file}: does not call scaleFont`);
    // Anything under 14 is text. Larger bare values are decorative glyph sizes
    // inside fixed-size boxes (an emoji avatar), which must NOT scale or they
    // overflow the box they are centred in.
    for (const m of src.matchAll(/fontSize: (\d+(?:\.\d+)?)\b/g)) {
      if (Number(m[1]) < 14) unscaled.push(`${file}: bare fontSize ${m[1]}`);
    }
  }
  check("every cast screen sizes its text through the player's scale",
    unscaled.length === 0, unscaled.slice(0, 6).join(" | "));
  check("scaleFont applies the scale and floors at the minimum readable size",
    ct.scaleFont(11, 1) === 11 && ct.scaleFont(11, 1.25) === 14
      && ct.scaleFont(8, 1) === ct.CAST_MIN_FONT
      && ct.scaleFont(8, 1.25) === Math.round(ct.CAST_MIN_FONT * 1.25),
    `floor ${ct.CAST_MIN_FONT}: an 8px line is raised before the scale, not after`);

  // One palette across the three screens the player walks through in one sitting.
  // It was three copies of the same fifteen literals; `extractStoryText` is the
  // precedent — two copies of one definition had drifted, and the guard had been
  // written against the copy that was still correct.
  const localPalette = Object.entries(CAST_FILES)
    .filter(([, src]) => /const (border|textMain|accentGrad) = isLight \?/.test(src))
    .map(([f]) => f);
  check("the cast screens share one palette instead of each keeping a copy",
    localPalette.length === 0 && Object.values(CAST_FILES).every((s) => /castTokens/.test(s)),
    localPalette.join(", "));

  // The group's display name, never its storage id. Same defect as [Stage Changes]
  // printing a raw member id beside an [Affections] line printing a name — and a
  // custom member's id is a timestamp, which reads as nothing at all.
  check("a member sourced from another group names that group, not its id",
    /groups\.find\(\(g\) => g\.id === id\)\?\.name/.test(builderSrc)
      && !/\{c\.viaGroup\} \{picks\[m\.id\]\.groupId\}/.test(builderSrc),
    "`red_velvet` and `gnz` are keys; the index carries what the player calls them");

  // The control this described was deleted two redesigns ago. A stale string
  // beside its replacement is the i18n form of the "a prompt is not append-only"
  // failure this project keeps recording.
  const stale = [];
  for (const lang of ["zh", "en", "ko"]) {
    if (castKeys[lang].pickMainHint !== undefined) stale.push(`${lang}.pickMainHint`);
  }
  check("no i18n string survives describing a control that was removed",
    stale.length === 0 && !/pickMainHint/.test(builderSrc) && !/pickMainHint/.test(pickerSrc),
    stale.join(", "));

  // Roster order is prompt order, and prompt order is a cache boundary: the same
  // cast in a different order is the same game and a total cache miss. Iterating
  // the picks object directly would make the order depend on insertion, so the
  // slots are walked in a fixed sequence.
  // The ordering itself is asserted as behaviour above, on rosterFromPicks. This
  // only pins that the builder delegates to it rather than re-deriving an order
  // of its own, which would be a second source of truth for a cache boundary.
  // EVERY call site, not one of them: the builder calls rosterFromPicks twice -
  // once for the memo the chips and the images sheet read, once for the roster
  // it hands to Setup - and a guard matching the first left the second free to
  // shape its own. One of two is the extractStoryText failure exactly.
  const rfpCalls = builderSrc.match(/rosterFromPicks\([^)]*\)/g) || [];
  check("the builder delegates roster shaping rather than ordering entries itself",
    rfpCalls.length >= 2 && rfpCalls.every((c) => c === "rosterFromPicks(picks)")
      && !/entries:/.test(builderSrc),
    `prompt order is a cache boundary and belongs in one place: ${rfpCalls.join(" | ")}`);

  // Editing a picked member has to refresh the snapshot, or the roster carries
  // her profile as it was before the edit.
  check("editing a picked custom member refreshes her snapshot in the roster",
    /setPicks\(\(prev\) => \(prev\[entry\.id\]/.test(builderSrc),
    "custom entries are snapshotted, so a stale one ships the pre-edit profile");

  // A deleted member's images would otherwise sit in a capped store forever and
  // eventually refuse an image for a member who exists.
  //
  // Asserted on the SOURCE and negatively, which is not the shape this file
  // prefers — the rule is now two lines inside a component, so there is no pure
  // function to call. What it pins is the requirement rather than the lines: the
  // delete path removes images BY ID, and must never reconcile either store
  // against the custom palette, which is what silently dropped every library
  // member's photo. The positive half is the behavioural pair in Layer I.
  // Anchored on the CONDITION, not on `removePhoto(walls, id)` — which the first
  // version matched and which also appears in `setWallFor`, so deleting the whole
  // line from the delete path left the guard green. That is this file's own
  // "count the call sites, do not test presence" rule, failed by its own guard.
  check("deleting a custom member drops her photo and her wallpaper",
    /if \(photos\[id\]\) \{[^}]*removePhoto\(photos, id\)/.test(builderSrc)
      && /if \(walls\[id\]\) \{[^}]*removePhoto\(walls, id\)/.test(builderSrc),
    "her wallpaper outlives her otherwise, in a store capped at 8");
  // Comments stripped first: this guard is about what the builder DOES, and the
  // source carries a comment naming the call precisely so nobody puts it back.
  // A source regex that reads prose as code is a guard that cannot be explained.
  check("...and does not reconcile either store against the palette",
    !/pruneOrphans/.test(builderSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
    "keeping only palette ids deletes every library member's image");

  // The photo store is keyed by member id, and a photo can be picked on step 1
  // before anything is saved — so the CALLER mints the id. Minting it at submit
  // time instead would store the image under one id and the member under another.
  check("the builder mints the member id before opening the editor",
    /setEditing\(\{[^}]*\bid: newMemberId\(\)/.test(builderSrc),
    "otherwise a photo added on step 1 is orphaned the moment the member is saved");
  check("...and the editor never mints one of its own",
    !/newMemberId/.test(editorSrc),
    "two sources for the id is how the photo and the member end up disagreeing");

  // Every string is localized, and the builder must not invent its own English.
  check("the builder hardcodes no visible English string",
    !/>[A-Z][a-z]+ [a-z]+</.test(builderSrc.replace(/\{[^}]*\}/g, "")),
    "every label comes off t.cast");
  const builderKeys = [...builderSrc.matchAll(/\bc\.([a-zA-Z]+)/g)].map((m) => m[1]);
  // Both screens, because step 8's sheet reads keys the builder never mentions.
  const sheetKeys = [...sheetSrc.matchAll(/\bc\.([a-zA-Z]+)/g)].map((m) => m[1]);
  const missingKeys = [...new Set([...builderKeys, ...sheetKeys])]
    .filter((k) => !["fields", "hints"].includes(k))
    .filter((k) => ["zh", "en", "ko"].some((l) => castKeys[l][k] === undefined));
  check("every t.cast key the cast screens read exists in all three languages",
    missingKeys.length === 0, missingKeys.join(", "));

  // --- step 8: her face, in the game ---------------------------------------
  // The photo store shipped in step 6 and NOTHING IN THE GAME READ IT. The
  // uploader worked, the builder showed the result, and all six surfaces that
  // draw a member still drew `emoji` over a gradient — a feature complete on one
  // side of a boundary and connected to nothing on the other, which is the same
  // shape as npcAppearances and the bubble photo frame. It was reported as a
  // broken uploader, because that is what it looks like.
  const overlayFiles = {
    "BubbleOverlay.jsx": readFileSync(join(ROOT, "src/platforms/BubbleOverlay.jsx"), "utf8"),
    "KakaoOverlay.jsx": readFileSync(join(ROOT, "src/platforms/KakaoOverlay.jsx"), "utf8"),
    "InstagramOverlay.jsx": readFileSync(join(ROOT, "src/platforms/InstagramOverlay.jsx"), "utf8"),
    "WeverseOverlay.jsx": readFileSync(join(ROOT, "src/platforms/WeverseOverlay.jsx"), "utf8"),
    "MemberSelector.jsx": readFileSync(join(ROOT, "src/platforms/MemberSelector.jsx"), "utf8"),
  };
  // COUNT THE CONSUMERS, do not test that the helper exists. A helper can exist,
  // be correct, and be used in five of six places — which is the whole reason
  // this rule is in CLAUDE.md.
  const faceless = Object.entries(overlayFiles)
    .filter(([, src]) => !/photos\s*=\s*\{\}/.test(src) || !/photos\[/.test(src))
    .map(([f]) => f);
  check("every surface that shows a member shows her photo",
    faceless.length === 0, faceless.join(", "));
  check("...including the game's own top bar",
    /<MemberFace member=\{displayTopMember\} photo=\{castPhotos\[displayTopMember\?\.id\]\}/.test(appForCast),
    "the most-affected member is the one face on screen every round");
  // One definition of "her photo, or her gradient and her emoji". Six copies is
  // six chances for one of them to be the copy still showing the emoji — the
  // extractStoryText failure, guarded before the drift rather than after it.
  const inlineFace = Object.entries({ ...overlayFiles, "App.jsx": appForCast })
    .filter(([, src]) => /borderRadius: "50%", background: `linear-gradient\(135deg,\$\{m/.test(src))
    .map(([f]) => f);
  check("the avatar has one definition rather than one per surface",
    inlineFace.length === 0, inlineFace.join(", "));
  // Asserted on the CALL, not on the import: a file can import both maps and
  // forward neither, which is what a presence check would pass.
  const unthreaded = ["BubbleOverlay", "InstagramOverlay", "WeverseOverlay", "KakaoOverlay"]
    .filter((n) => !new RegExp(`<${n}[^>]*photos=\\{castPhotos\\}[^>]*walls=\\{castWalls\\}`).test(appForCast));
  check("App threads both image maps into all four social overlays",
    unthreaded.length === 0, unthreaded.join(", "));
  // The builder writes to localStorage synchronously, so a photo added while
  // choosing the cast has to be on screen in the game that starts next. On the
  // PHASE rather than in startNewGame and loadSave, which is a two-entry list
  // someone has to remember to extend.
  check("the game re-reads the image stores on entry, not only at mount",
    /if \(phase === "game"\) refreshCastImages\(\)/.test(appForCast),
    "a photo added in the builder would not appear until a reload");

  // THE guard of this batch. A data URL is ~20-90 KB of base64; one reaching the
  // static system prompt would destroy the ~5,500-token cached prefix AND bill
  // for it every round, which is the most expensive failure available here.
  // Same class as displayNameIn, and asserted the same way: by who can see it.
  const imageImporters = [];
  const walkSrc = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walkSrc(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name) || e.name === "imageStore.js") continue;
      // An IMPORT, not a mention. utils.js names the module in a comment
      // explaining where the wallpaper caps live, and a guard that reads a
      // comment as a dependency fails on its own documentation.
      if (/from "[^"]*imageStore/.test(readFileSync(p, "utf8"))) {
        imageImporters.push(p.replace(join(ROOT, "src"), "").replace(/\\/g, "/").replace(/^\//, ""));
      }
    }
  };
  walkSrc(join(ROOT, "src"));
  const promptSideImporters = imageImporters.filter((f) => !/^(platforms\/|App\.jsx$)/.test(f));
  check("nothing the prompt is built from can see an image store",
    promptSideImporters.length === 0 && imageImporters.length > 0,
    promptSideImporters.join(", ") || "the scan found no importers, so it proves nothing");
  // Narrower than "mentions a photo", deliberately. mainAgent.js carries
  // `hasPhoto` and `photoDesc` because the schema asks a model to DESCRIBE a
  // picture she posted, and that is text — the first version of this guard read
  // those as image data and failed on correct code. What must never appear is a
  // data URL or a handle on either store.
  const promptPath = ["src/agent/mainAgent.js", "src/rag/rosterResolver.js", "src/rag/groupLoader.js"]
    .map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
  check("...and no data URL or image store is reachable from the prompt path",
    !/data:image/.test(promptPath) && !/CAST_PHOTOS|CAST_WALLS/.test(promptPath),
    "members[] is what reaches buildSystemPrompt; a base64 photo in it costs the whole prefix");

  // Both caps and the bytes in use, visible BEFORE they refuse anything. The
  // save slots cost a run to learn this and the member palette repeated it one
  // screen over; a third instance would be nobody's fault but this file's.
  check("the image sheet shows both caps and the bytes in use at all times",
    /castCount\?\.\(Object\.keys\(photos\)\.length, PHOTO_MAX_COUNT\)/.test(sheetSrc)
      && /castCount\?\.\(Object\.keys\(walls\)\.length, WALL_MAX_COUNT\)/.test(sheetSrc)
      && /imagesUsed\?\.\(kb\)/.test(sheetSrc),
    "a cap the player meets for the first time by being refused is invisible");
  // One entry point, not a badge per card. The picker grid is three columns at
  // 390px and the card IS the assign target; a 20px badge beside it is the
  // adjacency that made the pre-step-7 builder untappable, where a mis-tap
  // assigned the wrong role rather than missing.
  check("the picker grid gains no image control of its own",
    !/imageStore|CastImageSheet|onPickPhoto/.test(pickerSrc),
    "uploads belong on the members already chosen, not on 57 assign targets");

  // --- step 8, second pass: the four hand-test bugs -------------------------
  // Every one of these is a defect no assertion written in advance reached, and
  // each guard is written from what the player should see.

  // ONE UPLOAD PATH. A file that became a stored image without passing the
  // cropper would be an automatic crop surviving beside a chosen one, which is
  // two answers to one question — and the automatic one is the bug. Derived by
  // scanning for the input rather than by naming the two screens, because the
  // thing that keeps going wrong in this repo is a list somebody has to extend.
  const filePickers = [];
  const labelWrapped = [];
  const walkPlatforms = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walkPlatforms(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      const src = readFileSync(p, "utf8");
      if (!/type="file"/.test(src)) continue;
      const rel = p.replace(join(ROOT, "src"), "").replace(/\\/g, "/").replace(/^\//, "");
      filePickers.push([rel, src]);
      // CODE, not prose. Both of these screens carry a comment explaining why the
      // label-wrapped input was replaced — and the first version of this guard
      // matched those comments and failed on its own documentation, which is the
      // same trap the prune guard hit one layer up.
      const code = src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // A <label> wrapping a display:none file input is the standard trick and
      // iOS Safari does not honour it — which is exactly how the member editor's
      // uploader shipped untappable on the one device this app is built for.
      // The input must be INSIDE the label, so no </label> may fall between
      // them — every one of these screens also has ordinary field labels, and a
      // looser span reads one of those as the wrapper.
      if (/<label[^>]*>(?:(?!<\/label>)[\s\S]){0,800}?type="file"/.test(code)) labelWrapped.push(rel);
    }
  };
  walkPlatforms(join(ROOT, "src"));
  check("a file picker is opened by a button, never by a label wrapping it",
    labelWrapped.length === 0 && filePickers.length >= 2,
    labelWrapped.join(", ") || `the scan found ${filePickers.length} file inputs, so it proves nothing`);
  const uncropped = filePickers.filter(([, src]) => !/<ImageCropper/.test(src)).map(([f]) => f);
  check("...and every picked file reaches the cropper before it is stored",
    uncropped.length === 0, uncropped.join(", "));

  // Her face was a square sitting inside a round ring on an iPhone, through
  // THREE fixes. A radius on the <img> cured Instagram, which was never broken.
  // Moving the frame to `clip-path` and dropping `overflow: hidden` left the
  // same three panels square — and made the failure WORSE, because with no
  // overflow clip an <img> whose clip does not apply renders as a full square
  // on top of a frame that border-radius still draws as a circle. That is the
  // reported symptom exactly: a square edge inside the circle.
  //
  // So the requirement is not "the photo is clipped correctly". It is that
  // NOTHING HAS TO CLIP ANYTHING: the photo is the frame's own background, and
  // an element's own background is clipped by its own border-radius, which has
  // no layer boundary to get wrong. Written from that, not from the CSS that
  // happens to implement it today.
  const stripComments = (src) => src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const faceSrc = readFileSync(join(ROOT, "src/platforms/memberFace.jsx"), "utf8");
  const faceCode = stripComments(faceSrc);
  check("the avatar renders no child for an ancestor to fail to clip",
    !/<img/.test(faceCode),
    "a photo drawn as a child element is a photo something else has to clip, and that is the bug");
  check("...so its shape is its own border-radius, for the circle and the rounded square alike",
    /borderRadius: r,/.test(faceCode) && /radius == null \? "50%" : radius/.test(faceCode),
    "border-radius clips the element's own background; that is the whole mechanism");
  // ONE enforcement. A second clip beside it is the `cropRect` double clamp
  // again: either half can be broken with the other covering for it, so neither
  // can be shown to work.
  check("...and it is the only thing enforcing that shape",
    !/overflow: "hidden"/.test(faceCode) && !/clipPath/.test(faceCode)
      && !/isolation/.test(faceCode),
    "a shape enforced twice is a shape neither enforcement can be shown to hold");
  check("...with the photo filling the frame the way object-fit: cover did",
    /backgroundSize: "cover"/.test(faceCode) && /backgroundOrigin: "border-box"/.test(faceCode)
      && /backgroundRepeat: "no-repeat"/.test(faceCode),
    "background-origin: border-box is what fills the frame right up under the border");
  check("...and her gradient stays UNDER it, so a photo that fails to decode is not a blank box",
    /photoFill\(photo, gradient\)/.test(faceCode),
    "the gradient is the fallback layer, not something the photo replaces");
  check("...and a border eats into the frame instead of insetting the photo",
    /boxSizing: "border-box"/.test(faceCode),
    "every caller passes a 1px border, and content-box sizing would shrink the photo by 2px");

  // COUNT THE CALL SITES. `photoFill` can exist, be correct, and be used in
  // one of three places — which is what `extractStoryText` cost this repo.
  // Derived from a scan of src/, so a fourth screen that shows a stored photo
  // cannot quietly go back to clipping an <img>.
  const photoScreens = [];
  const walkPhotoScreens = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walkPhotoScreens(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      const code = stripComments(readFileSync(p, "utf8"));
      if (!/photos\[/.test(code) && !/photoFill\(/.test(code)) continue;
      photoScreens.push([p.replace(join(ROOT, "src"), "").replace(/\\/g, "/").replace(/^\//, ""), code]);
    }
  };
  walkPhotoScreens(join(ROOT, "src"));
  // An <img> is still allowed for a stored photo, but only one that carries
  // its OWN radius — the tab strip has always done that, and the tab strip is
  // the one surface never reported square. What is banned is an <img> whose
  // shape is somebody else's job.
  const clippedByAncestor = photoScreens.filter(([, code]) => {
    const tags = code.match(/<img[\s\S]{0,400}?\/>/g) || [];
    return tags.some((tag) => /photos\[/.test(tag) && !/borderRadius/.test(tag));
  }).map(([f]) => f);
  check("no screen shows a stored photo as a child something else has to clip",
    clippedByAncestor.length === 0 && photoScreens.length >= 4,
    clippedByAncestor.join(", ") || `the scan found ${photoScreens.length} photo screens, so it proves nothing`);
  const fillUsers = photoScreens.filter(([, code]) => /photoFill\(/.test(code)).map(([f]) => f);
  check("...and the rounded-box screens all paint it through the one definition",
    fillUsers.length >= 3 && fillUsers.includes("platforms/memberFace.jsx"),
    `photoFill has ${fillUsers.length} users: ${fillUsers.join(", ")}`);
  // ── What's New, in the game ──────────────────────────────────────────────
  //
  // A player opens the game, not the repository, so the release notes have to
  // be reachable from inside it. They are one array in src/config/releaseNotes
  // rendered above the contact details in the Help Center's More Info tab.
  //
  // The binding check is the newest entry against package.json. Without it the
  // list silently stops at whatever release last remembered to add a line —
  // which is the failure README's "What's New" heading already has a guard for,
  // one file over.
  const pkgVersion = readCurrentVersion();
  const notesSrc = readFileSync(join(ROOT, "src/config/releaseNotes.js"), "utf8");
  const { RELEASE_NOTES } = await import(pathToFileURL(join(ROOT, "src/config/releaseNotes.js")).href);
  check("the newest release note is the version the player is running",
    RELEASE_NOTES[0].version === pkgVersion,
    `releaseNotes.js starts at ${RELEASE_NOTES[0].version}, package.json says ${pkgVersion} — add the entry`);
  const langsMissing = RELEASE_NOTES.filter((r) => !["zh", "en", "ko"].every((l) => typeof r[l] === "string" && r[l].trim().length > 20))
    .map((r) => r.version);
  check("...and every entry says it in all three languages",
    langsMissing.length === 0 && RELEASE_NOTES.length >= 5,
    langsMissing.join(", ") || `only ${RELEASE_NOTES.length} entries, so this proves nothing`);
  // The tab labels the top entry "you are playing this", which is only true if
  // the list is ordered newest-first.
  const descending = RELEASE_NOTES.every((r, i) => {
    if (i === 0) return true;
    const a = r.version.split(".").map(Number);
    const b = RELEASE_NOTES[i - 1].version.split(".").map(Number);
    for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] < b[k];
    return false;
  });
  check("...newest first, with no version listed twice",
    descending && new Set(RELEASE_NOTES.map((r) => r.version)).size === RELEASE_NOTES.length,
    "the tab calls the first entry the build in hand, so the order is load-bearing");
  // A version number in this file is HISTORY. `npm run bump` must leave it
  // alone, exactly as it leaves CLAUDE.md's post-mortems and README's old
  // headings alone — otherwise the next release relabels notes for a release
  // that never happened.
  // Non-vacuous on purpose: bumping the CURRENT version would find nothing in
  // this file to rewrite, so the probe uses a version the notes actually name.
  const pastV = (notesSrc.match(/v(\d+\.\d+\.\d+)/) || [])[1];
  check("...and a bump leaves the notes of past releases alone",
    Boolean(pastV) && bumpFile("src/config/releaseNotes.js", notesSrc, pastV, "0.0.0").count === 0,
    pastV ? `a bump of v${pastV} rewrote this file, which is a changelog` : "the notes name no past version, so this proves nothing");

  // The tab shows BOTH halves in all three languages. Composition is the thing
  // that silently half-lands: a language whose tab renders only the contact
  // block looks completely normal until someone opens it.
  const helpSrc = readFileSync(join(ROOT, "src/platforms/HelpOverlay.jsx"), "utf8");
  const composed = ["Zh", "En", "Ko"].filter((L) =>
    new RegExp(`function More${L}\\(\\)[^\n]*WhatsNew lang="${L.toLowerCase()}"[^\n]*Contact${L}`).test(helpSrc));
  check("the More Info tab shows the release notes above the contact details",
    composed.length === 3,
    `only ${composed.join("/") || "none"} render both`);
  check("...in every language's tab list, not just one",
    (helpSrc.match(/ErrorsZh, MoreZh|ErrorsEn, MoreEn|ErrorsKo, MoreKo/g) || []).length === 3,
    "CONTENTS still routes a language at the contact-only body");
  // The panel's content area scrolls, which is what lets the list grow a
  // release at a time without a layout change.
  check("...and the panel's content area scrolls",
    /flex: 1, overflowY: "auto"/.test(helpSrc) && /maxHeight: "86vh"/.test(helpSrc),
    "a fixed-height panel would cut the oldest releases off");
  // Renaming a tab and leaving prose pointing at the old name is the
  // `pickMainHint` failure: a control described in three languages that had
  // been deleted two redesigns earlier. Derived from TABS, so the next rename
  // fails here until the prose follows it.
  const tabRow = (lang) => {
    const m = helpSrc.match(new RegExp(`\\n  ${lang}: \\[([^\\]]+)\\],`));
    return m ? m[1].split(",").map((x) => x.trim().replace(/^"|"$/g, "")) : [];
  };
  const staleTabRef = ["zh", "en", "ko"].filter((lang) => {
    const labels = tabRow(lang);
    const help = helpSrc.match(new RegExp(`ERROR_HELP_${lang.toUpperCase()} = \\{[\\s\\S]*?\\n\\};`));
    if (!help || labels.length !== 4) return true;
    const unknown = help[0].split(/\n/).find((l) => l.trim().startsWith("unknown:")) || "";
    return !unknown.includes(labels[3]);
  });
  check("no help text sends the player to a tab that no longer exists",
    staleTabRef.length === 0,
    `${staleTabRef.join(", ")}: the unrecognised-error line names a tab that is not in TABS`);

  // A wallpaper must be SEEN at the ratio it was framed at. `background-
  // attachment: local` sizes `cover` against the scrollable content instead of
  // the panel, so a long KakaoTalk thread showed a crop the player never chose —
  // and it is what makes those scrollers a composited layer, which is the best
  // account available of the square avatars above. Derived, not a list of three
  // files: a fourth panel that grows a wallpaper must not be able to bring it
  // back.
  const wallPanels = Object.entries(overlayFiles).filter(([, src]) => /url\(\$\{wall\}\)/.test(src));
  const attached = wallPanels.filter(([, src]) => /backgroundAttachment/.test(src)).map(([f]) => f);
  check("a wallpaper is sized against the panel, never against how far the feed scrolls",
    attached.length === 0 && wallPanels.length >= 3,
    attached.join(", ") || `the scan found ${wallPanels.length} wallpapered panels, so it proves nothing`);

  // A custom member is a member. She could be given a photo in the editor and a
  // wallpaper NOWHERE, because the image sheet lists the chosen cast and she is
  // authored before she is chosen.
  // THREE conjuncts, because "the editor mentions onWallChange" is presence and
  // not behaviour: the first version of this guard matched the call site, so
  // deleting the prop that call depends on left it green. What has to be true is
  // that she can be ASKED for, that the frame she chose is FORWARDED, and that
  // the caller supplies the two — the editor owns no storage.
  const wallInEditor = [
    [/\bwall, onWallChange,/, "the editor does not take the wallpaper and a way to change it"],
    [/ask\("wall"\)/, "nothing on the form asks for a wallpaper"],
    [/onWallChange\?\.\(dataUrl\)/, "the framed wallpaper is not handed back"],
  ].filter(([re]) => !re.test(editorCode)).map(([, why]) => why);
  check("an authored member can be given a wallpaper where she is authored",
    wallInEditor.length === 0 && /wall=\{walls\[editing\.id\]\}/.test(builderSrc),
    wallInEditor.join("; ") || "the builder does not pass her current wallpaper in");
  check("...and both of her images go through the same store the library uses",
    /onWallChange=\{\(d\) => setWallFor\(editing\.id, d\)\}/.test(builderSrc)
      && /onPhotoChange=\{\(d\) => setPhotoFor\(editing\.id, d\)\}/.test(builderSrc),
    "a second write path is a second set of caps to forget");

  // The wheel had no frame and no surface of its own, so five rows of loose
  // numbers read as page content — in Setup, beside a 38px name field, as if the
  // control were sitting on top of the fields around it.
  const wheelSrc = readFileSync(join(ROOT, "src/platforms/YearWheel.jsx"), "utf8");
  const rows = Number((wheelSrc.match(/export const VISIBLE_ROWS = (\d+)/) || [])[1]);
  const rowH = Number((wheelSrc.match(/export const ROW_H = (\d+)/) || [])[1]);
  check("the wheel is short enough to sit in a row with a text field",
    rows >= 3 && rowH * rows <= 120,
    `${rows} rows x ${rowH}px = ${rowH * rows}px, against the ~38px field beside it`);
  check("...and is a bounded control, with its own edge and surface",
    /borderRadius: 10, border: `1px solid \$\{border\}`, background: fieldBg/.test(wheelSrc)
      && /overflow: "hidden"/.test(wheelSrc),
    "without an edge the rows above and below the year read as page content");
  const wheelCallers = [["App.jsx", appForCast], ["MemberEditor.jsx", editorCode]]
    .filter(([, src]) => /<YearWheel/.test(src) && !/fieldBg:/.test(src)).map(([f]) => f);
  check("...on both screens that use it",
    wheelCallers.length === 0, wheelCallers.join(", "));
  // …and in Setup it shares a line with the name field. It did not: a caption
  // sat above the wheel INSIDE its own column, which pushes the wheel down by
  // the caption's height, so the field and the selected year were on two
  // different lines and the pair read as two controls stacked. The row that
  // holds them must therefore contain exactly the field and the wheel, and
  // centre them — the selected year is the wheel box's own centre, since the
  // band sits at the middle row by construction.
  const setupYearRow = appForCast.slice(0, appForCast.indexOf("<YearWheel"));
  const nameRow = setupYearRow.slice(setupYearRow.lastIndexOf('<div style={{ display: "flex"'));
  check("...and in Setup the wheel's year sits on the name field's line",
    /alignItems: "center"/.test(nameRow) && /className="s-in"/.test(nameRow)
      && !/fontSize: 9/.test(nameRow),
    "a caption inside the wheel's column offsets it by the caption's own height");

  // ONE WALLPAPER, ONE JOB. Weverse used it as a post card's banner while the
  // other three used it as a background, so one upload meant two different
  // things. The three panels that scroll a feed now all put it behind the feed.
  const notBehindFeed = ["BubbleOverlay.jsx", "KakaoOverlay.jsx", "WeverseOverlay.jsx"]
    // Same style object, which is what "behind the feed" means in source. Not
    // `[^}]*`: the scrim arrives as `${wallScrim(...)}`, so a brace-free span
    // cannot reach the wallpaper and the guard fails on correct code. `[^<>]`
    // keeps it inside one element's attributes instead.
    .filter((f) => !/overflowY: "auto"[^<>]{0,400}url\(\$\{wall\}\)/.test(overlayFiles[f]));
  check("the wallpaper backs the feed on every panel that scrolls one",
    notBehindFeed.length === 0, notBehindFeed.join(", "));
  check("...and Instagram uses it as the post image, which is its own surface",
    /flex: "1 1 0"[^<>]{0,400}wallStyle\(wall\)/.test(overlayFiles["InstagramOverlay.jsx"]),
    "a feed of one post has no background to speak of; the post IS the surface");
  check("...with a scrim under every one of them",
    ["BubbleOverlay.jsx", "KakaoOverlay.jsx", "WeverseOverlay.jsx"]
      .every((f) => /wallScrim\(isLight, 0\.[0-9]+\)/.test(overlayFiles[f])),
    "text laid straight on an arbitrary photo is legible for some uploads and not others");

  // The birth year is stated once and then fixed: it decides which way every
  // address form points, and it sits in the static prompt, so a mid-run change
  // re-points the cast's honorifics AND costs the whole cached prefix. The row
  // survives only for a save whose year the migration reproduced from `age` —
  // wrong for about half of those saves and unrecoverable.
  check("the birth-year correction appears only for a save that needs it",
    /\{birthYearEstimated && \(\s*<div style=\{\{ marginBottom: 20 \}\}>/.test(appForCast),
    "a new game's year was stated by the player and must not be editable");
  check("...and correctBirthYear itself is untouched",
    /correctBirthYear/.test(appForCast)
      && /export function correctBirthYear/.test(readFileSync(join(ROOT, "src/rag/saveMigrator.js"), "utf8")),
    "the gate narrows who sees the control, not what it does");

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
    "the breakup reason and keepsake are re-rolling - see backstorySeed in mainAgent.js");

  // THE CLAIM THE TAIL MOVE RESTS ON, stated as the pair of assertions it needs.
  // Changing the story mode mid-run has to cost nothing, which means the static
  // prompt cannot move across a mode change AND the tail has to be what moves
  // instead. Either half alone is vacuous: identical prompts would also be true
  // of a mode nothing reads, and four distinct tails would also be true of a mode
  // that additionally rewrote section 6.
  const modePrompts = new Set(mod.MODE_IDS.map((id) => dBuild(dForm({ storyMode: id }), "zh")));
  const modeTails = new Set(mod.MODE_IDS.map(
    (id) => mod.buildTailRules(dWorld.zh, id, "default")));
  check(`the static prompt is byte-identical across all ${mod.MODE_IDS.length} story modes`,
    modePrompts.size === 1,
    "a live Settings switch reaching buildSystemPrompt costs ~5,500 tokens per toggle");
  check("...and the dynamic tail is what changes instead",
    modeTails.size === mod.MODE_IDS.length,
    `${modeTails.size} distinct tails for ${mod.MODE_IDS.length} modes`);
  // Same for Time Speed, which made this trade first and has never been asserted.
  check("the static prompt is byte-identical across a Time Speed change",
    new Set(["slow", "default", "fast"].map((ts) => dBuild(dForm({ timeSpeed: ts }), "en"))).size === 1
      && new Set(["slow", "default", "fast"].map(
        (ts) => mod.buildTailRules(dWorld.en, "free", ts))).size === 3,
    "CLAUDE.md: never move the pacing hint into buildSystemPrompt or buildHistoryLedger");

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
      { id: "irene", name: "Irene", name_kr: "裴珠泫" },
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
  // Narration can MENTION a form rather than use one, and step 7's run produced the
  // contrastive shape: the prose names the form in order to reject it, which is the
  // opposite of the defect. Verbatim from round 17.
  check("...and does not flag a form the narration is rejecting",
    none(g.narratedHonorifics("你喊她的名字，不是Irene欧尼，不是队长，是那个在天台上差点哭出来的女人。", cast, "zh")),
    JSON.stringify(g.narratedHonorifics("你喊她的名字，不是Irene欧尼。", cast, "zh")));
  check("...nor one the narration puts in quotes as the thing being discussed",
    none(g.narratedHonorifics("她想了想“Irene欧尼”这个称呼，觉得太远了。", cast, "zh")),
    "a quoted form inside narration is a mention");
  // The narrowing must not swallow the bug: the same sentence without the negation
  // is still a violation.
  check("...and a plain narrated form is still caught beside a rejected one",
    g.narratedHonorifics("不是队长。Irene欧尼正站在窗边。", cast, "zh").length > 0,
    "one mention in a story does not excuse a use elsewhere in it");

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
    g.selfNameErrors("“裴珠泫，谢谢你的咖啡。”", cast).length > 0);
  check("...and does not flag a self-introduction",
    none(g.selfNameErrors("“我叫姜涩琪，请多指教。”", cast)),
    "the v1.3.7 false positive");
  check("...and does not flag a real name in narration",
    none(g.selfNameErrors("裴珠泫转过头来。", cast)),
    "narration may use real names freely");
  // FIFTH false positive, twice in one 25-round run in step 7. Verbatim from rounds
  // 16 and 23: a quoted span that is NOTHING but the name, with the attribution
  // saying in so many words that she is naming herself. No message is attached, so
  // nobody is being addressed — and the earlier fix required a clause opening, which
  // a bare name satisfies.
  check("...nor a member saying her own name, when the narration says that is what it is",
    none(g.selfNameErrors("“裴珠泫，”她突然说，用的是自己的名字，像是在做一次新的自我介绍。", cast))
      && none(g.selfNameErrors("“裴珠泫，”她说，叫的是自己的名字，“在部队锅店门口，穿着你的外套。”", cast)),
    JSON.stringify(g.selfNameErrors("“裴珠泫，”她突然说，用的是自己的名字。", cast)));
  // The narrowing is scoped to a BARE name, so the bug it was built for survives: a
  // real name used to address someone stays a violation however the narration
  // describes it.
  check("...and the narrowing does not excuse a name with a message attached",
    g.selfNameErrors("“裴珠泫，你听我说。”她说，用的是自己的名字。", cast).length > 0,
    "a span carrying a message is a vocative whatever the attribution claims");

  // SIXTH false positive, from step 7's pinned 25-round revalidation. The prose
  // below is that round verbatim: the PLAYER, a 财阀, calls Irene by her legal
  // name and contrasts it with the stage persona in the same breath. The SPEAKER
  // CONTRACT scopes the prohibition to a member — "When Irene speaks, 'Irene' and
  // '裴珠泫' refer to herself" — so this is register-correct writing, and the
  // grader had no speaker attribution at all. Same blind spot
  // role-claimed-by-member had, which is why both now read one shared window.
  const playerUsesRealName =
    "你直视着她的眼睛，目光如炬，穿透了她层层叠叠的防御：“裴珠泫，我从来不做没把握的投资。"
    + "如果是麻烦，我会解决；如果是风险，我会承担。你只需要负责做那个耀眼的Irene，剩下的，交给我。”";
  check("...nor the PLAYER using a member's real name — only a member may not",
    none(g.selfNameErrors(playerUsesRealName, cast)),
    JSON.stringify(g.selfNameErrors(playerUsesRealName, cast)));
  // ...and the bug it was built for must survive that: a member speaking, with her
  // own name attributed to her, is still wrong however close the player's pronoun.
  // The tie-break, and the case that decides whether the narrowing is safe: prose
  // routinely attributes a member's line with the player in the same clause —
  // "Irene looked at you and said quietly". A second-person pronoun alone must NOT
  // buy the exemption, or the bug this grader exists for walks straight through it.
  const memberWithPlayerInWindow = "“裴珠泫，谢谢你的咖啡。”Irene看着你，轻声说。";
  check("...while a member's line is still flagged even with 你 in the attribution",
    g.selfNameErrors(memberWithPlayerInWindow, cast).length > 0,
    "a member attributed by name stays a violation however close the player's pronoun");
  // The shared window is load-bearing in both directions, so assert the other
  // grader's behaviour through it too: the player claiming her OWN role is fine,
  // a member claiming it is not, decided by the same attribution.
  check("...and the shared window still tells the two speakers apart for roles",
    none(g.roleClaimedByMember("你抬起头：“作为会长，我有权决定。”", "会长", ["Irene", "Seulgi"]))
      && g.roleClaimedByMember("Irene抬起头：“作为会长，我有权决定。”", "会长", ["Irene", "Seulgi"]).length > 0,
    "role attribution survives the shared-window refactor");

  // kkt-transcribed-in-story. The prose below is the real round a player
  // reported on DeepSeek Official in zh: the model delivered the Kakao AND
  // wrote it into the story, so she read it twice. The existing grader runs
  // only when NOTHING was delivered and could never have seen this.
  const kktRound = { irene: ["到家了吗", "粥的事……我不是随便说的", "下次见面，别道歉。"] };
  const transcribed = "她伸手替你把被子拉高。\n\n---\n\n【手机屏幕亮起】\n\n"
    + "**📱 KKT · 裴珠泫**\n到家了吗\n粥的事……我不是随便说的\n下次见面，别道歉。";
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

  // --- stage names are per language now ------------------------------------
  // getStageName took no language, so buildDynamicTail emitted 有印象 to an
  // English player's model while section 9 of the prompt listed "Acquaintance" —
  // two vocabularies for one scale, and the UI showed the Chinese one too.
  const sc = await import("../src/config/stageConfig.js");
  for (const lang of ["zh", "en", "ko"]) {
    check(`[${lang}] the stage scale has all seven names`,
      sc.stageNamesFor(lang).length === 7
        && sc.stageNamesFor(lang).every((n) => typeof n === "string" && n.length > 0),
      JSON.stringify(sc.stageNamesFor(lang)));
  }
  check("zh stage names are unchanged, so existing saves' prompts do not move",
    JSON.stringify(sc.stageNamesFor("zh"))
      === JSON.stringify(["陌生人", "有印象", "产生兴趣", "暧昧期", "确认关系", "热恋期", "考验期"]),
    JSON.stringify(sc.stageNamesFor("zh")));
  // Wrapped, because returning undefined here makes `[0]` throw and a throw
  // takes the whole suite down instead of failing one check — the same trap a
  // corrupt-input guard hit earlier in this step.
  let fallbackErr = null;
  try {
    fallbackErr = (sc.stageNamesFor("fr")?.[0] === "陌生人"
      && sc.stageNamesFor(undefined)?.[0] === "陌生人") ? null : "did not fall back to zh";
  } catch (e) { fallbackErr = `threw: ${e.message}`; }
  check("...and an unknown language falls back to zh rather than to undefined",
    fallbackErr === null, fallbackErr || "");
  check("the score bands are derived from the thresholds, not typed beside them",
    JSON.stringify(sc.STAGE_BANDS)
      === JSON.stringify(["0-15", "16-30", "31-50", "51-65", "66-80", "81-90", "91-100"]),
    JSON.stringify(sc.STAGE_BANDS));

  // --- the ROLE CONTRACT, graded from the prose ----------------------------
  // The reported line, verbatim: a Chaebol player's own office claimed by Irene.
  const castNames = ["Irene", "Jisoo", "Sana", "Mina"];
  const claimed = (s, role = "会长") => g.roleClaimedByMember(s, role, castNames);
  check("a member claiming the player's role is flagged",
    claimed("Irene转过身说：“作为会长，我不能同意。”")[0] === "role-claimed-by-member:会长",
    JSON.stringify(claimed("Irene转过身说：“作为会长，我不能同意。”")));
  check("...in Korean and English too",
    g.roleClaimedByMember("Irene이 말했다. “회장으로서 저는 반대예요.”", "회장", castNames).length === 1
      && g.roleClaimedByMember('Irene said, "As the chairman, I cannot allow it."', "chairman", castNames).length === 1,
    "the claim is a self-ascription, and each language marks it differently");
  check("...and when the attribution follows the quote instead",
    claimed("“作为会长，我不能同意。”Irene放下了杯子。").length === 1,
    "attribution sits on either side; both windows are read");
  // The title is legitimate all over a clean round — as ADDRESS, and in
  // narration. A grader that flags those gets tuned away within a week.
  check("...but the title used to ADDRESS the player is not flagged",
    none(claimed("Irene低下头：“会长nim，这边请。”")),
    "that is the work override doing exactly what it is for");
  check("...nor the title in narration",
    none(claimed("她穿过走廊，会长办公室的门是开着的。")),
    "narration may name her office; only a member may not claim it");
  check("...nor narration stating that the player holds it",
    none(claimed("你作为会长走进会议室，所有人都站了起来。")),
    "she does hold it — that is the premise, not a defect");

  // THE TWO REAL FALSE POSITIVES, verbatim from the 20-round Chaebol playthrough
  // that produced them. The player speaks inside quotes as much as any member
  // does, and she is the one who actually holds the title — so an unattributed
  // self-ascription beside a 你 is hers and correct. The first version of this
  // grader read every quote as a member's and flagged both.
  // Quotes CLOSED. The first draft of these two pasted the prose mid-quote, so
  // the span matcher never saw a paired span and they passed against every
  // mutation — including one that removed speaker identification altogether.
  // A test whose input never reaches the code under test is worse than no test:
  // it reports coverage that does not exist.
  check("...and not the player's own line, mid-narration",
    none(claimed("你的声音不高，却精准地穿透了周围的杂音，“公司的艺人需要最好的状态来消化新企划，而我作为会长，有权决定用什么方式让我的团队保持这种状态。”")),
    "flagged live on a round that was correct");
  check("...nor her line when a member is mentioned as its OBJECT",
    none(claimed("你直视着她的眼睛，选择顺着那条裂开的缝隙继续往前走，“作为会长，我需要为整个团队负责。”")),
    "她的眼睛 is what she is looking at, not who is speaking");
  // And the member name being present near the quote is not enough on its own —
  // it has to be present WITHOUT the player in the same window.
  check("...nor her line in a paragraph that also names a member",
    none(claimed("Sana把下巴搁在Irene肩上。你抬起头说：“作为会长，我需要为整个团队负责。”")),
    "the window carrying 你 is hers, whoever else is in the scene");
  check("...and no role, or no cast to attribute to, means no check",
    none(g.roleClaimedByMember("“作为会长，我不能同意。”", null, castNames))
      && none(g.roleClaimedByMember("Irene说“作为会长，我不能同意。”", "会长", [])),
    "the speaker cannot be identified without the cast");

  // The other direction: the player handed the members' working day.
  check("the player given a practice of her own is flagged",
    g.playerGivenIdolLife("她提醒你：“明天的练习别迟到。”")[0]?.startsWith("player-given-idol-life:"),
    JSON.stringify(g.playerGivenIdolLife("她提醒你：“明天的练习别迟到。”")));
  check("...including the possessive form, in all three languages",
    g.playerGivenIdolLife("你的回归准备得怎么样？").length === 1
      && g.playerGivenIdolLife("네 연습은 어땠어?").length === 1
      && g.playerGivenIdolLife("How was your rehearsal?").length === 1,
    "a player outside the group has none of these");
  // A chairman may stand in a practice room; what she may not have is a practice.
  check("...but visiting the practice room is not flagged",
    none(g.playerGivenIdolLife("你推开练习室的门，她们正在排练。")),
    "the place is not the obligation");
  check("...nor a member's own schedule mentioned near the player",
    none(g.playerGivenIdolLife("你看着她。她明天还有排练，得早点睡。")),
    "sentence-scoped on purpose — her schedule is hers");
  // The false positive the sentence scope exists to prevent: "you" in one
  // sentence and somebody ELSE's practice call in another. Whole-story matching
  // reads those as one statement about the player.
  check("...nor another member being told off in a later sentence",
    none(g.playerGivenIdolLife("你站在门口看着。她提醒Joy，排练别迟到。")),
    "two sentences, two subjects — only a scope keeps them apart");
  check("...and an identity that really has practice is skipped entirely",
    none(g.playerGivenIdolLife("她提醒你：“明天的练习别迟到。”", { sharesIdolLife: true })),
    "a 练习生 player has practice at this company; the rule must not fire");

  // --- the cross-group leak, graded from the prose -------------------------
  // The phone-reported round: told the cast was BLACKPINK, the model supplied
  // Jennie, Rose and Lisa from its own knowledge and set the company to YG.
  // Neither name is in any file the prompt sends, which is what makes prose the
  // only place this is visible.
  const outsiders = [
    { name: "Jennie", name_kr: "金珍妮" },
    { name: "Lisa", name_kr: "丽莎" },
    { name: "Rosé", name_kr: "朴彩英" },
  ];
  const leaked = "Jisoo推开练习室的门，Jennie和Lisa正坐在镜子前。";
  check("a member outside the roster, named in the prose, is flagged",
    g.outsideCastNames(leaked, outsiders).length === 2,
    JSON.stringify(g.outsideCastNames(leaked, outsiders)));
  check("...and is named in the flag, so the report says who leaked",
    g.outsideCastNames(leaked, outsiders).includes("outside-cast:Jennie"),
    JSON.stringify(g.outsideCastNames(leaked, outsiders)));
  check("...and the localized real name counts too",
    g.outsideCastNames("朴彩英站在门口。", outsiders)[0] === "outside-cast:Rosé",
    "a zh round names her 朴彩英, not Rosé");
  check("...and a clean round flags nothing",
    none(g.outsideCastNames("Jisoo和Irene在练习室里待到很晚。", outsiders)));
  check("...and an empty outsider list cannot fire",
    none(g.outsideCastNames(leaked, [])),
    "a whole single group has no outsiders, and the check must be silent there");

  // The agency was never in a file either. "X Entertainment" is derived from the
  // cast's own name; a real one means the model inferred the group.
  check("a real agency named in the prose is flagged",
    g.realAgencyNames("YG的会议室里，气氛很僵。")[0] === "real-agency:YG",
    JSON.stringify(g.realAgencyNames("YG的会议室里，气氛很僵。")));
  check("...and the cast's own derived agency is not",
    none(g.realAgencyNames("X Entertainment的会议室里，气氛很僵。")),
    "the composed lore names it, so the model is right to use it");
  // A bare acronym needs a boundary or it fires inside ordinary words, which is
  // how a grader gets tuned away for crying wolf.
  check("...and an acronym inside a word does not fire",
    none(g.realAgencyNames("She sent an SMS and smiled."))
      && none(g.realAgencyNames("他用KOZY的杯子喝水。")),
    JSON.stringify([g.realAgencyNames("She sent an SMS and smiled."),
                    g.realAgencyNames("他用KOZY的杯子喝水。")]));

  // The harness must actually call them, or the layer tests dead code.
  const harness = readFileSync(join(ROOT, "test", "playthrough.mjs"), "utf8");
  for (const fn of ["narratedHonorifics", "nameYaVocative", "sinicizedHonorifics", "selfNameErrors",
                    "kktTranscribed", "outsideCastNames", "realAgencyNames",
                    "roleClaimedByMember", "playerGivenIdolLife"]) {
    check(`playthrough.mjs calls ${fn}`, new RegExp(`bad\\.push\\(\\.\\.\\.${fn}\\(`).test(harness));
  }

  // Every field that selects a whole block of the prompt must be a flag, not a
  // literal. This has gone wrong three times with the same consequence:
  // `identity` was pinned to a trainee, so 7 of the 8 backgrounds - including the
  // only one containing randomness - had never been played live by anything;
  // `pace` was pinned, which cost nothing while the pace reached the model as a
  // bare id and cost three quarters of the coverage the moment step 7 started
  // sending its authored rule; and `provider` was pinned to Aliyun, so three of
  // the four providers still have not played a live round.
  //
  // The story mode is the same field one release later, and it is now checked ON
  // THE executeRound CALL rather than on the form literal. That is not a style
  // change: the mode is no longer a form field at all, so a guard reading `form`
  // would be reading the wrong object, and adding `--mode` while leaving
  // `storyMode` off the call would pass a flag check.
  const formLiteral = (harness.match(/const form = \{[\s\S]*?\n    \};/) || [""])[0];
  check("the harness builds its form from flags, not literals",
    formLiteral.length > 0 && /identity: IDENTITY/.test(formLiteral),
    formLiteral.slice(0, 200) || "form literal not found - the anchor moved");
  check("...and --identity reaches it",
    /const IDENTITY = arg\("identity",/.test(harness),
    "IDENTITY must come from arg('identity', ...)");
  const harnessCall = (harness.match(/await executeRound\(\{[\s\S]*?\n          \}\)/) || [""])[0];
  check("the harness passes its story mode to executeRound",
    harnessCall.length > 0 && /storyMode: MODE/.test(harnessCall),
    harnessCall.replace(/\s+/g, " ").slice(0, 200) || "executeRound call not found - the anchor moved");
  check("...and --mode reaches it",
    /const MODE = arg\("mode",/.test(harness),
    "MODE must come from arg('mode', ...)");
  // `form.pace` stays in the harness form as an EMPTY STRING rather than being
  // deleted: backstorySeed still hashes it, and a form that omits the key hashes
  // `undefined` where the app hashes "" - two seeds for one setup.
  check("...and the dead pace field is still present, empty, for the seed",
    /pace: ""/.test(formLiteral), formLiteral.slice(0, 200));
  // Every id the code declares has to be reachable from the flag, or the default
  // is the only one anyone ever plays. DERIVED from MODE_IDS, so a fifth mode
  // fails this until the harness documents it.
  const { MODE_IDS: HARNESS_MODE_IDS } = await import(
    "file://" + join(ROOT, "src/rag/worldLoader.js").replace(/\\/g, "/"));
  check("the harness documents every story mode",
    HARNESS_MODE_IDS.every((id) => harness.includes(id)),
    `undocumented: ${HARNESS_MODE_IDS.filter((id) => !harness.includes(id)).join(", ")}`);
  check("...and validates the flag against that list rather than a copy of it",
    /MODE_IDS.includes\(MODE\)/.test(harness) && /from "..\/src\/rag\/worldLoader.js"/.test(harness),
    "a second hand-maintained list of mode ids is what PACES was");

  // THE REPORT CONFIG IS WRITTEN ONCE, AT THE END OF A RUN, so an undefined name
  // in it throws only after the rounds have been spent - and `npm run build` does
  // not cover this file at all. Renaming PACE to MODE left `PACE` in that object
  // literal, which parses, bundles and dies at report time. A green build means
  // the module graph resolves, not that any of it runs.
  //
  // Derived: every shorthand name in `config: { ... }` must appear somewhere else
  // in the harness, so a key whose source was renamed away fails here.
  const cfgLiteral = (harness.match(/config: \{ ([^}]*) \}/) || [, ""])[1];
  const cfgKeys = cfgLiteral.split(",").map((k) => k.trim()).filter(Boolean);
  check("the harness report config is not empty",
    cfgKeys.length > 5, cfgLiteral.slice(0, 120) || "the config literal anchor moved");
  // Counting occurrences is NOT enough, and this guard failed its own mutation
  // that way first: a name mentioned in a COMMENT satisfies a count, and the
  // comment explaining this very rename mentions PACE twice. That is the
  // over-wide-pattern failure this suite already records three times. Require an
  // actual declaration.
  const orphanKeys = cfgKeys.filter((k) =>
    !new RegExp(`(const|let|var|function)\\s+${k}\\b`).test(harness));
  check("every name in the harness report config is defined somewhere in it",
    orphanKeys.length === 0,
    `${orphanKeys.join(", ")} - written into the report and declared nowhere, so the run dies after spending the rounds`);

  // THE PROVIDER IS THE THIRD FIELD OF THIS SHAPE, and it was the worst of them.
  // `selectedModel: "qwen"` and `aliyun: { mode: "free" }` were hardcoded into the
  // executeRound call, so the harness could exercise exactly ONE of the four
  // providers in MODEL_CONFIGS — and on a key for any other it died at round 0
  // with `free_all_exhausted`, which names the player's credits rather than the
  // harness. Identity and pace taught this twice already; the guards for those two
  // are directly above.
  //
  // Asserted on the CALL, not on the flag: adding `--provider` while leaving
  // `selectedModel: "qwen"` in place would pass a flag check, which is exactly the
  // trap the form-literal check above was written to avoid.
  const roundCall = (harness.match(/await executeRound\(\{[\s\S]*?\n          \}\);/) || [""])[0];
  check("the harness sends the round to the configured provider, not a hardcoded one",
    roundCall.length > 0
      && /selectedModel: PROVIDER/.test(roundCall)
      && !/selectedModel: "qwen"/.test(roundCall),
    roundCall.slice(0, 200) || "executeRound call not found — the anchor moved");
  check("...and only Aliyun is handed a free-route mode",
    /aliyun: ROUTED \? \{ mode: "free" \} : null/.test(roundCall),
    "a non-Aliyun key sent through the router cannot authenticate");
  check("--provider defaults to the key actually configured in .env.local",
    /const PROVIDER_ARG = arg\("provider", env\.MODEL_ID \|\| "qwen"\)/.test(harness),
    "the harness must follow MODEL_ID rather than assuming Aliyun");
  // Derived from MODEL_CONFIGS, not a second hand-maintained list of providers —
  // the thing that keeps going wrong in this repo is a list a human has to
  // remember to update, so the resolver consults the config instead.
  check("the provider resolver reads MODEL_CONFIGS rather than listing providers",
    /function resolveProvider/.test(harness)
      && /if \(MODEL_CONFIGS\[s\]\) return s;/.test(harness)
      && /Object\.keys\(MODEL_CONFIGS\)\.find/.test(harness),
    "a hand-listed provider table is the list someone forgets to update");
  // The false warning: it fired on every non-Aliyun key, so a correctly configured
  // DeepSeek run was told its key was wrong one line before it failed for an
  // unrelated reason. Two true-sounding lines naming the wrong cause.
  check("the sk-ws- key warning is scoped to the provider it describes",
    /PROVIDER === "qwen" && !API_KEY\.startsWith\("sk-ws-"\)/.test(harness),
    "a false warning is worse than none");

  // THE WORLD IS THE FOURTH FIELD OF THIS SHAPE, and it is the one this file
  // predicted. After identity, pace and provider it said: assume there is a fourth
  // and go looking rather than waiting for it to cost a release. There was.
  // `kpop_idol` was hardcoded in TWO places - the loadWorld call and the roster the
  // --cast door builds - so the harness could not play a single line of what v1.4.1
  // adds, and step 8's release gate (`a live playthrough.mjs pass`) was not
  // reachable rather than merely unmet.
  //
  // BOTH sites are asserted, because moving one is the `extractStoryText` failure:
  // a run would then load campus and hand resolveRoster a roster claiming kpop_idol.
  check("the harness loads the world the flag names, not a hardcoded one",
    /await loadWorld\(WORLD, LANG\)/.test(harness) && !/loadWorld\("kpop_idol"/.test(harness),
    "loadWorld must take WORLD - a pinned world cannot exercise any world but one");
  // The roster it builds carries NO world - the same shape `src/` now has, since
  // a second copy of the world is exactly what the app's save slots were reading
  // and getting wrong. What has to reach the cast is the LOADED world, passed to
  // resolveRoster, which is the site that was hardcoded in the first place.
  check("...and hands that same world to resolveRoster, rather than a roster pinning one",
    /resolveRoster\(rosterFromSpec\([^)]*\), LANG, world\)/.test(harness)
      && !/worldId:/.test(harness),
    "the --cast door must not carry a second answer to which world this is");
  check("...and --world reaches both",
    /const WORLD = arg\("world",/.test(harness),
    "WORLD must come from arg('world', ...)");

  // An identity id is a position inside ONE world and only the ex-girlfriend is
  // shared, so a mismatched pair selects nothing: section 6 renders an empty
  // background and no work title while every grader reports a healthy run. The
  // check is DERIVED from the loaded world's own identities - a hand-listed table
  // of which ids belong to which world is the list nobody updates.
  check("the harness refuses an identity the chosen world does not declare",
    /world\.identities\.some\(\(i\) => i\.id === IDENTITY\)/.test(harness),
    "an unmatched identity renders a blank block and grades clean");
  check("...and the refusal names what that world does declare",
    /world\.identities\.map\(\(i\) => i\.id\)\.join/.test(harness),
    "an error naming no alternative costs a second run to act on");

  // A grader that cannot run is not a grader that passed. IDENTITY_ROLE is keyed
  // on the kpop ids, so both ROLE CONTRACT graders are silent for every identity
  // in a new world - `0 issues` in exactly the area v1.4.1 changed most. Printed
  // under the table and deliberately NOT pushed into `notes`, which would colour
  // the row: this states coverage, it does not report a defect.
  check("a ROLE CONTRACT grader that cannot run is recorded rather than silent",
    /report\.gradersSkipped\.push\(/.test(harness) && /gradersSkipped: \[\]/.test(harness),
    "an unmapped identity must say so, or a clean run overstates what was checked");
  check("...and it is reported without colouring the run",
    /graders that did not run for this identity/.test(harness)
      && !/allClean[^;]*gradersSkipped/.test(harness),
    "a coverage statement that reaches allClean marks every new-world run dirty");

  // The default has to be a world that exists, or every run without the flag dies
  // at round 0 on a 404. Derived from the index rather than compared to a literal.
  const harnessWorldIdx = JSON.parse(readFileSync(join(ROOT, "public/worlds/index.json"), "utf8"));
  const harnessDefaultWorld = (harness.match(/const WORLD = arg\("world", "([^"]+)"\)/) || [])[1];
  check("the harness's default world is one the index lists",
    harnessWorldIdx.some((w) => w.id === harnessDefaultWorld),
    `default ${harnessDefaultWorld}, index lists ${harnessWorldIdx.map((w) => w.id).join(', ')}`);
  // Written into the report, because an A/B whose two arms were different worlds
  // and does not say so is the `model id in your flags` mistake one field over.
  check("...and the world that served the run is recorded in the report",
    /world: WORLD,/.test(harness) && /LANG, GROUP, WORLD,/.test(harness),
    "a report that does not name its world cannot be compared with another");

  // A flag whose evidence was not kept is not a flag. `storyContent` is the
  // PARSED story, so when the parser gives up the stored text is its own
  // 500-char slice of the response - the symptom and the evidence become the
  // same bytes. Observed live 2026-09-29, office/en round 7: `finish: stop`,
  // 832 completion tokens, so NOT truncated, and nothing left to say what the
  // model sent. Same gap CLAUDE.md records for delivered Kakao, one field over.
  // Asserted as ONE expression, gate and field together, because
  // `parseLevel !== "direct"` also appears in gradeRound - so asserting the two
  // halves separately would stay green with the gate dropped entirely, and the
  // half that matters would be the vacuous one. Found by asking what the
  // mutation would be, not by running it.
  check("a round the parser could not take as-is keeps what the model sent",
    harness.includes(`...(parseLevel !== "direct" ? { rawResponse: rawContent } : {})`),
    "a parse flag with no raw response cannot be judged after the run");
  // The point is that it comes off the RESPONSE. Storing the parsed story under
  // a new name would satisfy a presence check and preserve nothing.
  check("...and it is the response body rather than the parsed story",
    harness.includes("rawContent = data.choices")
      && !harness.includes("rawResponse: story"),
    "raw must be captured in the fetch stub, not copied from storyContent");

  // Prose is kept for every round, not a head of the first. A grader reports only
  // what went wrong, so the transcript is the only record of whether a positive
  // instruction was followed — and round 0 is the worst round to sample, being the
  // one round with no history behind it and therefore the one that cannot repeat.
  check("the harness stores a transcript for every round",
    /transcript: \{/.test(harness) && !/sampleText/.test(harness),
    "sampling round 0 cannot show repetition, rotation or pacing");
  // Compare the transcript's KEY SET, not a substring of the literal. Matching the
  // field name anywhere inside the block passes against `notStory: story` — the
  // name survives as the value while the key is gone, which is exactly the shape a
  // rename takes.
  const transcriptKeys = new Set(
    [...((harness.match(/transcript: \{[\s\S]*?\n        \},/) || [""])[0])
      .matchAll(/(?:^|[{,])\s*([A-Za-z_]\w*)\s*[,:]/gm)].map((m) => m[1]));
  for (const field of ["story", "scene", "options", "affections", "summaryText"]) {
    check(`...carrying ${field}`, transcriptKeys.has(field),
      [...transcriptKeys].join(" ") || "transcript literal not found — the anchor moved");
  }
  check("the harness records which slot each member held",
    /report\.roster = members\.map/.test(harness) && /slot: m\.id === mainId/.test(harness),
    "member rotation is a rule about slots");
  // A --route run that does not record which model answered is uninterpretable: the
  // route's head moves as models run out of free credits, so two runs with identical
  // flags can be two different models. Step 7 compared two such runs and read a 43%
  // output-length drop as a prompt effect.
  check("the harness records which model served each round",
    /report\.served\[servedModel\] = \(report\.served\[servedModel\] \|\| 0\) \+ 1;/.test(harness)
      && /getFreeRouteStatus\?\.\(API_KEY\)\?\.current/.test(harness),
    "a route run with no served model is an anecdote");
  check("...and warns when more than one model answered",
    /more than one model answered/.test(harness),
    "the rounds are then not directly comparable");
  check("scripts/analyze-prose.mjs reads the transcript",
    existsSync(join(ROOT, "scripts/analyze-prose.mjs"))
      && /transcript\?\.story/.test(readFileSync(join(ROOT, "scripts/analyze-prose.mjs"), "utf8")),
    "a transcript nothing reads is a bigger report file and nothing else");

  // ---- the analyzer's metrics, run against a SYNTHETIC report rather than grepped
  //
  // These are behavioural on purpose. Every other check on this tool has been a regex over
  // its own source, and that is the weak shape: it passes as long as a line exists, whatever
  // the line computes. The analyzer has now had three metric bugs (`아:194`, a repetition
  // count inflated by normalising names out of short sentences, and "not in English" matching
  // an em dash), and not one of them would have been caught by asserting that the code
  // mentions the metric. So build a report whose right answers are known by construction and
  // assert the numbers.
  const proseFixture = (rounds) => ({
    config: { LANG: "zh", GROUP: "red_velvet", IDENTITY: "财阀", PACE: "高压舆论向", ROUNDS: rounds.length, SUBS: 1 },
    results: [{
      model: "(fixture)",
      roster: [{ id: "irene", name: "Irene", slot: "main" }, { id: "seulgi", name: "Seulgi", slot: "sub" }],
      rounds: rounds.map((r, i) => ({ round: i + 1, parseLevel: "direct", bad: r.bad || [], transcript: {
        story: r.story, scene: r.scene, options: ["A. a", "B. b", "C. c", "D. d"],
        stats: { selfId: 40, secrecy: 100, mood: 70 },
        affections: { main: 10 + i },
        summaryText: r.summary ?? "x".repeat(120),
      } })),
    }],
  });
  const runAnalyzer = (fixture, extraArgs = []) => {
    const path = join(OUT, "smoke-prose-fixture.json");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path, JSON.stringify(fixture), "utf8");
    // eslint-disable-next-line no-control-regex
    return execFileSync(process.execPath, [join(ROOT, "scripts/analyze-prose.mjs"), path, ...extraArgs],
      { cwd: ROOT, stdio: "pipe", encoding: "utf8" }).replace(/\x1b\[[0-9;]*m/g, "");
  };

  // A scene can be distinct every round and still be a paragraph. 20 distinct scenes of
  // 250 characters is what the English run actually produced, and the distinct-count
  // reported it as perfect variety.
  const longScenes = runAnalyzer(proseFixture(
    Array.from({ length: 6 }, (_, i) => ({ story: `第${i}轮。` + "字".repeat(400), scene: `场景${i}，` + "很长的描述".repeat(12) }))));
  check("the analyzer measures scene LENGTH, not only distinctness",
    /6 over the 20 a one-line box fits/.test(longScenes),
    longScenes.split("\n").find((l) => /scenes/.test(l)) || longScenes);

  // And the mirror: a byte-identical scene held for five rounds is 2 distinct out of 6,
  // which still reads as "some variety" rather than as standing still.
  const stuckScenes = runAnalyzer(proseFixture(
    Array.from({ length: 6 }, (_, i) => ({ story: `第${i}轮。` + "字".repeat(400), scene: i === 0 ? "练习室，上午" : "练习室，深夜" }))));
  check("...and the longest run of identical scenes",
    /longest identical run 5/.test(stuckScenes),
    stuckScenes.split("\n").find((l) => /scenes/.test(l)) || stuckScenes);

  // Section 3's rule is a statement about EVERY round, so a single max cannot test it.
  // This fixture has a max gap of 6 and breaks the rule in 12.5% of (round, member)
  // pairs — two different numbers off the same data, which is why both are printed.
  // The max is what hid step 7's A/B: the arm with [Rounds Absent] had the worse max
  // and the worse rule rate, and the arm without it had a lower max while breaking the
  // rule more often per round than the max implied.
  const rotUnit = runAnalyzer(proseFixture(
    Array.from({ length: 8 }, (_, i) => ({
      story: `第${i}轮。Irene在场。` + (i < 2 ? "Seulgi也在场。" : "") + "字".repeat(400),
      scene: `练习室${i}，深夜`,
    }))));
  check("the analyzer measures rotation in the rule's own unit, not only the max",
    /max gap 6/.test(rotUnit) && /broken in 12\.5% of \(round, member\) pairs/.test(rotUnit),
    rotUnit.split("\n").filter((l) => /rotation|rule is broken/.test(l)).join(" | "));

  // "Not in English" must not mean "contains a byte over 127". An em dash is English
  // punctuation; this exact false positive reported 7 of 25 when 3 was the answer.
  const dashSummary = runAnalyzer(proseFixture(
    Array.from({ length: 4 }, (_, i) => ({
      story: `第${i}轮。` + "字".repeat(400), scene: "练习室，深夜",
      summary: i < 2 ? `Irene and the player talk — quietly, ${"a".repeat(80)}` : `Irene and 林夏 talk ${"a".repeat(90)}`,
    }))));
  check("an em dash in a summary is not counted as non-English",
    /2 with CJK\/Hangul/.test(dashSummary),
    dashSummary.split("\n").find((l) => /summary/.test(l)) || dashSummary);

  // A round far under the asked length passed every gate in step 7, because
  // MIN_STORY_CHARS (40) is a floor against a dead round, not a bound on a usable one.
  const truncated = runAnalyzer(proseFixture([
    { story: "字".repeat(400), scene: "练习室，深夜" },
    { story: "字".repeat(60), scene: "走廊，清晨" },
    { story: "字".repeat(400), scene: "录音室，下午" },
  ]));
  check("the analyzer flags a round far under the asked length",
    /1 round\(s\) under 117 — r2/.test(truncated),
    truncated.split("\n").find((l) => /under/.test(l)) || truncated);

  // The grader flags, rolled up by kind. Without this the only way to know whether a fix
  // landed is to open the JSON and read `rounds[].bad` by hand.
  const flagged = runAnalyzer(proseFixture([
    { story: "字".repeat(400), scene: "练习室，深夜", bad: ["narrated-honorific:欧尼"] },
    { story: "字".repeat(400), scene: "走廊，清晨", bad: ["narrated-honorific:前辈", "name-ya-vocative"] },
    { story: "字".repeat(400), scene: "录音室，下午" },
  ]));
  check("the analyzer rolls the grader flags up by kind",
    /narrated-honorific:2/.test(flagged) && /name-ya-vocative:1/.test(flagged)
      && /3 across 2 round\(s\)/.test(flagged),
    flagged.split("\n").find((l) => /flags/.test(l)) || flagged);

  // --report has to write a file, and the heading has to distinguish two runs of the SAME
  // config — which is the normal shape of an A/B, and was rendered identically at first.
  const reportPath = join(OUT, "smoke-prose-report.md");
  runAnalyzer(proseFixture([{ story: "字".repeat(400), scene: "练习室，深夜" }]), ["--report", reportPath]);
  const written = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
  check("--report writes a committable Markdown table",
    /\| `scene\.overBound` \| \d+ \|/.test(written) && /\| `rotation\.worstGap` \| \d+ \|/.test(written),
    written.slice(0, 200) || "no report written");
  check("...headed by the run's filename, so an A/B's two arms differ",
    /^## smoke-prose-fixture$/m.test(written),
    (written.match(/^## .*/m) || ["no heading"])[0]);
  // The served model belongs in the report unasked: it is what decides whether any other
  // row can be compared at all.
  check("...and naming the served model even when it is absent",
    /served by: not recorded/.test(written),
    (written.match(/served by.*/) || ["absent"])[0]);

  // --baseline must refuse to imply a comparison it cannot support. Both arms here have no
  // served model, and the diff has to say so rather than printing a clean table.
  const diffOut = runAnalyzer(proseFixture([{ story: "字".repeat(400), scene: "练习室，深夜" }]),
    ["--baseline", join(ROOT, "test/baselines/zh-chaebol-high-pressure-r25.json")]);
  check("--baseline prints the served model of both arms before the numbers",
    /served\s+baseline: not recorded/.test(diffOut) && diffOut.indexOf("served") < diffOut.indexOf("metric"),
    diffOut.split("\n").filter((l) => /served|metric/.test(l)).slice(0, 4).join(" | "));
  check("...and says when the two configs are not the same",
    /config\s+DIFFERENT/.test(diffOut),
    diffOut.split("\n").find((l) => /config/.test(l)) || diffOut);

  // The baselines themselves are tracked, because test/.out is gitignored and every
  // measurement this project has made lived only there.
  check("test/baselines holds the step 7 comparison set, tracked",
    existsSync(join(ROOT, "test/baselines/zh-chaebol-high-pressure-r25.json"))
      && existsSync(join(ROOT, "test/baselines/README.md")),
    "a baseline in a gitignored directory is one `git clean -xfd` from gone");
  check("...and the confounded run is labelled as one",
    existsSync(join(ROOT, "test/baselines/zh-chaebol-high-pressure-r25-CONFOUNDED.json"))
      && /do not use as a baseline/i.test(readFileSync(join(ROOT, "test/baselines/README.md"), "utf8")),
    "it has the same flags as the real baseline and a different model served it");
  // The A/B set is kept for what it DISPROVES: two runs of identical code, 0% and 26.7%.
  // Both arms of both replicates must stay, or the point of it is gone — one arm alone
  // reads as a result rather than as the variance that swamped it.
  {
    const ab = ["with-absence-1", "with-absence-2", "no-absence-1", "no-absence-2"]
      .map((n) => `test/baselines/ab-zh-chaebol-r25-${n}.json`);
    check("...and the A/B set keeps BOTH replicates of BOTH arms",
      ab.every((p) => existsSync(join(ROOT, p))),
      ab.filter((p) => !existsSync(join(ROOT, p))).join(", ") || "all present");
    // Each arm must name the model that served it, or it is not an A/B arm at all.
    const served = ab.map((p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")).results?.[0]?.served);
    check("...each naming the model that served it",
      served.every((s) => s && JSON.stringify(s).includes("qwen3.7-plus-2026-05-26")),
      JSON.stringify(served));
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
