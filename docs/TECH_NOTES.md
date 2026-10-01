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

### Measuring a layout in a browser, and the two ways the measurement lies — v1.4.2

**What it is.** Three layout batches in a row were settled by rendering the real component in
headless Chrome and reading the numbers off it, rather than by reasoning about them: the profile
editor (§22.7, §22.8) and the merged classic setup page (§22.10, §22.11). The harness bundles the
actual `App.jsx` or `MemberEditor.jsx` with esbuild, serves the group and world JSON from disk
through a `fetch` stub, drives the page to the screen under test by clicking the app's own
buttons, and prints the content height plus a per-block breakdown against a per-device budget
(`screen − safe-area insets − the card's padding`, capped at 844).

**What it replaced.** Estimating. §22.7 exists because a tab was *thought* to fit and did not, and
the sweep that chose the image column's width in §22.8 found a height curve that is **not
monotonic** — a 2:3 tile gets taller with a wider column while a wrapping palette gets taller with
a narrower one, so 18% renders taller than 20% and 26% taller than 30%. No amount of reasoning
reaches that.

**The two ways it lied, both found in §22.11 and both worth more than the numbers they corrected.**

1. **It rendered without `src/index.css`.** The stub page gave the browser `html,body{margin:0}`
   and a `.rv-page{height:100%}` rule, on the reasonable-sounding basis that the app styles
   everything inline. It does not: `:root` in `index.css` carries `font: 18px/145%`, and a
   line-height inherited by every line of text on the screen is about **8% of every measured
   page**. So every number in §22.7, §22.8 and §22.10 is optimistic — the classic door's *"585px
   against a 676px budget"* is really 583 against 676, and the editor's figures carry the same bias
   and have not been re-taken.

   **The general rule: a harness that renders a component without the styles the app serves it with
   is measuring a different component.** A clean render proves the module graph resolves; it says
   nothing about a cascade that was never applied. Load the real stylesheet, or measure nothing.

2. **`scrollHeight` is floored by the scroller's own height.** It returns the larger of the content
   and the box, so on a card that is `height: 100%` it reports the card whenever the content is
   shorter — and after §22.11 the content is *always* shorter, because it is centred. The reading
   is taken by letting the card size to its content (`height: auto; max-height: none`) after the
   geometry has been captured from the real layout, and subtracting the padding.

**What it bought.** A layout claim that is a measurement rather than an estimate, per device and
per language — including the honest bad news, which is the half an estimate never produces: after
§22.11 a 9- or 10-member classic cast **scrolls by 26-30px on an iPhone 13 mini**, where the same
page fits an iPhone 15 by 1-5px. It also measures properties, not only sizes: that opening the
world fold changes the page height by **zero** (651/651, 734/734, 527/527), that the centred block
sits at `[65,65]` when it fits and `[0,-41]` when it does not — the second being the proof that the
top of a long page is still reachable — and that the flipped-open list lands inside the card at
every window size.

**It reads BEHAVIOUR as well as size, which is what §22.12 needed and no assertion could reach.**
The second bug of that batch was a world switch emptying the cast the player had chosen, and both
guards for it read a **dependency array** - a source check, and three guards in this repo have
passed while the app was broken. So the harness drives the transition instead: it clicks a main
member and a sub, opens the world fold, picks a different world, and reads the `NPC:` line back out
of the rendered page. Fixed, it is byte-identical across the switch; unfixed, it lists the whole
cast with nobody chosen, which is the screenshot that was reported. The header one line above it
(`已加载组合` → `已加载学校`) is what says the world really changed rather than the probe failing to
click - **a probe that does nothing and a probe that passes read the same.**

It also settles a question about a *colour* the same way: the open world list shipped on a
translucent token, and the fix is checked by reading the computed `background-color` off the live
element - `rgb(17, 8, 32)` and `rgb(224, 210, 184)`, no alpha channel - in both themes, rather than
by trusting the token name.
**What it costs.** Chrome. The harness lives in the gitignored `test/.out/ui/` and is **not in the
smoke suite**, deliberately: `deploy.sh` gates on smoke, and a release must not be blocked by a
browser dependency — the same reason the `YearWheel` browser harness stays out. What goes into
smoke is the *invariant* the harness established, written structurally: both panes share a grid
cell, the card is a column with one `margin: auto 0` child and no `justify-content: center`. A
pinned pixel count would be re-measured on every font change and wrong on some phone anyway.

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

**v1.4.1 step 2 — the constraint is not only about data that GROWS; it is about anything the
player can change.** The pace was a setup choice, so it sat correctly in the static prompt for
four releases. Turning it into a four-way *story mode* the player can switch mid-run changed
nothing about its size and everything about its placement: a rule in the cached prefix means
every toggle pays full price for ~5,500 tokens on the next round, which is the cost this entry
exists to avoid. It moved to the tail beside the Time Speed hint, and the generalised rule is
**order the prompt by how often each part changes — including the parts that change because a
person chose to change them.**

