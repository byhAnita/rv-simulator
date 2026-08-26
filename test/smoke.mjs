// test/smoke.mjs
//
// Smoke test for the per-provider output-token-cap fix (commit 6814eff).
//
// NOT part of the app bundle. Lives outside src/ so Vite never sees it, and
// reads its key from process.env (Node only) — never import.meta.env. The env
// var is deliberately unprefixed so Vite cannot inline it into dist/.
//
//   node test/smoke.mjs            # offline contract + leak checks only
//   node test/smoke.mjs --live     # also hit the real provider (spends credits)
//
// Layers:
//   A  offline  request-body contract, all 4 providers x reasoning on/off
//   B  live     one real round per reasoning mode against the provider
//   C  offline  secret-leak checks (bundle, source, env hygiene)

import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test", ".out");
const LIVE = process.argv.includes("--live");

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
const API_KEY = env.YURIAGENT_API_KEY || process.env.YURIAGENT_API_KEY || "";

// .env.local's MODEL_ID comment lists model strings, but MODEL_CONFIGS is keyed
// by provider id. Accept either spelling.
const MODEL_ALIASES = {
  "deepseek-v4-flash": "deepseek", "deepseek": "deepseek",
  "gemini-3.5-flash-lite": "gemini", "gemini": "gemini",
  "gpt-5.6-luna": "gpt4omini", "gpt4omini": "gpt4omini",
  "qwen-3.8-max": "qwen", "qwen3.8-max": "qwen", "qwen": "qwen",
};
const rawModel = (env.MODEL_ID || "deepseek-v4-flash").trim();
const MODEL_ID = MODEL_ALIASES[rawModel] || rawModel;

// ------------------------------------------------------- build test bundle
// src/ uses extensionless imports, which plain Node ESM will not resolve.
// esbuild (already a Vite dep) bundles the module graph into something Node
// can import, without touching the app build.
async function buildBundle() {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, "llmTool.mjs");
  // JS API, not the .bin shim — spawning a .cmd shim fails with EINVAL on Windows.
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(ROOT, "src", "tools", "llmTool.js")],
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
  });
  return outfile;
}

// ------------------------------------------------------ fetch interception
// Captures the request body callLLM builds, then returns a canned success so
// callLLM's retry loop does not fire.
function withCapturedFetch(fn, responseContent = '{"story":"ok"}') {
  const captured = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: responseContent }, finish_reason: "stop" }] }),
    };
  };
  return fn().finally(() => { globalThis.fetch = original; });
}

const MSGS = [
  { role: "system", content: "sys" },
  { role: "user", content: "[HISTORY]\n(no history yet)" },
  { role: "user", content: "[CURRENT STATE]\nPlayer choice: A" },
];

