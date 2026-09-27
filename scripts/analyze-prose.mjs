// scripts/analyze-prose.mjs
//
// Reads the transcripts `test/playthrough.mjs` now stores for every round and
// measures WRITING QUALITY — the half of the game that no grader can reach.
//
// A grader answers "did the model break a rule". It fires on a wrong honorific,
// a phantom Kakao, a leaked agency name. Every one of those is a defect with a
// yes/no answer, and after a few releases they nearly all come back clean. What
// stays invisible is everything with no wrong answer:
//
//   - Did any of it repeat? A model that opens four rounds on the same sensory
//     image breaks no rule and is tedious to read.
//   - Did the sub members get the scenes section 3 promises them ("meaningful
//     scenes every 2-3 rounds", "no romanceable member disappears for more than
//     3 rounds")? That is a stated rule with no detector.
//   - Are the four options actually four choices, or "continue / change the
//     subject / say nothing" with a coat of paint?
//   - Do the Korean address forms appear at all? CLAUDE.md wants them "frequent
//     enough to feel Korean"; zero over 20 rounds means the table is inert, and
//     a grader that only catches 姐 reports that as success.
//   - Does affection pace the way the game intends, or does the model push +8
//     every round and cross seven stages in thirteen?
//
// This prints numbers, not verdicts. Reading them is the point: there is no
// threshold at which "the writing is fine", and a metric that failed a build
// would get tuned away the first time it was inconvenient.
//
//   node scripts/analyze-prose.mjs                     # the newest report
//   node scripts/analyze-prose.mjs test/.out/playthrough-*.json
//   node scripts/analyze-prose.mjs --full              # print every repeated line
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test", ".out");
const FULL = process.argv.includes("--full");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", x: "\x1b[0m" };

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reports = files.length ? files : [newestReport()];

function newestReport() {
  const names = readdirSync(OUT).filter((n) => /^playthrough-\d+\.json$/.test(n)).sort();
  if (!names.length) throw new Error("no playthrough report in test/.out — run the harness first");
  return join(OUT, names.at(-1));
}

// ---------------------------------------------------------------- helpers

// Sentence split that works for all three languages: CJK full stops and
// quotation marks as well as Latin ones. Short fragments are dropped — a
// two-character line repeating is not a repetition finding.
const sentences = (text) =>
  text.split(/[。！？…\n]+|(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 8);

// Prose length in the unit the prompt asks for. For zh and ko a "word" is not a
// thing the prompt can mean, so count characters; for en count whitespace runs.
const proseLength = (text, lang) =>
  lang === "en" ? text.trim().split(/\s+/).length : text.replace(/\s/g, "").length;

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");
const uniq = (a) => [...new Set(a)];

// Bigrams of characters (zh/ko) or words (en), for measuring how much of one
// round's prose the next round reuses. Character bigrams are the right unit for
// Chinese, where a recycled phrase is rarely a whole sentence.
function grams(text, lang, n = 4) {
  const src = lang === "en" ? text.toLowerCase().split(/\s+/) : [...text.replace(/\s/g, "")];
  const out = new Set();
  for (let i = 0; i + n <= src.length; i++) out.add(src.slice(i, i + n).join(lang === "en" ? " " : ""));
  return out;
}
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return shared / (a.size + b.size - shared);
};

// The address forms each language uses, split by whether they can be counted on
// their own. The first version counted every occurrence of each form anywhere and
// reported `아:194` in a 20-round Korean run: 아 and 야 are single syllables that
// occur inside ordinary Korean words constantly, and 씨 and 님 are words in their own
// right. The Latin ones have the same problem from the other side — `xi` and `nim`
// sit inside plenty of Latin strings.
//
// So the rule splits by script, because the two have opposite problems:
//
//   - a HANGUL suffix must follow a cast or player name, since 아 and 야 are syllables
//     inside ordinary words. The cost is that a form on a TITLE rather than a name —
//     `회장님`, `선배님` — is not counted; that is an undercount worth knowing about
//     rather than a reason to go back to matching every 아.
//   - a LATIN suffix is counted anywhere, because the hyphen (`-nim`) or the Latin
//     letters sitting in CJK prose (`会长nim`) already make it specific. Anchoring
//     these to a name was worse: it silently dropped `Manager-nim`, which is the
//     Staff identity's work title and the thing most worth measuring in that run.
const ADDRESS_FORMS = {
  zh: { standalone: ["欧尼", "前辈", "nim", "xi"], suffix: [] },
  en: { standalone: ["unnie", "sunbae", "-nim", "-ssi", "-ya", "-ah"], suffix: [] },
  ko: { standalone: ["언니", "선배"], suffix: ["님", "씨", "야", "아"] },
};
// What the prompt bans by name — as a FORM OF ADDRESS, which is the distinction the
// first version of this got wrong. It counted every 姐姐 and reported three
// violations in a 25-round run; all three were the ordinary noun in narration
// (`护在身后的姐姐` — "the kind of older sister who shields her members",
// `姐姐对妹妹的那种温柔`). That is correct Chinese prose, and nothing in the prompt
// forbids it: what is forbidden is 姐 standing in for 언니 when one character
// addresses another. So this is anchored to a name, exactly as the live grader
// `sinicizedHonorifics` is, and the whole point of anchoring it there.
const BANNED_AFTER_NAME = { zh: ["姐", "姐姐"], en: [" sister"], ko: [] };

// ---------------------------------------------------------------- per result

function analyze(result, config) {
  const lang = config.LANG || "zh";
  const rounds = (result.rounds || []).filter((r) => r.transcript?.story);
  if (!rounds.length) return null;
  const T = rounds.map((r) => r.transcript);
  // Round numbers as the game counts them, so a run with a failed round in it does
  // not report repetitions against indices that have silently shifted.
  const roundNo = rounds.map((r) => r.round);
  const cast = result.roster || [];
  const nameOf = (id) => cast.find((m) => m.id === id)?.name || id;
  const romanceable = cast.filter((m) => m.slot !== "npc").map((m) => m.id);

  // --- length against what section 3 asks for
  const lengths = T.map((t) => proseLength(t.story, lang));
  const asked = [350, 450];
  const inBand = lengths.filter((n) => n >= asked[0] && n <= asked[1]).length;

  // --- repetition between consecutive rounds, and across the whole run
  const gramSets = T.map((t) => grams(t.story, lang));
  const consecutive = gramSets.slice(1).map((g, i) => jaccard(gramSets[i], g));

  // Any sentence that appears in more than one round. Near-duplicates are the
  // usual shape, so compare on a normalised form with names and punctuation out:
  // "Irene的耳尖泛红" and "Seulgi的耳尖泛红" are the same sentence reused.
  const names = cast.map((m) => m.name).filter(Boolean);
  const normalise = (s) => {
    let out = s;
    for (const n of names) out = out.split(n).join("§");
    return out.replace(/[，、,;；:：""''「」]/g, "").toLowerCase();
  };
  const seen = new Map();
  T.forEach((t, i) => {
    // Length is checked AFTER normalising, not before. Removing the names shortens a
    // sentence, so `Irene였다.` and `Seulgi였다.` both became `§였다.` — five characters
    // — and got reported as a reused sentence across three rounds. "It was Irene" and
    // "it was Seulgi" are not a repetition; they are two different sentences that
    // happen to share a predicate. That accounted for most of the Korean run's count.
    for (const s of uniq(sentences(t.story).map(normalise)).filter((s) => s.length >= 10)) {
      if (!seen.has(s)) seen.set(s, []);
      seen.get(s).push(i);
    }
  });
  const repeats = [...seen.entries()].filter(([, rs]) => rs.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  // Openers specifically: section 3 asks every round to open on scene
  // atmosphere, which is exactly the instruction that produces a house style.
  const openers = T.map((t) => sentences(t.story)[0] || "");
  const openerGrams = openers.map((o) => grams(o, lang, 3));
  let openerPairs = 0, openerWorst = 0;
  for (let i = 0; i < openerGrams.length; i++) {
    for (let j = i + 1; j < openerGrams.length; j++) {
      const s = jaccard(openerGrams[i], openerGrams[j]);
      if (s > 0.35) openerPairs++;
      openerWorst = Math.max(openerWorst, s);
    }
  }

  // --- scene variety
  const scenes = T.map((t) => t.scene).filter(Boolean);

  // --- option quality
  const allOptions = T.flatMap((t) => t.options || []);
  const optionBodies = allOptions.map((o) => String(o).replace(/^[A-D][.、:]\s*/, "").trim());
  const optionLens = optionBodies.map((o) => proseLength(o, lang));
  // A stat or route hint in an option is explicitly forbidden by the schema RULES.
  const leaky = optionBodies.filter((o) => /[+\-−][0-9]|好感|affection|route|线$/i.test(o));
  // Four options that are one option: measured per round, not across the run.
  const flatRounds = T.filter((t) => {
    const bodies = (t.options || []).map((o) => String(o).replace(/^[A-D][.、:]\s*/, "").trim());
    const g = bodies.map((b) => grams(b, lang, 3));
    let maxSim = 0;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) maxSim = Math.max(maxSim, jaccard(g[i], g[j]));
    return maxSim > 0.5;
  }).length;

  // --- member rotation, which section 3 states as a rule and nothing checks
  const appearances = {};
  for (const id of cast.map((m) => m.id)) {
    appearances[id] = T.map((t, i) => (t.story.includes(nameOf(id)) ? i : -1)).filter((i) => i >= 0);
  }
  const gaps = {};
  for (const id of romanceable) {
    const seenAt = appearances[id];
    let worst = seenAt.length ? seenAt[0] : T.length;
    for (let i = 1; i < seenAt.length; i++) worst = Math.max(worst, seenAt[i] - seenAt[i - 1] - 1);
    if (seenAt.length) worst = Math.max(worst, T.length - 1 - seenAt.at(-1));
    gaps[id] = worst;
  }

  // --- honorifics: is the address protocol visible in the prose at all?
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Everyone a form or a substitute could be attached to. The player counts: she is
  // who a member would wrongly call 姐, and who carries the -nim in `会长nim`.
  const addressable = [...names, result.cast?.playerName].filter(Boolean);
  const table = ADDRESS_FORMS[lang] || { standalone: [], suffix: [] };
  const forms = {};
  for (const f of table.standalone) {
    forms[f] = T.reduce((n, t) => n + (t.story.split(f).length - 1), 0);
  }
  for (const f of table.suffix) {
    const re = new RegExp(`(?:${addressable.map(esc).join("|")})\\s*${esc(f)}`, "g");
    forms[f] = addressable.length
      ? T.reduce((n, t) => n + [...t.story.matchAll(re)].length, 0)
      : 0;
  }
  // Anchored to a cast or player name, so the ordinary noun in narration is not a finding.
  const bannedExamples = [];
  for (const sub of BANNED_AFTER_NAME[lang] || []) {
    for (const n of addressable) {
      const re = new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
      T.forEach((t, i) => {
        for (const mt of t.story.matchAll(re)) {
          bannedExamples.push(`r${roundNo[i]}: ${t.story.slice(Math.max(0, mt.index - 12), mt.index + 14).replace(/\n/g, " ")}`);
        }
      });
    }
  }
  const bannedHits = bannedExamples.length;

  // --- affection pacing. The prompt asks for +/-1..10 and the code clamps to 8,
  // so a run sitting at the clamp is a run the model is driving, not the game.
  const mainAff = T.map((t) => t.affections?.main ?? 0);
  const deltas = mainAff.slice(1).map((v, i) => v - mainAff[i]);
  const atClamp = deltas.filter((d) => Math.abs(d) >= 8).length;
  const negative = deltas.filter((d) => d < 0).length;

  // --- stat movement: the schema demands at least one non-zero every round.
  const STATS = ["selfId", "secrecy", "mood"];
  const statSeries = STATS.map((k) => T.map((t) => t.stats?.[k] ?? 0));
  const statMoves = STATS.map((k, i) =>
    statSeries[i].slice(1).filter((v, j) => v !== statSeries[i][j]).length);

  // --- how much of the prose is spoken. A dating sim that is all narration reads
  // flat however good the narration is, and nothing in the prompt asks for dialogue
  // at all — only that address forms belong inside quotation marks, which presumes
  // there are some.
  const spokenChars = (text) => {
    let n = 0;
    for (const re of [/"([^"]*)"/g, /“([^”]*)”/g, /「([^」]*)」/g]) {
      for (const m of text.matchAll(re)) n += m[1].replace(/\s/g, "").length;
    }
    return n;
  };
  const dialogueShare = T.map((t) => {
    const total = t.story.replace(/\s/g, "").length || 1;
    return spokenChars(t.story) / total;
  });
  const silentRounds = dialogueShare.filter((r) => r === 0).length;

  // --- how the response parsed. This is the cost side of any schema change: the
  // 4-level fallback exists because the weaker route models struggle with long
  // structured output, and asking for the prose EARLIER in the response is exactly
  // the kind of change that could push one of them off `direct`.
  const parseLevels = {};
  for (const r of rounds) parseLevels[r.parseLevel || "?"] = (parseLevels[r.parseLevel || "?"] || 0) + 1;

  // --- is the proposal ending reachable? relationshipEvents.js gates it on
  // affection >= 95 AND selfId > 95 AND round >= 35 AND not in a love triangle.
  // selfId starts near 40 and moves +/-1..10, so >95 needs sustained positive
  // movement across every one of those rounds.
  const proposalGate = {
    aff: Math.max(0, ...mainAff),
    selfId: Math.max(0, ...statSeries[0]),
    selfIdPerRound: T.length > 1 ? (statSeries[0].at(-1) - statSeries[0][0]) / (T.length - 1) : 0,
  };

  // --- summary field: always English, ~100 chars, names who appeared.
  const summaries = T.map((t) => t.summaryText || "");
  const nonAscii = summaries.filter((s) => /[^\x00-\x7F]/.test(s)).length;
  const namesInSummary = summaries.filter((s) => names.some((n) => n && s.includes(n))).length;

  return {
    lang, n: T.length, lengths, inBand, asked,
    consecutive, repeats, openerPairs, openerWorst, openers,
    scenes, allOptions, optionLens, leaky, flatRounds,
    appearances, gaps, nameOf, romanceable, cast,
    forms, bannedHits, bannedExamples, mainAff, deltas, atClamp, negative, statMoves, statSeries, STATS, roundNo,
    summaries, nonAscii, namesInSummary,
    dialogueShare, silentRounds, parseLevels, proposalGate,
  };
}

