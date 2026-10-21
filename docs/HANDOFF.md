# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-21 (night)

**Written by:** Claude Code (Opus 5.5, main VS Code session).
**Branch:** `dev`. **Last commit:** the P8 draw commit on top of `8ee95cc`. **Unpushed:** every
commit since `origin/dev` (`git log --oneline origin/dev..dev`). Pushing is Yuhan's.
**Uncommitted:** nothing.

### Done this session (Yuhan's answers of 2026-10-21 night)

- **P8 readings confirmed by Yuhan:** the rate lives in code; "appended to the history entry" is
  the story log the player reads, not the model's ledger.
- **Event rate: live A/B, then built.** Described "one in four" vs drawn in code at 1/4,
  deepseek-flash, zh, 3 x 12 rounds per mode per arm. Described: pressure 22/33 (16
  back to back). Drawn: 17/17 drawn rounds followed, 2 events on 49 undrawn rounds, 0 gestures.
  **Built the draw** at the plan's rates (romance 1/3, pressure and dramatic 1/2):
  `drawEvent`/`eventLine` in `mainAgent.js`, graders `event-not-drawn`/`drawn-event-missing`.
  Goldens moved by one phrase, diff read. `docs/V144_PLAN.md`, *P8 A/B*; PROPOSALS §13 BUILT.
- **P7 blind read is a private page:** https://claude.ai/artifact/FyYBsJBpXPVEDBeryRENR8 . Built
  from `p7-blind-packet.md` only. Her ratings land in that artifact's `ratings` collection (one
  doc per sample, `rating`, `stiff` sentence keys, `stiffText`, `note`); read them with
  ArtifactData `list`, then unblind with `test/.out/p7-blind/p7-blind-key.json`, **only after
  she says she is done.**

### Verified

- `npm run build` clean; `node test/smoke.mjs` **1815 passed / 0 failed**; 17 new mutations RED,
  files byte-identical after the run.
- 144 live rounds in the A/B: all parsed directly, 0 drifts, 0 prefix breaks.

### Owed by Yuhan (all gate the v1.4.4 release)

- **The P7 blind read**, on the page above. Do not open the key before she finishes.
- **Confirm the P7 reading** of "first-person view" (player's view, narrated as "you").
- **Release notes** (zh, ko) and the ko heading `【돌발 이벤트】`: she reviews them just before
  the release.
- **Phone test of v1.4.4** (P10 scroll, the event heading), then the push and the release.

### The exact next action

When Yuhan says the blind read is done: read the `ratings` collection, unblind with the key,
write the result into `docs/V144_PLAN.md` under *P7*, and fix what it points at. Otherwise
nothing is queued for an agent.

### Not verified

- P1 (address ladder) and P2 (stage behaviour, chapters) have **not been played live** for
  whether the model walks the ladder or holds a Stranger at a distance.
- P8 in **en and ko**: not played. Whether a drawn event lands at a bad moment: not read by
  Yuhan. The heading on a phone: not seen.
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