The move is ~50 tokens leaving the prefix (~20% of miss price) for the always-miss tail, so about
40 full-price-equivalent tokens against ~7,950 input per round: **+0.5%, calculated from the token
profile, not measured.** The static prompt gets ~50 tokens smaller in exchange.

**And the trap it surfaced is a naming one, not a caching one.** Time Speed already wrote
`[Pacing] slow — …` into the tail, and the obvious label for the new line was also `[Pacing]`.
**Two different quantities under one label is worse than two labels for one quantity** — the
`[Stage Changes]` id-vs-name bug this project already records — because the model is left to work
out which line means what, and nothing fails when it guesses wrong. They were renamed together, in
the same commit, to `[Story Mode: …]` and `[Time Speed]`. That rename is free precisely because
the tail is the always-miss message: no golden pins it and no cached prefix contains it.

Both lines are now placed by one exported pure function, `buildTailRules(world, storyMode,
timeSpeed)`. It was an inline ternary inside a template literal, which meant the one part of the
prompt that changes every round was the one part no test could call. Layer J asserts the paired
invariant — the static prompt is byte-identical across a change to either dial **and** the tail is
what moves instead — because either half alone passes against a dial nothing reads.

**Where it lives.** `src/agent/memoryPool.js` (`buildHistoryLedger`, `buildDynamicTail`,
`collapseHistoryIfNeeded`), `src/agent/mainAgent.js` (`buildSystemPrompt`, `buildTailRules`).
The round-by-round cache trace is in `CLAUDE.md`.

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

### World data as a fetched document, validated not whitelisted — v1.4.0

**What it is.** The parts of the prompt that describe the *setting* rather than the *cast* —
identities and their backgrounds, paces, round-phase beats, NPC archetypes, and the Korean
address-form table — moved out of `mainAgent.js` into `public/worlds/kpop_idol/{zh,en,ko}.json`.
`buildSystemPrompt` now takes a `world` argument and renders from it. One world ships, so nothing
a player sees changed.

**What it replaced.** Those strings were template literals and object literals inside
`buildSystemPrompt` and `getIdentityBackground`. That is fine for one setting and blocks every
later one: a second world could only be a second branch in the same function, and the address
table in particular was keyed by output language as though 언니/님/씨 were a Chinese-vs-English
question. They are not. They encode Korean seniority, which is a birth-year boundary; a Japanese
setting needs 先輩/さん/ちゃん and seniority by school year. The table is really keyed on
**(world, language)**, and writing it as (language) alone made "add a country" look like a
translation task.

**What it bought.** A world is now data, so adding one is authoring three JSON files rather than
editing a 300-line function. The static-prompt text also left the JS bundle: **324.73 KB →
317.51 KB** (gzip 116.59 → 109.97), since ~7 KB of identity prose is fetched instead of shipped
to every player in every language. The extraction is verifiable in a way a refactor normally is
not — see below.

**What it costs.** One more runtime fetch and one more mirrored tree (root `worlds/`, which
GitHub Pages serves and which nothing automates — Layer C now loops over `groups/` and `worlds/`
rather than naming one). The per-language file layout triplicates the blocks that are English
rule text in every language, so smoke asserts the three files still agree on them. And
`buildSystemPrompt` is no longer callable without a loaded world, which is a deliberate cost: it
has no default, because a default would be a second copy of every string.

**Validation is the interesting part.** A pure extraction has an exact success criterion —
byte-identical output — but only if something checks it. Two things did. The JSON was generated
*programmatically* from the live literals rather than retyped, then the result was rendered
against the original `getIdentityBackground` across every identity × language × name × seed that
can reach the prompt: **1,368 renders, 0 mismatches**, including all 16 reason × keepsake pairs of
the seeded ex-girlfriend backstory. Then the golden prompts (v1.3.9) had to stay byte-identical
with `update-golden.mjs` never run. They did, after catching one real defect the round-trip could
not: a **trailing space** after the NPC-archetype list, which no reviewer would ever see. That is
the whole argument for goldens in one character.

**`parseWorld` validates and throws; it does not whitelist-copy.** `parseGroupConfig` is a field
whitelist and silently dropped `birthday` for two releases — every member reached the prompt as a
`"2000-01-01"` fallback while sixteen offline checks passed. A missing world key now fails at
load, naming the key. Silence is the wrong default for a loader whose output is invisible until
the writing drifts weeks later.

**v1.4.1 step 1 — the honorific table was still keyed on the wrong axis, one level up.** v1.4.0
moved it out of `buildSystemPrompt` and into the world file, on the argument that it is a
(world, language) table rather than a language one. That is right about the *axis* and wrong about
the *granularity*: four worlds set in Korea would have carried four byte-identical copies of one
Korean table, across three languages each — twelve copies of a thing that changes when the country
changes and at no other time.

So the table moved once more, to `public/worlds/_registers/<lang>.json` keyed by **register**, and
a world names the register its `country` speaks. `parseWorld` resolves it and attaches the result
as `world.addressForms`, which is what makes this a pure data move: `buildSystemPrompt` reads
exactly the field it always read, and the three goldens are byte-identical across the change.

