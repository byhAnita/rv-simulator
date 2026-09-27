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
//   node scripts/analyze-prose.mjs --baseline test/baselines/zh-chaebol-high-pressure-r25.json
//   node scripts/analyze-prose.mjs --report test/reports/2026-09-28-rotation.md
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test", ".out");
const FULL = process.argv.includes("--full");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", x: "\x1b[0m" };

// `--report` and `--baseline` take a value, so positional arguments cannot simply be
// "everything not starting with --" any more: that read the value as a report to analyze.
const argv = process.argv.slice(2);
const valueOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const VALUED = ["report", "baseline"];
const takenValues = new Set(VALUED.map(valueOf).filter(Boolean));
const REPORT_TO = valueOf("report");
const BASELINE = valueOf("baseline");

const files = argv.filter((x) => !x.startsWith("--") && !takenValues.has(x));
const reports = files.length ? files : [newestReport()];
// Every analyzed result's comparable metrics, for --report and --baseline.
const collected = [];

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
  // Every name the prose can call her by. Matching the stage name alone made this
  // script measure the model's choice of name form instead of who was in the scene:
  // it reported 20% rotation failure on a run that was actually at 0%, because
  // narration named both subs only as 涩琪 and 胜完. Same alias rule as
  // mainAgent.js#namedInStory, which had the identical bug in shipped code — the
  // difference being that there it fed the model a false absence count.
  //
  // A pre-2026-09-27 report carries no name_kr, so it falls back to the stage name
  // and its rotation rows stay as wrong as when they were generated. That is why
  // the committed baselines say so beside their numbers rather than being re-stated.
  const aliasesOf = (m) => {
    const kr = m?.name_kr || "";
    const given = kr.includes(" ") ? kr.slice(kr.indexOf(" ") + 1) : kr.slice(1);
    return [m?.name, ...[kr, given].filter((x) => x.length >= 2)].filter(Boolean);
  };
  const namedIn = (story, id) => {
    const m = cast.find((x) => x.id === id);
    return aliasesOf(m).some((a) => story.includes(a));
  };
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

  // --- scene variety, and scene SHAPE, which are different questions
  const scenes = T.map((t) => t.scene).filter(Boolean);
  // The prompt asks for "a place and a time, nothing else", and that is a layout
  // requirement: it is printed as one line of a 30-character box on a 390px phone.
  // A distinct-count cannot see the failure — 25 distinct scenes can be 25 sensory
  // paragraphs, which is exactly what the English run produced at 250 characters each.
  const sceneLens = scenes.map((s) => proseLength(s, lang));
  const SCENE_BOUND = lang === "en" ? 8 : 20;
  const sceneOver = sceneLens.filter((n) => n > SCENE_BOUND).length;
  // And a distinct-count hides standing still, too: a run that repeated a byte-identical
  // scene for five consecutive rounds still reports 21 distinct out of 25. The longest
  // run of identical neighbours is what the "change it when the story moves" rule is about.
  let sceneRun = scenes.length ? 1 : 0;
  for (let i = 1, cur = 1; i < scenes.length; i++) {
    cur = scenes[i] === scenes[i - 1] ? cur + 1 : 1;
    sceneRun = Math.max(sceneRun, cur);
  }

  // --- rounds that came back far too short to use. `bad_response` retries anything
  // under MIN_STORY_CHARS (40), which is a floor against a DEAD round rather than a
  // bound on a usable one — a 126-character round passed that gate, rendered with
  // English fallback options, and was counted clean by every grader.
  const truncFloor = Math.round(asked[0] / 3);
  const truncated = lengths.map((n, i) => (n < truncFloor ? roundNo[i] : -1)).filter((r) => r >= 0);

  // --- what the live graders flagged, rolled up by kind. The detail after the colon
  // is the member or form, which is noise at this level; the kind is what says whether
  // a fix landed. Read the stored story before believing any of them — nine of the
  // first thirteen flags in this project were bugs in the grader, not in the model.
  const flags = {};
  for (const r of result.rounds || []) {
    for (const b of r.bad || []) {
      const kind = String(b).split(":")[0];
      flags[kind] = (flags[kind] || 0) + 1;
    }
  }
  const flaggedRounds = (result.rounds || []).filter((r) => (r.bad || []).length).map((r) => r.round);

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
    appearances[id] = T.map((t, i) => (namedIn(t.story, id) ? i : -1)).filter((i) => i >= 0);
  }
  const gaps = {};
  for (const id of romanceable) {
    const seenAt = appearances[id];
    let worst = seenAt.length ? seenAt[0] : T.length;
    for (let i = 1; i < seenAt.length; i++) worst = Math.max(worst, seenAt[i] - seenAt[i - 1] - 1);
    if (seenAt.length) worst = Math.max(worst, T.length - 1 - seenAt.at(-1));
    gaps[id] = worst;
  }

  // The rule's own unit, and the reason this exists beside `gaps`: section 3 says
  // "do not let any romanceable member disappear for more than 3 rounds", which is
  // a statement about EVERY round, not about the worst one. A single max hid the
  // whole result of step 7's A/B — one arm held a 13-round hole and the other
  // scattered short ones, and the max said the scattered arm was better while the
  // rule was broken in 8% of its rounds against 27% of the other's. Fourth time in
  // this file that a count which was easy to take stood in for the property.
  let violPairs = 0, totalPairs = 0;
  for (let i = 0; i < T.length; i++) {
    for (const id of romanceable) {
      const prior = appearances[id].filter((r) => r < i);
      const absence = prior.length ? i - Math.max(...prior) - 1 : i;
      totalPairs++;
      if (absence > 3) violPairs++;
    }
  }
  const rotationViolPct = totalPairs ? +(100 * violPairs / totalPairs).toFixed(1) : 0;

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
  // The full sign split, not just the negative count. 0 negatives reads the same whether
  // the model moved affection up every round or left it flat half the time, and those are
  // opposite problems: one is a relationship with no setbacks, the other is a stat the
  // model has stopped driving. `docs/PROPOSALS.md` §1 turns on this distinction.
  const signs = { up: deltas.filter((d) => d > 0).length, flat: deltas.filter((d) => d === 0).length, down: negative };

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
  // "Not in English" is NOT "contains a byte over 127". The first version of this tested
  // exactly that and reported 7 of 25 in a zh run: four were an ordinary em dash, which is
  // English punctuation, and the other three were the player's own name 林夏 written in its
  // native script inside an otherwise English sentence — a proper noun, not a language
  // failure. So this matches CJK and Hangul only, and is named for what it measures rather
  // than for the conclusion it was being read as. Third metric bug in this file's history
  // and the third with the same cause: a character class wider than the concept.
  const cjk = (s) => /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(s);
  const nonAscii = summaries.filter(cjk).length;
  const namesInSummary = summaries.filter((s) => names.some((n) => n && s.includes(n))).length;
  // Its length is a memory budget, not a style note: this string replaces the round's
  // entire story in the model's context three rounds later, so an over-long one costs
  // cache on every later round and a short one loses the round. The prompt asks 100-150.
  const SUMMARY_BAND = [100, 150];
  const summaryLens = summaries.map((s) => s.length);
  const summaryInBand = summaryLens.filter((n) => n >= SUMMARY_BAND[0] && n <= SUMMARY_BAND[1]).length;

  return {
    lang, n: T.length, lengths, inBand, asked,
    consecutive, repeats, openerPairs, openerWorst, openers,
    scenes, sceneLens, sceneOver, sceneRun, SCENE_BOUND,
    truncated, truncFloor, flags, flaggedRounds,
    allOptions, optionLens, leaky, flatRounds,
    appearances, gaps, rotationViolPct, nameOf, romanceable, cast,
    forms, bannedHits, bannedExamples, mainAff, deltas, atClamp, negative, signs,
    statMoves, statSeries, STATS, roundNo,
    summaries, nonAscii, namesInSummary, summaryLens, summaryInBand, SUMMARY_BAND,
    dialogueShare, silentRounds, parseLevels, proposalGate,
  };
}

