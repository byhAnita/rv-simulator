# AGENTS.md — who works on this repo, and the rules all of us follow

Read this first, then `docs/HANDOFF.md` for the task you are picking up.

**Only one agent works at a time.** Yuhan switches when one runs out of credits. There is no
concurrent work and no merge between agents — if you find the tree in a state you did not create,
stop and say so rather than guessing.

---

## Roles

| Agent | Where | Scope |
| --- | --- | --- |
| **Claude Opus 5** | VS Code extension | **Main developer and designer**, working with Yuhan. Owns design, architecture, prompt design, new features, releases. |
| **Claude Opus 5.5** | Claude Code Cloud | **Bug fixes only.** Stand-in when the main session runs out of credits. |
| **GPT** | VS Code extension | Possible future stand-in. Same scope as above. |

**The stand-ins fix bugs. They do not design.** No new features, no architecture changes, no prompt
redesign, no refactors "while I'm here", no renaming, no restructuring of documents. If the task in
`HANDOFF.md` turns out to need a design decision, **stop, write the question into `HANDOFF.md`, and
leave it for the main session.** A stand-in guessing at a design decision costs more than waiting.

Mechanical work that *is* in scope: running the validators, reading a diff, regenerating goldens
after an intended change, adding a regression guard for a bug you fixed, measuring, and reporting
honestly.

---

## Where the truth lives

| File | What it is |
| --- | --- |
| `CLAUDE.md` | **The authority on how the system behaves**, plus its post-mortems. Its newest `## Pick up here` block is the authority on what is open. Long — read the pick-up block first. |
| `docs/HANDOFF.md` | **The baton.** The one task in flight, its state, and the exact next command. Short by design. |
| `docs/V140_PLAN.md` | The feature plan and its numbered sections. |
| `docs/PROPOSALS.md` | Changes deliberately NOT made, each with the measurement that would settle it. |
| `docs/TECH_NOTES.md` | One entry per technique: what it replaced, what it bought, what it costs. |

**Never rewrite history in `CLAUDE.md`.** It is largely changelog and post-mortem; "fixed in v1.3.7"
is a record, not a stale version string.

---

## Non-negotiable rules

These come from Yuhan's own working rules. They are restated here because a cloud or third-party
agent does not see her personal config.

**Shell**
- **Use the Bash tool for shell commands, never PowerShell.** Unix syntax throughout.
- Multi-line commit messages go through `git commit -F - <<'MSGEOF'`. PowerShell here-string syntax
  (`@'...'@`) silently corrupts the message.
- Windows line endings: most tracked files are **CRLF**. A multi-line patch anchor written with `\n`
  matches nothing and fails silently — derive the newline from the file and abort on a missed anchor.

**Stop and ask — never do these on your own**
- Deleting files, directories, or git history
- `git push`, `git rebase`, `git reset --hard`, any force push
- Merging into `main`, deploying, releasing, tagging
- Touching `.env*`, keys, tokens, or CI config
- Anything acting outside this machine: posting, emailing, logging into sites

Approval for one instance is not approval for the next one. Committing locally is fine.

**Honesty**
- Report outcomes as they are. If a test fails, show the output. If a step was skipped, say so. If
  something is unverified, say **unverified** rather than implying it works.
- Never present a calculation as a measurement, or an estimate as either. Label which it is.
- Never invent a metric this project has not taken.
- No flattery. Conclusions first, reasoning after. Keep replies short — Yuhan often reads on a phone.
- Refer to Yuhan as **she/her**.

**Engineering**
- Run `npm run build` **and** `node test/smoke.mjs` after every change. No lint config.
- **Mutation-verify every new test.** Break the code deliberately, confirm RED, restore. Roughly a
  third of new assertions pass against broken code on the first attempt. A test added without that
  step is decoration.
- A mutation harness is **not safe to background** — nothing distinguishes a slow run from a dead
  one, and the recovery is a tree nobody can trust. Restore in a `finally` and verify the tree after.
- Write the assertion from the **requirement**, not from the implementation.
- **Count call sites; do not test presence.** A helper can exist, be correct, and be used in three of
  four places.
- A check that duplicates a validator cannot fail. If your mutation **crashes** the suite instead of
  reddening the check, the check is decoration — delete it or rewrite it.
- Never comment out an error or add a workaround flag. Fix the root cause.
- All code, comments and identifiers in **English**; source files **UTF-8, ASCII identifiers**.
- **One change at a time when the point is to measure it.**

**The prompt**
- The artifact to review is the **rendered prompt**, not the template. Six goldens in
  `test/fixtures/` pin it.
- A golden is **not a specification**. When you change the prompt on purpose, run
  `node scripts/update-golden.mjs` and then **read the diff**. Regenerating to turn a red suite green
  converts the only prompt-regression detector in this repo into a rubber stamp.
- **A prompt is not append-only.** When you add a rule, grep for what the old one said about the same
  thing and delete it. Nothing fails when two sections disagree; the model just picks.
- `buildSystemPrompt` must be a **pure function of the save** — no `Math.random()`, no `Date.now()`,
  no locale formatting, no unordered iteration. One character of drift costs the whole ~7,300-token
  cached prefix.

**Commits**
- Sign with **your own** model name, so the history says who did what:
  - `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Author must remain `byhAnita <52732052+byhAnita@users.noreply.github.com>` — Vercel refuses to
  deploy a commit whose author it cannot match to a GitHub account.
- Work on `dev`. Never commit directly to `main`.

---

## The handoff protocol

1. **Read `docs/HANDOFF.md`.** It names the one task in flight and the exact next command.
2. **Check the tree is clean** (`git status`). If it is not, stop and report — do not "tidy up".
3. **Do the task, and only the task.** Anything you notice but were not asked to fix goes into
   `HANDOFF.md` under *Found along the way*, not into the diff.
4. **Validate**: `npm run build`, `node test/smoke.mjs`, and `node scripts/update-golden.mjs` if you
   touched the prompt. Mutation-verify any guard you added.
5. **Commit** on `dev`, with your own attribution. Do not push.
6. **Update `docs/HANDOFF.md`** before you stop: what you did, what is verified, what is **not**
   verified, and the exact next command. A handoff that says "done" without saying what was not
   checked is worse than no handoff.
7. **Stop.** Do not start the next item.

**If you finish the baton and nothing is in flight**, update `HANDOFF.md` to say so and stop. Do not
pick work out of `CLAUDE.md`'s open list — that list is prioritised by Yuhan, and most of it is
design.
