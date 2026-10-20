#!/usr/bin/env node
// Yuhan's review of every Chinese string the app ships as data.
//
// CLAUDE.md's rule is that no agent adds Chinese prose to a world, group or register
// file without Yuhan's review. This script makes that rule mechanical:
//
//   - every Chinese string in the data is collected (derived, never listed by hand);
//   - docs/zh-review/ledger.json records the content hash of each string as she last
//     saw it, and whether she approved it or it is still pending;
//   - smoke fails when a string's hash is not the one the ledger holds, so text an agent
//     wrote or changed cannot reach a release unreviewed;
//   - she edits a Markdown sheet per data file, ticks a box, and `sync` writes the
//     ticked text back into public/ and its root mirror. An unticked edit is a draft and
//     touches nothing.
//
//   node scripts/zh-review.mjs init     # once: baseline every current string as pending
//   node scripts/zh-review.mjs sync     # apply ticked blocks, refresh every sheet
//   node scripts/zh-review.mjs sync --dry
//   node scripts/zh-review.mjs status   # what is pending, changed, drafted, owed
//   node scripts/zh-review.mjs settle <key> <en|ko>   # an owed translation was checked
//                                       # and needs no change (touches only `owed`)
//
// docs/ZH_REVIEW.md is the workflow; this file is the machinery.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REVIEW_DIR = join(ROOT, "docs", "zh-review");
export const LEDGER_PATH = join(REVIEW_DIR, "ledger.json");

const CJK = /[\u3400-\u9fff]/;
// Facts and stored values, not prose: an id lives in every save and can never change,
// and a member's name (with its family_name / given_name overrides) or birthplace is a fact about a real person, not a register.
const SKIP_KEY = [
  /(^|\.)id$/,
  /^members\[[^\]]+\]\.(name|name_kr|family_name|given_name|birthplace)$/,
  /^group\.(name|fandom|debut)$/,
  /\.tokens\./,
];
// _template is an authoring scaffold that no player is ever served.
const SKIP_DIR = new Set(["_template"]);

export const hashText = (s) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);

// Every zh.json under public/worlds and public/groups, as `<tree>/<id>`.
export function zhSources() {
  const out = [];
  for (const tree of ["worlds", "groups"]) {
    const dir = join(ROOT, "public", tree);
    for (const id of readdirSync(dir).sort()) {
      if (SKIP_DIR.has(id)) continue;
      const p = join(dir, id, "zh.json");
      if (existsSync(p)) out.push({ source: `${tree}/${id}`, rel: `public/${tree}/${id}/zh.json`, mirror: `${tree}/${id}/zh.json` });
    }
  }
  return out;
}

// Array elements are addressed by their `id` where they have one, so a key survives a
// reorder; otherwise by index.
function walk(v, path, visit) {
  if (typeof v === "string") return visit(path, v);
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      const sel = x && typeof x === "object" && !Array.isArray(x) && typeof x.id === "string" ? x.id : String(i);
      walk(x, `${path}[${sel}]`, visit);
    });
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, visit);
  }
}

// [{key, source, path, text, hash}] in document order.
export function collectZh() {
  const out = [];
  for (const s of zhSources()) {
    const json = JSON.parse(readFileSync(join(ROOT, s.rel), "utf8"));
    walk(json, "", (path, text) => {
      if (!CJK.test(text) || SKIP_KEY.some((re) => re.test(path))) return;
      out.push({ key: `${s.source}#${path}`, source: s.source, path, text, hash: hashText(text) });
    });
  }
  return out;
}

// Resolve a key path against a parsed document (used for the en/ko counterpart).
export function resolvePath(json, path) {
  let cur = json;
  for (const part of path.match(/[^.[\]]+|\[[^\]]*\]/g) || []) {
    if (cur == null) return undefined;
    if (part.startsWith("[")) {
      const sel = part.slice(1, -1);
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((x) => x && typeof x === "object" && x.id === sel) ?? (/^\d+$/.test(sel) ? cur[Number(sel)] : undefined);
    } else cur = cur[part];
  }
  return cur;
}

