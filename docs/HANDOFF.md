# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-22 (v1.4.4 ready to release)

**Written by:** Claude Code (Opus 5.5, main VS Code session).
**Branch:** `dev`. **Last commit:** the v1.4.4 release-prep commit on top of `f4dff4f`.
**Unpushed:** every commit since `origin/dev` (`git log --oneline origin/dev..dev`). Pushing is
Yuhan's. **Uncommitted:** nothing.

### Done this session

- **P7b blind read done and unblinded** (`docs/V144_PLAN.md`, *P7b blind read: the result*):
  first sentences stiff **1 of 6** against 5 of 6 for P7's opening. Shipped. Overall ratings went
  the other way (P7b 1/3/2, control 3/2/1), the marks being verb collocations and clipped dialogue
  in both arms; not attributed, n=6. Ratings in `test/.out/p7b-blind/ratings/ratings/`.
- **Her verb notes** are `docs/PROPOSALS.md` §14, widened beyond dance/singing, for v1.4.5.
- **P7c: no clothing in how she looks.** The `style` line lists hair, makeup, expression or
  hands and says "Never her clothes". 4 mutations RED.
- **P8 random events removed from v1.4.4** (Yuhan: a one-line event reads badly). Source files
  restored from `100a2a6^`; smoke from the same plus P7b's guard; goldens now differ from pre-P8
  by exactly the P7b and P7c lines. One absence guard, 3 mutations RED. v1.4.5 redesign is
  `docs/PROPOSALS.md` §15 (an event told as story, 1/2-2/3 of a round), starting from `2be2a65`.
- **Release notes final** (in-app zh/en/ko and README): atmosphere line reworded, events removed.
  Yuhan waived her review of the release notes for this release.

### Verified

- `npm run build` clean; `node test/smoke.mjs` **1800 passed / 0 failed**; 7 new mutations RED
  (4 clothing, 3 events), files restored byte-identical; six golden diffs read.

### Owed by Yuhan (the release)

1. **Phone test of v1.4.4** (Cloudflare branch preview after `git push origin dev`, see memory
   *phone-testing-preview-urls* / `docs/RELEASE.md`).
2. Then the release, all red lines and hers: `git checkout main && git pull`,
   `git merge dev --no-ff -m "release: v1.4.4"`, `npm run deploy`, tag the **deploy commit**
   `v1.4.4`, `git checkout -- index.html`, merge `main` back into `dev`,
   `node scripts/dev-index.mjs`, `node scripts/verify-mirrors.mjs`. Full steps: `docs/RELEASE.md`.
3. Still open from before: confirm the P7 reading of "first-person view" (player's view,
   narrated as "you").

### The exact next action

Nothing for an agent until Yuhan has pushed and phone-tested. After her deploy: run
`node scripts/verify-mirrors.mjs`, then revise the CV in `docs/.resume/` (gitignored; RELEASE.md
says how), then start v1.4.5 planning from `docs/PROPOSALS.md` §12, §14, §15 (one measurement
at a time).

### Not verified

- P7c is not measured live (a deletion she asked for).
- P1 (address ladder) and P2 (stage behaviour, chapters) have **not been played live** for
  whether the model walks the ladder or holds a Stranger at a distance.
- P10 not seen on a phone; zh/ko prologues (P6) unread by Yuhan; ko is not native-reviewed.
- **Grader suspect, not fixed:** `real-name-vocative` fires on a real name in a non-idol world's
  dialogue, where P1's Q2 rule makes it correct.
- 0 affection falls in live runs (`docs/PROPOSALS.md` §1), unchanged.

### Decided, for v1.4.5 (not v1.4.4)

- §15 random events as a short story passage; §14 verbs and the trade's words; §12 `summary` in
  the player's language (starting with a blind read of rounds 10-25). Measured separately.
  PROPOSALS §9-11 deferred.

### Standing rules from Yuhan this cycle

One chaebol family (A1); Korean given names in non-idol worlds (Q2); address forms only inside
quotes; no named strangers; no clothing in member description; no agent adds Chinese or Korean
prose to prompt/world/group/register files without her review; never tick a ZH_REVIEW box or edit
`docs/zh-review/ledger.json` by hand; replies short, conclusions first, **unverified** marked; say
"good point to compact" after each batch.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- **P7b read:** her one stiff P7b opening was a `像是…` guess after a plain sound; 2 of 6 P7b
  openings carried one in the live set. Worth a clause if it recurs.
- **`validateAndFixOutput`'s leaked-key strip misses the realistic shape** `...story","summary":...`
  (closing quote before the comma); it only matches `...,"summary":...`. Pre-existing.
- **Restaged positions do not always hold in the prose.** en campus: Irene restaged as an art
  history student said "I teach the intro seminar" (one run) and was "the senior who runs the
  student council" in another, a post another member held. n=2 of 10, not acted on.
- en tense shift and zh real-name/stage-name switching: Yuhan's call 2026-10-20 - keep.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places. Ids are internal and `draws` has no reader, so nothing breaks.
- P7 live: every P7 round 1 was set in the morning, every control round 1 at 晚上九点; two P7
  round 1s opened 你推门进去. n=3, noticed only.
