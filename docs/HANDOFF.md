# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-20 by Claude Opus 5.5 (main VS Code session)
**Handing to:** **Yuhan** - one decision (campus), then the last two zh blocks

---

## Project state

- **v1.4.3 is released**, deployed 2026-10-02, tagged on `adf19b9`. `dev` carries unreleased work.
- `npm run build` clean (bundle unchanged, `index-CbS1KJjv.js`); `node test/smoke.mjs` **1724 / 0**.
- Yuhan's first zh pass is applied: 176 strings edited, 614 approved. Every en/ko counterpart of
  an edit is retranslated; `status` shows **0 owed**. All six goldens regenerated and the diff
  read: data lines only (member prose, identity blocks, place names and emojis), no rule text.

## The task in flight

1. **Campus: replace `prof_of_cast`.** Yuhan judged a professor wrong for a dating game. The id
   stays `prof_of_cast` so old saves load; the name, background and work title change. Options are
   in the chat of 2026-10-20; she picks one and writes its zh in `worlds-campus.md` (the professor
   blocks). Her unticked draft there is a placeholder, not the new text.
   - Smoke pins `prof_of_cast` as the campus identity whose title points **at the player**
     (`[campus] a title pointed at the player relaxes toward HER name`). If the replacement
     keeps a to_player title, nothing moves; if it has none, that check needs another fixture.
2. **`kpop_idol` 财阀 background is REFUSED and held as her draft**: it uses `{org}`, and identity
   backgrounds only substitute `{name}`, `{reason}`, `{keepsake}`. On the classic door there is no
   company name to put there. She rewords (e.g. `{name}组合所在公司`) and re-ticks.
3. **`_registers` is still `pending`**: she said it needs no change, but no box was ticked, and
   agents never tick. One tick and a `sync`.

## Not verified

- **No live round** has been played on the new world text. The new-employee (`lawyer` id) and
  secretary title lines were rendered offline and read correctly; nothing more.
- **ko is not native-reviewed**, all 177 strings of it.

## Next command

Hers: edit `docs/zh-review/worlds-campus.md` and `worlds-kpop_idol.md`, tick, then
`node scripts/zh-review.mjs sync`. Then the agent: en/ko for whatever `status` lists as owed,
`node scripts/update-golden.mjs` and **read the diff**, `npm run build && node test/smoke.mjs`,
commit. `git push origin dev` is hers.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- `groups/red_velvet` and `groups/x` Irene `public_image` read `定海神神`; the earlier text had
  `定海神针`. Possibly a typo in her edit - hers to decide, an agent does not touch zh.
- The `练习生` (kpop) and `junior_student` (campus) zh backgrounds now contain a line break
  mid-text, so section 6 renders `典型事件` on its own line. Harmless; noted in case it was
  unintended.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places (now the family company offices, the van, the company canteen). Ids are internal and
  `draws` has no reader, so nothing breaks.
