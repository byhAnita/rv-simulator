// test/playthrough.mjs
//
// Live robustness harness: plays real multi-round games through executeRound,
// one playthrough per Aliyun free-route model, and grades what comes back.
//
// smoke.mjs --live-free proves each model ACCEPTS our request. This proves each
// model can actually RUN the game: valid JSON every round, the player's language,
// four options, stats in range, and a history ledger whose prefix stays
// byte-identical (the whole point of the 3-tier prompt).
//
// It also grades writing quality that only shows up in real prose, and that no
// offline check can reach (smoke Layer I covers the prompt those rules are
// written into; this covers whether the model follows them):
//   unnie-to-junior      an honorific pointed downward in age — always wrong
//   unnie-to-player      the player called unnie by a cast with no juniors
//   real-name-vocative   a member's full real name used to address someone,
//                        which is how "Irene thanks Bae Ju-hyun" happens
//   kkt-narrated-but-locked  a Kakao message in the prose that the round never
//                        delivered, i.e. the affection lock was ignored
//
// NOT part of the app bundle. Lives outside src/ so Vite never sees it, and
// reads its key from .env.local via process.env — never import.meta.env.
//
//   node test/playthrough.mjs                       # 6 models (one per family) x 6 rounds, zh
//   node test/playthrough.mjs --models all          # every model in ALIYUN_FREE_ROUTE
//   node test/playthrough.mjs --models qwen3.6-27b,glm-5.3
//   node test/playthrough.mjs --rounds 15           # long enough for 5 collapses
//   node test/playthrough.mjs --lang en             # zh | en | ko
//   node test/playthrough.mjs --group twice         # any folder in public/groups/
//   node test/playthrough.mjs --jobs 6              # parallel playthroughs
//   node test/playthrough.mjs --subs 0              # 1 main + N subs (default 1, the
//                                                   # reference setting for cost strings)
//   node test/playthrough.mjs --age 22              # pin the player's age; the default
//                                                   # puts her on the cast's median birth
//                                                   # year so both honorific directions
//                                                   # are exercised (see cast grading)
//   node test/playthrough.mjs --reasoning           # Deep Thinking on
//   node test/playthrough.mjs --route               # no pinning: walk the real route
//   node test/playthrough.mjs --identity 主线成员前女友
//                                                   # one of App.jsx's 8 IDENTITIES; the
//                                                   # default 练习生 was hardcoded for a
//                                                   # long time, which is how a bug in
//                                                   # 主线成员前女友's background block
//                                                   # survived every live run ever made
//
// Each model runs in its own child process, so the router's localStorage state
// and mainAgent's module-level social buffer cannot interleave between them.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { fork } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test", ".out");
const SELF = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------- args
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const ROUNDS = Number(arg("rounds", 6));
const LANG = arg("lang", "zh");
const GROUP = arg("group", "red_velvet");
const JOBS = Number(arg("jobs", 4));
const SUBS = Number(arg("subs", 1));
const AGE = arg("age", null) != null ? Number(arg("age", null)) : null;
// Mirrors src/config/constants.js — the worker derives the player's birth year
// from it and the grader compares birth years, so the two must agree.
const GAME_YEAR = 2026;
const REASONING = has("reasoning");
const ROUTE_MODE = has("route");
// Identity ids are the Chinese literals from App.jsx's IDENTITIES, which is what
// sits in form.identity in every save. They select a whole background block in
// buildSystemPrompt, so pinning one to 练习生 meant 7 of the 8 were never played
// live by anything.
const IDENTITY = arg("identity", "练习生");
const WORKER = arg("worker", null);

// ---------------------------------------------------------------- env
function loadEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnvLocal();
const API_KEY = env.YURIAGENT_API_KEY || env.API_KEY || process.env.YURIAGENT_API_KEY || process.env.API_KEY || "";