// ============================================================ LAYER A
async function layerA(callLLM, MODEL_CONFIGS) {
  section("LAYER A — request-body contract (offline, no network)");

  // --- the core of the fix: correct field name per provider ---
  console.log("\n  reasoning OFF");
  for (const [id, expectCap, expectField] of [
    ["qwen", 65535, "max_completion_tokens"],
    ["deepseek", 8192, "max_tokens"],
    ["gpt4omini", 8192, "max_tokens"],
    ["gemini", 8192, "max_tokens"],
  ]) {
    let body;
    await withCapturedFetch(async () => {
      const cap = [];
      const orig = globalThis.fetch;
      globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
      await callLLM("", [], "", "sk-test", id, MSGS, false, null);
      globalThis.fetch = orig;
      body = cap[0];
    });
    const other = expectField === "max_tokens" ? "max_completion_tokens" : "max_tokens";
    eq(`${id}: ${expectField} = ${expectCap}`, body[expectField], expectCap);
    eq(`${id}: ${other} absent`, body[other], undefined);
    eq(`${id}: config maxOutputTokens defined`, typeof MODEL_CONFIGS[id].maxOutputTokens, "number");
  }

  // --- reasoning ON: caps must be raised, flags set ---
  console.log("\n  reasoning ON");
  const onCases = [
    ["qwen", null, { max_completion_tokens: 65535, enable_thinking: "true", preserve_thinking: "true", reasoning_effort: "medium" }],
    ["qwen", "qwen3.7-max", { max_completion_tokens: 65535, reasoning_effort: "high" }],
    ["qwen", "qwen3.7-plus", { max_completion_tokens: 65535, reasoning_effort: "high" }],
    ["deepseek", null, { max_tokens: 65536, reasoning_effort: "high" }],
    ["gemini", null, { max_tokens: 65535, reasoning_effort: "high" }],
    ["gpt4omini", null, { max_tokens: 8192, reasoning_effort: "high" }],
  ];
  for (const [id, sub, expected] of onCases) {
    const cap = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await callLLM("", [], "", "sk-test", id, MSGS, true, sub);
    globalThis.fetch = orig;
    const body = cap[0];
    const label = sub ? `${id}/${sub}` : id;
    for (const [k, v] of Object.entries(expected)) eq(`${label}: ${k} = ${JSON.stringify(v)}`, body[k], v);
  }

  // --- deepseek thinking object shape (off vs on) ---
  console.log("\n  deepseek thinking object");
  for (const [enabled, want] of [[false, "disabled"], [true, "enabled"]]) {
    const cap = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await callLLM("", [], "", "sk-test", "deepseek", MSGS, enabled, null);
    globalThis.fetch = orig;
    eq(`reasoning=${enabled}: thinking.type = ${want}`, cap[0].thinking?.type, want);
  }

  // --- qwen sub-model string resolution ---
  console.log("\n  qwen sub-model resolution");
  for (const sub of ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus"]) {
    const cap = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await callLLM("", [], "", "sk-test", "qwen", MSGS, false, sub);
    globalThis.fetch = orig;
    eq(`qwenSubModel="${sub}" -> body.model`, cap[0].model, sub);
  }
  {
    const cap = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await callLLM("", [], "", "sk-test", "qwen", MSGS, false, null);
    globalThis.fetch = orig;
    eq("qwenSubModel=null -> falls back to cfg.model", cap[0].model, MODEL_CONFIGS.qwen.model);
  }

  // --- regression guard: the pre-fix bug ---
  console.log("\n  regression guard (pre-fix behaviour must not return)");
  {
    const cap = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (u, i) => { cap.push(JSON.parse(i.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await callLLM("", [], "", "sk-test", "qwen", MSGS, false, null);
    globalThis.fetch = orig;
    check("qwen no longer sent the ignored max_tokens field", cap[0].max_tokens === undefined,
      `max_tokens=${cap[0].max_tokens} would be silently dropped by Qwen`);
    check("qwen cap is 65535, not the old hardcoded 8192", cap[0].max_completion_tokens === 65535,
      `got ${cap[0].max_completion_tokens}`);
  }

  // --- gameplay cost strings present for every selectable entry (fix #4) ---
  console.log("\n  cost strings (fix #4)");
  for (const id of Object.keys(MODEL_CONFIGS)) {
    const g = MODEL_CONFIGS[id].gameplay;
    check(`${id}: gameplay has zh/en/ko`, !!(g?.zh && g?.en && g?.ko), JSON.stringify(g));
  }
  for (const sub of MODEL_CONFIGS.qwen.subModels) {
    const g = sub.gameplay;
    check(`qwen/${sub.id}: gameplay has zh/en/ko`, !!(g?.zh && g?.en && g?.ko), JSON.stringify(g));
  }
  {
    const hrs = MODEL_CONFIGS.qwen.subModels.map(s => s.gameplay.en);
    check("qwen sub-models have distinct cost strings", new Set(hrs).size === 3, hrs.join(" / "));
    check("deepseek cost string updated off the stale 56 hrs",
      !/56\s*hrs/.test(MODEL_CONFIGS.deepseek.gameplay.en), MODEL_CONFIGS.deepseek.gameplay.en);
  }
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
      check(`${label}: request succeeded`, false, e.message);
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
        model: MODEL_ID === "qwen" ? "qwen3.8-max" : cfg.model,
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
async function layerD(ROOT_) {
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
  const tool = readFileSync(join(ROOT, "src", "tools", "llmTool.js"), "utf8");
  const activeLogs = tool.split("\n").filter(l => /^\s*console\.log\(/.test(l));
  check("no active console.log in llmTool.js", activeLogs.length === 0, activeLogs.join(" | "));
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
}

// ============================================================ main
(async () => {
  console.log("\x1b[1mSmoke test — per-provider output cap fix (6814eff)\x1b[0m");
  console.log(`mode: ${LIVE ? "OFFLINE + LIVE" : "OFFLINE only"} · provider: ${MODEL_ID} · key: ${API_KEY ? "loaded" : "absent"}`);

  let bundle;
  try { bundle = await buildBundle(); }
  catch (e) { console.error("\nesbuild bundle failed:\n", e.stderr?.toString() || e.message); process.exit(1); }

  const { callLLM } = await import("file://" + bundle.replace(/\\/g, "/"));
  const { MODEL_CONFIGS } = await import("file://" + join(ROOT, "src/config/modelConfigs.js").replace(/\\/g, "/"));

  await layerA(callLLM, MODEL_CONFIGS);
  await layerB(callLLM, MODEL_CONFIGS);
  layerC();
  await layerD();

  console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32mALL PASS" : "\x1b[31mFAILURES"}\x1b[0m  ${pass} passed, ${fail} failed`);
  if (fail) { console.log("failed:\n  - " + failures.join("\n  - ")); process.exit(1); }
})();
