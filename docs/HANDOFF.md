# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-21 (evening)

**Written by:** Claude Code (Opus 5.5, main VS Code session).
**Branch:** `dev`. **Last commit:** this handoff, on top of `2d17033` (release notes) and
`100a2a6` (P8). **Unpushed:** every commit since `origin/dev` (`git log --oneline
origin/dev..dev`). Pushing is Yuhan's. **Uncommitted:** nothing.

### Verified

- `npm run build` clean; `node test/smoke.mjs` **1813 passed / 0 failed**.
- **P8 done** (`100a2a6`): schema `event` between story and summary, `EVENT_RATES` ->
  `[Random Events]` tail line, the event shown under `t.game.randomEvent` on screen only (the
  ledger keeps the plain story). 19 mutations RED; all six goldens moved by five lines, diff read.
  Live (deepseek-flash, zh): free 0/6 events, 34/34 rounds clean, 0 drifts, 0 prefix breaks.
  `docs/V144_PLAN.md`, P8 design / first live check / as built.
- **Release notes rewritten once for v1.4.4** (`2d17033`), P1-P8.

### Owed by Yuhan (all gate the v1.4.4 release)

- **The P7 blind read** (unchanged): `test/.out/p7-blind/p7-blind-packet.md`; **do not open
  `p7-blind-key.json` or show it to her before she rates.** 自然 / 一般 / 翻译腔, plus where.
- **Confirm the P7 reading** of "first-person view" (player's view, narrated as "you").
- **Confirm the P8 readings:** the rate lives in code, not in 48 world-file sentences; "appended
  to the history entry" = the round's entry in the story log the player reads, not the model's
  ledger (V144_PLAN, P8 design).
- **Decide PROPOSALS §13:** the model overshoots the event rate (romance 7/14 vs ~1/3, pressure
  11/14 vs ~1/2). Keep it, or draw the event rounds in code.
- **Read the zh and ko release-notes text** in `src/config/releaseNotes.js` (agent-written; ko
  not native-reviewed), and the ko event heading `【돌발 이벤트】`.
- **Phone test of v1.4.4** (P10 scroll, the event heading), then the push and the release.

### The exact next action

**Nothing is queued for an agent.** v1.4.4's feature list (P1-P12) is done. Wait for Yuhan's
blind read and decisions above. If she accepts §13, it is a new P-item: plan first.

### Not verified

- P1 (address ladder) and P2 (stage behaviour, chapters) have **not been played live** for
  whether the model walks the ladder or holds a Stranger at a distance.
- P8 in **en and ko**: not played. The heading on a phone: not seen.
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
