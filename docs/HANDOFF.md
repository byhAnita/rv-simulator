# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-20 (overnight) by Claude Opus 5.5 (main VS Code session)
**Handing to:** **Yuhan** - morning read; nothing is blocked on anyone

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
- **Social posts are not scanned** for idol facts; one control caption read 「练习室结束」.
- ko is still **not native-reviewed**; the ko runs were read for positions and graders only.
- The A/B is one world, one identity, one language, one model.

## Next command

None owed. Yuhan's calls, if any:
- whether `sajang-nim` reads right to her in en (it follows the transliteration table);
- whether to scan social posts too (the harness would need to store their text).

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- **Restaged positions do not always hold in the prose.** en campus: Irene restaged as an art
  history student said "I teach the intro seminar" (one run) and was "the senior who runs the
  student council" in another, a post another member held. n=2 of 10, not acted on.
- en tense shift and zh real-name/stage-name switching: Yuhan's call 2026-10-20 - keep.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places. Ids are internal and `draws` has no reader, so nothing breaks.