**What it bought**: adding a Korean-set world is now zero new honorific data, and adding a Japanese
one is a second key in an existing file rather than a fourth tree. **What it costs**: one extra
fetch per game, and a world can now name a register that does not exist — which **throws**, because
the alternative is a prompt with no address protocol in it, and that reads as the model choosing
not to use honorifics rather than as a missing file.

**The general shape.** Data that varies with A and not with B belongs in a store keyed by A. Putting
it in the B-shaped file works until there is a second B, and then every copy is a chance for one to
be the copy somebody forgot — which is exactly how `extractStoryText` ended up with two definitions
and a guard written against the one that was still correct.

**Where it lives.** `src/rag/worldLoader.js` (`loadWorldIndex`, `loadWorld`, `parseWorld`,
`MODE_IDS`, `getIdentity`, `getPaceRule`, `renderIdentityBackground`),
`public/worlds/_registers/*`, `public/worlds/index.json`, `public/worlds/kpop_idol/*`, root
`worlds/*`, `buildSystemPrompt` in `src/agent/mainAgent.js`, smoke Layers C, I and J.

**Short form.** The setting became data instead of code, because the honorific table was keyed on
the wrong axis. Proved byte-identical two ways — 1,368 seeded renders and three golden prompts —
and the goldens still found a trailing space that nothing else would have. Then v1.4.1 found the
axis was still one level too coarse and moved the table again, to a register store, byte-identical
a third time.

### Migration that reproduces rather than fixes — v1.4.0

**What it is.** A save written before v1.4.0 records who the player chose but not where they came
from — no group id, no world, no roster — and carries her age where the prompt needs her birth
year. `migrateSave` fills all four at read time, in place, under one rule: **every value written
is one the save already implied.** A game in flight therefore builds a byte-identical system
prompt before and after migrating.

**What it replaced.** Nothing — saves had never been migrated. The absence was itself a bug:
`loadSave` never set the selected group, so loading a TWICE save while Red Velvet was selected
produced a prompt whose `mainMember` was `undefined` and whose cast was the wrong five people.
Optional chaining meant it did not crash, which is why it survived several releases.

**What it bought.** The group a save belongs to is now recorded rather than assumed. The gate is
mechanical: a pinned v1.3.8 slot must migrate and resolve to the same member set `getNpcMembers`
derives today, in the same order, and build the same prompt byte for byte — asserted in smoke
Layer I, and verified to fail against a reversed member order, an off-by-one birth year, and a
disabled group scan.

**The counter-intuitive part is the birth year.** Migration writes `GAME_YEAR - age` — the exact
arithmetic v1.4.0 removed for being wrong about half the time. Writing the *correct* value is
impossible (age does not contain a birth year) and writing a *different* wrong one would move
every honorific in a save mid-run. A player who saved at round 12 and loads a week later must get
the game she left. So the error is preserved deliberately, and correcting it is a separate,
visible act she takes — UI, step 6 — not something a loader does to her save behind her back.

**Identifying the group needs the whole cast, not the main member.** Member ids are not unique
across the library: `x` is a crossover roster sharing seven ids with the groups those members
debuted in, so `irene` alone is genuinely ambiguous between `red_velvet` and `x`. The scan matches
on main **plus every sub**, which separates them whenever the player picked a sub at all; a
remaining tie is broken by the group the app has selected, and a cast no group contains is
**warned about rather than defaulted silently**. That last point is the v1.3.5 lesson applied:
`loadGroupIndex`'s catch returning a hardcoded Red Velvet entry is what made a path bug invisible
for a whole release, and the same swallow with a player's progress attached would read as "the
game replaced my cast".

**What it costs.** The scan fetches every group in the index — nine small files, once, only for a
save that has never been migrated; a save carrying a roster short-circuits before any network
call, which smoke asserts. Idempotence is by field, not by schema number, so a save half-written
by a build between the two shapes is completed rather than trusted or rejected — slightly more
code than `if (save.schema >= 14) return save`, and it cannot be fooled by a schema stamp that got
ahead of the data. The preserved birth-year error is the real cost, and it is permanent for every
save made before v1.4.0.

**Where it lives.** `src/rag/saveMigrator.js` (`migrateSave`, `migrateSaveFields`,
`SAVE_SCHEMA`), the fixture `test/fixtures/save-v138.json`, smoke Layer I.

**Short form.** Migration's job is to make an old save mean what it always meant, not to improve
it. Anything a loader silently corrects, the player experiences as the game changing under her.

---

### Always-on log capture with an opt-in panel — v1.4.0

**What it is.** A 300-entry ring buffer that wraps `console.log/info/warn/error` plus
`window.onerror` and `unhandledrejection`, installed on the first line of `main.jsx`. An in-app
panel renders it, opened with `?debug=1`. Every captured string is run through a redactor that
replaces provider API keys with `***REDACTED***` before it enters the buffer.

