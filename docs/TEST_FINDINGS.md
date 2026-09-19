# Aliyun free-route test findings — 2026-09-16

Testing session against the live Aliyun API with the general `sk-ws-` key in `.env.local`.

**Status: all suggestions below were reviewed and are now implemented.** The findings are kept
as the record of *why* each change exists — the reasoning is not reconstructible from the diff.

## What changed as a result

| Finding | Decision | Where |
| --- | --- | --- |
| `a95b` rejected every request | New family, then removed from the route entirely | `modelConfigs.js` |
| `a95b` could not finish in 90s; `qwen3.5-27b` answers `null` | Both dropped from `ALIYUN_FREE_ROUTE` (28 models now) | `modelConfigs.js` |
| `glm-5.3` always thinks, 3-5x slower | Moved to **last** in the route | `modelConfigs.js` |
| `glm-5.1` truncation showed raw JSON (5/12 rounds) | New `bad_response` kind: retried, then next model | `llmTool.js` |
| `qwen3.8-max` returned a 22-char stub (~8%) | Same path, via a `validateContent` callback | `mainAgent.js` |
| `timeout` ended the round with 24 models untried | Walks to the next model; two in a row blame the connection | `llmTool.js` |
| Unbounded route walk | 4 models / 120s per round, with a "trying another model" toast | `llmTool.js`, `App.jsx` |
| Deep Thinking timed out on ~15% of rounds | Limit doubled to 180s when it is on | `llmTool.js` |
| Deep Thinking corrupts `qwenOpen` JSON | Pinned off for that family | `modelConfigs.js` |
| Exhausted route was a permanent dead end | Hourly recovery probe + manual reset + localized notice | `aliyunRoute.js`, `App.jsx` |
| Failed round collapsed the ledger early | `executeRound` collapses a clone, commits on success | `mainAgent.js` |
| Error notices polluted saves and exports | Tagged `error: true` and filtered | `App.jsx` |

Measured afterwards: `glm-5.1` went from **7/12 to 12/12 clean rounds**, and a live route-mode
playthrough ran **8/8 clean**. Offline suite 371 checks at the time of this sweep (386 after the
deployment-path work later the same day), 381 with the live probe, 28/28 models
accepting our parameters.

**Pricing was deliberately left unchanged** — see the cache section for why.

---

## Fixed

### 1. `qwen3.8-2.4t-a95b` rejected every request (would have broken the free route)

`node test/smoke.mjs --live-free` found it:

```
invalid_parameter_error <400> InternalError.Algo.InvalidParameter:
The value of the enable_thinking parameter is restricted to True.
```

The model sits 6th in `ALIYUN_FREE_ROUTE`, so every free player who got that far
would have had it fail and be dropped from their route permanently for the session.

It is a second always-thinking model, like `glm-5.3`, but this one is **not documented** —
the reference's `enable_thinking` table simply omits the open-weight builds, so no amount
of reading the docs would have caught it. Only the live probe could.

**Fix:** new family `qwenOpenAlways` (no thinking toggle, `max_tokens`, 16384 cap both ways).
All 30 route models now answer: **30/30**, up from 29/30.

### 2. The test that should have caught it was passing vacuously

Layer H asserted "no model returned `bad_request`", but the router catches a per-model
`bad_request`, skips that model, and — when no candidate is left — throws
`free_all_exhausted` instead. The probe only ever saw the generic error, so the assertion
could never fail.

**Fix, in the product not just the test:** `free_all_exhausted` now carries
`.cause = {model, kind, code, message}`, the last model skipped and why. Without it a
mis-parameterised model is invisible behind "all models exhausted" — in the browser console
too, not only in tests. Layer F has two new offline cases pinning this behaviour.

### 3. No guard that error kinds are actually translated

The code can throw 14 `kind`s. Each needs a line in `zh`/`en`/`ko` **and** an entry in the
Help Center Errors tab; a missing one shows the player a blank notice mid-round.
Nothing checked this. New offline **Layer E2** derives the kind list from the source and
asserts all three languages plus `ERROR_ORDER` / `ERROR_HELP_{EN,ZH,KO}` cover it exactly —
in both directions, so a dead translation for a kind we no longer throw also fails.
Currently 14/14 everywhere.

### 4. New test harness: `test/playthrough.mjs`

