# Proposals

Changes worth making that are **not made**, because they are larger than one commit, they change
something a player would notice in a way worth deciding deliberately, or their benefit is a
hypothesis and shipping them alongside another change would destroy the measurement.

Each entry says what, why, what it would cost, and — most importantly — **what evidence would settle
it**. A proposal with no such line is a preference, and preferences belong in a conversation rather
than a file.

Nothing here is in progress. Delete an entry when it lands or when it is decided against, and say
which in the commit message.

---

## 1. Emit `statChanges` and `affectionChanges` after the story, not before

**Written 2026-09-27, during v1.4.0 step 7.**

**What.** Move the two number fields below `story`/`summary` in the JSON schema, giving the order
`scene, story, summary, statChanges, affectionChanges, socialContent, kktMessages, options`.

**Why.** A model emits keys in the order it is shown them, so today it commits to "+5 affection,
-3 secrecy" *before* writing the scene that is supposed to earn them. The prose is then written to
justify numbers guessed from the state block alone. This is the same mechanism that put a Kakao in the
prose — `kktMessages` sat immediately before `story`, the message was the freshest thing in context,
and the model wrote the scene around it. That one is fixed by moving `story` ahead of the social
fields; the argument applies unchanged to the numbers.

**The symptom is measured and it is total. Across 85 rounds — four identities, four paces, three
languages — there are ZERO negative affection steps.** 81 transitions, every one of them up or flat.
And every run saturates: in the 25-round configuration `selfId` went 29→100, `secrecy` 100→11, `mood`
72→100 and affection 15→100, so by round 22 the game had nothing left to move. The other three
configurations differ only in how far they got.

Section 9 asks for *"60% sweet, 30% realistic pressure, 10% youthful regret"* and the schema permits
`+/-1 to +/-10`. Neither is reaching the numbers.

**This is the strongest reason to try the reorder, and it makes the experiment predictive rather than
aesthetic.** A model that must emit `affectionChanges` **before** writing the scene cannot make the
number follow the scene — it can only guess a plausible one, and the plausible guess in a dating sim is
always upward. If that is the mechanism, moving the numbers after the story should produce the first
negative deltas this project has ever recorded. If they still never appear, the cause is elsewhere and
the prompt needs to say that a round can cost her something — which is a question about how the game
should feel, and Yuhan's.

`scripts/analyze-prose.mjs` reports `median step`, rounds at the ±8 clamp, negative count, and each
stat's trajectory, so the comparison is one command.

**What it would cost.** All three goldens move. It is the second reorder in one release, and each one
asks a model to restructure a long response — the 4-level parser exists because the weaker route
models struggle with exactly that. `scene` would also stop being adjacent to the fields that follow
from it.

**Why it is not done.** The Kakao reorder is justified by a confirmed, repeated live defect. This one
is justified by symmetry only. Shipping both at once means a later measurement cannot attribute a
change to either.

**What would settle it.** Two runs of ~20 rounds on the same identity, pace and language, one per
order, comparing from `scripts/analyze-prose.mjs`: the spread of affection deltas, how many rounds
move each stat, and the `direct` parse rate. If deltas spread and parse quality holds, take it. If
the `direct` rate drops at all, the cost is real and the case is weak.

---

## 2. Say the story length in a unit each language actually has

**Written 2026-09-27, during v1.4.0 step 7.**

**What.** Replace `Story length: 350 - 450 words in <language>` with a per-language band: characters
for `zh` and `ko`, words for `en`.

**Why.** "Words" is not a unit Chinese or Korean prose is measured in, so for two of the three
languages the prompt states a length in a unit that does not apply and the model interprets it.
Measured: a zh round comes out at **794-965 characters** against a band whose upper bound is 450 of
anything — roughly double, if the model is reading 2 characters to a word. Nothing is *wrong* with
the result: ~800 characters is about the 800 output tokens the README's cost model and every cost
string in the app already assume. But the length the game gets is an accident of interpretation
rather than a number anyone chose, and the same sentence is being read differently in each language.

**What it might buy.** A length that is specified. It also makes the cost model honest: the README
derives every per-round price from 800 output tokens, which the zh band supports and the en band may
not — 350-450 English words is ~500-650 tokens, so an English player's rounds may be materially
cheaper than the table says, or the en prose may be materially shorter than the zh prose for no
reason a player would want.