// ------------------------------------------------------- build test bundle
// src/ uses extensionless imports, which plain Node ESM will not resolve.
// One bundle so mainAgent, the router and memoryPool share module state.
async function buildBundle() {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, "agent.mjs");
  const esbuild = await import("esbuild");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/agent/mainAgent.js";',
        'export * from "./src/agent/memoryPool.js";',
        'export * from "./src/tools/aliyunRoute.js";',
        'export * from "./src/rag/groupLoader.js";',
        'export * from "./src/rag/worldLoader.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
    // groupLoader reads import.meta.env.BASE_URL, which Vite fills at build
    // time and Node does not have at all — without this the whole harness dies
    // on "Cannot read properties of undefined" before the first API call.
    // "/" matches the dev-server base and the /groups/ paths the fetch stub
    // below serves from disk.
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  });
  return outfile;
}

// ---------------------------------------------------------------- graders
const CJK = /[\u4e00-\u9fff]/g;
const HANGUL = /[\uac00-\ud7af\u1100-\u11ff]/g;
const ratio = (s, re) => (s.match(re) || []).length / Math.max(1, s.length);

// The story must be in the player's UI language. zh/ko are positive tests;
// en is a negative one — any CJK or Hangul in an English story is a leak.
function languageOk(story, lang) {
  if (lang === "zh") return ratio(story, CJK) > 0.25;
  if (lang === "ko") return ratio(story, HANGUL) > 0.25;
  return ratio(story, CJK) < 0.02 && ratio(story, HANGUL) < 0.02;
}

// Prose graders live in graders.mjs so smoke can unit-test them; see the
// header there. esc moved with them.
import { esc, dialogueSpans, sinicizedHonorifics, selfNameErrors, narratedHonorifics, nameYaVocative } from "./graders.mjs";
// unnie in the three scripts the game can output, with or without a separator.
// The transliterated forms only. 姐 is deliberately absent: the setting is
// Korean, so the prompt asks for 欧尼 in Chinese and treats 姐 as a defect —
// see sinicizedHonorifics below.
const UNNIE = "(unnie|언니|欧姬)";
const calledUnnie = (name) => new RegExp(`${esc(name)}\\s*[-‐-― ]?\\s*${UNNIE}`, "i");

// Korean seniority runs on birth year, and unnie only ever points upward. A
// member who is YOUNGER than the player may therefore never be called unnie by
// anyone — the one direction that is wrong regardless of who is speaking, which
// is what makes it gradeable without knowing the speaker.
//
// Members carry two names: `name` is the Latin stage name in every language,
// `name_kr` the localized real name. Both are matched. A Hangul stage name the
// model spells out phonetically ("예리") appears in no group JSON and is not
// covered — an undetected case, not a passing one.
function honorificErrors(story, cast) {
  const bad = [];
  for (const m of cast.members) {
    if (m.birthYear <= cast.playerBirthYear) continue;       // she is older or a peer
    const hit = [m.name, m.name_kr].filter(Boolean).some((n) => calledUnnie(n).test(story));
    if (hit) bad.push(`unnie-to-junior:${m.id}`);
  }
  // Nobody may call the player unnie unless someone in the cast is younger.
  if (!cast.members.some((m) => m.birthYear > cast.playerBirthYear)
      && calledUnnie(cast.playerName).test(story)) {
    bad.push("unnie-to-player");
  }
  return bad;
}