`--live-free` only proves a model *accepts* our request shape. It says nothing about whether
the model can actually run the game. The new harness plays real multi-round games through
`executeRound` and grades each round: direct-parse (no fallback), story in the player's
language, 4 `A.`–`D.` options, stats in 0–100, prose with no stats box or option lines baked
in, no chain-of-thought leak, social content addressed only to real members — plus the
**cache invariant**: outside a collapse round, the previous history ledger must remain a
byte-identical prefix of the next one. That is the assumption the ~95.8% hit rate rests on
and it had never been checked against live output.

Each model runs in its own child process, so router state and `mainAgent`'s module-level
social buffer cannot interleave.

### 5. Harness bug found and fixed mid-run

The first sweep ran 6 workers starting simultaneously on one key and silently lost three
models. Two causes, both mine: errored rounds emitted no live progress line, and any error
ended the playthrough — so my own test parallelism tripping the account's shared request
rate read as a defect in the model under test. The harness now shows errors live, retries
transient kinds (`rate_limit`, `server_busy`, `network`, `timeout`) with backoff the way a
real player would, and staggers worker starts. Worth remembering when reading any future
sweep: a `retry` count in the results table is usually about the harness, not the model.

### 6. The cache invariant holds — the first sweep's "58 prefix breaks" was my bug

The first full sweep reported a prefix break on rounds 4 and 7 for **every** model, which
would have meant the KV-cache design was broken. It was the harness: `executeRound` collapses
the ledger in place *before* building it, so reading `buildHistoryLedger(memory)` before
calling `executeRound` compares against a ledger that was never sent. The break showed up one
round after each collapse, exactly as that mistake predicts.

The harness now runs `collapseHistoryIfNeeded` itself first (a no-op when `executeRound`
repeats it) and reads the ledger that is actually transmitted. Re-measured: **0 prefix
breaks across 4 collapses**. The append-only ledger behaves as documented.

---

## Full sweep result — 30 models x 12 rounds, zh, Red Velvet, thinking off

*(Run against the pre-fix 30-model route; two of those models were removed as a result.)*

348 rounds, 328 clean, **0 prefix breaks across 87 collapses**. Language lock held everywhere:
all 19 `wrong-language` flags were a side effect of a broken round, never a model narrating in
the wrong language when it worked.

Every failure traced to one of five causes:

| Model | Failure rate | Cause | What the player sees |
| --- | --- | --- | --- |
| `qwen3.5-27b` | **12/12** | returns literal `null` (once `false`, once a bare integer) | the fallback placeholder, every round |
| `glm-5.1` | **5/12** | runs away to exactly 8,192 completion tokens, `finish_reason: length` | **raw truncated JSON as the story text** |
| `glm-5.2` | 2/12 | same runaway once; once stopped mid-sentence after 390 tokens | raw JSON / a 30-character fragment |
| `qwen3.8-max`, `-0902` | 1/12 each | valid JSON with a `story` under 20 chars | `"The story continues..."` |
| `qwen3.8-2.4t-a95b` | **0/0** | never finished a round inside 90s | timeout notice, then stuck |

Three of these deserve attention:

**`glm-5.1` is the worst player-visible failure found.** It is not thinking — `reasoning_tokens`
is absent and normal rounds use 400–1,200 completion tokens — it simply fails to stop, hits the
8,192 cap and gets cut mid-JSON. The parser's repair passes cannot close a string truncated deep
inside `socialContent`, so it falls through to level 4, which returns `text.substring(0, 500)`.
That is why every truncated round is exactly 500 characters: **the player is shown raw JSON**.
Note that raising the cap is not the fix — it would buy a longer runaway at higher cost.

**The 22-character story is our own guard firing.** `validateAndFixOutput`
(`mainAgent.js:422`) replaces any story under 20 characters with `"The story continues..."`.
So `qwen3.8-max` occasionally returns well-formed JSON with an all-but-empty story, and the app
quietly accepts the dead round. `callLLM` retries only when content is *completely* empty, so
this slips through. It is ~8% of rounds on the paid-mode default and the head of the free route.

**`glm-5.3`'s large cap turned out to be necessary.** It spends 2,300–8,000 reasoning tokens per
round despite being sent no thinking toggle, and hit 9,019 completion tokens once — it would have
been truncated in 2 of 12 rounds under the ordinary `glm` family's 8,192 cap. The `glmAlways`
family decision is confirmed correct by live data.