export function loadLedger() {
  return existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")) : null;
}
function saveLedger(ledger) {
  const sorted = Object.fromEntries(Object.keys(ledger).sort().map((k) => [k, ledger[k]]));
  writeFileSync(LEDGER_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

// One string's review state against the ledger.
export function stateOf(entry, ledger) {
  const l = ledger?.[entry.key];
  if (!l) return "new";
  if (l.hash !== entry.hash) return "changed";
  return l.status; // "approved" | "pending"
}

// ------------------------------------------------------------------ writing back
// The data files are hand-formatted and do not round-trip through JSON.stringify, so a
// change is a surgical replacement of one `"key": "<old>"` occurrence.
//
// Short values repeat (two members whose animal is the same word), so the occurrence is
// chosen by ORDINAL: the n-th entry with this key and this text is the n-th match in the
// file, because JSON.parse keeps document order. That only holds when every match in the
// file is one of those entries, so a count that disagrees is refused, not guessed at.
const needleOf = (lastKey, text) =>
  /^\d+$/.test(lastKey) ? JSON.stringify(text) : `${JSON.stringify(lastKey)}: ${JSON.stringify(text)}`;

export function locate(raw, entry, siblings) {
  const k = lastKeyOf(entry.path);
  const same = siblings.filter((e) => e.source === entry.source && lastKeyOf(e.path) === k && e.text === entry.text);
  const ordinal = same.findIndex((e) => e.key === entry.key);
  const needle = needleOf(k, entry.text);
  const at = [];
  for (let i = raw.indexOf(needle); i >= 0; i = raw.indexOf(needle, i + 1)) at.push(i);
  if (ordinal < 0 || at.length !== same.length) return { ok: false, hits: at.length, expected: same.length };
  return { ok: true, at: at[ordinal], needle };
}

export function replaceInRaw(raw, entry, siblings, newText) {
  const loc = locate(raw, entry, siblings);
  if (!loc.ok) return loc;
  const out = raw.slice(0, loc.at) + needleOf(lastKeyOf(entry.path), newText) + raw.slice(loc.at + loc.needle.length);
  return { ok: true, raw: out };
}
export const lastKeyOf = (path) => {
  const m = path.match(/(?:\.([^.[\]]+)|\[([^\]]+)\])$/);
  return m ? (m[1] ?? m[2]) : path;
};

// ------------------------------------------------------------------ provenance
const trailerCache = new Map();
function commitInfo(sha) {
  if (/^0+$/.test(sha)) return "uncommitted";
  if (!trailerCache.has(sha)) {
    const out = execFileSync("git", ["show", "-s", "--format=%h %ad%n%(trailers:key=Co-Authored-By,valueonly)", "--date=short", sha], { cwd: ROOT, encoding: "utf8" });
    const [head, ...rest] = out.split("\n");
    trailerCache.set(sha, `${/claude/i.test(rest.join(" ")) ? "Claude" : "no co-author line"} ${head}`);
  }
  return trailerCache.get(sha);
}
// line number -> "who, commit, date". It is LINE-level: a string that shares a line
// with your own edit reports your commit.
function blameLines(rel) {
  try {
    const out = execFileSync("git", ["blame", "--line-porcelain", "--", rel], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
    const lines = [];
    let sha = null;
    for (const l of out.split("\n")) {
      const m = l.match(/^([0-9a-f]{40}) \d+ (\d+)/);
      if (m) { sha = m[1]; lines[Number(m[2])] = sha; }
    }
    return lines;
  } catch { return []; }
}
function originOf(raw, blame, entry, siblings) {
  const loc = locate(raw, entry, siblings);
  if (!loc.ok) return "unknown";
  const line = raw.slice(0, loc.at).split("\n").length;
  return blame[line] ? commitInfo(blame[line]) : "unknown";
}

// ------------------------------------------------------------------ sheets
const sheetPath = (source) => join(REVIEW_DIR, `${source.replace("/", "-")}.md`);
const FENCE = "~~~~";

function renderSheet(source, entries, ledger, drafts, origins) {
  const rows = [
    `# ${source} (zh)`,
    "",
    "Edit the text between the `~~~~` lines. Tick `[x]` to approve the text as it stands",
    "after your edit; an unticked edit is kept as a draft and changes nothing.",
    "Then run `node scripts/zh-review.mjs sync`. See docs/ZH_REVIEW.md.",
    "Generated: do not edit the `<!-- zh-review ... -->` lines.",
    "",
  ];
  for (const e of entries) {
    const st = stateOf(e, ledger);
    const draft = drafts.get(e.key);
    const shown = draft && draft.base === e.hash ? draft : null;
    const label = { approved: "approved", pending: "pending", changed: "CHANGED SINCE YOUR LAST REVIEW", new: "NEW - never reviewed" }[st];
    rows.push(`### ${e.path}`);
    rows.push(`<!-- zh-review key=${JSON.stringify(e.key)} base="${e.hash}" -->`);
    rows.push(`- [${st === "approved" && !shown ? "x" : " "}] ${label}${shown ? (shown.conflict ? " - CONFLICT: the data changed under this draft, compare and re-tick" : " - DRAFT (not applied)") : ""} - ${origins.get(e.key) || "unknown"}`);
    rows.push(FENCE);
    rows.push(shown ? shown.text : e.text);
    rows.push(FENCE);
    rows.push("");
  }
  return rows.join("\n");
}

// [{key, base, ticked, text}] from a sheet on disk.
export function parseSheet(md) {
  const blocks = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^<!-- zh-review key=("(?:[^"\\]|\\.)*") base="([0-9a-f]+)" -->$/);
    if (!m) continue;
    // "[]" reads as unticked: an easy typo for "[ ]", and refusing it would block the whole sheet.
    const box = lines[i + 1]?.match(/^- \[([ xX]?)\]/);
    if (!box || lines[i + 2] !== FENCE) throw new Error(`sheet block for ${m[1]} is malformed near line ${i + 1}`);
    let j = i + 3;
    while (j < lines.length && lines[j] !== FENCE) j++;
    if (j >= lines.length) throw new Error(`sheet block for ${m[1]} has no closing ${FENCE}`);
    blocks.push({ key: JSON.parse(m[1]), base: m[2], ticked: box[1] === "x" || box[1] === "X", text: lines.slice(i + 3, j).join("\n") });
    i = j;
  }
  return blocks;
}

