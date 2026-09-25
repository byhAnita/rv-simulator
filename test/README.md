# Smoke test

Guards the per-provider output-token-cap fix (`6814eff`) and the corrected
in-app cost strings. Not part of the app: lives outside `src/`, so Vite never
bundles it, and it is not referenced by any application module.

```bash
node test/smoke.mjs          # offline only — no network, no credits spent
node test/smoke.mjs --live   # also hits the real provider (spends credits)
```

## Credentials

The live layer reads `.env.local` in the repo root:

```
YURIAGENT_API_KEY="sk-..."
MODEL_ID="deepseek-v4-flash"
```

`MODEL_ID` accepts either the provider id (`deepseek`, `qwen`, `gemini`,
`gpt4omini`) or the model string (`deepseek-v4-flash`, `gpt-6-luna`, `qwen-3.8-max`, …).

**Why this can never reach players:**

- the var is **unprefixed** — Vite only inlines `VITE_*` names into the client
  bundle, so an unprefixed name is invisible to the browser build
- the runner reads `process.env` / the file directly, never `import.meta.env`
- `src/` contains no reference to `YURIAGENT_API_KEY` or `process.env`
- `.gitignore` covers `.env.*` and `*.local`

Layer C asserts all four of those every run, plus scans the built `dist/` for
the literal key. Revoke the key at the provider when you are done with it.

## Layers

| Layer | Network | What it covers |
| --- | --- | --- |
| **A** | none | Request-body contract: 4 providers × reasoning on/off. Asserts the cap value **and the field name** (`max_completion_tokens` for Qwen, `max_tokens` for the rest), the reasoning flags, deepseek's `thinking` object, Qwen sub-model resolution, and the cost strings from fix #4. Includes an explicit regression guard against the pre-fix behaviour. |
| **B** | live | One real round per reasoning mode: HTTP success, non-empty content, valid JSON, schema fields present (`story`, `summary`, 4 `options`, numeric `statChanges`), and no chain-of-thought leakage into the story. Prints latency. Then probes with a cap of 16 to prove the output cap is **honored**, not merely accepted — an ignored unknown field would still return HTTP 200. |
| **C** | none | Secret hygiene (see above). |
| **D** | none | Probability-engine recency window with `Math.random` pinned to 0.5, so the arithmetic is exact: a long-absent member must score 0.60 and a saturated one 0.40. Also guards that the dead NPC constants stay removed and that no active `console.log` returns to `llmTool.js`. |
| **J** | none | Golden system prompts + prompt determinism. See below. |
| **K** | none | Usage meter and cost estimate: token accounting, the reported-vs-absent `cached_tokens` distinction, peak-price windows, and the rule that an unknown number never renders as 0. |

| **L** | none | Unit tests for the live-harness prose graders in `graders.mjs`, against the real prose that triggered each one. |

Layers **E**–**I** are listed in the header comment of `smoke.mjs`; this table
predates them.

**And the custom cast** (v1.4.0 step 6). The palette's and photo store's quota rules
are pure functions, tested directly — the half that can lose a player's data must
not be reachable only by hand. `cardGenerator` is tested against a mocked `fetch`
for the contract that matters: **every failure yields a blank form**, because a
dead provider must not be able to block character creation, and that is the path a
live test would exercise least often.

The UI is checked by **source-string assertions**, the same shape as the Layer G
key-page guards. Two are worth knowing about:

- **Both `.jsx` files are compiled by smoke.** `App.jsx` imports them now, but for
  two commits it did not, and the Vite build only compiles what the module graph
  reaches — so a JSX error or a bad import path would have shipped silently.
- **Comments are stripped before matching.** A guard asserting the year input is
  not `type="number"` failed on the comment explaining why it is not, which is the
  same trap the `getNpcMembers` guard in Layer G calls out.

