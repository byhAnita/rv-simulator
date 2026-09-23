# Tech notes

One entry per non-obvious technique in this codebase: what it is, what it replaced, and what it
actually bought. Plain language, no assumed background.

## Why this file exists

`CLAUDE.md` documents **how the system behaves** — enough to work on it safely. It does not
explain **why a technique was chosen over the obvious alternative**, and that reasoning is not
reconstructible from a diff. Six months later the code looks arbitrary; in an interview it is
unexplainable.

`docs/TEST_FINDINGS.md` already does this for the model-layer decisions. This file does it for
techniques rather than test results.

## The rule

**When a change introduces a technique rather than a feature, add an entry here in the same
commit.** A technique is anything where a reader could reasonably ask *"why not just do the
simple thing?"* — a caching strategy, a retrieval method, a statistical model, a routing policy,
a build or CI mechanism.

Not every change needs one. A new overlay, a copy fix, another group JSON: no entry. If the
honest answer to "why this way" is "it's the obvious way", there is nothing to write.

An entry that cannot state what it **replaced** and what it **cost** is not finished. A technique
with no measured cost is usually a technique nobody checked.

## Template

```markdown
### <name> — v<version>

**What it is.** 2-3 lines, no jargon, assume the reader has not seen it before.

**What it replaced.** The previous approach and the specific way it fell short.

**What it bought.** Numbers where they exist. "Not measured" where they do not — say so.

**What it costs.** Tokens, latency, complexity, a new failure mode. Every technique costs
something; an entry claiming otherwise is incomplete.

**Where it lives.** Files and functions.

**Short form.** The version you would say out loud in under a minute.
```

---

## Entries

### 3-tier prompt + stepped-window collapse — v1.3.0

**What it is.** The prompt sent each round is split into three messages in a fixed order: a
static system prompt (rules, cast, schema), an append-only history ledger, and a small dynamic
tail (stats, affections, this round's state). LLM providers cache prompts by *prefix* — if the
first N tokens of a request are byte-identical to a previous one, those tokens are billed at
roughly a tenth of the normal rate and skip re-processing. Ordering the prompt from
never-changing to always-changing means almost all of it stays cacheable.

The history is a single append-only array. Entries are never deleted or reordered mid-ledger,
because changing anything early shifts every token after it and destroys the shared prefix. When
full stories reach `HISTORY_FULL_MAX` (3), they are collapsed **in place** into the ~100-char
English summaries the model already produced each round.

**What it replaced.** A two-pool memory (`summaries` + `fullStories`, v12) rebuilt into a prompt
each round. Because the pools were re-serialized every time, the token stream shifted whenever
anything moved between them — so the cache missed constantly despite the memory itself being
perfectly correct. The bug was invisible: output quality was fine, the bill was not.

**What it bought.** Measured ~95.8% prompt-cache hit rate on DeepSeek Official billing, ~83% on
Aliyun (a coarser cache, and 12 route models report no `cached_tokens` at all). Input cost per
round falls by roughly an order of magnitude at steady state.

**What it costs.** One partial cache miss every 3 rounds when the collapse runs, because the
three new short summaries occupy token positions previously held by long stories. And a standing
constraint on every future feature: **nothing that grows mid-game may enter the static prompt.**
That rule has already shaped the place map (§7.2 of the v1.4.0 plan) and the retrieval design
(§13) — both put their growing data in the tail instead.

**Where it lives.** `src/agent/memoryPool.js` (`buildHistoryLedger`, `buildDynamicTail`,
`collapseHistoryIfNeeded`), `src/agent/mainAgent.js` (`buildSystemPrompt`). The round-by-round
cache trace is in `CLAUDE.md`.

**Short form.** Prompts are cached by prefix, so the prompt is ordered by how often each part
changes and the history is append-only. Collapsing old stories into their summaries in place
keeps the ledger short without disturbing the prefix. Roughly 10x cheaper input per round, at
the price of one partial miss every three rounds.

---

### Typed error classifier + per-kind retry — v1.3.2

**What it is.** Every failed API call throws one `LLMError {kind, provider, model, status, code}`,
where `kind` is one of 15 values. Four providers report the same failure in four different
shapes; the classifier maps all of them onto that one vocabulary, and retry policy, UI text and
router behaviour are all driven by `kind` rather than by HTTP status.

**What it replaced.** Status-code branching per provider. It could not distinguish failures that
share a code and need opposite handling — Aliyun returns 429 both for "free quota exhausted"
(never retry, switch model) and for ordinary throttling (retry, same model), and returns 400 for
`Arrearage`, which is a billing problem rather than a bad request.

**What it bought.** The free-route walker became possible at all: it needs to know whether a
failure means *skip this model permanently*, *skip for an hour*, or *retry here*. It also gave
one localized line per failure in three languages, with a matching Help Center entry, guarded by
smoke Layer E2.

**What it costs.** A table that must be updated whenever a provider adds an error code, and it
is only as correct as `docs/error_code/*.md`. Misclassification is silent — a wrongly-typed
error retries wrongly rather than failing loudly.

**Where it lives.** `src/tools/llmErrors.js`; policy table in `CLAUDE.md`.

**Short form.** Four providers, four error dialects, one vocabulary of 15 kinds. Retry policy and
user-facing text key off the kind, not the status code, because the same status means opposite
things on different providers.

---

## To backfill

Not yet written; add when next touched.

- **Aliyun free-route walker** (`aliyunRoute.js`) — per-key state, permanent vs timed marks, the
  round budget, and the hourly recovery probe.
- **`bad_response` as a failure kind** — why HTTP 200 is not success, and why the story-length
  check is injected as a callback so `llmTool.js` stays ignorant of the game schema.
- **`keepFull`** — one flag that makes an edited story survive a collapse, and why it adds no
  cache miss.
- **Esbuild `define` for `import.meta.env.BASE_URL`** — why Node harnesses that bundle `src/`
  need it, and how its absence killed `playthrough.mjs` silently for two releases.

Planned, per `docs/V140_PLAN.md`:

- **Log-linear place prior** (§7.3) — why a multiplicative prior rather than another additive
  term, and why `BETA = 0` must reproduce the old draw exactly.
- **BM25 over the story archive** (§13) — why lexical beats vector at 10² documents.
- **Bandit router** (§17) — Thompson sampling seeded from offline sweep data, and why an
  uninformed bandit would be worse than the current hand-ordered route.
