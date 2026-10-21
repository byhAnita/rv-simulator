# Chinese text review — Yuhan writes it, the repo enforces it

**Why.** Model-written Chinese in the data is copied, register and all, into every round
(`CLAUDE.md`, *The translationese bug*, lesson 3). The rule is that no agent ships Chinese
prose without Yuhan's review. This document is the workflow that makes the rule mechanical
rather than remembered.

**What it covers.** Every Chinese string in `public/worlds/*/zh.json`,
`public/worlds/_registers/zh.json` and `public/groups/*/zh.json`: 619 strings, about 31k
characters, collected by `scripts/zh-review.mjs` and never listed by hand. Excluded on
purpose: ids (stored in every save, never renamed), a member's `name` / `name_kr` / `family_name` / `given_name` /
`birthplace` and a group's `name` / `fandom` / `debut` (facts, not register), the address
`tokens`, and `_template`.

**Not covered yet:** the UI strings in `src/i18n/zh.js` and `src/config/releaseNotes.js`.
They reach the player but never the model, so they cannot teach the story a register. If
you want them in, they become the next sheets.

---

## Your loop

1. `node scripts/zh-review.mjs status` shows what is left, per file.
2. Open a sheet in `docs/zh-review/`, e.g. `worlds-kpop_idol.md`. Each block is one string:

   ```
   ### identities[练习生].background
   <!-- zh-review key="..." base="..." -->
   - [ ] pending · Claude 49713f1 2026-10-01
   ~~~~
   [身份背景] 你是{name}的练习生后辈 ...
   ~~~~
   ```

3. Rewrite the text between the `~~~~` lines however you like, then tick `[x]`.
   - **Tick with no edit** = "this text is fine as it is".
   - **Edit without ticking** = a draft. It survives every sync and changes nothing until
     you tick it, so you can stop halfway through a file.
   - Keep the `{name}`, `{org}` etc. placeholders. Using one fewer times is fine; dropping
     one entirely or misspelling it is refused, and the block stays as your draft.
   - Do not touch the `<!-- zh-review ... -->` line.
4. `node scripts/zh-review.mjs sync`. It writes every ticked edit into `public/` **and** the
   root mirror, records your approval in `docs/zh-review/ledger.json`, and regenerates the
   sheets with your drafts kept. `--dry` shows what it would do.
5. Hand it back, in one line: *"zh review: ticked worlds-kpop_idol, run it"*. I run the
   goldens (`update-golden.mjs`, then read the diff — your edits are what moves them), smoke
   and the build, and commit. Or run them yourself; either way the commit carries the diff.

**The line on each block tells you where the string came from**, read from `git blame`:
`Claude <commit>` means an agent wrote or last edited that line; `no co-author line` means a
commit with no Claude trailer. It is line-level, so a string sharing a line with your own
edit reports your commit.

## The order I would read in

| | sheet | strings | chars | why first |
| --- | --- | --- | --- | --- |
| 1 | `worlds-kpop_idol.md` | 40 | 2,229 | every default zh game; the identity background goes into every round |
| 2 | `worlds-chaebol.md`, `-campus.md`, `-office.md` | 119 | 7,451 | written by Claude in v1.4.1 step 7, never read by you |
| 3 | `worlds-_registers.md` | 1 | 803 | English rules with Chinese example lines (`会长nim，早上好`); check the examples |
| 4 | `groups-red_velvet.md` | 46 | 1,414 | the default classic cast |
| 5 | the other eight groups | 413 | 19,439 | see the open question below |

In the world files, the `[初见]` half of each background is already yours (2026-10-02). The
`[身份背景]` half before it is not, and `setting` (the paragraph the card generator is
handed) is model-written.

**Open question, yours to answer:** every group string traces to a commit from May or June
2026 with no co-author line, before any Claude session touched this repo. If you wrote those,
ticking a whole file without edits is the right move. If they were drafted by another tool,
they are the same risk as the world files.

## What happens to en and ko

When you change a zh string, its en and ko counterparts are now translations of the old text.
`sync` records their hashes at that moment, and `status` lists them as **translations owed**
until each one changes.

- **en** — I translate from your zh, and you can read the result.
- **ko** — translated on your ask (2026-10-20, the first pass), **not native-reviewed**. Nobody
  on this project reads Korean natively; treat every ko string as a draft a native reader
  should check.
- **Already right?** Some zh edits leave the translation correct (a reworded Chinese place
  name whose English was always fine). `settle <key> <en|ko>` clears that one owed entry,
  and only while the translation is still the exact text that was owed. It never touches a
  zh hash or an approval.

## What enforces it

Smoke **Layer Z** fails when any Chinese string's hash is not the one the ledger holds —
written or changed since your last review — and when the ledger names a string that no longer
exists. Since `deploy.sh` gates on smoke, unreviewed Chinese cannot reach a release.

`sync` cannot launder an agent's edit: it moves a hash **only** for a block you ticked. An
agent that edits the JSON and runs `sync` leaves smoke red, and the sheet shows the block as
`CHANGED SINCE YOUR LAST REVIEW`. That is mutation-verified.

A box typed `[]` reads as unticked, like `[ ]`; only `[x]` is a tick.

**Conflicts.** Every block carries the hash of the text it was generated from. If the data
changed after the sheet was written, your block is not applied; if you had **edited** it, your
text is kept as a draft flagged `CONFLICT`, over the new text, for you to compare and re-tick. A
block you never edited is just the old text, so the new text replaces it. Until 2026-10-21 it
was kept as a "draft" too, which would have offered stale text back for a tick.

**A tick on a string that is already approved at that hash changes nothing**, its date included.
A regenerated sheet shows every approved string ticked, and until 2026-10-21 each `sync` re-stamped
all of them with the day of the sync, so the ledger's `approved` dates up to 2026-10-20 record the
last sync, not when you read each one.

## Rules for agents

- **Never tick a box.** A tick is Yuhan's approval and the ledger treats it as one.
- **To change existing Chinese, write an unticked draft in the sheet** and leave the JSON
  alone. Her approved text stays live until she accepts yours.
- **New Chinese text** (a new identity, a new place) may go into the JSON as a draft. Smoke
  goes red with `NEW - never reviewed`, `sync` puts it in her sheet, and it stays red until she
  ticks it. Say so in the handoff; a red suite nobody explained looks like a broken build.
- Deleting a Chinese field needs no review, only `sync` to prune the ledger.
- Never edit `ledger.json` by hand.

## Commands

```bash
node scripts/zh-review.mjs status        # per file: approved / pending / changed / new, drafts, owed
node scripts/zh-review.mjs sync --dry    # what a sync would apply
node scripts/zh-review.mjs sync          # apply ticked blocks, refresh every sheet
node scripts/zh-review.mjs settle <key> <en|ko>   # an owed translation needs no change
node scripts/zh-review.mjs init          # once only; already done 2026-10-19
```