// ------------------------------------------------------------------ commands
function init() {
  if (loadLedger()) { console.error("ledger already exists; init runs once. Use sync."); process.exit(1); }
  mkdirSync(REVIEW_DIR, { recursive: true });
  const ledger = {};
  for (const e of collectZh()) ledger[e.key] = { hash: e.hash, status: "pending" };
  saveLedger(ledger);
  console.log(`baselined ${Object.keys(ledger).length} strings as pending`);
  sync({ dry: false });
}

function sync({ dry }) {
  const ledger = loadLedger();
  if (!ledger) { console.error("no ledger; run init first"); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  let applied = 0, approved = 0, conflicts = 0, refused = 0;
  const drafts = new Map();

  for (const s of zhSources()) {
    const sp = sheetPath(s.source);
    if (!existsSync(sp)) continue;
    const current = new Map(collectZh().filter((e) => e.source === s.source).map((e) => [e.key, e]));
    let raw = readFileSync(join(ROOT, s.rel), "utf8");
    let mirror = readFileSync(join(ROOT, s.mirror), "utf8");
    const enRaw = existsSync(join(ROOT, s.rel.replace("zh.json", "en.json"))) ? JSON.parse(readFileSync(join(ROOT, s.rel.replace("zh.json", "en.json")), "utf8")) : null;
    const koRaw = existsSync(join(ROOT, s.rel.replace("zh.json", "ko.json"))) ? JSON.parse(readFileSync(join(ROOT, s.rel.replace("zh.json", "ko.json")), "utf8")) : null;

    for (const b of parseSheet(readFileSync(sp, "utf8"))) {
      const e = current.get(b.key);
      if (!e) continue; // the string was deleted from the data; the refresh drops it
      if (b.base !== e.hash) {
        // The data moved after this sheet was generated. Applying would overwrite it.
        // Her text is kept as a flagged draft over the new data rather than dropped by the
        // refresh: she re-reads the block and ticks it again.
        conflicts++;
        console.log(`CONFLICT ${b.key}: the data changed after this sheet was written; your block was not applied`);
        if (b.text !== e.text) drafts.set(b.key, { base: e.hash, text: b.text, conflict: true });
        continue;
      }
      const edited = b.text !== e.text;
      if (!b.ticked) {
        if (edited) drafts.set(b.key, { base: b.base, text: b.text });
        continue;
      }
      // `{name}`, `{org}` and the like are filled in by code. One lost or invented in an
      // edit renders as a literal brace in every prompt, so WHICH ones appear must not
      // move. How often is hers: a rewrite may say {name} once fewer.
      const holes = (t) => [...new Set(t.match(/\{[A-Za-z_]+\}/g) || [])].sort().join(" ");
      if (edited && holes(b.text) !== holes(e.text)) {
        refused++;
        console.log(`REFUSED ${b.key}: placeholders changed from [${holes(e.text)}] to [${holes(b.text)}]; keep them exactly`);
        drafts.set(b.key, { base: b.base, text: b.text });
        continue;
      }
      if (edited) {
        // Located against the file as it stands NOW: `current` is updated after each
        // write, so an earlier edit in this sync cannot shift which occurrence is meant.
        const siblings = [...current.values()];
        const a = replaceInRaw(raw, e, siblings, b.text);
        const m = replaceInRaw(mirror, e, siblings, b.text);
        if (!a.ok || !m.ok) {
          refused++;
          console.log(`REFUSED ${b.key}: found ${a.hits ?? m.hits} matches for ${a.expected ?? m.expected} entries, so it cannot be located safely. Edit the JSON by hand.`);
          drafts.set(b.key, { base: b.base, text: b.text });
          continue;
        }
        raw = a.raw; mirror = m.raw; applied++;
        current.set(e.key, { ...e, text: b.text, hash: hashText(b.text) });
        console.log(`applied  ${b.key}`);
      }
      const prev = ledger[b.key];
      const entry = { hash: hashText(b.text), status: "approved", approved: today };
      // A changed zh line leaves its en/ko counterparts translating the old one. Record
      // their hashes now; they are owed until either one changes.
      if (edited || prev?.owed) {
        const owed = prev?.owed ? { ...prev.owed } : {};
        if (edited) {
          const en = enRaw && resolvePath(enRaw, e.path);
          const ko = koRaw && resolvePath(koRaw, e.path);
          if (typeof en === "string") owed.en = hashText(en);
          if (typeof ko === "string") owed.ko = hashText(ko);
        }
        if (Object.keys(owed).length) entry.owed = owed;
      }
      ledger[b.key] = entry; approved++;
    }
    if (!dry) {
      writeFileSync(join(ROOT, s.rel), raw);
      writeFileSync(join(ROOT, s.mirror), mirror);
    }
  }

  // Deleted strings leave the ledger. A string an agent CHANGED is never re-baselined
  // here: only a ticked block moves its hash, so smoke stays red until she has read it.
  const live = new Set(collectZh().map((e) => e.key));
  if (!dry) for (const k of Object.keys(ledger)) if (!live.has(k)) delete ledger[k];

  if (dry) {
    console.log(`\n--dry: would apply ${applied}, approve ${approved}; ${conflicts} conflicts, ${refused} refused, ${drafts.size} drafts`);
    return;
  }
  saveLedger(ledger);
  writeSheets(ledger, drafts);
  console.log(`\napplied ${applied} edits, approved ${approved}; ${conflicts} conflicts, ${refused} refused, ${drafts.size} drafts kept`);
  if (applied) console.log("zh data changed: run `node scripts/update-golden.mjs`, READ the diff, then `node test/smoke.mjs`.");
}

function writeSheets(ledger, drafts) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const all = collectZh();
  for (const s of zhSources()) {
    const entries = all.filter((e) => e.source === s.source);
    if (!entries.length) continue;
    const raw = readFileSync(join(ROOT, s.rel), "utf8");
    const blame = blameLines(s.rel);
    const origins = new Map(entries.map((e) => [e.key, originOf(raw, blame, e, entries)]));
    writeFileSync(sheetPath(s.source), renderSheet(s.source, entries, ledger, drafts, origins));
  }
}

