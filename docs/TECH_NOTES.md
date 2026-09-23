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

### CI, and putting the mirror check in smoke rather than in CI — v1.3.9

**What it is.** A GitHub Actions workflow that runs `npm ci` -> `dev-index.mjs` -> `npm run
build` -> `node test/smoke.mjs` on every push to a working branch and every PR. No secrets: the
offline suite mocks `fetch` and skips live layers when `API_KEY` is absent.

The non-obvious half is **where the new guard went.** The whole reason for adding CI was that
nothing detects drift between root `groups/` and `public/groups/` — GitHub Pages serves the repo
root, so a group JSON edited only under `public/` leaves Pages serving stale cast data forever,
silently. The obvious implementation is a `diff -r` step in the workflow. It was instead written
as two assertions inside smoke Layer C.

**What it replaced.** Smoke ran in exactly two places: by hand, and inside `deploy.sh` preflight.
A broken commit on `dev` stayed invisible until someone ran it, and Vercel branch previews built
and deployed with nothing having checked them. For the mirror specifically there was no detector
at all — CLAUDE.md simply documented the hazard and asked people to remember.

**What it bought.** Putting the check in smoke rather than in the workflow means it runs in
*three* places instead of one: locally before a commit, in CI on push, and in `deploy.sh`
preflight — which is the only one that can actually stop a release. A CI-only check would have
left `npm run deploy` able to ship stale cast data, since preflight runs smoke, not CI. The
general rule: **put an assertion in the test suite and let CI run the suite; do not put
assertions in CI.** CI is a trigger, not a place to keep logic.

**What it costs.** Two checks (459 total, from 457) and a full directory walk of nine group
trees per run — milliseconds. Plus a real obligation: `worlds/` and `rosters/` in v1.4.x will
need the same mirroring and the same guard, or the check gives false confidence by covering only
one of three trees.

**Where it lives.** `.github/workflows/ci.yml`; the assertions in `test/smoke.mjs` Layer C,
beside the existing `manifest.json` parity check. Both verified failing against injected drift
(a changed file and a stray file) before being committed.

**Short form.** CI runs build and the offline smoke suite on every push, with no secrets. The
guard it was built for — root `groups/` drifting from `public/groups/`, which silently serves
stale data on GitHub Pages — lives in the test suite rather than the workflow, so it also gates
local commits and the deploy preflight. CI should trigger checks, not contain them.

---

### Golden-file prompt snapshots — v1.3.9

**What it is.** Three complete system prompts are generated from pinned inputs, written to text
files, and committed. The test suite regenerates them each run and asserts the output is
byte-identical to the committed copy. When the prompt changes on purpose, a script rewrites the
files and the diff goes into the same commit as the change.

The point is not that the current prompt is correct. It is that any change to it becomes
**visible**. A prompt is a 5,500-token string assembled from a dozen template literals; edit a
shared rule and you cannot tell from the diff which of the eight identities and three languages
moved. The golden files answer that in the form of a diff you can read.

**What it replaced.** Property assertions — smoke Layer I checks about forty specific substrings
(`/4 yr OLDER than Summer/`, `NEVER "姐"`, and so on). Those are precise about the things somebody
already thought to guard and blind to everything else. Nothing at all covered the ~95% of the
prompt that no regex names: the JSON schema block, the phase rules, the NPC rule, the social
platform list, section ordering, blank lines. A refactor could rewrite any of it and the suite
would stay green.

The two are complements, not substitutes. A property assertion says *this must be true*, survives
an intentional rewording, and explains itself when it fails. A golden file says *nothing may
change without being looked at*, catches what nobody predicted, and cannot explain anything — it
just shows you the diff. Keep both; do not convert one into the other.

**What it bought.** Immediately, before the first fixture was even written: the
`主线成员前女友` identity built its background from two `Math.random()` calls, and the prompt is
rebuilt every round — so that identity re-rolled its own backstory every round, defeating the
prompt cache and feeding the model a different breakup reason each time on a route whose whole
premise is a shared past. Shipped since the identity existed. Found because a snapshot forces you
to ask "is this output actually stable?", which no property assertion had ever asked.

**Measured, not argued.** The cache claim above was originally derived by reading code, which is
not evidence. A/B on Aliyun, `qwen3.8-flash` pinned, 8 rounds per arm, same identity, language,
group and sub-count — the only difference is the fix:

| Arm | Static-prompt drifts | Measured cache hit |
| --- | --- | --- |
| `Math.random()` | 7 of 8 rounds | **60.5%** |
| `backstorySeed` | 0 of 8 | **87.2%** |

**+26.7 points for one identity.** 87.2% is in line with the ~83% this project measures on Aliyun
generally, which is the real check: the fix returns this identity to normal rather than doing
anything clever. These are Aliyun figures and are *not* comparable with the ~95.8% from DeepSeek
Official billing — Aliyun's cache is coarser and reports less (see CLAUDE.md open question 2).

