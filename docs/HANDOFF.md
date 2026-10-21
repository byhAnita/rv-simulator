# HANDOFF - the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

## Pick up here — 2026-10-21

**Written by:** Claude Code (Opus 5.5, main VS Code session), handing to a **new Claude Code
session** (Yuhan is switching so Remote Control works; the old session's `/remote-control`
returned HTTP 403, a fresh session does not).
**Branch:** `dev`. **Last commit:** the CLAUDE.md split (see below), on top of `bec3530` (P7).
**Unpushed:** every commit since `origin/dev` - P3 through P7 plus this one. `git log --oneline
origin/dev..dev`. Pushing is Yuhan's.
**Uncommitted:** nothing.

### Verified at handoff

- `npm run build` clean; `node test/smoke.mjs` **1799 passed / 0 failed** (after the split too).
- CLAUDE.md split: every original line is in exactly one of the four files (sorted-line diff: 0
  missing); both `npm run bump` anchors are still in `CLAUDE.md`.

### What this session did last

1. **P7 committed** (`bec3530`): one plain atmosphere sentence opens each round, a member's
   appearance in one or two details, narration from the player's point of view. 10 mutations RED;
   all six goldens moved by 3 lines, diff read; live 9 of 9 P7 rounds open as asked, 18/18 clean,
   0 drifts. `docs/V144_PLAN.md`, "P7 as built".
2. **Yuhan decided: 承 stays at +6** (recorded in V144_PLAN, P4).
3. **CLAUDE.md was 493k characters, over the 150k load limit, and was split verbatim**:
   `CLAUDE.md` (~109k, current behaviour + a *Lessons index*), `docs/MODEL_LAYER.md`,
   `docs/RELEASE.md`, `docs/CLAUDE_HISTORY.md` (every post-mortem and old status block). Nothing
   deleted. Keep `CLAUDE.md` under ~120k from now on: new post-mortems go to the history file.

### Owed by Yuhan (gates the v1.4.4 release, not P8)

- **The P7 blind read.** 12 stories, 6 per arm (P7 vs `23c96a3`), shuffled, labels hidden:
  `test/.out/p7-blind/p7-blind-packet.md` (git-ignored). The key is beside it in
  `p7-blind-key.json` - **do not open the key or show it to her before she rates.** She rates each
  自然 / 一般 / 翻译腔 and marks where the stiff sentences are.
- **Confirm the P7 reading of "first-person view"**: implemented as the player's point of view,
  still narrated as "you", not switched to 我/I.

### The exact next action: P8, random events by story mode

Spec: `docs/V144_PLAN.md`, "### P8. Random events, generated rather than pooled". Read "P3 removed"
in the same file first (a tail line reads as a cue; no authored pool). In short:

- schema key `"event"` (string or null), **after `story`, before `summary`** (key order is
  generation order);
- rate from the story-mode rules in each world's `modes`: free always null, romance ~1 in 3,
  pressure and dramatic ~1 in 2 - the rule text is English, so no zh review is needed, but all 12
  world files and their root mirrors change;
- the event follows from chapter, stage and stats;
- UI shows it under `【随机事件】` (i18n for en/ko), it is appended to the history entry, and the
  export keeps it;
- a playthrough grader flags an event in free mode;
- all six goldens move: run `node scripts/update-golden.mjs` and **read the diff**;
- mutation-verify every new guard (runner pattern: a `[label, file, fn, want]` list, RED only if
  the named check fails - see `docs/V144_PLAN.md` P7 for the last one);
- docs before code, same commit: V144_PLAN P8 section + table row, CLAUDE.md, README v1.4.4 bullet.

**Then:** rewrite `src/config/releaseNotes.js` once for v1.4.4. **Then stop**: the phone test of
v1.4.4 (P10 scroll included), the push and the release are Yuhan's.

### Not verified

- P1 (address ladder) and P2 (stage behaviour, chapters) have **not been played live** for whether
  the model walks the ladder or holds a Stranger at a distance.
- P10 (scroll to the round's top) has not been seen on a phone.
- zh/ko prologues (P6) are unread by Yuhan; ko is not native-reviewed anywhere.
- **Grader suspect, not fixed:** `real-name-vocative` fires on a real name in a non-idol world's
  dialogue, where P1's Q2 rule makes it correct. Read `test/playthrough.mjs` before trusting that
  flag outside `kpop_idol`.
- 0 affection falls in live runs (`docs/PROPOSALS.md` §1), unchanged.

### Decided, for later versions (not v1.4.4)

- `summary` in the player's language: `docs/PROPOSALS.md` §12.
- PROPOSALS §9-11 deferred.

### Standing rules from Yuhan this cycle

One chaebol family (A1); Korean given names in non-idol worlds (Q2); address forms only inside
quotes; no named strangers; no agent adds Chinese or Korean prose without her review; never tick a
ZH_REVIEW box or edit `docs/zh-review/ledger.json` by hand; replies short, conclusions first,
**unverified** marked; say "good point to compact" after each batch.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- **Restaged positions do not always hold in the prose.** en campus: Irene restaged as an art
  history student said "I teach the intro seminar" (one run) and was "the senior who runs the
  student council" in another, a post another member held. n=2 of 10, not acted on.
- en tense shift and zh real-name/stage-name switching: Yuhan's call 2026-10-20 - keep.
- Place ids `greenhouse`, `back_seat` (chaebol) and `hoesik` (office) no longer describe their
  places. Ids are internal and `draws` has no reader, so nothing breaks.
- P7 live: every P7 round 1 was set in the morning, every control round 1 at 晚上九点; two P7
  round 1s opened 你推门进去. n=3, noticed only.
