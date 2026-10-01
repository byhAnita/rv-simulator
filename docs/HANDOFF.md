# HANDOFF — the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-01 by Claude Opus 5 (VS Code, main session)
**Handing to:** Claude Opus 5.5 (Claude Code Cloud)
**Reason:** main session running out of credits

---

## Project state

- **v1.4.2 is live.** `main` = `origin/main` = `376fba4`, tagged `v1.4.2`. Untouched by this work.
- **Working branch is `dev`** = `origin/dev` = `1333ed8`, pushed 2026-10-01 so a cloud session can
  see this baton at all. `main` is NOT to be touched.
- **Pushing is a red line.** The push above was explicitly authorised; the next one needs its own ask.
- Tree clean, nothing stashed. `npm run build` clean, `node test/smoke.mjs` **1725 passed / 0 failed**.

---

## The bug

**Reported by Yuhan, 2026-10-01:** on the classic Red Velvet door, default `kpop_idol` world, free
story mode, DeepSeek V4.1 Flash — the same model and cast she played v1.3.9 with — the generated
Chinese in rounds 1 and 2 **reads like machine translation**. It did not in v1.3.9.

**Diagnosed cause.** Measured on the rendered zh golden, v1.3.9 against v1.4.2: the static prompt
grew **+37%** (~5,435 -> ~7,259 tokens) while the **Chinese share of its characters FELL from 18.4%
to 16.2%** — ~4,000 of the ~5,900 new characters are English rules. Every rule governing how the
prose *sounds* was an English sentence describing Chinese writing abstractly, and **no rule anywhere
said what good Chinese prose is.**

**Ruled out, with evidence — do not re-investigate these:**

- **Not the cast data.** `public/groups/red_velvet/zh.json` is byte-identical to `v1.3.9` apart from
  five added `habit` lines and two deleted dead fields.
- **Not the world-detail restaging.** It is correctly skipped in `kpop_idol` (`castLore.useRole` is
  true), and the feature plus both its gates landed in the same commit (`a51dbc8`), so no build has
  ever written a `kpop_idol`-stamped overlay.
- **Not prompt drift.** `backstorySeed` shipped in v1.3.9; smoke builds each prompt twice across 8
  identities x 3 languages, and a live run measured 0 drifts across 8 rounds.
- **Not reproduced on DeepSeek by the harness.** A live run on Yuhan's exact config produced 8/8
  clean rounds of good Chinese. **That is weak evidence, not a refutation** — this repo has measured
  0% vs 26.7% rule violation across two runs of identical code. Yuhan's reading is the instrument.

---

## Done (commit `9e82d09`)

Tier 1 **plumbing**. The eight prose rules now come from `public/worlds/_registers/<lang>.json` under
`prose`, read via `world.prose` and a `P(key)` helper in `buildSystemPrompt`.

All three language files currently hold the **English text verbatim**, so **all six goldens are
unmoved** — the gate that says the wiring changed nothing but the wiring. smoke 1721 -> 1725,
**5 mutations, 5 RED**.

Full reasoning, the eight strings and their placements: `docs/PROMPT_L10N.md`.

---

## YOUR TASK

**Task A — land Yuhan's Chinese, once she has written it.** She is replacing the eight English
values under `prose` in `public/worlds/_registers/zh.json`. She may have done this before you start;
check `git status` and the file.

1. `node test/smoke.mjs` — four guards cover this. If one fails, the message names the problem.
   Common breakages, in order of likelihood:
   - a `{placeholder}` mistyped or dropped (`{lang}`, `{recentBeat}`, `{sceneExample}`) — `renderProse`
     throws on an unknown placeholder and on an empty value, by design
   - a `[Tail Label]` translated inside a value — the guard names it
   - the file saved as LF when the repo is CRLF, or not as UTF-8
2. **Mirror it:** `cp public/worlds/_registers/zh.json worlds/_registers/zh.json`. The root copy is
   what GitHub Pages serves; smoke Layer C fails if they drift.
3. `node scripts/update-golden.mjs`, then **read the diff.** Expect `red_velvet-classic-zh` and
   `chaebol-zh` to move, by exactly the lines she rewrote and nothing else. If an en or ko golden
   moved, something is wrong — stop and report.
4. `npm run build && node test/smoke.mjs`.
5. Commit on `dev` with your own attribution.

**Task B — measure it. THIS CANNOT RUN IN THE CLOUD; hand it back.**

The live arm is what actually answers the bug, and a cloud session cannot do it:

- `.env.local` is gitignored, so the cloud checkout has **no `API_KEY`** — and one must never be put
  into a cloud environment variable, which is visible to anyone using that environment.
- `trusted_only` network access does not reach `api.deepseek.com`.

So **if you are the cloud session, stop after Task A** and write in this file that the live arm is
owed. Yuhan or the VS Code session runs it locally:

```bash
node test/playthrough.mjs --lang zh --group red_velvet --identity 韩娱艺人 --subs 2 --mode free --rounds 8
```

It spends roughly $0.02 for 8 rounds. **Ask Yuhan before running it.** Then **read the eight
stories**, from `report.results[0].rounds[i].transcript.story` in the newest
`test/.out/playthrough-*.json`. The graders returned `8/8 clean · 0 issues` on prose that had not
changed, so **the verdict line is not the instrument.** Report whether the Chinese reads as written
by a Chinese author or as rendered by a translator, and quote lines either way.

The pre-change arm is already recorded in `docs/PROMPT_L10N.md` under *What was measured* — 8/8
clean, 89.6% cache, 662-904 chars per story — so only the post-change arm is owed.

---

## OUT OF SCOPE — leave these for the main session

- **Authoring `prose.voice` and `prose.length`** (Tier 2 in `docs/PROMPT_L10N.md`). `voice` is a new
  rule that does not exist yet, saying what good Chinese prose *is*; `length` changes "350-450 words"
  to a character count. Both are prompt **design**.
- **The Korean translation.** Yuhan is having `ko` written by a reviewer.
- **Reordering the JSON schema.** There is a proposal to restore in-language priming before the
  `story` field. It trades against the Kakao-in-prose fix and needs its own measurement.
- Anything else in `CLAUDE.md`'s open list.

## DO NOT TOUCH

- The JSON schema block, key names, or type rules. A translated key is a key `parseLLMOutput` has no
  level to recover from.
- The `summary` rule — summary is **always English**; it is the history-ledger collapse target.
- Tail labels (`[Rounds Absent]`, `[KKT Channels]`, `[Affections]`, ...). The static prompt points at
  them by name and `buildDynamicTail` emits them in English.
- Section numbers. Five rules cross-reference sections by number and smoke asserts 1..11 in order.
- `world.statNotes`, `world.castLife`, `world.addressContext` — language-invariant English by design,
  identical in all three world files. That is not a bug.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- `CLAUDE.md`'s v1.4.2 pick-up block says the remote has `557e9f7`. It has `5daf039`. The "ahead by
  two" count was right at the time; the named base commit is one behind. Now ahead by three.
