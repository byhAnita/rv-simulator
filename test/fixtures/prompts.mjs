// test/fixtures/prompts.mjs
//
// Pinned inputs for the golden system prompts, plus the code that renders them.
//
// Shared deliberately between smoke Layer J and scripts/update-golden.mjs. If
// the test and the regenerator built their prompts separately they could drift,
// and the failure mode is the worst one available: regenerating would write
// files the test can never match, and the only way out would be to stop
// believing the suite.
//
// NOT part of the app bundle. Node only.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE_DIR = join(ROOT, "test", "fixtures");

// Identity ids are the Chinese literals from App.jsx's IDENTITIES, which are
// what sits in form.identity in every save on every player's device. They are
// ids, not display text - do not "translate" them.
export const IDENTITIES = [
  "练习生", "Staff", "韩娱艺人", "粉丝", "留学生", "财阀", "主线成员前女友", "H",
];
export const LANGUAGES = ["zh", "en", "ko"];

// Three casts, three languages, three identities. Chosen for coverage of the
// branches that actually differ, not for variety:
//
//  - classic: the shape most saves are in (main + 2 subs + NPCs), zh token
//    table, an identity with no work override.
//  - nine: the largest cast in the repo, so per-member blocks are exercised at
//    scale; Staff adds the work-title override; the player's age sits inside
//    the cast's range so both seniority directions appear at once.
//  - solo: no sub members at all, so the SUB section must degrade cleanly and
//    everyone else becomes an NPC. It also pins 主线成员前女友, whose background
//    was assembled with Math.random() until v1.3.9 - a fresh roll every round,
//    which defeated the prompt cache and changed the backstory mid-game. A
//    golden file is exactly what makes that visible if it ever returns.
export const FIXTURES = [
  {
    id: "red_velvet-classic-zh",
    group: "red_velvet",
    lang: "zh",
    mainId: "irene",
    subIds: ["seulgi", "wendy"],
    model: "qwen",
    form: {
      name: "Summer", age: "28", identity: "韩娱艺人", pace: "浪漫情感向",
      mainMember: "irene", subMembers: ["seulgi", "wendy"],
    },
  },
  {
    id: "twice-nine-en",
    group: "twice",
    lang: "en",
    mainId: "nayeon",
    subIds: ["jihyo", "tzuyu"],
    model: "deepseek",
    form: {
      name: "Alex", age: "29", identity: "Staff", pace: "高压舆论向",
      mainMember: "nayeon", subMembers: ["jihyo", "tzuyu"],
    },
  },
  {
    id: "red_velvet-solo-ko",
    group: "red_velvet",
    lang: "ko",
    mainId: "joy",
    subIds: [],
    model: "gpt4omini",
    form: {
      name: "Hana", age: "30", identity: "主线成员前女友", pace: "慢热现实向",
      mainMember: "joy", subMembers: [],
    },
  },
  //
  // v1.4.1 step 7 - one fixture per new world, rotating the language, so every
  // world and every language is covered once. Six of the twelve (world, language)
  // pairs stay unpinned and that is an accepted gap, stated in test/README.md:
  // a fixture stops a defect recurring, reading is what finds it.
  //
  // Each also pins a branch the kpop fixtures cannot reach:
  //  - campus-ko:  a work title pointed AT THE CAST (junior_student). No golden
  //    has ever covered that branch - it was one hardcoded id until step 7.
  //  - office-en:  a title pointed at the player in a world that is not an
  //    agency, so `addressContext` renders something other than "on the job".
  //  - chaebol-zh: the ex-girlfriend backstory in a SECOND world, which is what
  //    makes the seeded reason/keepsake pair visible if it ever re-rolls again.
  {
    id: "campus-ko",
    group: "red_velvet",
    world: "campus",
    lang: "ko",
    mainId: "seulgi",
    subIds: ["yeri"],
    model: "qwen",
    form: {
      name: "Nari", age: "24", identity: "junior_student", pace: "浪漫情感向",
      mainMember: "seulgi", subMembers: ["yeri"],
    },
  },
  {
    id: "office-en",
    group: "twice",
    world: "office",
    lang: "en",
    mainId: "jihyo",
    subIds: ["mina", "sana"],
    model: "gemini",
    form: {
      name: "Robin", age: "34", identity: "manager_of_cast", pace: "高压舆论向",
      mainMember: "jihyo", subMembers: ["mina", "sana"],
    },
  },
  {
    id: "chaebol-zh",
    group: "aespa",
    world: "chaebol",
    lang: "zh",
    mainId: "karina",
    subIds: ["winter"],
    model: "deepseek",
    form: {
      name: "安添", age: "27", identity: "主线成员前女友", pace: "慢热现实向",
      mainMember: "karina", subMembers: ["winter"],
    },
  },
];

