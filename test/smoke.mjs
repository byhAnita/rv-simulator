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
  "gpt-5.6-luna": "gpt4omini", "gpt4omini": "gpt4omini",
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
    ["gpt4omini", null, { max_completion_tokens: 32768, reasoning_effort: "high" }],
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
async function layerB(callLLM, MODEL_CONFIGS) {
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

  // Dead NPC constants must stay gone.
  const consts = readFileSync(join(ROOT, "src", "config", "constants.js"), "utf8");
  check("NPC_APPEARANCE_CHANCE removed", !/^export const NPC_APPEARANCE_CHANCE/m.test(consts));
  check("NPC_COOLDOWN_ROUNDS removed", !/^export const NPC_COOLDOWN_ROUNDS/m.test(consts));

  // Debug logging must not ship to players.
  for (const f of ["llmTool.js", "llmErrors.js", "aliyunRoute.js"]) {
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

  check("groupLoader derives its prefix from BASE_URL",
    readFileSync(join(ROOT, "src/rag/groupLoader.js"), "utf8").includes("import.meta.env.BASE_URL"),
    "a hostname check cannot know the deploy path");

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
  await layerB(mod.callLLM, MODEL_CONFIGS);
  layerC();
  await layerD();
  layerE(mod);
  await layerEi18n();
  await layerF(mod, ALIYUN_FREE_ROUTE);
  await layerG(mod, MODEL_CONFIGS);
  await layerH(mod, ALIYUN_FREE_ROUTE, cfg.getAliyunModelFamily);

  console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32mALL PASS" : "\x1b[31mFAILURES"}\x1b[0m  ${pass} passed, ${fail} failed`);
  if (fail) { console.log("failed:\n  - " + failures.join("\n  - ")); process.exit(1); }
})();