**What it would cost.** All three goldens move. If the new zh band is written as what is already
produced (~750-900 characters), nothing about the output changes and the only gain is that it is
stated; if it is written lower, every zh round gets shorter and the cost strings need rechecking.

**Measured across four configurations, 85 rounds, 2026-09-27.** The comparable number is **completion
tokens**, not characters: comparing a Chinese character count to an English word count is not a ratio,
and doing that is what made the first version of this entry overstate the problem.

| config | rounds | median completion | vs the assumed 800 | median prompt |
| --- | --- | --- | --- | --- |
| zh `财阀` / `高压舆论向` | 25 | **1,710** | 2.14x | 7,874 |
| zh `练习生` / `慢热现实向` | 20 | **1,086** | 1.36x | 7,389 |
| en `Staff` / `修罗海王向` | 20 | **1,177** | 1.47x | 9,629 |
| ko `主线成员前女友` / `浪漫情感向` | 20 | **1,572** | 1.97x | 8,922 |

**Every configuration exceeds the assumption, in every language, by 1.4x to 2.1x.** The README derives
each per-round price from **800 output tokens**; input matches its profile closely. Output is the
expensive component everywhere (DeepSeek bills ￥4 per 1M output against ￥1 input and ￥0.02
cache-hit), so `MODEL_CONFIGS[*].gameplay`, `ALIYUN_PAID_MODELS[*].gameplay` and the README cost table
quote roughly **60% of what a round costs**. That part is not a matter of taste.

**In each language's own unit**, which is what the band should have been stated in:

| | asked | zh | en | ko |
| --- | --- | --- | --- | --- |
| `story` | 350-450 "words" | median 1,139 chars | median **482 words** | median 1,002 chars |
| `summary` | "one sentence (~100 chars)" | median **303**, up to 506 | median 141 | median 138 |

**English lands near its band; the two languages where "words" means nothing are unspecified.** en is
482 against a 450 ceiling — 1.07x, roughly on spec. zh and ko produce ~1,000-1,100 characters, which
is *in the same neighbourhood* by reading length but arrived at by interpretation rather than by
instruction.

**The summary is the sharpest single case, and it is zh-specific.** 303 characters of 2-4 sentences
against "one sentence (~100 chars)" — while en and ko both land near 140. The summary is the collapse
target, so it becomes the permanent cached ledger entry: at 300 characters the ledger is ~3x the size
the *Round-by-Round Cache Trace* in CLAUDE.md is drawn with (~25 tokens per `S` entry). This one
enforces a number Yuhan already chose, so it is the piece of this that needs no decision.

**And there is no effective upper bound at all — the round gets more expensive the longer you play.**
Across the 25-round configuration, in order:

| round | story chars | summary chars | completion tokens | prompt tokens |
| --- | --- | --- | --- | --- |
| 0 | 946 | 235 | 1,030 | 6,248 |
| 8 | 1,051 | 308 | 1,622 | 8,141 |
| 14 | 1,994 | 317 | 2,655 | 8,801 |
| 20 | 1,936 | 368 | 2,856 | 10,193 |
| 24 | 1,042 | 356 | 1,959 | 8,857 |

Input growing is the design — the ledger accumulates. **Output growing is not designed and nothing
asks for it**: the model is matching the register of a lengthening context, so completion tokens go
from 1,030 to 2,856 and the summary climbs steadily from 186 characters to 506. A player's cost per
round roughly doubles over 25 rounds, as does the reading time, and the usage panel will show her the
first of those.

So the specification is not merely stated in the wrong unit; it is **not functioning as a bound**. A
band that yields 1,994 characters at round 14 is not constraining anything.

**Not touched here, because the right band is an authorial choice.** ~1,100 characters is about two
minutes of reading on a 390px screen, and whether that is the game or twice the game is Yuhan's call.
The three plausible answers: state ~1,100 for zh/ko and **fix the cost table to match the measured
tokens**; state ~800 and accept shorter rounds; or leave the story alone and change nothing but the
cost table, since the lengths are defensible and only the arithmetic is wrong.