export const goldenPath = (id) => join(FIXTURE_DIR, `${id}.txt`);

// Load group JSON off disk the way the app loads it. Reading the file directly
// would test the formatter rather than the feature - parseGroupConfig is a
// field whitelist and has silently dropped a field before (birthday, v1.3.6),
// so anything asserting on member data goes through loadGroupConfig.
async function withDiskFetch(fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const p = join(ROOT, "public", String(url).replace(/^\//, ""));
    if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, "utf8")) };
  };
  try { return await fn(); } finally { globalThis.fetch = real; }
}

// src/ uses extensionless imports and groupLoader reads import.meta.env, which
// plain Node has neither of. esbuild bundles the graph and defines BASE_URL as
// "/", matching the paths withDiskFetch serves from.
export async function loadPromptModules(outDir) {
  const esbuild = await import("esbuild");
  const outfile = join(outDir, "goldenPrompt.mjs");
  await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/agent/mainAgent.js";',
        'export * from "./src/rag/groupLoader.js";',
        'export * from "./src/rag/worldLoader.js";',
        'export * from "./src/rag/rosterResolver.js";',
      ].join("\n"),
      resolveDir: ROOT, loader: "js",
    },
    bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent",
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  });
  return import("file://" + outfile.replace(/\\/g, "/") + "?t=" + Date.now());
}

// Renders every fixture. Returns [{ id, text }] in FIXTURES order.
export async function renderFixtures(outDir) {
  const mod = await loadPromptModules(outDir);
  const configs = new Map();
  const worlds = new Map();
  const out = [];
  // Keyed by WORLD and language, not by language alone. Two fixtures in the
  // same language but different worlds would otherwise share the first one's
  // world, and the second would silently render against the wrong setting.
  for (const f of FIXTURES) {
    const key = `${f.group}/${f.lang}`;
    if (!configs.has(key)) {
      configs.set(key, await withDiskFetch(() => mod.loadGroupConfig(f.group, f.lang)));
    }
    // Loaded through loadWorld for the same reason the cast is loaded through
    // loadGroupConfig: reading the JSON directly would test the file, not the
    // path the app actually takes.
    const worldId = f.world || "kpop_idol";
    const wkey = `${worldId}/${f.lang}`;
    if (!worlds.has(wkey)) {
      worlds.set(wkey, await withDiskFetch(() => mod.loadWorld(worldId, f.lang)));
    }
    const cfg = configs.get(key);
    const world = worlds.get(wkey);
    // Through resolveRoster, because that is what the app does and section 4 is
    // composed there. Rendering straight from the group config was byte-identical
    // for a whole single group in kpop_idol - isWholeSingleGroup keeps that
    // group's own lore verbatim - and would have been WRONG the moment a fixture
    // used a world declaring useGroupLore:false, which sends every cast down the
    // composed path. The fixture would have pinned a Red Velvet idol history
    // that the running app never produces in a lecture hall.
    const roster = mod.buildClassicRoster(
      f.group, f.mainId, f.subIds, cfg.members.map((m) => m.id));
    const cast = await withDiskFetch(() => mod.resolveRoster(roster, f.lang, world));
    out.push({
      id: f.id,
      text: mod.buildSystemPrompt(
        f.form, cast.members, f.mainId, f.subIds, cast.groupConfig, "", f.model, f.lang, world),
    });
  }
  return out;
}

// Exposed so Layer J can call buildSystemPrompt itself for the determinism
// sweep, which covers the full identity x language grid the three goldens
// cannot.
export { withDiskFetch };