---

## Measured: prompt-cache behaviour

The harness now reads `usage.prompt_tokens_details.cached_tokens` off each response. First
direct evidence for the architecture's headline claim:

The 30-model sweep splits perfectly cleanly by model generation. The distinction that matters
is **absent** (no `prompt_tokens_details` key in `usage` at all) versus **zero** (key present,
this particular call did not hit):

| Models | `cached_tokens` | rounds with a hit | measured rate |
| --- | --- | --- | --- |
| `qwen3.8-*`, `qwen3.7-*`, `glm-*`, `deepseek-*` (17 models) | present | 11 or 12 of 12 | **77–89%** |
| **every `qwen3.6-*` and `qwen3.5-*` (12 models)** | **absent, 12/12 rounds** | 0 | **n/a** |

Two things worth discussing:

1. **Twelve of the thirty free-route models report no prompt caching at all.** Every Qwen 3.5
   and 3.6 build — `qwen3.6-flash`, `qwen3.5-plus`, `qwen3.5-397b-a17b`, the small open-weight
   builds, all of them — omits the field entirely in all 12 rounds, while every 3.7/3.8, GLM and
   DeepSeek model on the same endpoint returns it and hits. The pattern is exact, with no model
   straddling it. This is the open question in to-do #5 ("confirm the `qwen3.6-flash` implicit
   cache-hit price assumption, 20% of input"): the answer appears to be that there is no implicit
   cache to price on that generation, so the published cost strings for those models are
   optimistic — they assume a discount the API does not corroborate. Player-facing, so worth
   settling before release.

   (A separate English-language run showed `qwen3.7-plus` reporting `cached: 0` for six straight
   rounds — field present, no hit. That is a cold-prefix miss, not the same phenomenon, and it is
   run-to-run variance: the same model hit on 11 of 12 rounds in the Chinese sweep.)

2. **The measured rate for models that do cache is 77–89%, not ~95.8% — but the two numbers
   are from different platforms, so they do not contradict each other.** The 95.8% in
   `CLAUDE.md` and `README.md` comes from real DeepSeek **Official** billing on
   `deepseek-v4-flash` over hours of hand play. Everything measured here is **Aliyun**, whose
   implicit cache is block-quantised and extends into the ledger only slowly. DeepSeek's own
   context caching is finer-grained and reports `prompt_cache_hit_tokens` directly.

   **Decision: pricing and the 95.8% figure stay as they are**, to be re-checked against
   DeepSeek Official billing after a long hand-played session rather than rewritten from an
   Aliyun measurement. The Aliyun numbers below stand as a platform-specific observation.

   Member count is *not* a factor, which was the other hypothesis. Same model, same settings:
   0 subs 81.4% / 82.6%, 1 sub 79.5% / 83.1%, 2 subs 83.6% — flat. Selection only changes the
   ~150-token dynamic tail; the cache covers the static system prompt, which is driven by group
   size instead (Red Velvet 83.6%, TWICE 87.6% on the same model).

   The detail behind the Aliyun figure: A 30-round game (the length `CLAUDE.md` says is needed for steady state)
   came in at **79.0%** and **83.6%**, with a clear sawtooth on the 3-round collapse cycle:
   ~90% on the round right after a collapse, falling to ~75-80% as two full stories accumulate,
   then repeating. `cached_tokens` grew 4,224 → 6,144 over the 30 rounds while the prompt grew
   4,356 → 6,945, so the cache tracks the static prompt plus the summarised ledger, and the two
   or three recent full stories are always a miss — exactly as designed, just not at 95.8%.

   **Cost impact, if these Aliyun numbers were used.** The cost table assumes a 7,664-hit /
   336-miss profile (4.2% miss); the Aliyun measurement is ~16% miss on Red Velvet. That would
   put `qwen3.8-flash` about **15% above** its published string, and `qwen3.6-flash` — which
   reports no cache at all — near **1.9x**. Not applied, per the decision above, but this is the
   size of the gap to check for when the DeepSeek Official billing figure is revisited.

---

## Language lock: clean

`en` and `ko` playthroughs (4 models x 6 rounds each) came back **24/24 clean** in both
languages, as did the 348-round Chinese sweep. Story length differs as expected (~2,400 chars
in English, ~1,000 in Korean, ~650 in Chinese for the same content). No model narrated in the
wrong language while otherwise working.