Three step-6 bugs came from a phone hand test and each has a regression check:
the birth-year **round trip** (simulated keystroke by keystroke — the guard it
replaced asserted the stored format and never that the value read back, so it
passed against completely broken behaviour), the named-role picker, and
**cross-group lore** (nine checks: no member outside the roster in section 4, the
origin groups never named, the cast presented as its own group under a named
agency). Two `src/` bugs in step 6 were caught by tests and **not** by the build —
an unimported `SLOTS` and a `null` `groupConfig` — because an undefined identifier
and a dereferenced null are runtime errors, and a green build only says the module
graph resolves.

**Layer I also covers world and roster loading** (v1.4.0 step 3): that the world
JSON loads through `loadWorld` in all three languages, that it still declares
every identity and pace id that can sit in a save, that `parseWorld` throws on a
missing key rather than dropping it, that the three language files agree on the
blocks that are English rule text, and that a classic roster resolves to a
**byte-identical prompt**. That last one is what makes "one engine, two doors"
a fact rather than a claim.

**And save migration** (v1.4.0 step 4). `test/fixtures/save-v138.json` is a real
pre-split save slot, pinned so the migration runs against something authentic
rather than something written to make it pass. It is **TWICE, not Red Velvet**,
because Red Velvet is both the app's default selection and the migrator's
last-resort fallback — a Red Velvet fixture would pass every check with the
group scan doing nothing at all.

The gate is that the migrated save resolves to the same member set
`getNpcMembers` derives today, in the same order, and builds the same prompt
byte for byte. Migration **reproduces rather than fixes**: the birth year it
writes is the one the save already produced, wrong by up to a year and
deliberately left that way, because a loader that silently corrects a save
changes a running game underneath its player. See `docs/TECH_NOTES.md`.

**And the correction migration deliberately does not make** (step 6, commit 6).
`correctBirthYear` is tested by *running* it, not by grepping the component that
calls it, because the rule worth guarding is behavioural: it writes `birthYear`
and leaves `age` alone, since `backstorySeed` hashes `age` and a recomputed one
re-rolls an identity backstory mid-save.

That last guard needs the right fixture to mean anything. Pointed at the v1.3.8
save's own identity it **cannot fail** — only `主线成员前女友` draws its
background from the seed — so the check overrides the identity, and a mutation
that recomputes `age` then moves a breakup reason and a keepsake where it
otherwise moves nothing. The first draft of that check was green against its own
mutation; this is the fourth time in this step that a guard had to be re-aimed
rather than merely written.

Two more behavioural ones: an unchanged year returns the **same object**, so
re-confirming a correct year is not a ~5,500-token cache miss, and a year outside
the range Setup enforces is refused rather than written.

`docs/V140_PLAN.md` §9.4 pencilled these into Layer J. They are here instead,
beside the `getNpcMembers` equivalence anchor they are measured against; the
plan has been corrected in place.

**And `habit`** (v1.4.0 step 5), in two halves. The **content** half sweeps all
nine groups in all three languages *through `loadGroupConfig`* and asserts that
every member arrives with a non-empty, single-line habit, that the three
language files of a group agree on their member ids, that no two members of one
cast share a habit, and that a member appearing in more than one group carries
the same habit in each — `x` is a crossover roster sharing seven ids, and a
physical tic belongs to the person, not the roster. They are aggregate checks
that *name their offenders*, because one check per member would add 171 lines
of noise to the suite.

The **rendering** half asserts the `Habit:` line reaches the member profile
block, sits below `Queer Texture`, and — the one that matters — that a member
with **no** habit renders nothing at all, with no trailing whitespace left
where the line would have been.

> **That last guard is the reason to keep it after reading this.** Making the
> line unconditional leaves **all three goldens green**: every library member
> has a habit, so the empty case appears in no snapshot. A golden covers what
> the data happens to contain, never the branch the data does not exercise.
> Custom members (step 6) are exactly that branch.

Both halves are mutation-verified — ten mutations, all RED, each naming the
guard it was aimed at. Two incidental confirmations from that run: blanking one
member's habit also tripped the crossover check (she is in two groups), and
every content mutation tripped **Layer C's mirror assertion**, because only
`public/` was edited. The root `groups/` tree is load-bearing, not bookkeeping.