// ---------------------------------------------------------------- comparable metrics
//
// A flat object of scalars, so a run can be DIFFED against a saved one instead of read.
// This exists because the step 7 validation was compared by hand against numbers quoted
// in prose in CLAUDE.md, and the comparison turned out to be worthless for a reason no
// amount of careful reading would have surfaced — the served model had changed. A diff
// of two files makes both the movement and the confound visible in one screen.
//
// Only scalars belong here. Anything needing judgement (which sentences repeated, which
// flags were real) stays in the printed report, because a number cannot carry that.
function metrics(a) {
  const worstGap = Math.max(0, ...a.romanceable.map((id) => a.gaps[id]));
  return {
    rounds: a.n,
    "story.median": median(a.lengths),
    "story.inBand": a.inBand,
    "story.truncated": a.truncated.length,
    "repeat.meanOverlapPct": +(mean(a.consecutive) * 100).toFixed(1),
    "repeat.reusedSentences": a.repeats.length,
    "repeat.openerPairs": a.openerPairs,
    "scene.distinct": uniq(a.scenes).length,
    "scene.medianLen": median(a.sceneLens),
    "scene.overBound": a.sceneOver,
    "scene.longestIdenticalRun": a.sceneRun,
    "rotation.worstGap": worstGap,
    "rotation.rulePct": a.rotationViolPct,
    "rotation.minAppearances": Math.min(a.n, ...a.romanceable.map((id) => a.appearances[id].length)),
    "address.perRound": +(Object.values(a.forms).reduce((x, y) => x + y, 0) / a.n).toFixed(2),
    "address.bannedHits": a.bannedHits,
    "aff.up": a.signs.up,
    "aff.flat": a.signs.flat,
    "aff.down": a.signs.down,
    "aff.atClamp": a.atClamp,
    "summary.medianLen": median(a.summaryLens),
    "summary.inBand": a.summaryInBand,
    "summary.cjk": a.nonAscii,
    "dialogue.sharePct": +(mean(a.dialogueShare) * 100).toFixed(0),
    "dialogue.silentRounds": a.silentRounds,
    "parse.direct": a.parseLevels.direct || 0,
    "flags.total": Object.values(a.flags).reduce((x, y) => x + y, 0),
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
    if (a.truncated.length) {
      console.log(`              ${C.r}${a.truncated.length} round(s) under ${a.truncFloor} — r${a.truncated.join(",")}${C.x} ` +
        `${C.d}(MIN_STORY_CHARS is 40, so these passed every gate)${C.x}`);
    }

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
    console.log(`  ${C.b}scenes${C.x}      ${flag(us.length < a.n / 3, us.length < a.n / 2)}${us.length} distinct across ${a.scenes.length} rounds${C.x} · ` +
      `median ${median(a.sceneLens)} ${a.lang === "en" ? "words" : "chars"} · ` +
      `${flag(a.sceneOver > a.n / 2, a.sceneOver > 0)}${a.sceneOver} over the ${a.SCENE_BOUND} a one-line box fits${C.x} · ` +
      `${flag(a.sceneRun >= 3, a.sceneRun === 2)}longest identical run ${a.sceneRun}${C.x}`);
    console.log(`              ${C.d}${us.slice(0, 4).map((s) => s.slice(0, 22)).join(" / ")}${us.length > 4 ? " …" : ""}${C.x}`);

    // options
    console.log(`  ${C.b}options${C.x}     median ${median(a.optionLens)} ${a.lang === "en" ? "words" : "chars"} · ` +
      `${flag(a.leaky.length > 0, false)}${a.leaky.length} leaking a stat or route hint${C.x} · ` +
      `${flag(a.flatRounds > a.n / 4, a.flatRounds > 0)}${a.flatRounds} round(s) whose four options say one thing${C.x}`);
    if (a.leaky.length) console.log(`      ${C.d}${a.leaky.slice(0, 3).join(" | ").slice(0, 150)}${C.x}`);

    // rotation
    const rot = a.romanceable.map((id) => `${a.nameOf(id)} ${a.appearances[id].length}/${a.n} (max gap ${a.gaps[id]})`);
    const worstGap = Math.max(0, ...a.romanceable.map((id) => a.gaps[id]));
    console.log(`  ${C.b}rotation${C.x}    ${flag(worstGap > 3, worstGap === 3)}${rot.join(" · ")}${C.x}`);
    console.log(`              ${flag(a.rotationViolPct > 10, a.rotationViolPct > 0)}the rule is broken in ${a.rotationViolPct}% of (round, member) pairs${C.x}` +
      ` ${C.d}— the rule's own unit, and not the same story as the max above${C.x}`);
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
      `steps ${C.g}+${a.signs.up}${C.x}/${C.d}=${a.signs.flat}${C.x}/${flag(a.signs.down === 0 && a.n > 8, false)}-${a.signs.down}${C.x}`);
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
    console.log(`  ${C.b}summary${C.x}     ${flag(a.nonAscii > 0, false)}${a.nonAscii} with CJK/Hangul${C.x} · median ${median(a.summaryLens)} chars · ` +
      `${flag(a.summaryInBand / a.n < 0.4, a.summaryInBand / a.n < 0.7)}${a.summaryInBand}/${a.n} inside ${a.SUMMARY_BAND[0]}-${a.SUMMARY_BAND[1]}${C.x} · names a member in ${pct(a.namesInSummary, a.n)}`);

    // What the live graders said, as one line. The detail is deliberately dropped: the
    // kind is what says whether a fix landed, and the stored story is what says whether
    // the flag was real.
    const flagTotal = Object.values(a.flags).reduce((x, y) => x + y, 0);
    console.log(`  ${C.b}flags${C.x}       ${flag(flagTotal > a.n / 4, flagTotal > 0)}${flagTotal} across ${a.flaggedRounds.length} round(s)${C.x}` +
      (flagTotal ? ` — ${Object.entries(a.flags).map(([k, v]) => `${k}:${v}`).join(" ")} ${C.d}(r${a.flaggedRounds.join(",")} — read the story before believing any)${C.x}` : ""));

    collected.push({ file, model: result.model, config, m: metrics(a) });
  }
}
// ---------------------------------------------------------------- baseline diff
//
// The A/B, as a script. `--baseline test/baselines/<run>.json` prints this run's metrics
// beside a saved run's, so what moved is visible without re-reading either transcript.
//
// It prints the SERVED MODEL of both arms first and without being asked, because that is
// the line that decides whether the rest of the table means anything: the step 7 validation
// compared cleanly-moving numbers across two DIFFERENT models and the comparison was
// worthless. `--route` does not pin a model.
if (BASELINE) {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const baseResult = (base.results || [])[0];
  const baseA = baseResult && analyze(baseResult, base.config);
  const now = collected[0];

  console.log(`\n${C.b}diff vs ${BASELINE.replace(ROOT, ".")}${C.x}`);
  if (!baseA || !now) {
    console.log(`  ${C.r}cannot compare — ${!baseA ? "baseline has no transcript" : "this run produced no metrics"}${C.x}`);
  } else {
    const servedOf = (rep, res) => {
      const s = rep.served || res?.served;
      if (!s) return `${C.y}not recorded${C.x}`;
      const names = Object.entries(s).map(([m, n]) => `${m}${n > 1 ? ` x${n}` : ""}`);
      return names.length > 1 ? `${C.r}${names.join(" + ")} — MIXED${C.x}` : names[0];
    };
    console.log(`  ${C.b}served${C.x}   baseline: ${servedOf(base, baseResult)}`);
    console.log(`           this run: ${servedOf(JSON.parse(readFileSync(now.file, "utf8")), null)}`);
    console.log(`  ${C.d}If those differ, every row below is confounded and measures the model, not the change.${C.x}`);

    const cfgLine = (c) => `${c.LANG}/${c.IDENTITY}/${c.PACE || "?"}/r${c.ROUNDS}/subs${c.SUBS}`;
    const sameCfg = cfgLine(base.config) === cfgLine(now.config);
    console.log(`  ${C.b}config${C.x}   ${sameCfg ? `${C.g}identical${C.x}` : `${C.r}DIFFERENT — ${cfgLine(base.config)} vs ${cfgLine(now.config)}${C.x}`}`);

    const bm = metrics(baseA), nm = now.m;
    console.log(`\n  ${"metric".padEnd(30)} ${"base".padStart(8)} ${"now".padStart(8)}   delta`);
    for (const k of Object.keys(nm)) {
      const b = bm[k], n = nm[k];
      if (b === undefined) continue;
      const d = +(n - b).toFixed(2);
      const mark = d === 0 ? `${C.d}=${C.x}` : `${d > 0 ? "+" : ""}${d}`;
      console.log(`  ${k.padEnd(30)} ${String(b).padStart(8)} ${String(n).padStart(8)}   ${mark}`);
    }
    console.log(`\n  ${C.d}A delta is not a result. It is the thing to go and read the prose about.${C.x}`);
  }
}