**What it replaced.** Nothing — there was no way to see a console on a phone. iOS Safari's
devtools need a tethered Mac, and this project's two most phone-specific failures are exactly the
ones reported through `console.error`: a `QuotaExceededError` from `saveToStorage`, and every
`LLMError` kind. Three of the four defects found in v1.3.9 came from hand play on a phone, and
each one was described by its symptom because the diagnostic was unreachable.

**What it bought.** A bug report that carries its own evidence: tap the badge, tap copy, paste a
log that already has the user agent, viewport, URL, phase, model and round count attached. Not
measured in time saved — it is a first, so there is no before.

**Why the capture is always on and the panel is not.** This is the whole design. A tool you must
enable *before* the bug is a tool you use after reproducing the bug, and some of these bugs need a
twenty-round game to reach. Capture costs one function call per log line and a bounded array, so
it runs for everyone; the panel and its button appear only when asked for.

**Why not just Eruda.** Eruda is a full mobile devtools in a single CDN script and it is supported
here — `?debug=eruda` — but deliberately not the default, for three reasons. It loads a
third-party script into a page holding the player's API key in `localStorage`, which is a trust
decision rather than a convenience. It cannot work offline, and this is an installable PWA. And it
starts recording when it loads, so a boot-time throw — the one class of error nothing else can
see — is already gone by the time it initialises; the buffer is replayed into it on load
specifically to paper over that. The built-in panel has none of those properties and is ~120 lines.

**What it costs.** `console` is monkey-patched for every player, so a stack trace in the desktop
devtools now shows the wrapper as the call site. The buffer holds up to ~600 KB of strings in
memory in the worst case. The redactor is a blocklist of four patterns, so a credential in a shape
nobody anticipated would pass through — it reduces the risk of a leaked key, it does not remove
it. And 6.2 KB of bundle that only a debugging session uses.

**Where it lives.** `src/tools/debugConsole.js` (`installDebugCapture`, `redact`, `debugEnabled`,
`loadEruda`), `src/platforms/DebugPanel.jsx`, one call in `src/main.jsx`, the launcher inside
`App.jsx#NotificationBar`, and smoke Layer I.

**Short form.** A phone has no console, so the app keeps its own — always recording, bounded,
key-redacted, and copyable in one tap. The panel is opt-in; the recording is not, because you
never know you want a log until after the thing has happened.

---

### Korean particle pairs resolved at render time — v1.4.0

**What it is.** The Korean world file writes a particle as the pair Korean conventionally writes it
as — `은/는`, `이/가`, `을/를`, `과/와`, `으로/로` — and `resolveKoreanParticles` picks one after the
surrounding words have been substituted in. For a Hangul word the choice is exact, computed from the
syllable's own encoding: the final consonant is `(code - 0xAC00) % 28`, and 0 means it ends in a
vowel. For a Latin word it deliberately does **not** choose, and renders `은(는)`.

**What it replaced.** One hardcoded form per site, which is the only thing an author *can* write when
the word in front of the particle is a template variable. `{name}` is whichever member the player
picked and `{keepsake}` is one of four, so `ko.json` said `{name}는` — right for Joy, wrong for Irene
(아이린**은**) — and `{reason}로`, giving `미숙함로`. One site had given up and shipped the template
itself: every Korean ex-girlfriend prompt contained a literal `편지을/를`.

**Why not just hardcode the common case.** Because there is no common case: the split across the four
keepsakes is 3–1, and across the group library roughly half the stage names go each way. And why not
guess from the Latin name's last letter — Irene reads 아이린 and ends in a consonant though its last
letter is a vowel; Winter reads 윈터 and ends in a vowel though its last letter is not. A rule that
is wrong half the time in a *prompt* is worse than no rule, because an example is an instruction.

**What it bought.** Not measured against writing quality, and it should not be — this is a
correctness fix in the class of the `Alex--ya` double hyphen: 12 particle sites across the 7 Korean
identity backgrounds, previously wrong for roughly half of all casts, now right for every Hangul word
and honest about every Latin one. 17 unit cases plus 5 mutations in smoke Layer I.

**What it costs.** One pass of five `replaceAll`s per game (not per round — this is inside the static
prompt), and an authoring rule: a new Korean sentence must write the pair, not a form. A guard fails
the suite when a placeholder in `ko.json` is followed by a bare particle, so the rule is enforced
rather than remembered. `은(는)` in a Latin case is visibly a form-filling artifact; that is the
honest rendering of a fact the data does not carry, but it is not beautiful.

**Where it lives.** `src/rag/worldLoader.js` — `PARTICLE_PAIRS`, `finalSound`,
`resolveKoreanParticles`, called last in `renderIdentityBackground`. Data in
`public/worlds/kpop_idol/ko.json`.

**Short form.** A Korean particle depends on the sound of the word before it, and that word is a
variable, so the file writes both and the code picks — exactly where it can know, and visibly not
where it cannot.

---

### An input that cannot express an invalid value — v1.4.0