// Grades one round's parsed output. Returns the list of things that went wrong.
function gradeRound({ res, parseLevel, memberIds, lang, story, options, cast }) {
  const bad = [];
  if (parseLevel !== "direct") bad.push(`parse:${parseLevel}`);
  if (!story || story.length < 80) bad.push(`story-short:${story?.length ?? 0}`);
  if (!languageOk(story || "", lang)) bad.push("wrong-language");
  if (/<think>|<\/think>|reasoning_content/i.test(story || "")) bad.push("cot-leak");
  // The story must be prose only — the UI renders the stats box and options itself.
  if (/^[A-D]\.\s/m.test(story || "")) bad.push("options-inside-story");
  if (story?.includes("\u2554")) bad.push("stats-box-inside-story");

  if (!Array.isArray(options) || options.length !== 4) bad.push(`options:${options?.length}`);
  else if (!options.every((o, i) => typeof o === "string" && o.startsWith(`${"ABCD"[i]}.`))) bad.push("option-prefix");

  for (const k of ["selfId", "secrecy", "mood"]) {
    const v = res.newStats[k];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 100) bad.push(`stat-${k}:${v}`);
  }
  // Social content addressed to a member who is not in this game would be
  // dropped silently by executeRound; catch it here instead.
  for (const id of Object.keys(res.socialFeedsUpdate || {})) {
    if (!memberIds.includes(id)) bad.push(`social-unknown-member:${id}`);
  }

  if (cast) {
    bad.push(...honorificErrors(story || "", cast));
    bad.push(...selfNameErrors(story || "", cast));
    bad.push(...sinicizedHonorifics(story || "", cast, lang));
    bad.push(...narratedHonorifics(story || "", cast, lang));
    bad.push(...nameYaVocative(story || "", cast, lang));

    // KKT is gated on affection. A story that describes a message ARRIVING in a
    // round that delivered none is the symptom of the lock being ignored.
    // Merely naming the app is not: now that the prompt tells the model which
    // channels are shut, it legitimately writes lines like "the KKT window
    // stayed silent" — which the first version of this check flagged as a bug.
    const delivered = Object.values(res.kktUpdate || {}).some((v) => Array.isArray(v) && v.length > 0);
    if (!delivered) {
      const s = story || "";
      const word = /KakaoTalk|카카오톡|카톡|\bKKT\b/gi;
      const arrival = /收到|发来|发了|弹出|震动|提示音|响起|一条|buzz|ping|received|sent you|notification|popped|lit up|왔|보냈|울렸|알림|도착/i;
      for (const m of s.matchAll(word)) {
        if (arrival.test(s.slice(Math.max(0, m.index - 60), m.index + 60))) {
          bad.push("kkt-narrated-but-locked");
          break;
        }
      }
    }
  }
  return bad;
}