// ---------------------------------------------------------------- committed report
//
// `--report test/reports/<name>.md` writes the metrics as Markdown so a run's numbers can
// be COMMITTED. `test/.out/` is gitignored, so until this existed every measurement this
// project made lived in one untracked directory on one machine, and a comparison depended
// on numbers quoted in prose in CLAUDE.md that nothing kept in step with the runs.
//
// It writes numbers and the flagged round ids, and deliberately not a verdict: the same
// reason the terminal output has none. A committed file is exactly where a threshold would
// harden into one.
if (REPORT_TO) {
  const rows = collected;
  const lines = [
    `# Playthrough metrics`,
    ``,
    `Generated by \`node scripts/analyze-prose.mjs --report ${REPORT_TO.replace(ROOT, ".")}\` on ${new Date().toISOString().slice(0, 10)}.`,
    `Numbers only, no verdicts — see \`scripts/analyze-prose.mjs\` for what each measures and why.`,
    ``,
  ];
  for (const { file, model, config, m } of rows) {
    const rep = JSON.parse(readFileSync(file, "utf8"));
    const served = rep.served ? Object.entries(rep.served).map(([k, v]) => `${k} x${v}`).join(", ") : "not recorded";
    lines.push(
      // The filename is in the heading, not only in the source line below it: two runs of
      // the SAME config is the normal shape of an A/B, and a heading built from the config
      // alone renders both arms identically.
      `## ${file.replace(/^.*[\\/]/, "").replace(/\.json$/, "")}`,
      ``,
      `${config.LANG} / ${config.IDENTITY} / ${config.PACE || "?"} / ${config.ROUNDS} rounds`,
      ``,
      `- source: \`${file.replace(ROOT, ".")}\``,
      `- model requested: \`${model}\``,
      `- **served by: ${served}**`,
      `- cast: ${config.GROUP || "?"}${config.CAST ? ` / ${config.CAST}` : ""}, ${config.SUBS} sub(s)`,
      ``,
      `| metric | value |`,
      `| --- | --- |`,
      ...Object.entries(m).map(([k, v]) => `| \`${k}\` | ${v} |`),
      ``,
    );
  }
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(dirname(resolve(REPORT_TO)), { recursive: true });
  writeFileSync(resolve(REPORT_TO), lines.join("\n"), "utf8");
  console.log(`\n${C.g}wrote ${REPORT_TO}${C.x} ${C.d}— commit it; that is the point${C.x}`);
}

console.log(`\n${C.d}No metric here fails a build. Read them; the questions they answer have no right answer.${C.x}`);