function status() {
  const ledger = loadLedger();
  if (!ledger) { console.log("no ledger yet; run init"); return; }
  const all = collectZh();
  const by = new Map();
  for (const e of all) {
    const r = by.get(e.source) || { approved: 0, pending: 0, changed: 0, new: 0, chars: 0, pendingChars: 0 };
    const st = stateOf(e, ledger);
    r[st]++; r.chars += e.text.length;
    if (st !== "approved") r.pendingChars += e.text.length;
    by.set(e.source, r);
  }
  console.log("source                 approved pending changed new   chars left");
  for (const [s, r] of by) console.log(`${s.padEnd(22)} ${String(r.approved).padStart(8)} ${String(r.pending).padStart(7)} ${String(r.changed).padStart(7)} ${String(r.new).padStart(3)}   ${String(r.pendingChars).padStart(5)}`);

  let drafts = 0;
  for (const s of zhSources()) {
    const sp = sheetPath(s.source);
    if (!existsSync(sp)) continue;
    const cur = new Map(all.map((e) => [e.key, e]));
    for (const b of parseSheet(readFileSync(sp, "utf8"))) if (!b.ticked && cur.get(b.key) && b.text !== cur.get(b.key).text) drafts++;
  }
  console.log(`\ndrafts in sheets (unticked edits): ${drafts}`);

  // A translation is owed while its en/ko text is still the one recorded at approval.
  const owed = [];
  for (const [key, l] of Object.entries(ledger)) {
    if (!l.owed) continue;
    const [source, path] = key.split("#");
    for (const lang of Object.keys(l.owed)) {
      const p = join(ROOT, "public", source, `${lang}.json`);
      const v = existsSync(p) ? resolvePath(JSON.parse(readFileSync(p, "utf8")), path) : undefined;
      if (typeof v === "string" && hashText(v) === l.owed[lang]) owed.push(`${lang}  ${key}`);
    }
  }
  console.log(`translations owed after your zh edits: ${owed.length}`);
  for (const o of owed) console.log(`  ${o}`);
}