// ---------------------------------------------------------------- worker
async function runWorker(model) {
  const bundle = join(OUT, "agent.mjs");
  const mod = await import("file://" + bundle.replace(/\\/g, "/"));
  const cfgMod = await import("file://" + join(ROOT, "src/config/modelConfigs.js").replace(/\\/g, "/"));
  const { executeRound, createInitialStats, createEmptyMemory, buildHistoryLedger,
          collapseHistoryIfNeeded, loadGroupConfig, loadWorld, getNpcMembers, markModel, resetSessionSkips,
          resetFreeRoute, buildSystemPrompt } = mod;
  const { ALIYUN_FREE_ROUTE } = cfgMod;

  // --- browser globals the app modules expect
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), clear: () => store.clear(),
  };
  globalThis.window = { location: { hostname: "localhost" } };

  // Serve public/groups/*.json from disk so the real parseGroupConfig runs;
  // everything else (the API call) goes out over the network unchanged, but we
  // read finish_reason and usage off the way past. cached_tokens is the only
  // direct evidence that the 3-tier prompt is actually hitting the KV cache.
  let meta = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("/groups/")) {
      const p = join(ROOT, "public", u.replace(/^\//, ""));
      if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
      const body = readFileSync(p, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
    const resp = await realFetch(url, init);
    if (!resp.ok) return resp;
    const data = await resp.json();
    const usage = data.usage || {};
    meta = {
      finish: data.choices?.[0]?.finish_reason || null,
      prompt: usage.prompt_tokens ?? null,
      cached: usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? null,
      completion: usage.completion_tokens ?? null,
      reasoning: usage.completion_tokens_details?.reasoning_tokens ?? null,
    };
    return { ok: true, status: resp.status, json: async () => data };
  };

  // --- quiet the app's own logging, but keep the parser's verdict
  let parseLevel = "direct";
  const LEVELS = { "[parse] Direct OK": "direct", "[parse] Extract OK": "extract",
                   "[parse] Clean OK": "clean", "[parse] Regex fix OK": "regex",
                   "[parse] ALL FAILED - using fallback": "FALLBACK" };
  const realLog = console.log, realWarn = console.warn, realErr = console.error;
  const captured = [];
  console.log = (...a) => { const s = String(a[0]); if (LEVELS[s]) parseLevel = LEVELS[s]; };
  console.warn = (...a) => captured.push("warn: " + a.map(String).join(" ").slice(0, 200));
  console.error = (...a) => captured.push("error: " + a.map(String).join(" ").slice(0, 200));
  const restore = () => { console.log = realLog; console.warn = realWarn; console.error = realErr; };

  const report = { model, identity: IDENTITY, rounds: [], notes: [], collapses: 0, prefixBreaks: [], systemDrift: [] };
  try {
    const groupConfig = await loadGroupConfig(GROUP, LANG);
    const world = await loadWorld("kpop_idol", LANG);
    const members = groupConfig.members;
    const mainId = members[0].id;
    // Sub-member count changes the dynamic tail (affections, KKT, social targets)
    // and therefore the cache-miss share of every prompt. The game's minimum is
    // 1 main + 0 subs; 1 main + 1 sub is the reference setting for cost strings.
    const subIds = members.slice(1, 1 + SUBS).map(m => m.id);
    const memberIds = members.map(m => m.id);
    report.group = { id: GROUP, members: members.length, mainId, subIds };

    // The player's age is what makes honorifics gradeable. A cast that is
    // uniformly older than the player only ever exercises one direction, so by
    // default the player is born on the cast's median birth year: some members
    // are then her seniors and some her juniors, and a reversed unnie shows up.
    // --age pins it when a specific setup needs reproducing.
    // The harness always thought in birth years and only converted to an age
    // because that was the field the form had; since v1.4.0 it carries the
    // birth year straight through. `age` is still written because backstorySeed
    // hashes it (see mainAgent.js), and --age still pins the setup.
    const birthYears = members
      .map((m) => parseInt((m.birthday || "2000-01-01").split("-")[0]) || 2000)
      .sort((a, b) => a - b);
    const playerBirthYear = AGE != null
      ? GAME_YEAR - AGE
      : birthYears[Math.floor(birthYears.length / 2)];
    const age = String(GAME_YEAR - playerBirthYear);
    const playerName = LANG === "zh" ? "\u6797\u590f" : LANG === "ko" ? "\uc774\ud558\ub9b0" : "Summer";

    const form = {
      mainMember: mainId, subMembers: subIds, identity: IDENTITY, customIdentity: "",
      name: playerName,
      nationality: "KR", birthYear: String(playerBirthYear), age, nickname: "", herNickname: "",
      starLevel: "", pace: "\u6d6a\u6f2b\u60c5\u611f\u5411",
    };
    const cast = {
      playerName, playerBirthYear,
      members: members.map((m) => ({
        id: m.id, name: m.name, name_kr: m.name_kr,
        birthYear: parseInt((m.birthday || "2000-01-01").split("-")[0]) || 2000,
      })),
    };
    report.cast = { playerName, age: Number(age), playerBirthYear: cast.playerBirthYear };

    // Pin the route at one model so this playthrough grades that model only.
    // Re-pinned before every round: the router now rests a model for an hour
    // after a timeout or an unusable answer, which in real play just means the
    // next model serves — but with everything else pinned away it would end the
    // playthrough. Resetting first also clears that rest so we keep measuring
    // this model rather than stopping at its first bad round.
    // ROUTE_MODE leaves the route alone to exercise the real walk instead.
    const aimAtModel = () => {
      if (ROUTE_MODE) return;
      resetSessionSkips?.();
      resetFreeRoute?.(API_KEY);
      for (const other of ALIYUN_FREE_ROUTE) if (other !== model) markModel(API_KEY, other, "model_unavailable");
    };
    aimAtModel();

    let stats = createInitialStats(mainId, subIds);
    let memory = createEmptyMemory();
    let kktUnlocked = {};
    let prevLedger = null;
    let prevSystem = null;

    for (let round = 0; round < ROUNDS; round++) {
      // Reproduce exactly what this round will send. executeRound collapses
      // in place BEFORE building the ledger, so the ledger has to be read after
      // the same collapse — reading it before compares against a ledger that was
      // never sent, and reports a false prefix break on every post-collapse round.
      // Calling it here is safe: executeRound's own call then finds < N fulls
      // and does nothing.
      // The static system prompt is rebuilt from scratch every round and is
      // supposed to be byte-identical every time — that is what makes it 100%
      // cache hit after round 1, and it is the single largest block in the
      // request. Nothing checked it. 主线成员前女友 built its background from
      // Math.random(), so for that identity the whole ~5,500-token prefix
      // changed every round, and no test anywhere could see it: the offline
      // suite never called it twice and this harness only ever played 练习生.
      const systemSent = buildSystemPrompt(
        form, members, mainId, subIds, groupConfig, "", "qwen", LANG, world);
      if (prevSystem !== null && systemSent !== prevSystem) {
        let i = 0;
        const a = prevSystem.split("\n"), b = systemSent.split("\n");
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        report.systemDrift.push({ round, line: i + 1, was: (a[i] || "").slice(0, 80), now: (b[i] || "").slice(0, 80) });
      }
      prevSystem = systemSent;

      const fullsBefore = memory.history.filter(h => h.type === "full").length;
      collapseHistoryIfNeeded(memory);
      const collapsedNow = memory.history.filter(h => h.type === "full").length < fullsBefore;
      const ledgerSent = buildHistoryLedger(memory);
      const choice = "ABCD"[round % 4];
      aimAtModel();   // the router may have rested this model after a bad round
      const t0 = Date.now();
      let res, lastErr = null, bestErr = null;
      // A real player retries a transient failure; only a kind that means "this
      // model cannot serve this key" ends the playthrough. Without this split,
      // throttling caused by THIS harness's own parallelism reads as a defect
      // in the model under test.
      for (let attempt = 0; attempt < 3; attempt++) {
        parseLevel = "direct";
        try {
          res = await executeRound({
            playerChoice: `${choice}. option ${choice}`, stats, memory, form, members,
            mainId, subIds, groupConfig, world, apiKey: API_KEY, selectedModel: "qwen",
            kktUnlocked, language: LANG, reasoningEnabled: REASONING,
            aliyun: { mode: "free" }, timeSpeed: "default",
          });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          // Keep the most informative error across attempts, not the last one.
          // With a model pinned, attempt 0 walks the route, marks the pinned
          // model and throws free_all_exhausted carrying .cause = why it was
          // skipped. Every retry then finds zero candidates, so the walk body
          // never runs, lastSkip stays null, and the throw is a bare "all models
          // are exhausted or unavailable" — the retry destroys the diagnosis.
          // That reads identically whether the model is out of free credits or
          // rejecting our parameters, which is the exact confusion .cause exists
          // to prevent.
          if (!bestErr || (!bestErr.cause && e.cause)) bestErr = e;
          const transient = ["rate_limit", "server_busy", "network", "timeout", "free_all_exhausted"].includes(e.kind);
          // free_all_exhausted here means the pinned model was rate-limited and
          // the route had no one else to fall back to — still transient.
          if (!transient || attempt === 2) break;
          report.transient = (report.transient || 0) + 1;
          await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
        }
      }
      if (lastErr) {
        // With one model pinned, free_all_exhausted just means that model was
        // skipped; .cause carries the kind that actually caused the skip.
        const carrier = bestErr || lastErr;
        const real = carrier.kind === "free_all_exhausted" && carrier.cause ? carrier.cause : carrier;
        const rec = { round, ms: Date.now() - t0, error: real.kind || "unknown", detail: `${real.code || ""} ${real.message || ""}`.trim().slice(0, 120) };
        report.rounds.push(rec);
        if (process.send) process.send({ tick: { model, round, ms: rec.ms, bad: 0, error: rec.error } });
        break;
      }
      const ms = Date.now() - t0;

      // A collapse rewrites the ledger's opening entries on purpose; every other
      // round must extend the previous ledger without touching a byte of it.
      if (collapsedNow) report.collapses++;
      if (prevLedger !== null && !collapsedNow && !ledgerSent.startsWith(prevLedger)) {
        report.prefixBreaks.push(round);
      }
      prevLedger = ledgerSent;

      const story = res.storyContent;
      const bad = gradeRound({ res, parseLevel, memberIds, lang: LANG, story, options: res.options, cast });
      report.rounds.push({
        round, ms, parseLevel, chars: story.length,
        summary: (res.updatedMemory.history.at(-1)?.summary || "").length,
        options: res.options.length, social: Object.keys(res.socialFeedsUpdate || {}).length,
        kkt: Object.keys(res.kktUpdate || {}).length, bad,
        ...(meta || {}),
        // Keep the evidence for anything that graded badly, so a short or
        // off-language story can be read back without re-running the model.
        // Full text, not a 400-char head: a grader can fire past the truncation
        // point, and then the report cannot be used to judge the flag.
        ...(bad.length ? { storyText: story, optionsText: res.options } : {}),
        // Graders only ever report what went wrong, which cannot show that a
        // positive instruction was followed — "0 issues" reads the same whether
        // the model used 欧尼 or avoided honorifics altogether. Keep one sample
        // per model so the prose can be read back.
        ...(round === 0 ? { sampleText: story.slice(0, 700) } : {}),
      });

      stats = res.newStats; memory = res.updatedMemory; kktUnlocked = res.newKktUnlocked;
      if (process.send) process.send({ tick: { model, round, ms, bad: bad.length } });
    }

    // History is append-only; entries may change type but never disappear.
    const rounds = memory.history.map(h => h.round);
    if (rounds.some((r, i) => i > 0 && r <= rounds[i - 1])) report.notes.push("history out of order");
    report.finalStats = { selfId: stats.selfId, secrecy: stats.secrecy, mood: stats.mood, week: stats.week, affection: stats.affection };
    report.historyLen = memory.history.length;
  } catch (e) {
    report.fatal = `${e.name}: ${e.message}`;
  }
  restore();
  report.captured = captured.slice(0, 12);
  process.stdout.write("###RESULT###" + JSON.stringify(report) + "\n");
}

// ---------------------------------------------------------------- parent
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };

async function runParent() {
  if (!API_KEY) { console.error("No API_KEY in .env.local"); process.exit(1); }
  if (!API_KEY.startsWith("sk-ws-")) console.log(`${C.y}warning${C.x} key is not an sk-ws- general key; free mode may not work`);

  const cfgMod = await import("file://" + join(ROOT, "src/config/modelConfigs.js").replace(/\\/g, "/"));
  const { ALIYUN_FREE_ROUTE, getAliyunModelFamily } = cfgMod;

  const modelsArg = arg("models", "sample");
  let models;
  if (ROUTE_MODE) models = ["(route)"];
  else if (modelsArg === "all") models = [...ALIYUN_FREE_ROUTE];
  else if (modelsArg === "sample") {
    // One model per family: the widest parameter coverage for the fewest calls.
    const seen = new Set();
    models = ALIYUN_FREE_ROUTE.filter(m => {
      const f = getAliyunModelFamily(m);
      return seen.has(f) ? false : (seen.add(f), true);
    });
  } else models = modelsArg.split(",").map(s => s.trim()).filter(Boolean);

  console.log(`${C.b}Playthrough harness${C.x} — ${models.length} model(s) x ${ROUNDS} rounds · ${GROUP} · lang ${LANG} · thinking ${REASONING ? "ON" : "off"} · jobs ${JOBS}`);
  console.log(`${C.d}building bundle…${C.x}`);
  await buildBundle();

  const results = [];
  const queue = [...models];
  const started = Date.now();

  async function worker(slot) {
    // Stagger the opening burst: 6 workers starting the same instant is what
    // trips the account's shared request-rate limit, not the game's own load.
    await new Promise(r => setTimeout(r, slot * 3000));
    while (queue.length) {
      const model = queue.shift();
      const res = await new Promise((done) => {
        const child = fork(SELF, [...process.argv.slice(2), "--worker", model], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
        let buf = "";
        child.stdout.on("data", (d) => { buf += d.toString(); });
        child.stderr.on("data", (d) => { buf += d.toString(); });
        child.on("message", (m) => {
          if (!m.tick) return;
          const { model: mm, round, ms, bad, error } = m.tick;
          const mark = error ? C.r + "!" : bad ? C.y + "x" : C.g + ".";
          const note = error ? `  ${C.r}${error} — playthrough ended${C.x}` : bad ? `  ${C.y}${bad} issue(s)${C.x}` : "";
          console.log(`  ${mark}${C.x} ${mm.padEnd(26)} r${String(round).padStart(2)}  ${String(ms).padStart(6)}ms${note}`);
        });
        child.on("exit", () => {
          const i = buf.indexOf("###RESULT###");
          if (i === -1) return done({ model, fatal: "worker produced no result", raw: buf.slice(-500) });
          try { done(JSON.parse(buf.slice(i + 12))); }
          catch (e) { done({ model, fatal: "unparseable worker result: " + e.message }); }
        });
      });
      results.push(res);
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, models.length) }, (_, i) => worker(i)));

  // ---------------------------------------------------------- report
  console.log(`\n${C.b}RESULTS${C.x}  (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
  const head = "model".padEnd(26) + "ok/rounds  med_ms  direct  chars  cache%  retry  issues";
  console.log(C.d + head + C.x);

  let totalRounds = 0, totalBad = 0, hardFails = 0;
  const issueTally = {};
  results.sort((a, b) => models.indexOf(a.model) - models.indexOf(b.model));
  for (const r of results) {
    if (r.fatal) { console.log(`${C.r}${r.model.padEnd(26)}FATAL ${r.fatal}${C.x}`); hardFails++; continue; }
    const done = r.rounds.filter(x => !x.error);
    const errored = r.rounds.filter(x => x.error);
    const clean = done.filter(x => x.bad.length === 0);
    const med = done.length ? [...done.map(x => x.ms)].sort((a, b) => a - b)[Math.floor(done.length / 2)] : 0;
    const direct = done.filter(x => x.parseLevel === "direct").length;
    const chars = done.length ? Math.round(done.reduce((s, x) => s + x.chars, 0) / done.length) : 0;
    // Steady-state cache rate: round 0 has nothing to hit, so it is excluded.
    const cacheRounds = done.filter(x => x.round > 0 && x.prompt);
    const cachePct = cacheRounds.length
      ? (100 * cacheRounds.reduce((s, x) => s + (x.cached || 0), 0) / cacheRounds.reduce((s, x) => s + x.prompt, 0)).toFixed(1)
      : "-";
    r.cachePct = cachePct;
    const truncated = done.filter(x => x.finish && x.finish !== "stop").length;
    if (truncated) issueTally[`finish:length`] = (issueTally["finish:length"] || 0) + truncated;
    totalRounds += done.length; totalBad += done.length - clean.length;
    for (const x of done) for (const b of x.bad) issueTally[b.split(":")[0]] = (issueTally[b.split(":")[0]] || 0) + 1;
    for (const x of errored) issueTally[`API:${x.error}`] = (issueTally[`API:${x.error}`] || 0) + 1;

    const allClean = clean.length === done.length && done.length === ROUNDS && !r.prefixBreaks.length
      && !(r.systemDrift?.length) && !r.notes.length;
    const colour = allClean ? C.g : clean.length === 0 ? C.r : C.y;
    const issues = [
      ...(r.prefixBreaks.length ? [`${C.r}prefix-break@${r.prefixBreaks.join(",")}${C.x}`] : []),
      ...(r.systemDrift?.length ? [`${C.r}system-drift@${r.systemDrift.map(d => d.round).join(",")}${C.x}`] : []),
      ...r.notes,
      ...errored.map(x => `${C.r}${x.error}${C.x}`),
      ...[...new Set(done.flatMap(x => x.bad))].slice(0, 4),
    ].join(" ");
    console.log(`${colour}${r.model.padEnd(26)}${C.x}${String(clean.length).padStart(2)}/${String(done.length).padEnd(8)}` +
      `${String(med).padStart(6)}  ${String(direct).padStart(6)}  ${String(chars).padStart(5)}  ${String(cachePct).padStart(6)}  ${String(r.transient || 0).padStart(5)}  ${issues}`);
  }

  console.log(`\n${totalRounds} rounds played · ${totalRounds - totalBad} clean · ${totalBad} with issues · ${hardFails} fatal`);
  if (Object.keys(issueTally).length) {
    console.log("\nissue tally:");
    for (const [k, v] of Object.entries(issueTally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  const collapses = results.reduce((s, r) => s + (r.collapses || 0), 0);
  const breaks = results.reduce((s, r) => s + (r.prefixBreaks?.length || 0), 0);
  const rates = results.map(r => Number(r.cachePct)).filter(n => !Number.isNaN(n));
  if (rates.length) {
    console.log(`\nmeasured prompt-cache hit rate (round 1+): ` +
      `min ${Math.min(...rates).toFixed(1)}% · median ${rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)].toFixed(1)}% · max ${Math.max(...rates).toFixed(1)}%`);
  }
  console.log(`\ncache invariant: ${collapses} collapses, ${breaks} prefix breaks ` +
    `${breaks === 0 ? C.g + "(ledger prefix stable outside collapses)" + C.x : C.r + "(BROKEN \u2014 cache hit rate would drop)" + C.x}`);

  // The ledger is only the second-largest cacheable block. The static system
  // prompt is bigger and is supposed to never change at all, so it gets its own
  // line rather than being folded into the ledger's.
  const drifts = results.reduce((s, r) => s + (r.systemDrift?.length || 0), 0);
  console.log(`static system prompt: ${drifts} drifts across ${totalRounds} rounds ` +
    `${drifts === 0 ? C.g + "(byte-identical every round \u2014 100% cacheable)" + C.x
      : C.r + "(BROKEN \u2014 the whole ~5,500-token prefix misses every round)" + C.x}`);
  if (drifts) {
    for (const r of results) for (const d of (r.systemDrift || []).slice(0, 3)) {
      console.log(`  ${C.d}${r.model} r${d.round} line ${d.line}: ${JSON.stringify(d.was)} -> ${JSON.stringify(d.now)}${C.x}`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `playthrough-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify({ config: { models, ROUNDS, LANG, GROUP, IDENTITY, SUBS, REASONING, ROUTE_MODE }, results }, null, 2));
  console.log(`${C.d}full report: ${path.replace(ROOT, ".")}${C.x}`);

  process.exit(hardFails || breaks ? 1 : 0);
}

if (WORKER) await runWorker(WORKER);
else await runParent();