### Layer J and the golden prompts

Three complete system prompts are committed under `test/fixtures/` and compared
byte-for-byte. They cover what no assertion names — the JSON schema block, the
phase rules, section ordering, blank lines — because a prompt regression throws
no error and fails no test. It just writes differently, weeks later, with
nothing to bisect.

When you change `buildSystemPrompt` **on purpose**:

```bash
node scripts/update-golden.mjs --dry   # what would change, writes nothing
node scripts/update-golden.mjs         # write
git diff test/fixtures/                # READ THIS
```

The diff is the point. It is the only place a one-word edit to a shared rule
appears as the eleven lines it actually touched, across three languages and
three casts. Regenerating to clear a red run, without reading it, turns the only
prompt-regression detector in the repo into a rubber stamp — which is why
regeneration is a separate script and not a `--update` flag on the suite.

The layer also sweeps all 8 identities × 3 languages, building each prompt twice
and requiring byte-equality. Snapshots cannot detect unstable output (a snapshot
of unstable output is simply wrong), and the fixtures cover only 3 of 24
combinations. That sweep is what caught `主线成员前女友` re-rolling its backstory
every round — see `docs/TECH_NOTES.md`.

Layer A stubs `globalThis.fetch` and inspects the body `callLLM` builds, so it
verifies the fix without spending anything. Because `src/` uses extensionless
imports that plain Node ESM cannot resolve, the runner bundles
`src/tools/llmTool.js` with esbuild (already a Vite dependency) into
`test/.out/` first. That directory is git-ignored.

## Verified live

| Provider | Reasoning off | Reasoning on | Cap honored |
| --- | --- | --- | --- |
| `qwen` (qwen3.8-max) | 6.2 s | 16.4 s | ✅ `max_completion_tokens` |
| `deepseek` (v4-flash) | 4.4 s | 7.1 s | ✅ `max_tokens` |

Latencies are for a minimal one-round prompt with no history, so real
steady-state play is slower.

Qwen accepts **both** `max_tokens` and `max_completion_tokens` — a cap of 16
truncates with `finish_reason:'length'` under either. The split in `llmTool.js`
tracks the field OpenAI-compatible APIs are standardising on; it is not required
by Qwen.

Not yet exercised live: `gemini`, `gpt4omini`. Layer A covers their request
bodies offline. To add one, put its key in `.env.local`, set `MODEL_ID`
accordingly, and re-run with `--live`.

## Validating a regression guard

Layer D's `storyRounds` guard was checked by reverting the fix and confirming it
fails (delta 0.020 vs the required 0.05), then restoring. A guard that has never
been seen to fail is not a guard — do the same for any new one.

`playthrough.mjs` grades the same invariant live, as `system-drift`. It found
the identity bug in production conditions before the fix landed (7 drifts in 8
rounds, 60.5% cache → 0 drifts, 87.2% after), and it covers something Layer J
cannot: that the prompt stays stable *through real rounds of `executeRound`*,
not merely across two calls in a test.

Note `--identity`. It was added because the harness had `练习生` hardcoded, so
7 of the 8 identities had never been played live by anything — which is how a
`Math.random()` in one identity's background block survived every live run ever
made. When testing prompt-level behaviour, sweep identities.

Layer J's determinism sweep was checked the same way: restoring the two
`Math.random()` calls in the identity background builder failed three checks — the
`red_velvet-solo-ko` golden (reporting the differing line), the 8×3 sweep
(naming all three `主线成员前女友` coordinates), and the named ex-girlfriend
check. The other two goldens stayed green, which is correct: they pin identities
that were never affected.

That builder is no longer a function in `mainAgent.js`. The identity backgrounds
moved into `public/worlds/kpop_idol/<lang>.json` in v1.4.0 and are rendered by
`renderIdentityBackground` in `worldLoader.js`; `backstorySeed` still supplies
the index, so the seeding logic and the bug this check guards are unchanged.
