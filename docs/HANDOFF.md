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
- Yuhan's zh review is complete: **620 of 620 strings approved, 0 owed, 0 drafts.** Every en/ko
  counterpart of an edit is retranslated (ko **not native-reviewed**). Goldens regenerated and
  the diff read.
- Campus `prof_of_cast` is now a **cafe owner** near campus (id kept for saves). Members address
  her as 老板 / Boss / 사장님 (`kr` 사장님), still to_player, so the smoke fixture that pins
  `prof_of_cast` is unchanged. The kpop 财阀 background now reads `{name}组合所在公司`, no `{org}`.

## The task in flight

1. **Live test** the new world text after she pushes `dev`. The zh review itself is closed:
   the café owner's zh name is 咖啡馆老板 (en/ko Café owner / 카페 사장).

## Not verified

- **No live round** has been played on the new world text. The café owner, new-employee
  (`lawyer` id), secretary and kpop 财阀 identity lines were rendered offline and read; nothing more.
- **ko is not native-reviewed.**

## Next command

`node test/playthrough.mjs --world campus --identity prof_of_cast --lang en --rounds 4`, plus a
zh `chaebol`/`lawyer` arm, once Yuhan has pushed.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places (now the family company offices, the van, the company canteen). Ids are internal and
  `draws` has no reader, so nothing breaks.