**What it is.** Choosing a control whose set of reachable values *is* the set of valid values, so
the invalid state cannot be entered — rather than letting the control produce anything and rejecting
the bad ones afterwards. The birth year is picked from a scroll wheel over the legal range instead
of typed into a text field.

**What it replaced, and how that fell short.** A text input, validated downstream.
`birthdayFromYear` returns `""` for anything shorter than four digits, deliberately: a half-typed
`19` must leave the profile invalid, because a two-digit year reaching the address protocol makes
the whole cast either senior or junior to the player at once. That validation is correct and it was
never enough, because **the invalid value still exists** — it has to be represented, displayed,
stored somewhere, and kept out of everything downstream. Each of those is a place to get it wrong,
and step 6 got two of them wrong in one field:

- `type="number"` refuses to render a value it cannot parse, so the box blanked on every keystroke
  and the field was **literally unfillable**. Found only by hand-testing on a phone.
- fixing that needed a second piece of state (`yearDraft`) holding "what the player has typed so
  far", separate from the profile's `birthday`, plus a rule about which one writes when.

A wheel deletes the category. There is no partial value to represent, no draft to keep in step, no
`type=` trap, and no range check on the way out — the wheel over `[1980, 2012]` can emit 33 values
and every one is legal.

**What it bought.** One defect class gone rather than guarded: the partial year, the out-of-range
year, and the unrenderable value all stop being reachable. Two of the three guards that used to
cover them are now about the *bound* instead — which is the thing that can still be wrong, and
invisibly: handing Setup the idol range (1980-2012) would let a player be 14, and handing the editor
the player's range (1946-2008) would offer a 79-year-old idol, and neither looks wrong on screen.
It also fits the data: a year is one of ~60 **ordered** values, which is what a picker is for, and a
numeric keyboard on iOS covers the field it is filling.

**What it costs.**

- **A wheel always displays a value, which is a new way to lie.** Showing `2000` over an empty
  `birthday` makes the field look filled while Save stays disabled with nothing to point at. The fix
  is to seed the stored value from the wheel's opening position, so the displayed value is the
  stored one from the first frame — but note that this is a *silent default*, where the text field
  had an honest blank. A required field that defaults is a field the player may never consider.
- ~60 rows of DOM per wheel, and a scroll handler that must debounce: reporting every row a flick
  passes over would push ~50 values through `onChange`, each one a form write.
- Reaching 1946 from 2000 is one flick with momentum and a long drag without it. Acceptable here
  because the common answers cluster near the default; it would not be for a control whose values
  are uniformly distributed over a wide range.
- The programmatic scroll and the scroll handler form a loop unless one of them is suppressed —
  `selfScroll` is a ref, not state, because the guard must take effect before the next event rather
  than after the next render.

**Where the line is.** This is worth doing when the valid set is small, ordered and enumerable. It
is not a general argument against text inputs: a member's name has no enumerable valid set, and a
picker for one would be absurd. The question to ask is whether the control can produce something the
domain cannot hold — and if it can, whether the set of things it *should* produce is small enough to
show.

**Short form.** Do not validate a value the control should never have been able to produce. A year
is 33 ordered choices, so offer 33 choices.

---

### A crop the player chooses, with the geometry outside the canvas — v1.4.0

**What it is.** Turning a picked image into a stored one in two halves: pure functions that decide
*which region of the source is kept* (`coverScale`, `clampOffset`, `cropRect` in
`src/utils/imageStore.js`), and one browser-only function that draws that region
(`renderCrop`). The component that lets the player drag and pinch (`ImageCropper.jsx`) holds
zoom and offset in state and calls the pure functions; it computes no geometry of its own.

**What it replaced, and how that fell short.** `downscaleCover(file, w, h, q)` did all of it at
once: decode, pick the largest centred region with the target aspect ratio, scale, encode. It is a
reasonable default and it was wrong in practice on every portrait, because a photo taken at arm's
length puts the head in the top third and a centred square crop cuts it off. The player saw a
different result for every upload with no statement anywhere of what the rule was, and reported it
as *"the ratio of the photo and wallpaper is not fixed"* — **an automatic choice with no preview is
indistinguishable from a bug**, because the only thing visible is that the output varies with the
input.

**What the split bought, specifically.** A wrong crop region produces an image that looks plausible
and is wrong — the failure surfaces in the game, days later, as "her face is cut off again". The
component cannot be tested offline: it needs pointer events, a layout and a canvas. The *region*
needs none of those, so moving it out bought eight offline assertions on the thing that can actually
be wrong:

- confirming without touching anything reproduces the old centred crop **exactly**, which is what
  makes deleting `downscaleCover` safe rather than a behaviour change;
- zooming keeps proportionally less, centred on the same point;
- dragging right keeps what was off the left edge (a sign error here is invisible in review and
  obvious in use);
- a drag is refused on the axis with no slack;
- the frame can never leave the image — checked at four zooms against absurd offsets in both
  orientations, which is the assertion that catches a blank corner;
- the region follows the frame's **ratio** and not its size, so a 244px preview and a 360px output
  agree about what was framed.