---

## Deep Thinking ON: two problems, first live test

The toggle had never been exercised against the API. 5 models x 4 rounds:

**1. Rounds routinely exceed the 90s client timeout.** Three of the five models needed a retry
after a timeout — roughly 15% of rounds. Observed wall-clock including the retry: `qwen3.8-max`
165s, `qwen3.7-plus` 157s, `qwen3.6-27b` 162s. My harness retries transient failures; **the game
does not** — `timeout` has no retry policy in `RETRY_DELAYS_MS`, so a real player turning Deep
Thinking on gets a timeout notice instead of a story on a meaningful fraction of rounds.

`REQUEST_TIMEOUT_MS` is a flat 90s regardless of mode. Suggest scaling it with
`reasoningEnabled` (180s or so) — a thinking round legitimately takes 2-4x longer, and the
current constant was presumably chosen for the thinking-off default.

The existing warning (`t.aliyun.free.thinkingWarning`, "free credits drain ~2x faster") is about
cost only. Measured token cost is consistent with that — reasoning adds 650–4,300 tokens/round —
but it says nothing about the latency, which is the more noticeable effect.

**2. Deep Thinking breaks JSON output on the small open-weight builds.** `qwen3.6-27b` scored
12/12 clean with thinking off, and **3 of 4 rounds failed with it on**. It returns the entire
JSON *escaped inside a string*, behind a stray `">` fragment:

```
">{\"scene\":\"SM...\",\"statChanges\":{\"selfId\":1,...
```

The parser's extraction regex looks for `{"scene"` and cannot match `{\"scene\"`, so every
repair level fails and the player is shown 500 characters of raw escaped JSON. The `qwenOpen`
family sends `enable_thinking: true` with no `reasoning_effort` (the reference gives no effort
values for these builds), and this is what comes back. Worth considering whether Deep Thinking
should simply be a no-op for that family.

---

## Observations (not defects)

**`glm-5.3` is slow enough to be a risk.** Rounds measured at 29s, 36s, 67s and 72s against
the client's 90s timeout, versus ~15-20s for the Qwen hybrids. It always thinks and cannot
be told not to. It currently sits 3rd in the free route, so free players hit it early. See
suggestion 4.

**`qwen3.8-2.4t-a95b` is worse than slow — it is unusable.** Now that it accepts our
parameters, it still cannot finish a round inside the 90s client timeout: one round completed
only after 4 retries (282s of wall clock), the next timed out three times and ended the
playthrough. It sits 6th in the free route. See suggestions 6 and 7.

**`qwen3.5-27b` cannot run the game at all.** 10 rounds, 10 failures: every response fell
through all four parser levels to the safe defaults, with a 4-character body. The player
would see the same fallback story every round. It sits last (30th) in the route, so only
players who exhaust everything above it arrive there — but arriving there is worse than
being told the route is empty. See suggestion 6.

**The flagship default returns an occasional 22-character story.** `qwen3.8-max` did it once
in 12 rounds and `qwen3.8-max-0902` twice; the JSON parsed directly, so the model simply
returned a near-empty `story` and no `summary`. This matters more than the others because
`qwen3.8-max` is the paid-mode default and heads the free route. The same thing happened once
in the route-mode playthrough, which `qwen3.8-max` served — so it is reproducible, not an
artifact of pinning.

---

## Suggestions (not implemented — for discussion)

### 1. Free-route exhaustion is permanent with no way back

`exhausted` entries are never cleared, which is right for a one-time new-user grant. But a
player who later tops up their Aliyun account still has every model marked used-up, and free
mode stays dead forever unless they change the API key. There is no reset in the UI.

Options: a "reset free route" link on the key page; or clear the flag automatically when a
paid-mode call on the same key succeeds; or expire `exhausted` after ~30 days the way
`model_unavailable` expires after 24h.

### 2. The route walk has no total deadline and no progress feedback

Each model gets its own 90s timeout, and the route is 30 models. A pathological case — many
models timing out rather than failing fast — leaves the player on a loading spinner for a
very long time with no indication anything is happening. `onModelSwitch` only fires *after*
a model succeeds.

Suggest an overall budget for the round (stop and show `free_all_exhausted` after, say, 120s
or 4 failed models), and a "trying another model…" notice while walking.

### 3. A failed round permanently collapses the history ledger

