# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-21 by Claude Opus 5.5 (main VS Code session)
**Handing to:** the next session - continue `docs/V144_PLAN.md` at **P2**

---

## Project state

- **v1.4.3 is released**, deployed 2026-10-02, tagged on `adf19b9`. `dev` carries unreleased work.
- `dev` = `origin/dev` after the last commit of the night (check `git log origin/dev..dev`).
- `npm run build` clean; `node test/smoke.mjs` **1737 / 0**.
- Yuhan's zh review is complete: 620 of 620 approved. Campus `prof_of_cast` is a cafe owner,
  addressed 老板 / **sajang-nim** / 사장님.

## What the overnight run did (autonomous, on Yuhan's instruction)

Three commits, each validated (build + smoke + mutation) and pushed to `dev`:

1. **`bf0cc4e`** - a world-level `NO ONE IN THIS CAST IS AN IDOL` rule for every non-idol world,
   independent of restaging; the restaging prompts learn the player's role so no member is cast
   into it (the Joy barista); en `Boss` -> `sajang-nim`. 12 mutations RED.
2. **`cd4da85`** - three fixes the live measurement found:
   - the player-role block **framed** the cast (a chaebol family became the company's staff);
     reworded and moved, re-measured clean;
   - a **total parse failure passed the retry probe** and would have shown raw JSON (7 of 64
     rounds in one window, a stray `}`); `isUsableRound` now rejects it - PROPOSALS §7's fix;
   - a grader false positive (self-introduction read as address).
   10 mutations RED.
3. The docs commit with the A/B report.

## Measured, `deepseek-flash`

- **The not-an-idol rule:** idol facts in the prose of **1 of 30 runs with it, 7 of 30 without**
  (chaebol/zh/lawyer, 8 rounds a run, arms alternated, every hit read).
  `test/reports/2026-10-20-not-idols-ab.md`.
- **The Joy fix:** 0 of 50 restaged campus positions at the player's café (en, 10 runs) and
  no meta text in ko after the rewording.
- **ko:** 6 runs, campus café owner / campus `junior_student` / chaebol `lawyer`, **6/6 clean,
  0 drifts, 0 prefix breaks, 88-90% cache** - the first live ko rounds on the reviewed text.
- **sajang-nim** used in 1 of 5 en café runs, both times from a member to the player.

## Not verified

- **The parse-failure retry has not been seen firing live** - the stray-brace failures stopped
  recurring after the fix landed. Verified offline against the verbatim response.
- Social posts and Kakao are now scanned (the harness stores their text): 0/8 runs leak with
  the rule, 2/8 without. Small n.
- ko is still **not native-reviewed**; the ko runs were read for positions and graders only.
- The A/B is one world, one identity, one language, one model.

## Next command

**v1.4.4 is NOT ready to release.** Yuhan confirmed nine additions (P1-P9) on 2026-10-20 and they
ship in the same release, plus **P10** (the scroll fix) added the same evening. `docs/V144_PLAN.md` is the plan; its table's **Done** column is the
authority on progress.

- Done, local, unpushed: **P9** (`35ef7f7`, no named strangers) and **P5** (`ea95dbf`, the
  chaebol cast is one family), and **P10** (`c57adaa`, a new round scrolls to its own top). Build
  clean, smoke **1754 / 0**. P10 has not been seen on a phone.
- **P1 is done** (the address ladder, given names, narration names): all six goldens moved, diff
  read; 17 mutations RED; smoke **1772 / 0**. **Not played live** - whether a model walks the
  ladder and steps down on screen is the next live measurement, best taken with P2/P3.
- **P2 is done** (stage behaviour in section 9, the 起承转合 chapters in section 3, `[Chapter]` in
  the tail): chapters live once in `src/config/chapters.js`, world `phases` is keyed by chapter id;
  all six goldens moved, diff read; 18 mutations RED; smoke **1778 / 0**. **Not played live.**
- **P11 is done** (the romance rule points at section 9 instead of naming a stage in English); 4
  mutations RED, no golden moved.
- **P12 is done** (ledger numbers rounds from 1 and writes `Round N:`; `Round:` left `[Player
  Status]`); 6 mutations RED, no golden moved; existing saves miss the ledger cache once.
- **P3 is done** (typical events left the static background for a `[Possible events]` tail line,
  unlocked by the main member's stage; V144_PLAN "P3 as built"). 4 goldens moved, diff read; 18
  mutations RED. **Smoke is RED by design on one check, Layer Z:** 105 world strings (23 changed
  backgrounds, 82 new events) await Yuhan's ticks in `docs/zh-review/worlds-*.md`. Everything else
  passes. **Do not "fix" that red by editing the ledger or ticking.**
- Layer Z is green again: Yuhan ticked the 105 P3 strings (`162380b`). Identity text now narrates
  her real name outside the idol world (`10a0ad1`).
- **P3 live check (V144_PLAN, "P3 live check"):** events fire on the unlock round, a used event
  echoes for up to 6 rounds, and nothing removes one. Five proposals await Yuhan's call.
- **Next: P4, affection rate tied to the chapter** (V144_PLAN P4), unless Yuhan picks P3 follow-ups first.
- The chaebol `orgHint` is one family in all three languages: Yuhan ticked the zh draft on
  2026-10-21, `sync` applied it, en/ko settled. No golden moved (UI only).
- **Decided for a LATER version, not v1.4.4:** `summary` in the player's language,
  `docs/PROPOSALS.md` §12 (Yuhan agreed 2026-10-21).
- **Phone test of P10 and the rest is Yuhan's, after v1.4.4 is complete.**
- In-game release notes (`src/config/releaseNotes.js`) are rewritten once, after P8.
- Pushing and the release are Yuhan's.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- **Restaged positions do not always hold in the prose.** en campus: Irene restaged as an art
  history student said "I teach the intro seminar" (one run) and was "the senior who runs the
  student council" in another, a post another member held. n=2 of 10, not acted on.
- en tense shift and zh real-name/stage-name switching: Yuhan's call 2026-10-20 - keep.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places. Ids are internal and `draws` has no reader, so nothing breaks.