**What it costs.** ~6 KB of bundle, one extra tap per upload, and a component that only a hand test
can validate. The geometry is also duplicated in one sense: the preview positions the image with a
CSS transform while `cropRect` recomputes the same rectangle in source pixels, so the two have to
agree by construction — the transform is written `translate(-50%,-50%) translate(dx,dy) scale(z)`
precisely so `dx`/`dy` stay in unscaled frame pixels, which is the space the pure functions work
in. Getting that order wrong makes the preview and the result disagree by a factor of the zoom.

**The mutation-testing lesson that came with it.** The first version clamped twice — the offset, and
then the resulting rectangle into the image. Both are individually sufficient, so breaking either
left the escape guard green: **two clamps of one rule is two clamps neither of which can be shown to
work.** One enforcement now, with the surviving `Math.max(0, …)` documented as a floating-point
floor rather than a bound, so it is clear which line is load-bearing.

**Short form.** Split "which pixels" from "draw the pixels". The first is arithmetic and can be
tested; the second needs a browser and cannot. And never let a default crop stand in for a choice
the player can see the results of.

---

### An avatar with nothing to clip — v1.4.0

**What it is.** `MemberFace` paints her photo as the frame's **own background** —
`background-image`, `background-size: cover`, `background-origin: border-box` — and renders no
child element at all. The shape is `border-radius`, full stop: no `overflow: hidden`, no
`clip-path`, no `isolation`. `photoFill` is the one definition of that fill and is used by
`MemberFace`, `MemberPicker` and `RosterBuilder`.

**What it replaced, and how that fell short. This entry has been rewritten twice, and the two
failures are the content.** The obvious construction is `border-radius` + `overflow: hidden` on a
parent wrapping an `<img>`, which is what shipped. On iOS the photo came out **square inside the
round ring** on Bubble, KakaoTalk and Weverse, and correct on Instagram.

- **Attempt one** put the radius on the `<img>`. It fixed Instagram — the one surface that had
  never been broken — and nothing else. The gradient-and-emoji default has no `<img>` to put a
  radius on, and it was square too.
- **Attempt two** moved the frame to `clip-path` and removed `overflow: hidden`, on the reasoning
  that a clip path does not clip by overflow and so is indifferent to compositing. The three
  panels were still square. **And it made the failure worse**: measured in Chromium with
  `clip-path` forced off, `border-radius` still draws the frame as a circle while the `<img>`
  renders as a **full, unclipped square on top of it** — which is exactly the symptom the report
  used the words "a square edge inside the circle" for. Removing the overflow clip removed the
  thing that had been holding the square in.

Both attempts argued about *how* to clip a child. Neither questioned whether there should be a
child. An element's own background is clipped by its own `border-radius` — the most basic
rounding in CSS, painted by the element into its own border box, with no layer boundary to get
wrong. So the third fix deletes the `<img>`.

**Why this was diagnosable at all, after two blind fixes.** A repro harness: esbuild bundles the
real `memberFace.jsx` and the real `cropRect`/`renderCrop` into a page, headless Chrome renders
it at 300px against a lime background with a flat-red photo, and the screenshot is read. Chromium
cannot reproduce an iOS compositing bug — but it can be made to reproduce the *consequence*, by
forcing `clip-path: none` and looking at what is left. That turned "which CSS does iOS dislike"
(unanswerable here) into "what does this component look like when its clip fails" (answerable in
one screenshot). The harness lives in the scratchpad; nothing about it is committed, and the test
images are generated rather than downloaded.

**What it bought.** A shape that cannot depend on an ancestor, one mechanism instead of three
cooperating ones, and two fewer elements on a component consumed by six surfaces. The guards moved
with it: they now assert the component renders **no child**, rather than asserting today's clip
syntax, and a derived scan fails if any screen in `src/` shows a stored photo as a child something
else has to clip. An `<img>` carrying its **own** radius still passes — the tab strip has always
done that, and the tab strip is the one surface never reported square.

**What it costs.** A background image is not an `<img>`: no `alt`, no `loading`, no `onError`. All
three are irrelevant here (the avatar is decorative, the photo is a data URL already in memory, and
the gradient sits underneath as the fallback layer), but a future avatar that needs any of them
cannot use this. `ImageCropper`'s preview is the standing exception and keeps its `<img>`, because
it is panned and zoomed by transform and genuinely must be a child.

**Short form.** Two fixes argued about how to clip the child. The answer was not to have one.
And when the failing platform is out of reach, reproduce the *failure mode* rather than the cause:
disable the mechanism you suspect and look at what the component does without it.

### Data says WHICH, code says WHAT — v1.4.1

**What it is.** A world file declares a list of platform ids (`{social: [...], private: "..."}`) and
nothing else. Everything a platform *is* — its icon, its prompt rule, its JSON schema fragment, its
format rule, its notification badge — lives in one catalog in `src/config/platformConfig.js`, keyed
by that id.