**What is being done now, separately from that choice:** the summary only, tightened to a number
already written down (`100-150 characters`, ONE sentence) with the reason attached — it is what
replaces the whole story in the model's memory three rounds later.

**A ceiling on the story is NOT added, on reflection.** It would need a number per language, because
the three are measured in different units, and choosing those numbers *is* the authorial decision this
entry exists to defer. Bounding the drift and setting the band are the same act.

---

## 3. Give the ledger's summaries the player's choice back

**Written 2026-09-27, during v1.4.0 step 7.**

**What.** Either keep `choice` on a history entry when `collapseHistoryIfNeeded` converts it to a
summary, or state in the schema that `summary` must record what the player did.

**Why.** A collapsed entry is `{round, type:'summary', text}` — the `choice` field is dropped. So
after three rounds the model can no longer see what the *player* chose, only what happened. In a
dating sim the player's own arc is the thing continuity is most about: whether she has been bold or
careful for twenty rounds is exactly what a member should remember.

**Evidence it may not matter.** Sampled summaries already do it unprompted — *"You chaired the first
comeback meeting"*, *"You visited the practice corridor at dusk"*. The field is asked for as "what
happened this round and who appeared", and the model volunteers the player's action anyway.

**What it would cost.** Keeping `choice` adds ~15 tokens to every summary, against a summary that is
~25 — a large relative increase in the one block that is designed to stay small, and it is the
*cached* block, so it is cheap per round but permanent. Asking the summary to include the action
costs nothing at all.

**Why it is not done.** The cheap version (ask the summary for it) is probably sufficient and is worth
doing on its own, but it changes what the model writes into a field that becomes permanent memory, and
that deserves a measurement rather than a guess.

**What would settle it.** Count, across ~20 rounds, how many summaries name the player's action
without being asked. If it is most of them, ask for it explicitly and change nothing else. If it is
patchy, ask for it explicitly and re-measure before considering the token cost of carrying `choice`.

---

## 4. Decide what the member probability engine is for — wire it or delete it

**Written 2026-09-27, during v1.4.0 step 7.**

**What is true today.** `probabilityEngine.js` computes a weighted probability per romanceable member
— `affection 40% + balance 30% + recency 20% + random 10%`, with a 0.3 floor for anyone absent four
rounds and a 0.7 cap otherwise — and `pickPrimaryMember` draws one. CLAUDE.md documents the formula
and calls it the Member Probability Engine.

**It is a closed loop.** `pickPrimaryMember` is called at `mainAgent.js:756`, which is **after** the
LLM call. Its result `primaryId` has exactly one use: writing `memberAppearances: {[primaryId]:
[roundNum]}`. And `memberAppearances` has exactly one reader: the recency term of
`calculateProbability`. Nothing about the engine reaches the prompt, the UI, the save's meaning, or
the player. It is a lottery that records its own results so it can consult them next time.

Worse, the record is fiction. The **model** decides who appears in a round; the engine draws a name
afterwards and writes down that she appeared. A member the story never mentioned is logged as having
been there, and a member who carried the whole scene may not be. So the recency term — which v1.3.1
fixed a real bug in, and which smoke Layer D guards with a pinned `Math.random` — is computed over
data that does not describe the game.

**Two ways out, and they are opposite.**

*Delete it.* Removes ~65 lines, one documented "technique" that does nothing, a `Math.random` in the
round path, and a CLAUDE.md section describing behaviour the game does not have. Rotation would then
rest entirely where it already rests: section 3's instruction to the model.

*Wire it.* Move the draw **before** the LLM call and put the result in the dynamic tail — "centre this
round on Wendy". That is presumably what it was always for, and it would make rotation mechanical
rather than a request. Section 3 already asks for rotation in words; the measured evidence is that the
model complies in short runs, but a 25-round game is where a main member starts to crowd everyone out,
and `scripts/analyze-prose.mjs` reports each member's max absence gap so the question is answerable.

**Why it is not done either way.** Wiring it changes the writing in a way a player would feel, and it
could easily feel worse — a scene steered to a member the story had no reason to reach is the
mechanical-feeling failure this game's whole prompt design avoids. Deleting it throws away a design
someone intended. Neither is a decision a test can make.