`collapseHistoryIfNeeded(memory)` mutates memory in place at the *start* of `executeRound`,
before the LLM call. If the call then fails, the collapse has already happened: full stories
for that window are gone, replaced by their summaries.

It self-heals if the player taps ↺ Retry (`regenerateRound` deep-clones the pre-round
snapshot), but not if they simply pick another option. Consequence is mild — one extra cache
miss and some lost narrative detail, no crash — but it is avoidable by collapsing only after
a successful response, or by working on a clone inside `executeRound`.

Pre-existing behaviour, not introduced by the Aliyun work.

### 4. Reconsider where the two always-thinking models sit in the route

`glm-5.3` (3rd) and `qwen3.8-2.4t-a95b` (6th) cost roughly 2x the tokens and 2-4x the time
of the hybrids, even with Deep Thinking off, because they cannot be told to stop thinking.
Free players meet both early, and the game feels markedly slower there. Since the route is
ordered by storytelling quality, this is a real trade-off rather than an obvious bug — worth
a deliberate decision. Demoting them below the Qwen hybrids would make the free experience
faster and stretch each model's allowance further.

### 5. Error notices are stored as story messages

`llmErrorNotice` output is appended to `messages`, which means it is written into save slots
and appears in story exports (`extractStoryText` has no filter for it). Marking those
messages so export and save can skip them would keep exported stories clean.

### 6. Two models in the free route should probably not be in it

Both are *correct* now — they accept our parameters — but neither can serve a playable round:

* `qwen3.8-2.4t-a95b` (6th): cannot finish inside the 90s timeout, 0 of 12 rounds.
  A free player reaching it waits 90s, sees a timeout notice, and — because `timeout` is not a
  kind the router skips on — hits it again on the very next round. That is a dead end.
* `qwen3.5-27b` (30th, last): 0 of 12 rounds produced parseable output; it answers `null`.

Options per model: drop it from `ALIYUN_FREE_ROUTE`, or move it to the end and accept the
cost. For `a95b` specifically there is a third option worth considering regardless — see
suggestion 7, which is the underlying defect.

### 7. `timeout` should probably make the router try the next model

`callAliyunFreeRoute` (`llmTool.js:158`) rethrows any kind it does not explicitly skip, and
`timeout` is one of those — so one slow model ends the round with 20+ untried models behind it,
and does so again every round. Adding `timeout` to the skip list with a short TTL, the way
`model_unavailable` gets 24h, would turn a permanent dead end into a one-round hiccup.

The counter-argument is that a timeout can be the player's own network, in which case walking
the route means several 90s waits stacked up. That argues for pairing it with suggestion 2's
overall round budget.

### 8. Retry responses that are known-bad instead of showing them

Two failure modes reach the player as visible garbage, and both are detectable before render:

* `finish_reason === "length"` — the JSON is truncated by construction, the parser cannot
  repair it, and the player is shown `text.substring(0, 500)` of raw JSON. Hit `glm-5.1` on
  5 of 12 rounds.
* a parsed story under 20 characters — `validateAndFixOutput` already detects this (it
  substitutes `"The story continues..."`), it just substitutes instead of retrying. Hit
  `qwen3.8-max` on ~8% of rounds.

`callLLM` already retries twice when content is completely empty; these are the same class of
non-answer. The cost is one extra generation on an already-wasted round.

### 9. Deep Thinking needs a longer timeout, and maybe fewer models

From the live run above: ~15% of thinking rounds exceed the flat 90s `REQUEST_TIMEOUT_MS`, and
`timeout` has no retry policy, so the player gets an error instead of a story. Scaling the
timeout with `reasoningEnabled` (180s or so) is the direct fix. Separately, Deep Thinking
corrupts JSON output on the `qwenOpen` family (`qwen3.6-27b`: 12/12 clean off, 1/4 on) — worth
considering making it a no-op there.

### 10. The cost strings need recomputing

Covered in the cache section: the table assumes a 95.8% hit rate, measured is ~83%, and twelve
route models appear not to cache at all. `qwen3.6-flash` looks close to 1.9x its published cost.
These numbers are on the paid-mode cost cards, so they are player-facing.

### 11. When the free route empties, the key page does not say what to do

The status line renders `— · 0/30` and the player is left to work it out. A line pointing at
paid mode when `available === 0` would close the loop.