// ---------------------------------------------------------------- report

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const flag = (bad, warn) => (bad ? C.r : warn ? C.y : C.g);

for (const file of reports) {
  const { config, results } = JSON.parse(readFileSync(file, "utf8"));
  console.log(`\n${C.b}${file.replace(ROOT, ".")}${C.x}`);
  console.log(`${C.d}${config.LANG} · ${config.GROUP}${config.CAST ? ` · cast ${config.CAST}` : ""} · ${config.IDENTITY} · ${config.PACE || "(pace not recorded)"} · ${config.ROUNDS} rounds${C.x}`);

  for (const result of results) {
    const a = analyze(result, config);
    if (!a) { console.log(`  ${C.d}${result.model}: no transcript (older report)${C.x}`); continue; }
    console.log(`\n  ${C.b}${result.model}${C.x} — ${a.n} rounds of prose`);

    // length
    console.log(`  ${C.b}length${C.x}      median ${median(a.lengths)} ${a.lang === "en" ? "words" : "chars"} · range ${Math.min(...a.lengths)}-${Math.max(...a.lengths)} · ` +
      `${flag(a.inBand / a.n < 0.5, a.inBand / a.n < 0.8)}${a.inBand}/${a.n} inside the ${a.asked[0]}-${a.asked[1]} the prompt asks for${C.x}`);

    // repetition
    const cm = mean(a.consecutive);
    console.log(`  ${C.b}repetition${C.x}  round-to-round 4-gram overlap: median ${(median(a.consecutive) * 100).toFixed(1)}% · max ${(Math.max(0, ...a.consecutive) * 100).toFixed(1)}% ` +
      `${flag(cm > 0.25, cm > 0.15)}(mean ${(cm * 100).toFixed(1)}%)${C.x}`);
    console.log(`              ${flag(a.repeats.length > a.n / 2, a.repeats.length > 2)}${a.repeats.length} sentence(s) reused across rounds${C.x}` +
      (a.repeats.length ? ` — worst appears in ${a.repeats[0][1].length} rounds` : ""));
    for (const [s, rs] of a.repeats.slice(0, FULL ? 40 : 4)) {
      console.log(`      ${C.d}r${rs.map((i) => a.roundNo[i]).join(",")}: ${s.slice(0, 84)}${C.x}`);
    }
    console.log(`  ${C.b}openers${C.x}     ${flag(a.openerPairs > a.n, a.openerPairs > 2)}${a.openerPairs} pair(s) of rounds open alike${C.x} (worst similarity ${(a.openerWorst * 100).toFixed(0)}%)`);
    if (FULL) a.openers.forEach((o, i) => console.log(`      ${C.d}r${a.roundNo[i]}: ${o.slice(0, 84)}${C.x}`));

    // scenes
    const us = uniq(a.scenes);
    console.log(`  ${C.b}scenes${C.x}      ${flag(us.length < a.n / 3, us.length < a.n / 2)}${us.length} distinct across ${a.scenes.length} rounds${C.x} — ${us.slice(0, 6).map((s) => s.slice(0, 18)).join(" / ")}${us.length > 6 ? " …" : ""}`);

    // options
    console.log(`  ${C.b}options${C.x}     median ${median(a.optionLens)} ${a.lang === "en" ? "words" : "chars"} · ` +
      `${flag(a.leaky.length > 0, false)}${a.leaky.length} leaking a stat or route hint${C.x} · ` +
      `${flag(a.flatRounds > a.n / 4, a.flatRounds > 0)}${a.flatRounds} round(s) whose four options say one thing${C.x}`);
    if (a.leaky.length) console.log(`      ${C.d}${a.leaky.slice(0, 3).join(" | ").slice(0, 150)}${C.x}`);

    // rotation
    const rot = a.romanceable.map((id) => `${a.nameOf(id)} ${a.appearances[id].length}/${a.n} (max gap ${a.gaps[id]})`);
    const worstGap = Math.max(0, ...a.romanceable.map((id) => a.gaps[id]));
    console.log(`  ${C.b}rotation${C.x}    ${flag(worstGap > 3, worstGap === 3)}${rot.join(" · ")}${C.x}`);
    console.log(`              ${C.d}section 3: sub members need scenes every 2-3 rounds, none absent for more than 3${C.x}`);
    const npcs = a.cast.filter((m) => m.slot === "npc");
    if (npcs.length) {
      console.log(`              ${C.d}npc: ${npcs.map((m) => `${m.name} ${a.appearances[m.id]?.length ?? 0}/${a.n}`).join(" · ")}${C.x}`);
    }

    // honorifics
    const totalForms = Object.values(a.forms).reduce((x, y) => x + y, 0);
    console.log(`  ${C.b}address${C.x}     ${flag(totalForms === 0, totalForms < a.n)}${Object.entries(a.forms).map(([f, n]) => `${f}:${n}`).join(" ")}${C.x}` +
      ` — ${(totalForms / a.n).toFixed(1)} per round` + (a.bannedHits ? ` ${C.r}· ${a.bannedHits} banned substitute(s): ${a.bannedExamples.slice(0, 2).join(" ; ")}${C.x}` : ""));

    // pacing
    console.log(`  ${C.b}pacing${C.x}      main affection ${a.mainAff[0]} → ${a.mainAff.at(-1)} in ${a.n} rounds · ` +
      `median step ${median(a.deltas.map(Math.abs))} · ${flag(a.atClamp > a.n / 3, a.atClamp > 0)}${a.atClamp} at the +/-8 clamp${C.x} · ` +
      `${flag(a.negative === 0 && a.n > 8, false)}${a.negative} negative${C.x}`);
    console.log(`  ${C.b}stats${C.x}       moved selfId/secrecy/mood on ${a.statMoves.join("/")} of ${a.n - 1} transitions · ` +
      a.STATS.map((k, i) => `${k} ${a.statSeries[i][0]}→${a.statSeries[i].at(-1)}`).join(" · "));
    // relationshipEvents.js gates the proposal ending on affection >= 95 AND
    // selfId > 95 AND round >= 35. If selfId barely moves, that ending is unreachable
    // however well the run goes.
    const needed = a.n > 1 ? (96 - a.statSeries[0][0]) / 34 : 0;
    console.log(`  ${C.b}proposal${C.x}    gate needs aff>=95 & selfId>95 by round 35 · reached aff ${a.proposalGate.aff}, selfId ${a.proposalGate.selfId} · ` +
      `${flag(a.proposalGate.selfIdPerRound < needed / 2, a.proposalGate.selfIdPerRound < needed)}selfId +${a.proposalGate.selfIdPerRound.toFixed(2)}/round vs +${needed.toFixed(2)} needed${C.x}`);
    console.log(`  ${C.b}dialogue${C.x}    ${flag(mean(a.dialogueShare) < 0.1, mean(a.dialogueShare) < 0.2)}${(mean(a.dialogueShare) * 100).toFixed(0)}% of prose is spoken${C.x} · ` +
      `${flag(a.silentRounds > a.n / 4, a.silentRounds > 0)}${a.silentRounds} round(s) with no dialogue at all${C.x}`);
    console.log(`  ${C.b}parse${C.x}       ${Object.entries(a.parseLevels).map(([k, v]) => `${k}:${v}`).join(" ")} ` +
      `${flag((a.parseLevels.direct || 0) < a.n, false)}(direct ${a.parseLevels.direct || 0}/${a.n})${C.x}`);
    console.log(`  ${C.b}summary${C.x}     ${flag(a.nonAscii > 0, false)}${a.nonAscii} not in English${C.x} · median ${median(a.summaries.map((s) => s.length))} chars · names a member in ${pct(a.namesInSummary, a.n)}`);
  }
}
console.log(`\n${C.d}No metric here fails a build. Read them; the questions they answer have no right answer.${C.x}`);