**Measured, and it answers the question: the prompt does not solve rotation.** 25 rounds, zh, 财阀,
1 main + 2 subs, counting which members the prose actually names:

| | rounds present | longest absence |
| --- | --- | --- |
| Irene (main) | 23 / 25 | 2 |
| Seulgi (sub) | 9 / 25 | **9** |
| Wendy (sub) | 13 / 25 | **6** |

A second run, 20 rounds, zh, `练习生`, 1 main + 2 subs, is worse:

| | rounds present | longest absence |
| --- | --- | --- |
| Irene (main) | 17 / 20 | 2 |
| Seulgi (sub) | 6 / 20 | 9 |
| Wendy (sub) | **1 / 20** | **17** |
| Joy (NPC) | **0 / 20** | — |

A romanceable member the player chose appeared **once in twenty rounds**, and an NPC the prompt says
"must appear in background" never appeared at all.

Section 3 says *"sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable
member disappear for more than 3 rounds."* A nine-round absence is not a near miss.

**But the conclusion is not "wire the lottery".** The model is not refusing the rule — it cannot
*apply* it, because nothing tells it how long anyone has been away. It gets `[Affections]` and
`[NPC Appearances]` (which never renders), and neither is a count of rounds since a member last
appeared. A lottery result — "centre this round on Wendy" — would steer the scene from outside the
story; a **fact** — "Seulgi has not appeared for 4 rounds" — lets the model honour a rule it was
already given, and is the kind of thing the rest of this prompt is built out of.

So the first thing to try is the third option that was not on the list: derive appearances from the
prose (see 5) and put the absence counts in the dynamic tail. That needs no decision about whether
rotation should feel mechanical, because it does not steer anything. **If that does not fix it**, the
choice between wiring and deleting the engine comes back, with better evidence.

---

## 5. Observe who appeared instead of drawing it — and make `[NPC Appearances]` exist

**Written 2026-09-27, during v1.4.0 step 7.**

**What.** Derive both appearance records from the story text rather than from a lottery or from
nothing: a member appeared this round if the prose names her.

**Why, for NPCs, this is a plain bug rather than a design question.** `mainAgent.js` does
`const npcAppearances = { ...memory.npcAppearances };` and writes it back **unchanged**. Nothing ever
adds an entry, so the object is `{}` for the life of every save. Therefore:

- The `[NPC Appearances] Joy(last: round 2)` line in the dynamic tail **never renders** — its guard is
  `Object.keys(...).length > 0`. CLAUDE.md documents it as a live line and shows that exact example.
- Section 8's `NPC: max 1 dialogue/round, 2-round cooldown` refers to information the model is never
  given, so the cooldown half of that rule has never been enforceable.

This is the third piece of NPC machinery that turns out to be inert: `NPC_APPEARANCE_CHANCE` and
`NPC_COOLDOWN_ROUNDS` are already documented as imported by nothing.

**The fix is small and the detector already exists.** `scripts/analyze-prose.mjs` measures rotation by
checking which member names occur in each round's prose, and names in this library are distinctive
enough that a substring test is reliable. The same test in `executeRound` would make both records
describe what happened.

**What it would cost.** A scan of the story per cast member, once per round. `[NPC Appearances]` would
start rendering, which adds a line to the always-miss tail and moves nothing cached. It would also
make `calculateProbability`'s recency term real for the first time — which is a change in behaviour,
not just in bookkeeping, and smoke Layer D's pinned-random guard would need rereading.

**Why it is not done.** It is entangled with 4. If the engine is deleted, `memberAppearances` has no
reader at all and deriving it honestly is work for nobody; only the NPC half is worth fixing. If the
engine is wired, both halves matter and the appearance data must be real first. So this should land
**with** whichever way 4 is decided, not before it.

**What would settle it.** Nothing to measure — this one waits on a decision, not on evidence. The NPC
half could be split out and done now if `[NPC Appearances]` is wanted in the tail regardless.

---

## 6. One of the five endings is shadowed by the two above it, and one common state reaches none

**Written 2026-09-27, during v1.4.0 step 7.** Read `src/config/achievements.js` alongside this.

`checkAchievement` runs every round from 30 on, returns the **first** definition whose condition
holds, and each id fires at most once — so a run accumulates endings as the stats drift rather than
stopping at one. The conditions, in the order they are tested:

| # | id | condition |
| --- | --- | --- |
| 1 | `he_hidden_love` | `secrecy > 60 && topAff > 90` |
| 2 | `se_public_love` | `secrecy < 60 && topAff > 90` |
| 3 | `be_exposed_separation` | `secrecy < 45 && topAff < 90` |
| 4 | `oe_unspoken_waiting` | `selfId < 90 && topAff > 90` |
| 5 | `be_you_left` | `mood < 85 && topAff < 90` |

**#4 is unreachable except at `secrecy === 60` exactly.** Every state it describes has `topAff > 90`,
and #1 and #2 between them claim `topAff > 90` for all secrecy **except** the single integer 60. So the
one ending about loving each other while she has not accepted herself — which reads like the most
interesting of the five — fires only when secrecy lands on exactly 60 in a round where `selfId < 90`.
Secrecy is an integer moved by ±1..10 per round, so this is incidental rather than strictly impossible;
"shadowed" is the accurate word, not "dead".

**And `topAff < 90 && secrecy >= 45 && mood >= 85` matches nothing.** #3 needs secrecy below 45, #5
needs mood below 85. A player who is discreet, cheerful, and only moderately loved therefore collects
no ending on that round — and if she stays in that state, none at all. That is not an exotic corner; it
is what a careful slow-burn run looks like.

**What the fix probably is, and why it is not applied.** Testing #4 before #1 and #2 would make it
reachable and reads as the intended precedence (unresolved self-identity outranks the
hidden/public distinction). Widening #3 or #5 — or adding a sixth, "nothing resolved" ending — would
close the hole. **Both change which ending a player gets, which is authorship, not a bug fix.** The
five titles and descriptions are written in three languages and carry a clear authorial intent about
what each one *means*; guessing at the precedence between them is not mine to do.

**What would settle it.** Yuhan deciding. The useful thing a test can add meanwhile: a check that the
five conditions partition the reachable state space, so that whatever the answer is, no state falls
through and no ending is shadowed. That guard is worth writing **after** the conditions are decided,
not before — written now it would pin today's behaviour as the requirement.

---

## 7. The option fallbacks are English in every language

**Written 2026-09-27, during v1.4.0 step 7.**

**What is true today.** `validateAndFixOutput` pads a short option list with `"D. Custom"`, and
`parseLLMOutput`'s level-4 fallback returns `["A. Continue", "B. Change topic", "C. Stay silent",
"D. Custom"]`. Both are English literals. So a Chinese or Korean player whose round fails to parse is
shown four English buttons.

**Why it is not fixed here.** Neither function knows the language: `parseLLMOutput` is called from
`executeRound` (which does know) and from `hasUsableStory` (which is a content probe inside the LLM
client's retry path). Threading `language` through both, or duplicating the i18n option strings into
`mainAgent.js`, is more surface than the defect deserves without evidence that it fires — and the
`parseLevel` distribution is exactly what `scripts/analyze-prose.mjs` now reports, so the evidence is
cheap to get.

**What would settle it.** The `direct` parse rate across a long run. If level 4 is never reached, this
is a cosmetic defect on a path players do not travel and can stay written down. If it is reached, the
right fix is probably that `executeRound` localises the options after parsing, since it is the one
place that has both the language and the result.

---

## 8. Unify how the two halves of the ledger label a round

**Written 2026-09-27, during v1.4.0 step 7.**

**What.** `buildHistoryLedger` writes collapsed entries as `R4: <summary>` and full entries as
`=== Round 4 ===\n<story>`. Two shapes for the same thing in one block.

**Why it might matter.** Nothing says the two are the same series, so a model has to infer it. A
short header before each group ("earlier rounds, one line each" / "recent rounds in full") would make
the structure explicit.

**Why it is not done.** There is no evidence of confusion — continuity in the sampled runs is good,
and the summaries reference earlier rounds correctly. Headers cost tokens in the cached block, and
changing the format costs every save in flight one full ledger cache miss. This is a tidiness
argument wearing a correctness costume until something shows the model mis-reading it.

**What would settle it.** A round where the model attributes an event to the wrong round number, or
treats the summary block as something other than earlier history. Worth watching for; not worth
looking for.
