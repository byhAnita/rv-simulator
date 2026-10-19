# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-19 by Claude Opus 5.5 (main VS Code session)
**Handing to:** **Yuhan** - the Chinese text review

---

## Project state

- **v1.4.3 is released**, deployed 2026-10-02, tagged on `adf19b9`. `dev` carries unreleased work on
  top: the `place.desc` reader deletion, docs, and the zh review machinery below.
- `npm run build` clean; `node test/smoke.mjs` green (Layer Z added, 1716 -> 1719).

## The task in flight: Yuhan reviews the Chinese data

The workflow is **`docs/ZH_REVIEW.md`**. In short: she edits the sheets in `docs/zh-review/`, ticks
`[x]` on what she approves, and runs `node scripts/zh-review.mjs sync`. Nothing reaches the JSON
without a tick.

- **Baseline:** 619 strings, all `pending`, recorded 2026-10-19. Smoke is green because pending
  text is the text she has *seen listed*; it goes red only if anything changes without her tick.
- **Suggested order:** `worlds-kpop_idol.md`, then chaebol / campus / office, then the register,
  then `groups-red_velvet.md`, then the other groups.
- **Open question for her:** the 459 group strings all date from May-June 2026 commits with no
  co-author line. If she wrote them, she ticks them as they stand.

## Next command

Hers: edit a sheet, then `node scripts/zh-review.mjs sync`. When she hands it back, the agent runs
`node scripts/update-golden.mjs` and **reads the diff**, then `npm run build && node test/smoke.mjs`,
commits, and translates the **en** strings `status` lists as owed. The **ko** ones stay owed: no
native reader.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*
