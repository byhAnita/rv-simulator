# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-22

**Written by:** Claude Code (Opus 5.5, main VS Code session).
**Branch:** `dev`. **Last commit:** the P7b live-run docs commit on top of `2139598`.
**Unpushed:** every commit since `origin/dev` (`git log --oneline origin/dev..dev`). Pushing is
Yuhan's. **Uncommitted:** nothing.

### Done this session

- **P7b built (2026-10-22)**: the opening sentence states a plain fact she perceives; light,
  air, shadow, mist and weather never act. English in the three registers and the root mirror;
  six goldens moved by that one line; 5 mutations RED. Live 18/18 clean on `deepseek-flash`.
  Blind page published, ratings owed. `docs/V144_PLAN.md`, *P7b*.
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

- `npm run build` clean; `node test/smoke.mjs` **1815 passed / 0 failed** after P7b; 5 P7b
  mutations RED, register files byte-identical after the run.

### Owed by Yuhan (all gate the v1.4.4 release)

- **P7b's blind read**: https://claude.ai/artifact/PWbGhxrCuYmygER2btMcXf (12 stories, rounds
  2-3). Built and live-run 2026-10-22; `docs/V144_PLAN.md`, *P7b*. Decided that day to fix the
  opening in v1.4.4; §12 and §14 moved to v1.4.5.
- **Confirm the P7 reading** of "first-person view" (player's view, narrated as "you").
- **Release notes** (zh, ko) and the ko heading `【돌발 이벤트】`, just before release.
- **Phone test of v1.4.4**, then the push and the release.

### The exact next action

When Yuhan says the P7b read is done: read the artifact's `ratings` collection with
ArtifactData, copy the docs to `test/.out/p7b-blind/ratings/`, THEN open
`test/.out/p7b-blind/p7b-blind-key.json` and write *P7b blind read: the result* in
`docs/V144_PLAN.md` (same table as P7's, first sentences stiff against P7's 4 of 6). If it
holds, v1.4.4 is complete apart from the release notes, the phone test and the push. The
release note's "each scene opens with one line of atmosphere" may want rewording then (zh and
ko need Yuhan).

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

- v1.4.5: `summary` in the player's language (`docs/PROPOSALS.md` §12, starting with a blind
  read of rounds 10-25 of the current build) and the trade verbs (§14), measured separately.
  PROPOSALS §9-11 deferred.

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