**What it replaced, and how that fell short.** Four platforms named by hand in five places: the JSON
schema example, section 7's rule bullets, the RULES format bullets, section 1's
`bubble/instagram/weverse/KKT` list, and the top bar's four `{icon, type}` literals. Adding a world
with two platforms would have meant editing five lists and remembering all five; the sixth reader
is always the one that still says weverse. Separately, the group library carried
`social_platforms` / `private_chat` that nothing had ever read — the wrong file as well as a dead
field, because the same five members are idols in one world and law students in another.

**Why not put the rules in the world files instead?** That is the split `castLore` takes one field
over, and it is right there and wrong here. `castLore` describes *this world's* organisation, so
three worlds genuinely need three wordings. *"Instagram: Photo social. Style: aesthetic, short
caption + emoji"* is true in a lecture hall exactly as it is in a practice room, so three worlds
would carry three copies of one sentence with nothing keeping them in step — and a translation
layer on top of that, since each world ships in three languages. **Put in data what varies between
worlds; put in code what varies between platforms.**

**The asymmetry that falls out of it.** An unknown id in a *world file* throws at `parseWorld`; an
unknown platform in a *model response* is dropped silently. Both are "an id the catalog does not
have", and they are opposite cases: a world file is authored in this repo, so a typo must fail
loudly rather than render a top-bar button that opens nothing, while a model response is untrusted
text that must never break a round. Filtering happens once, in `executeRound`, before either reader
— the notification strip is a live entry point, and an unfiltered `weverse` would open an overlay
for a platform with no button anywhere else in the app.

**What it bought.** A world declares its platforms and the prompt, the schema and the UI follow. The
step that introduced it rendered a **byte-identical** prompt — `update-golden.mjs` was not run at
all — because every world on disk declares the same three in the same order, so the trimming is
provably a no-op until step 7's content arrives.

**What it costs.** The catalog and the world files must agree on ids, which is a coupling across a
`public/` boundary; that is what the throw is for. And a platform that genuinely behaves differently
in two worlds has nowhere to say so — it would need its rule moved back into world data, at which
point the copies return. Nothing in v1.4.x needs that.

**One guard had to be replaced because it could not fail.** *"Every platform a world declares exists
in the catalog"* is exactly what `parseWorld` throws on, so the mutation crashed the load before the
check ran. A check that duplicates a validator is decoration. The property that *can* fail
independently is the other end — every catalog entry has an overlay the app can open — and it is
what makes the throw worth having.

---

### A list that grows, kept out of the cached prefix — v1.4.1

**What it is.** Places the model invents become map content the player can revisit, while the static
system prompt stays byte-identical for the whole run.

**The obvious thing, and what it costs.** Put the discovered list in the prompt, so the model knows
the map. The static prompt is ~5,500 tokens and is cached after round 1; a list that gains a row
mid-game changes the prefix **the round it changes**, so that round pays full input price on all of
it. This repo has already measured that class of mistake: the ex-girlfriend backstory re-rolling per
round cost **26.7 points** of cache hit rate, A/B, same model both arms. One row on a map is not
worth that, and the cost recurs every time the player finds somewhere new.

**What replaced it.** The fact travels in the **choice string** — *"I head to the noraebang
basement"* — which is in the always-miss dynamic tail, and the history ledger already contains the
round that invented the place. So the model needs no enumeration to understand a revisit.
`memory.places` is client state, read only by the picker, and asserted to reach none of the three
messages.

**What it bought.** The map grows for a whole run at zero prompt cost. `update-golden.mjs` was not
run at all in the step that added the feature — the rendered prompt is byte-identical to the previous
step's, which is the step's gate in its strongest form.

**What it costs.** Two things, both real. The model cannot be *asked* to return to a discovered
place, because nothing in its context lists them — only the player can bring one back, and only
through the picker. And the client has to recognise a discovery from prose, which is a heuristic: the
scene is matched against the canon names, a trailing segment carrying a digit is dropped as the time,
and a name with no letter in it is rejected. Two spellings of one invented place can still be two
rows on the map.

**Where the guard goes when the obvious mutation does not exist.** The plan asked for
*mutation-verify by making `buildSystemPrompt` read `memory.places`*. It takes no `memory` argument,
so that mutation cannot be written and a byte-equality check across a discovery would be vacuous.
The guard sits on every route by which the value could leak instead: `buildHistoryLedger` and
`buildDynamicTail`, which do take memory, and `memoryContext`, the static prompt's only text input.

---

### The world owns what the cast does all day — v1.4.1

**What it is.** Four strings on every world document (`castLife`) plus two more
(`addressContext`) that supply the nouns a handful of prompt sentences used to hardcode: what the
members' daily life consists of, what the player therefore does **not** have, what a member's
social post reacts to, what a `scene` looks like, and the register a work title is spoken in.

**What it replaced.** English literals inside `buildSystemPrompt`. The ROLE CONTRACT enumerated
*"practice, schedules, comebacks, the dorm, this company"*; section 7 named *"the practice she just
left"*; the schema's `scene` rule exemplified *"Practice room, 10PM"*; the work-title sentence said
*"on the job"*.

