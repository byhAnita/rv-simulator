# HANDOFF — the baton

**Read `docs/AGENTS.md` first.** This file holds the ONE task in flight. Keep it short; replace the
contents rather than appending a log.

---

**Last updated:** 2026-10-01 by Claude Opus 5.5 (Claude Code Cloud), working directly with Yuhan
**Handing to:** whoever runs next — the live blind read is the open item

---

## Project state

- `main` untouched at v1.4.2. **Work is on `dev`, two commits ahead of `origin/dev` (`42f908a`), NOT pushed.**
- `npm run build` clean; `node test/smoke.mjs` **1723 passed / 0 failed**.

## What happened this session (the translationese bug)

Yuhan supplied a DeepSeek key for this cloud session (her call; capped billing) and reviewed the
rendered prompt herself on a diff page. Findings and decisions:

- **Cause (hypothesis, not yet measured):** diffing v1.3.9 against v1.4.2's rendered zh prompt for her
  exact setup shows section 11 is the only new Chinese narration v1.4.2 sends — place blurbs in an
  aphoristic register and an identity-blind opening set in a late-night practice corridor, which is
  where her bad rounds took place. The earlier blind reads fixed the round-2 choice in every arm, which
  forces that corridor scene and hides a cause that works by putting the player there.
- **`49713f1`** — place descriptions and `scenario` deleted from all 4 worlds x 3 languages (+ mirror);
  `[初见]` takes her zh rewrite, translated to en/ko (ko had two typos). Goldens read. 4 mutations RED.
- **`6586849`** — `habit` is now her TASTES, rendered `Little things <player> knows:`, with a usage rule
  in section 5 and a section 1 allowance for a learned language's words. Red Velvet only (her text);
  every other member emptied. Goldens read. 5 mutations RED.

## NOT verified

- **Nothing here has been measured live.** `deepseek-flash` stopped answering ~20:05 UTC (requests are
  accepted, held with keep-alives, then dropped; `deepseek-v4-pro` answers normally). The blind read
  that would show whether the register improved has not run.
- Not hand-played; no live round of the new tastes rule on any provider.

## Next command

The blind read (scratchpad harness from this session; not in the repo): 5 full R1-R3 games per arm on
`deepseek-flash`, arms v1.3.9 / v1.4.2 / dev HEAD, rated blind by Yuhan on R2 and R3. Locally the
equivalent is `node test/playthrough.mjs --lang zh --group red_velvet --subs 2 --mode free --rounds 3`
on each tree, then reading the stories blind.

## Open, for the main session

- `place.desc` support remains in `mainAgent.js` and `MapOverlay.jsx` (conditional, now no data).
- The en and ko tastes lines are Claude's translations of Yuhan's zh; the ko reviewer should read them.
- Other members' tastes are empty until Yuhan writes them.

---

## Found along the way

*(Add anything you notice but were not asked to fix. Do not fix it.)*

- `CLAUDE.md`'s v1.4.2 pick-up block says the remote has `557e9f7`. It has `5daf039`. The "ahead by
  two" count was right at the time; the named base commit is one behind. Now ahead by three.
