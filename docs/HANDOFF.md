# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-21 (late night)

**Written by:** Claude Code (Opus 5.5, main VS Code session).
**Branch:** `dev`. **Last commit:** the P7-result / event-rate commit on top of `b9607d9`.
**Unpushed:** every commit since `origin/dev` (`git log --oneline origin/dev..dev`). Pushing is
Yuhan's. **Uncommitted:** nothing.

### Done this session

- **P7 blind read: done by Yuhan, unblinded, written up** in `docs/V144_PLAN.md`, *P7 blind
  read: the result*. Overall a tie (P7 2/2/2 自然/一般/翻译腔, control 1/3/2). But **4 of 6 P7
  atmosphere sentences were marked stiff** (2 of 6 control openings), every one with light, air
  or a shadow as the subject of a figurative verb; the two she rated natural state a plain fact.
  Her ratings: `test/.out/p7-blind/ratings/` (and the artifact's `ratings` collection).
- **Found by the read, both arms, not P7:** dance and singing described in body mechanics
  (`踩错`, `再动`, `拉长音`), 4 of 12 stories. Proposed as `docs/PROPOSALS.md` §14, not built.
- **Event rate is 1/3 in romance, pressure and dramatic** (Yuhan's call: 1/2 cost continuity).
  One constant in `EVENT_RATES`; smoke asserts 1/3 for all three and every mode's frequency over
  4000 real draws.

### Verified

- `npm run build` clean; `node test/smoke.mjs` **1815 passed / 0 failed**; 6 rate mutations
  RED, files byte-identical after the run.

### Owed by Yuhan (all gate the v1.4.4 release)

- ~~P7's opening rule~~ **decided 2026-10-22: shipped as is**; PROPOSALS §14 held as is too.
- **Whether §12 (`summary` in the player's language) joins v1.4.4.** Yuhan proposed it on
  2026-10-22; the plan and its measurement are in `docs/PROPOSALS.md` §12. Not built yet.
- **Confirm the P7 reading** of "first-person view" (player's view, narrated as "you").
- **Release notes** (zh, ko) and the ko heading `【돌발 이벤트】`, just before release.
- **Phone test of v1.4.4**, then the push and the release.

### The exact next action

If Yuhan says go on §12: build it as `docs/PROPOSALS.md` §12 lists (three schema lines in
`mainAgent.js`, the length unit, the collapse fallback, the `saveStoryEdit` comment, the
analyzer's CJK metric inverted), regenerate the six goldens and read the diff, mutation-verify,
then run the A/B §12 describes and build a blind page of rounds 10-25. If not: v1.4.4 is
complete apart from the release notes, the phone test and the push.

### Not verified

- P1 (address ladder) and P2 (stage behaviour, chapters) have **not been played live** for
  whether the model walks the ladder or holds a Stranger at a distance.
- P8 in **en and ko**: not played. Not played live at 1/3 (the draw fixes the frequency by
  construction). Whether a drawn event lands at a bad moment: not read by Yuhan. The heading on a
  phone: not seen.
- P10 not seen on a phone; zh/ko prologues (P6) unread by Yuhan; ko is not native-reviewed.
- **Grader suspect, not fixed:** `real-name-vocative` fires on a real name in a non-idol world's
  dialogue, where P1's Q2 rule makes it correct.
- 0 affection falls in live runs (`docs/PROPOSALS.md` §1), unchanged.

### Decided, for later versions (not v1.4.4)

- `summary` in the player's language: `docs/PROPOSALS.md` §12. PROPOSALS §9-11 deferred.

### Standing rules from Yuhan this cycle

One chaebol family (A1); Korean given names in non-idol worlds (Q2); address forms only inside
quotes; no named strangers; no agent adds Chinese or Korean prose without her review; never tick a
ZH_REVIEW box or edit `docs/zh-review/ledger.json` by hand; replies short, conclusions first,
**unverified** marked; say "good point to compact" after each batch.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- **P8 live:** about 2 of 10 events are still a member's gesture rather than something that
  happens to the scene (a drink left at the door). n=10, not acted on.
- **`validateAndFixOutput`'s leaked-key strip misses the realistic shape** `...story","summary":...`
  (closing quote before the comma); it only matches `...,"summary":...`. Pre-existing; the P8
  guard uses the documented shape.

- **Restaged positions do not always hold in the prose.** en campus: Irene restaged as an art
  history student said "I teach the intro seminar" (one run) and was "the senior who runs the
  student council" in another, a post another member held. n=2 of 10, not acted on.
- en tense shift and zh real-name/stage-name switching: Yuhan's call 2026-10-20 - keep.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places. Ids are internal and `draws` has no reader, so nothing breaks.
- P7 live: every P7 round 1 was set in the morning, every control round 1 at 晚上九点; two P7
  round 1s opened 你推门进去. n=3, noticed only.