**How that fell short.** It did not, for one world. With four worlds it is a prompt that tells a
campus game the cast have comebacks, two sections after section 4 has said they are students — a
**specific claim in an authoritative section contradicting a general rule elsewhere**, which is the
one pattern this project has watched the model resolve the wrong way three times. It fails no test
by construction: every golden is `kpop_idol`, where every sentence is true.

**Why not leave it in code with a per-world branch.** A `switch (world.id)` in `buildSystemPrompt`
is the same four strings with the world's name spelled twice and a fifth world requiring a code
change — which is what step 3 deleted `IDENTITIES` for.

**Why not put the whole sentence in the world file.** Because then the *rule* is data: four worlds
would each carry "…is THEIRS. She does not inherit it…", and the next reword touches four files
and reaches three of them. The split is the one step 6 arrived at from the other direction — **the
world says WHICH, the code says WHAT** — applied to prose: the world owns the **noun phrase** that
varies, the code owns the **sentence** that does not.

**The discriminator, stated so it can be applied rather than remembered:** *does this text vary
with the thing the data file is about, or with the thing the code is doing?* "Instagram is photo
social, aesthetic, short caption" does not vary with the world, so it is code (step 6). "Practice,
schedules, comebacks" varies with nothing else, so it is data. `socialReach` is the sharp case:
Instagram's **shape** is the platform's and its **magnitude** is the world's, so one catalog entry
reads a world-supplied value. Step 6 put the whole rule on the code side and shipped
`"likes":800000` into a world where a student's post gets three hundred.

**What it bought.** Three worlds whose prompts assert nothing false about their own cast, with
`kpop_idol` byte-identical on every line these fields feed — the four `castLife` strings and the
two `addressContext` strings are exactly what it already rendered, so the golden diff for this
change is **zero lines**. The five sentences that were genuinely world-neutral were generalised
instead, and those moved all three goldens by six lines each, read once.

**What it costs.** Six more required fields per world document, which is six more things a fifth
world must get right before it loads, and six more strings that a reader of one world file cannot
see the other three copies of. The mitigation is that they are language-invariant and smoke
compares them across zh/en/ko for **every world in the index**, derived from the index rather than
named — so the cost is paid once per world, not once per language.

**The trap it leaves.** `castLife.sceneExample` is English in all three languages, like the rule
that contains it, while the `scene` field itself must be written in the player's language. That is
inherited from the sentence it sits in rather than introduced here, and it is the one place in the
new fields where the example and the instruction disagree about language.

### Structural invariants for layout: one grid cell, one z-ladder — v1.4.2

**What it is.** Two layout requirements from the seventh phone pass are held by the *structure*
rather than by a number anybody maintains. *"The editor panel must be the same size on both
tabs"*: both tab panes are placed in the **same CSS grid cell** (`gridArea: 1 / 1`), so the row is
as tall as the taller of them whatever either one contains, and the inactive pane is
`visibility: hidden`. *"A modal opened from inside a sheet must be drawn above it"*: every
full-screen layer in the cast flow reads its level from one exported `Z` map in `castTheme.js`,
and the suite asserts the **ordering relation** between named layers rather than their values.

**What it replaced.** For the panel: nothing - it was content-sized, so it resized under the
player's thumb when the tab changed. The obvious fix is to measure the taller tab and pin the
panel's height, which was considered and rejected. For the layers: five `zIndex` literals in five
files, with nothing anywhere stating which was meant to be on top - and they were wrong, so
`+ create member` opened the profile editor *underneath* the picker sheet it was tapped in.

**What it bought.** The panel is one height across both tabs and all three member/world
combinations, **measured in headless Chrome: 537px of content in every case**, with no number in
the source to re-measure when a field moves. The ladder turns a class of bug into a check: the
guard reddens on `editor < sheet`, on `cropper < editor`, on two layers sharing a level, and on a
new root that does not read the ladder at all.

**What it costs.** Both tab panes are always mounted - a few hundred extra DOM nodes; acceptable
only because this component fetches nothing and subscribes to nothing, and it would not be if a
pane loaded data on mount. The grid stack also means `display: none` and conditional rendering are
now *forbidden* for these panes, which is a non-obvious constraint the guard has to state
explicitly. The ladder adds one import to five files and one indirection when reading them.

**Where it lives.** `src/platforms/MemberEditor.jsx` (`pane`, the grid body, `resumeBlock`),
`src/platforms/castTheme.js` (`Z`), and the guards in `test/smoke.mjs` around *"the two tabs are
one size"* and *"a modal opened from inside a sheet is drawn above it"*. Design in
`docs/V140_PLAN.md` §22.8.3 and §22.8.5.

**Short form.** If two things must be the same size, give them the same box instead of measuring
one and typing the number into the other. If one layer must sit above another, name both in one
ladder and assert the relation - a pinned pair passes against the same bug the moment somebody
renumbers the other side.

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