// A translation can already say what the edited zh now says (a reworded Chinese name whose
// English was always right). Editing it to clear the flag would be churn, and hand-editing
// the ledger is what this script exists to prevent - so this drops one owed entry, and only
// while the counterpart is still the exact text recorded as owed. It never touches a zh
// hash or an approval, so it cannot launder Chinese text.
// Pure: returns {ok, ledger} with a copy, or {ok:false, reason}. `current` is the
// counterpart's text as it is on disk now.
export function settleOwed(ledger, key, lang, current) {
  const l = ledger?.[key];
  if (!l?.owed?.[lang]) return { ok: false, reason: `nothing owed for ${lang} ${key}` };
  if (typeof current !== "string" || hashText(current) !== l.owed[lang]) {
    return { ok: false, reason: `${lang} ${key} has changed since it was owed; it is no longer listed, nothing to settle` };
  }
  const owed = { ...l.owed };
  delete owed[lang];
  const entry = { ...l };
  if (Object.keys(owed).length) entry.owed = owed; else delete entry.owed;
  return { ok: true, ledger: { ...ledger, [key]: entry } };
}

function settle(key, lang) {
  const [source, path] = String(key).split("#");
  const [tree, id] = source.split("/");
  const doc = JSON.parse(readFileSync(join(ROOT, "public", tree, id, `${lang}.json`), "utf8"));
  const r = settleOwed(loadLedger(), key, lang, resolvePath(doc, path));
  if (!r.ok) { console.error(r.reason); process.exit(1); }
  saveLedger(r.ledger);
  console.log(`settled  ${lang} ${key}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd] = process.argv.slice(2);
  const dry = process.argv.includes("--dry");
  if (cmd === "init") init();
  else if (cmd === "sync") sync({ dry });
  else if (cmd === "status") status();
  else if (cmd === "settle") settle(process.argv[3], process.argv[4]);
  else { console.log("usage: node scripts/zh-review.mjs init|sync [--dry]|status|settle <key> <en|ko>"); process.exit(1); }
}