Going forward it is the gate on the v1.4.0 cast/world/roster split (plan §15.0 step 3), whose
success criterion is *byte-identical prompts for the same roster*. Without the files that
criterion cannot be stated, let alone checked.

**What it costs.** Three committed text files (~40 KB) that must be regenerated whenever the
prompt changes on purpose, and one real failure mode: **regenerating without reading the diff**
turns the detector into a rubber stamp. That is why regeneration is a separate explicit script
(`scripts/update-golden.mjs`) rather than a `--update` flag on the test suite — a flag people
reach for while a run is red, a script is something you decide to do.

They also pin only what the fixtures cover. Three casts out of nine groups, three of eight
identities; a bug reachable only by `留学生` in Korean is still invisible. The determinism sweep
covers the full 8x3 grid precisely because the snapshots cannot.

**Where it lives.** `test/fixtures/*.txt` (the goldens), `test/fixtures/prompts.mjs` (the pinned
inputs, shared so the test and the regenerator cannot disagree), smoke **Layer J**,
`scripts/update-golden.mjs`. The determinism fix is `backstorySeed` in `src/agent/mainAgent.js`.

**Short form.** Pin the whole generated prompt to committed files and diff against them, so a
refactor that changes the prompt by accident shows up as a diff instead of as slightly different
writing three weeks later. It found a shipped bug on day one: one identity re-randomised its
backstory every round, which cost the prompt cache and quietly contradicted the story. Property
assertions say what must be true; goldens say nothing may change unseen — you want both.

---

### Usage metering as a module-level sink — v1.3.9

**What it is.** Every LLM response carries a `usage` block: how many input tokens the request
used, how many of those the provider served from its cache, and how many tokens it wrote back.
`usageMeter.js` is a small module that adds these up for the current browser session, and
`UsagePanel.jsx` shows the totals — tokens, cache-hit rate, median generation time, estimated
cost — in the settings overlay.

**What it replaced.** Nothing read `usage` at all. The field was in every response since the
project began and was discarded on arrival. Two things followed. Players bring their own API key,
so the person paying for each round had no way to see what it cost short of opening the
provider's billing console. And the cache-hit figure this whole architecture is built around —
the ~95.8% in the README — came from reading DeepSeek's billing page by hand, on one provider,
once. It was an assertion the app itself could not check.

The obvious alternative was to return usage from `callLLM` alongside the content. That is worse
here for a specific reason: `callModelWithRetry` and `callAliyunFreeRoute` both return a plain
string, and the free router may make **several** billed calls before one answers — same-model
retries after a truncated response, then the next model, then the next. A return value carries
only the call that succeeded. On a bad route walk that understates the round by up to 4x, and it
understates exactly the rounds a player would most want explained. Recording at `callLLMOnce`,
where the HTTP 200 actually lands, counts every request that was billed. The cost is that the
meter is module-level state rather than a value — the same trade `mainAgent.js` already makes for
`pendingSocialFeeds`.

**What it bought.** Not yet measured in play — it ships with v1.3.9 and its first job is to
supply the measurement, not to be one. What it makes possible is concrete: CLAUDE.md open
question 2 ("re-check the 95.8% figure against DeepSeek Official billing") has been open since
v1.3.2 because checking it meant a long hand-played session plus a billing console. The panel
answers it from the player's own provider, which is also the only place the answer is really
true — the ~83% this project measures on Aliyun and the ~95.8% from DeepSeek are different
caches, and neither number transfers.

**What it costs.** About 130 lines of accumulator and 150 of panel, one new module-level global,
and a price table that is now the third place provider pricing is written down — after the README
cost table and the `gameplay` strings. That third copy is the real ongoing cost: unlike the other
two it is arithmetic rather than a rounded string, so a stale entry produces a wrong number
carrying four decimal places of false precision.

The sharper cost is epistemic, and it drove most of the design. A usage panel is a machine for
converting "we were not told" into "zero", and both of its numbers have that failure mode.
Twelve Aliyun route models report no `cached_tokens` field; averaging them in as misses would
show a healthy cache as broken. Several models have no published price; dropping them from the
total would show a partial figure that looks complete. So the meter carries `null` where a value
is unknown and separates *reported zero* from *not reported*, and the panel renders `—` and "not
reported" rather than `0`. That is more state and more branches than a naive version, and it is
the entire reason the component is trustworthy.

**Where it lives.** `src/tools/usageMeter.js` (`recordUsage`, `getUsageSummary`, `resetUsage`),
one call at the top of the response path in `src/tools/llmTool.js#callLLMOnce`,
`src/platforms/UsagePanel.jsx`, `MODEL_PRICES_USD_PER_1M` and `estimateCallCostUsd` in
`src/config/modelConfigs.js`, smoke **Layer K**.

**Short form.** The `usage` block was in every response and nobody read it, so the cost of a
round was invisible to the player paying for it and the project's own cache claim could not be
checked by the project. Meter it at the HTTP boundary rather than returning it, because the free
router makes several billed calls per round and only one of them is the one that answered. The
hard part is not counting — it is refusing to print `0` for a number nobody reported.

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
