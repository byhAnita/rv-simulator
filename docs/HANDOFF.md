# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-20 by Claude Opus 5.5 (main VS Code session)
**Handing to:** **Yuhan** - morning read of the overnight fix-and-measure run

---

## Project state

- **v1.4.3 is released**, deployed 2026-10-02, tagged on `adf19b9`. `dev` carries unreleased work.
- `npm run build` clean (bundle unchanged, `index-CbS1KJjv.js`); `node test/smoke.mjs` **1724 / 0**.
- Yuhan's zh review is complete: **620 of 620 strings approved, 0 owed, 0 drafts.** Every en/ko
  counterpart of an edit is retranslated (ko **not native-reviewed**). Goldens regenerated and
  the diff read.
- Campus `prof_of_cast` is now a **cafe owner** near campus (id kept for saves). Members address
  her as 老板 / sajang-nim / 사장님 (`kr` 사장님), still to_player, so the smoke fixture that pins
  `prof_of_cast` is unchanged. The kpop 财阀 background now reads `{name}组合所在公司`, no `{org}`.

## The task in flight

1. **Overnight, autonomous on Yuhan's instruction (2026-10-20):** the Seulgi leak and the Joy
   barista collision are fixed, en `Boss` is `sajang-nim`, and the multi-run measurement is
   running. Results go in the section below as they land.

## Live test, 2026-10-20 (`deepseek-flash`, after the push)

| run | rounds | cache | drifts | prefix breaks |
| --- | --- | --- | --- | --- |
| `campus` / en / `prof_of_cast` (café owner) | **4/4 clean** | 89.7% | 0 | 0 of 1 |
| `chaebol` / zh / `lawyer` (new employee) | **4/4 clean** | 89.7% | 0 | 0 of 1 |

Both premises land in the prose: the café scenes are set behind the counter with members as
regulars, and the new employee says 「对不起，代表nim」 to the heiress in the director's lift
(代表nim 4 times in 4 rounds, all from the player - the to_cast direction holds). Restaging 5/5
in both, 0 idol words in the restaged fields. Reports: `test/.out/playthrough-1792455888460.json`
(en), `-1792455936102.json` (zh).

**What reading the prose found, none of it fixed (each is n=1):**

- **zh chaebol: Seulgi brings her real idol past into a family company.** 「这家的牛骨汤，我练习生
  时候常吃」, 「我练舞练到凌晨」, and she carries 乐谱. The rendered prompt holds **none** of
  this - checked offline, the only hit is the prohibition list - so the model supplied it from what
  it knows about the real Seulgi. And because all five members were restaged, the §22.1 interim
  rule (*read for traits; no stage, no debut*) is **not rendered at all** - by design, since it
  narrows to un-restaged members. So a fully restaged cast is the one case with nothing telling the
  model these people are not idols here, other than the ROLE CONTRACT's `castLife`. Settling it
  needs several runs counting idol-fact sentences in the **prose** per world, restaged against
  `--no-restage`; a fix would be a world-level line that does not depend on who was restaged, and
  it moves the three non-idol goldens.
- **en campus: the restaging made Joy a "campus cafe barista"** while the player owns the café. It
  did not surface in four rounds, but the restaging prompt does not see the player's identity, so
  a member can be cast into the player's own role.
- **en campus: round 4 switched from present to past tense** and dropped contractions ("I am not
  usually this forgetful"), after three present-tense rounds. Register; Yuhan's to judge.
- **zh chaebol: narration names members 裴珠泫/姜涩琪 in rounds 1-3 and Irene/Seulgi in round 4.**
  Both are allowed; the switch mid-run is not consistent.
- The café owner's title (Boss) was never spoken in four rounds; Irene went straight to
  "Summer-ssi... Summer". Within the relaxing rule, early.

## Not verified

- **ko has had no live round** on the new text, and is not native-reviewed.
- The secretary and kpop 财阀 identities were rendered offline only.

## Next command

None owed. If the Seulgi finding is pursued: several `--world chaebol --lang zh --rounds 8` runs,
with and without `--no-restage`, counting idol-fact sentences in the prose.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places (now the family company offices, the van, the company canteen). Ids are internal and
  `draws` has no reader, so nothing breaks.
