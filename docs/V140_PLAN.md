# v1.4.0–v1.5.0 plan — cast library, worlds, interaction

Planning artifact. Written before any code, per the repo convention that docs lead.
Audience: whoever implements this, which is me in a later session and Yuhan reviewing it.

Status: **agreed in discussion 2026-09-23. Steps 0–3 done — v1.3.9 is released and live, and the
world/roster extraction is on `dev`. Step 4 next.** Plot mode (§19) was specced on 2026-09-24 and
scheduled for v1.4.2.

## Progress

| Step | State |
| --- | --- |
| **0 — CI** | ✅ **done**, on `dev`, unreleased. `.github/workflows/ci.yml` + two Layer C mirror assertions (smoke 457 → **459**). Both verified failing against injected drift. |
| **1 — Golden prompt snapshots** | ✅ **done**, on `dev`, unreleased. Three goldens in `test/fixtures/` + smoke **Layer J** + `scripts/update-golden.mjs` (459 → **469**). Found and fixed a shipped bug, **confirmed live A/B**: 7 drifts in 8 rounds and 60.5% cache before, 0 drifts and 87.2% after. Verified failing against the unfixed code. |
| **2 — Release v1.3.9** | ✅ **released.** Affection clamp (§12), usage panel (§11) + smoke **Layer K**, quota-guarded `saveToStorage` (§10), the backstory fix inherited from step 1, and four writing/pricing fixes found by hand play after the branch was already green (below). Smoke 469 → **578**. |
| **3 — World extraction + resolver** | ✅ **done**, on `dev`, unreleased. Four commits: world JSON + `worldLoader`, `buildSystemPrompt` reading it, `rosterResolver`, and the `habit`/`tags` whitelist. Smoke 578 → **630**. **The gate held: goldens byte-identical, `update-golden.mjs` never run.** Found two pieces of dead code — see below. |
| **4 — Save migration** | ✅ **done**, on `dev`, unreleased. Three commits: the player **birth-year field**, `saveMigrator` (`schema`/`worldId`/`groupId`/`roster`), and the App-side rewiring through `resolveRoster` with `getNpcMembers` ceasing to derive. Smoke 630 → **671**. **The gate held**: a pinned v1.3.8 save migrates to the same member set `getNpcMembers` derives today, in the same order, and builds the same prompt byte for byte. Goldens untouched. |
| **5 — Content (`habit`)** | ✅ **done**, on `dev`, unreleased. Two commits: 175 habits across 30 files + the 30 root mirror copies, then the conditional `Habit:` line. **The goldens moved here, on purpose and for the first time since step 1**: 19 insertions, 0 deletions, every one a `Habit:` line. Scope was wider than "27 files" — 57 members × 3 languages. A hand-play bug found while the branch was green rode along (`7fd109c`, a Kakao transcribed into the story), moving them a second time. Smoke 671 → **695**. |
| **6 — UI** | 🟡 **in progress**, on `dev`, unreleased. Six commits: the prompt surviving an incomplete member, the two stores, `cardGenerator`, the three-step member editor, the roster builder + the cover's second door, and the on-device console. Then **three bugs from the first phone test**, all fixed: the birth-year field could not be typed into, the role picker hid what it was assigning, and a cross-group cast was described as the main member's group. Smoke 695 → **849**. **The gate held: goldens byte-identical throughout.** Remaining: correcting a migrated birth year, optionally splitting the classic Setup page, docs. |
| **6 — UI** (cont.) | ✅ **released in v1.4.0.** Eight further commits after the row above: the birth-year correction, the harness revival + `--cast` + the live gate, the ROLE CONTRACT with six prompt-review fixes, and the save-slot cap with per-language stage names and section 4's per-roster preamble. Smoke 849 → **949**. Splitting the classic Setup page was **not** done and does not block anything. |
| **7 — Release v1.4.0** | ✅ **released 2026-09-28**, tag `v1.4.0` on deploy commit `7b3ceea`. Preceded by a full prompt re-read (nineteen defects, seven invisible to the zh fixture), 105 live rounds across five configurations, and a controlled four-arm re-validation that found two bugs in the measurement itself. Smoke 949 → **1081**. |
| **8 — Four hand-test passes** | ✅ **released in v1.4.0.** Photos reaching the game at all, then the player's own crop, then three phone-only rendering bugs, then the avatar a third time — see CLAUDE.md, *The second fix made the square reachable*. Smoke 1081 → **1204**. Release notes now render inside the game. |

**Step 1 paid for itself before the first fixture existed.** Writing a snapshot forces the
question *is this output actually stable?*, which nothing had ever asked. It is not: the
`主线成员前女友` identity built its background from two `Math.random()` calls, and the system
prompt is rebuilt every round — so that identity re-rolled its own breakup reason and keepsake
every single round. Two consequences, both shipped since the identity existed:

- **The prompt cache could never hit for those players.** ~5,500 tokens at full input price every
  round, against an architecture whose headline number is ~95.8%.
- **The story contradicted itself.** The model was handed a different shared past each round, on
  the one route whose entire premise is a shared past. A player could only have reported this as
  "she keeps forgetting things".

Fixed with `backstorySeed(form, mainId)` — FNV-1a over fields fixed at character setup, so
variety between playthroughs survives and drift within one does not. No new save field, nothing
to migrate. Full reasoning in CLAUDE.md, *"`buildSystemPrompt` must be a pure function of the
save"*, and in `docs/TECH_NOTES.md`.

**Verified live, A/B on Aliyun** (`qwen3.8-flash` pinned, 8 rounds per arm, everything else
identical): 7 static-prompt drifts and **60.5%** cache hit before, 0 drifts and **87.2%** after.
Two harness gaps were closed to make that measurable, and both were part of why the bug lasted
so long: `playthrough.mjs` hardcoded `identity: "练习生"` (so 7 of 8 identities had never been
played live) and had no invariant on the static prompt at all, only on the smaller history
ledger. It now takes `--identity` and reports `system-drift`.

### What a hand playthrough found that a green branch did not

v1.3.9 was built, bumped, CI-green and ready to merge. A single 40-round hand playthrough on
DeepSeek Official then produced **five** more defects, none of which any automated check could
have raised:

1. **Honorifics in narration** (`Irene欧尼正站在窗边`). The prompt scoped *pronouns* to narration
   from v1.3.6 and never scoped address forms at all.
2. **`呀` transliterated where it should not be.** The "keep the Korean form" rule works for 欧尼
   and `nim` because neither is a Chinese word; 呀 *is* one, with a different grammatical job, so
   the transliteration imported the wrong grammar. Generalised in CLAUDE.md.
3. **`Alex--ya`** — a double hyphen in every English prompt since v1.3.6, sitting in the committed
   golden. Found while writing the guard for (2).
4. **The usage panel read 6.7% high**, caught only by comparing it to the provider's billing page.
   Right arithmetic, wrong currency: DeepSeek bills CNY and its own USD sheet converts at ￥6.67,
   not the ￥7.1 used everywhere else here.
5. **The player's birth year is wrong for ~half of players** — deferred to step 4, see below.

The lesson is not "test more". Four of the five are **judgements a native speaker makes about
register**, or a number that only exists on an external billing page. They are invisible to any
assertion that could have been written in advance. The goldens and Layer I were working exactly
as designed and still could not see them, because they pin *what the code emits*, not whether a
human finds it natural.

What did change is that each is now mechanised going forward: smoke **Layer L** unit-tests the
live prose graders (which had never been tested at all — only run live, where a grader that can
never fire looks identical to a clean run), and Layer K pins the cost arithmetic to a real bill.

### Found by step 3: two blocks of dead code, one of them a real feature gap

A faithful extraction has a useful side effect — moving a string forces you to find its reader.
Two had none.

**`paceRules` was never sent.** All four pace descriptions were built into a local and never
referenced, so the player's pace reaches the model only as a bare id on the `Progression Pace:`
line — `浪漫情感向` and nothing else. The model is left to infer what that means from four Chinese
characters, in a prompt that is otherwise explicit about everything.

This is a **feature gap, not just dead code**, and it is worth fixing on its own: the authored
text says things like *"secrecy changes doubled"* and *"love triangle probability doubled"* that
the model currently has no way to know. The strings are preserved in the world file. Wiring them
in is a **deliberate prompt change** — it moves the goldens, and the diff should be read — so it
was explicitly not folded into a step whose entire gate is that the goldens do not move.

It also sharpens the plot-mode design in §19: `pace` currently does even less than that section
assumes, which makes "let `pace` choose the beat pool" a bigger win than it first looked, and
means these two changes should probably land together.

**`const identity` resolving `"H"` to `form.customIdentity` was a leftover.** `App.jsx` already
resolves it before calling `executeRound` ([App.jsx:489](../src/App.jsx#L489)), so the local
shadowed nothing and fed nothing. No player-visible bug: custom identity text does reach the
prompt, through `form.identity`. Deleted.

### Found by step 4: member ids are not unique across the library

§9.3 says to find a legacy save's group by scanning the index for the one containing
`form.mainMember`. That is not sufficient, and the plan did not know it. **`x` is a crossover
roster and shares seven member ids with the groups those members debuted in** — `irene`, `wendy`,
`sana`, `mina`, `sullyoon`, `wonyoung`, `jisoo`. Seven of the library's fifty ids are ambiguous,
so a scan matching on the main member alone would pick one in index order and hand the player a
cast she never chose, silently, on a save she had already been playing.

The implemented rule is containment of the **whole chosen cast** — main plus every sub — which
separates them in every case where the player picked a sub at all. A remaining tie (a solo
`irene` run) is broken by the group the app currently has selected, which is a real signal and
cannot reintroduce the §9.1 bug, because a group that does not contain the cast is never a
candidate. A cast no group contains is **warned about, never defaulted silently**: that is the
v1.3.5 lesson, where `loadGroupIndex`'s catch returning a hardcoded Red Velvet entry hid a path
bug for a whole release. Here the same swallow would have a player's progress attached.

Two corrections to this document follow, both made in place: §9.3's group-scan row, and §9.4's
claim that the migration checks live in Layer J — they are in **Layer I**, next to the
`getNpcMembers` equivalence anchor they are measured against.

### Done in step 6: correcting a migrated birth year (`commit 6`)

Migration writes `birthYear = GAME_YEAR - age`, which reproduces the value a legacy save has
always produced and is therefore **still wrong for about half of those saves**. Nothing can
recover the real year from an age. New games are correct; old ones are not, and no loader can fix
that without changing a running game underneath its player.

So the fix is an affordance, not a migration: let the player correct her birth year on a loaded
save. It belongs in step 6 because it is UI, and because editing it mid-run rewrites the static
prompt and costs one full cache miss — a fine price for a deliberate action, and not something to
incur as a side effect of loading.

**As shipped.** A birth-year row in the in-game settings overlay, beside Deep Thinking and Time
Speed, available in every run rather than only a migrated one — a typo at Setup produces exactly
the same wrong honorifics as a migration does, and one path is easier to reason about than two.

Three rules govern it, and each is a guard:

1. **It writes `birthYear` and never `age`.** `backstorySeed` hashes `age`, and that seed must stay
   frozen for the life of a save or the identity backstory re-rolls mid-game — step 1's bug wearing
   a third hat. The Setup field deliberately writes *both* (age is minted there, once); the
   correction writes one. They are therefore **different functions**, not one shared handler:
   `setBirthYear` at Setup, `correctBirthYear` afterwards.
2. **An unchanged year costs nothing.** Submitting the value already in the form returns the form
   object untouched, so re-confirming a correct year is not a cache miss. Only a real change pays.
3. **It is refused outside the bounds.** `validPlayerBirthYear` is now one function in
   `constants.js` instead of a copy at each call site, because a correction that bypassed the range
   Setup enforces would let a save hold a year Setup would have rejected.

`correctBirthYear` lives in **`saveMigrator.js`**, next to the migration that deliberately did not
fix the value. The two halves of one decision belong in one file: that header already said
*"correcting it is a separate, visible act the player takes"*, and this is that act. It also makes
the rule **executable** rather than a source-string assertion — the guard that matters here is that
`age` does not move, and that is worth running rather than grepping for.

**Discoverability is the other half, and it is session state, not a save field.** `loadSave` knows
something the migrated save no longer does: whether `form.birthYear` was present *before*
`migrateSave` filled it. A save that had none carries an estimate, so the row explains itself in
that session. Persisting that provenance would mean a new save field that must then be cleared,
and the row is permanent and self-describing anyway — the flag only decides whether an extra line
of explanation shows.

### Done in step 4: the player's birth year

`playerBirthYear = GAME_YEAR - playerAge` (`mainAgent.js:102`) assumes the player's birthday has
already passed this year, so it is **wrong for roughly half of all players**. Reported live: a
player born 1999-11-19 entering age 26 derives 2000, so Yeri (1999) becomes her senior when the
two are peers, and the game tells her to say `欧尼` to a same-year member.

This is not fixable from age — age alone cannot determine birth year, and since seniority is a
hard year boundary with no tolerance, a one-year error flips the relationship whenever it lands on
a member's birth year.

**Setup now collects `form.birthYear` and the prompt renders her age from it**, which is the only
direction that throws nothing away. The comparison itself never needed touching: `mainAgent.js`
already compared birth year to birth year, and only the source of the player's was lossy.

`age` stayed in the form, **demoted to a frozen setup token**. `backstorySeed` hashes it and that
seed must stay fixed for the life of a save, or an identity backstory re-rolls mid-game — the
drift step 1 closed. Setup writes it once from the birth year; nothing edits it afterwards. Had
the seed been re-pointed at `birthYear` instead, every existing ex-girlfriend save would have
re-rolled once on load, which is the same bug wearing a different hat.

Old saves migrate to `GAME_YEAR - age`, reproducing the value they already produced, so a game in
flight is byte-identical before and after. That is preservation, not repair — see *"Carried into
step 6"* above.

## Pick up here

**State as of 2026-09-28. v1.4.0 is released and every step in this plan has shipped.** `main`
and `origin/main` are at `7b3ceea`, the deploy commit, tagged `v1.4.0`; all three mirrors serve
`index-BEbGT01U.js`, verified byte-identical to the local build. **CLAUDE.md's `Pick up here` is
the authority on what is open** — it is shorter and it is current. What remains of *this* file's own
scope is one measurement: **§10's storage budget is calculated, not measured**, and the image sheet
prints `N KB used` on a real device. Read it and replace the arithmetic.

Everything below this line is the record of how the plan ran, kept because the reasoning is not
recoverable from the diffs. The dates and branch states in it are historical.

**State as of 2026-09-24** (historical). v1.3.9 is **released** and is what players run: `main` and
`origin/main` are at `758faa3`, the deploy commit, tagged `v1.3.9`. All three mirrors serve
`index-DAtY_Xfc.js`.

**Steps 3, 4 and 5 are done, pushed, and unreleased.** `dev` and `origin/dev` are both at
`7fd109c` — **sixteen** commits ahead of `main`, zero behind — and **CI is green** (run
`36046756985`). Nothing is pending on anyone's machine. No step ships a player-visible change on
its own, so all three ride with v1.4.0 rather than justifying a release. Smoke **578 → 695**.

Goldens were byte-identical through steps 3 and 4; **step 5 moved them twice, both deliberate,
both diffs read before committing** — 19 `Habit:` lines, then +3/−2 per fixture for the KKT rule
restructure that came with the v1.3.9 hand-play bug below.

CI matters more than usual for these two: it builds from a clean checkout with `npm ci` on Linux,
while `src/` on the development machine is CRLF and the goldens are LF. Green there is what says
the line-ending split is not load-bearing.

| Step 4 commit | What |
| --- | --- |
| `9d1c6cd` | the player's birth year is collected, not derived |
| `a629182` | `saveMigrator`, not yet consumed |
| `73b0995` | the game path resolves its cast from the roster |

**The gate held.** A pinned v1.3.8 save (`test/fixtures/save-v138.json`, TWICE) migrates and
resolves to the same member set `getNpcMembers` derives today, in the same order, and builds the
same system prompt **byte for byte**. Every guard added across the three commits was verified to
fail against a broken implementation — the old age-derivation, an off-by-one migration fallback, a
seed hashing `birthYear`, reversed member order, a disabled group scan, a removed idempotence
short-circuit, `phaseRef` pinned late, the group not taken from the save, and `SaveOverlay`
dropping `groupId` or `roster`.

**Step 6 is complete apart from two optional items. Smoke 695 → 949.** Fourteen commits:

| Commit | What |
| --- | --- |
| `919449a` | the prompt survives an incomplete member (commit 1) |
| `d79c04c` | the custom-cast palette and the photo store (commit 2) |
| `b78b8c5` | `cardGenerator` (commit 3) |
| `258a818` | the member editor, three steps (commit 4) |
| `d10f586` | the roster builder + the cover's second door (commit 5) |
| `5548050` | **tooling** — an on-device console |
| `ca66510` | **fix** — the birth year could not be typed; the role picker hid what it did |
| `b8e66b0` | **fix** — a cross-group cast is its own group, not the main member's |
| `081fc86` | **docs** — step 6 recorded, and this document corrected where phone play moved the design |
| `2eca085` | correcting a migrated birth year (commit 6) — see *"Done in step 6"* above |
| `06d1dc9` | **test** — `playthrough.mjs` revived and taught `--cast`; the live gate met |
| `f04c523` | **fix** — the player's identity is hers, and six stale rules removed from the prompt |
| `d731db1` | **fix** — save slots refuse instead of evicting; stage names and section 4 per roster |

**The live gate is met, and then some — 64 rounds across four configurations** (2026-09-27):
Chaebol classic **20/20 clean**, Chaebol + cross-group cast 17/20, Staff in **en** 12/12, the
ex-girlfriend identity in **ko** 12/12. **0 static-prompt drifts and 0 ledger prefix breaks across
all 64**, 18 collapses, cache 81.2–86.9%. Of the three flags, two were the new grader misreading the
player's own dialogue and one was a real KKT transcription left alone at n=1 — see CLAUDE.md.

Getting there needed the harness taught to express a roster at all (`--cast
blackpink:jisoo,red_velvet:irene,custom:李飞,twice:mina@npc,twice:sana@npc`) and, first,
**`playthrough.mjs` un-broken: it had been dead since step 3**, its `fetch` stub serving `/groups/`
but not the `/worlds/` step 3 introduced. So steps 3, 4, 5 and 6 were every one of them validated
with zero live rounds. The new guard derives the trees from `src/` rather than listing them; see
CLAUDE.md, *"`playthrough.mjs` had been dead since step 3"*.

**Remaining in step 6, both optional and neither blocking a release:** splitting the classic Setup
page into steps, and the roster builder's visual design — **known to be unpolished and deliberately
deferred**, Yuhan's call after the phone test: "works but doesn't look good, we can improve this
later."

**Three more player-reported bugs were fixed after the gate, all from hand play, none findable
offline:** a Chaebol player's identity leaking onto a member and the members' practice schedule onto
her (`f04c523`), and **save slots silently deleting the oldest run past ten** (`d731db1`) — the worst
of the three, because it destroyed player data rather than misdescribing it. Reviewing the whole
rendered prompt on Yuhan's suggestion found six more stale or contradictory statements in the same
commit; see CLAUDE.md, *"Reading the whole rendered prompt, once, found six more"*.

**Next: step 7, release v1.4.0.** Nothing in step 6 is known-broken. The release itself still needs
the version bump, the README "What's New" section, and the merge-and-deploy sequence in CLAUDE.md's
**Release** flow.

### Hand-tested on a phone, which is the only place three of these showed

Step 6's gate is a 390px hand test, and it was done on an iPhone against the Cloudflare branch
alias — `https://dev.idol-dating-sim.pages.dev/?debug=1`. **Use Cloudflare, not Vercel, for
branch previews**: its alias is a deterministic `<branch>.<project>.pages.dev`, while Vercel's
preview hostname embeds a team slug that exists nowhere in this repo and cannot be derived from
it.

Three bugs came out of that session and none of them could have come out of anything else:

1. **The birth-year field could not be typed into.** The editor derived the input's value from
   `profile.birthday`, so one keystroke stored `"1-01-01"` and fed `"1-01-01".slice(0, 4)` —
   `"1-01"` — back into a `type="number"` input, which cannot render that. The box blanked on
   every keypress. **The bug was in the round trip**, and the guard covering it checked only the
   write: it asserted the stored *format* and never that the value read back, so it passed against
   completely broken behaviour. The conversion now lives in `customCast.js` as `birthYearOf` /
   `birthdayFromYear`, tested in both directions by simulating the keystrokes.
2. **The role picker hid what it was assigning.** It was tap-to-cycle — none → main → sub → npc →
   none — shown as ◌ ★ ● ○. Reported as confusing, and rightly: the player could not tell *what*
   they were choosing, and removing someone meant tapping *forward* through every remaining state.
   Now one named button per role, tapping the active one removes her, the three roles are
   explained while the cast is empty, and the cast summary carries an × per member.
3. **A cross-group cast was described as the main member's group** — see below. The most
   consequential of the three.

### Found by phone play: the cast is a group, not a collection

Reported cast: Jisoo (BLACKPINK) main, Irene (Red Velvet) and a custom member sub, Mina and Sana
(TWICE) as NPCs. Round 1 put **Jennie, Rosé and Lisa** in the story and set the company to **YG**.

`resolveRoster` returned the main member's group config, so §4 of the prompt handed over
`[BLACKPINK Background]` plus full Public / Private / Queer Texture prose for all four BLACKPINK
members, three of whom were not in the roster. **§6's rule says only members in MEMBER PROFILES
may appear by name, and §4 was contradicting it two sections earlier with richer detail.** "YG" is
in no file in this repo — the model inferred the agency from a premise it was handed.

**The fix changes this plan's design, so the plan is corrected rather than annotated.** §4.2's
roster already carried an optional `name`; it is now load-bearing.

**A cast drawn from more than one source is its own group.** Yuhan's framing, adopted over the
first attempt, which told the model these people came from different agencies and that any scene
putting two of them together needed a reason. That version fights the setting: secrecy, dorms,
schedules, group activities and the phase beats are *all* group machinery, and a cast described as
five idols from four companies has none of it. As a group it is a premise instead of a constraint,
and naming the agency is what stops one being invented.

- Default name **`X`**, agency derived as **`X Entertainment`**, editable at Setup. The library
  already ships a group called `X` (id `x`, a 10-member crossover), so the default collides by
  name only; it is one string to change if that becomes annoying.
- **The origin groups are never named.** That is the leak: a model told the cast is BLACKPINK
  completes the group from its own knowledge. Nothing downstream needs them — a member's profile
  says who she is, and her real-world affiliation plays no part in the game.
- **A subset of one group keeps that group's real name**, because it still *is* that group, but the
  exclusion is stated out loud. `BLACKPINK is a 4-member group` while naming only Jisoo is the
  same leak in a quieter form.
- The composed lore does **not** repeat the prose fields. §5 carries them in full for exactly the
  members present; the single-group lore duplicates them and that is inherited token cost, not a
  pattern worth extending.
- **The gate held anyway.** The verbatim single-group lore is used whenever the roster is exactly
  one whole group — which is what the classic door always produces, since `buildClassicRoster`
  gives every member a slot — so the composed form is reached only by a cast the old code could
  not express. All three goldens are byte-identical.

It also closed a crash: an **all-custom cast** returned `groupConfig: null`, and
`buildSystemPrompt` reads `groupConfig.groupLore` unconditionally, so it threw a `TypeError`
before round 1. Reachable, because a custom member can be the main.

**The guard that should have caught the lore bug asserted the opposite.** *"lore follows the main
member's group, not the first group listed"* pinned the bug as intended behaviour. A guard written
from the implementation rather than from the requirement will do that, and the only defence is to
ask what a check would look like if the behaviour were wrong.

### Done in step 6: what the commits decided

- **Every optional field in the member profile block is conditional** (commit 1). A member built
  from §4.4's required tier alone previously rendered four defects in one block: `undefined` twice
  (emoji, animal) and a trailing space twice (`  Public: `, `  Queer Texture: `). Step 5 had fixed
  one instance of a class with five more members.
- **The golden blind spot, measured rather than asserted**: reverting that to unconditional leaves
  **0 of 3 goldens moved while 8 Layer I checks fail**. All 175 library member records are
  complete, so the empty branch appears in no snapshot.
- **Three storage keys, not §4.3's five.** `rv_sim_world` arrived in v1.4.1 **step 3**, with the
  picker that reads it — not step 7, which this line used to say; `rv_sim_worlds_custom_v14` is still
  deferred with the world builder. This repo already carries `NPC_APPEARANCE_CHANCE` and
  `NPC_COOLDOWN_ROUNDS` as a standing example of what declaring ahead of the reader costs.
- **Nine card fields, not §4.5's seven.** `name` and `birthday` are generated too, or the player
  still hand-fills two required fields and the fast path is pointless. `mbti`, `role`, `name_kr`
  and `tags` are excluded: for a custom member they reach **no prompt at all**, since
  `buildGroupLore` renders those only for the primary group's own members.
- **`world.setting` does not exist yet.** §4.5 names it; the v1.4.0 world shape carries only
  `name`/`emoji`/`color`. The card prompt falls back to the name and will prefer `setting`
  automatically once v1.4.1 adds it.
- **`src/utils.js` and `src/utils/` now both exist**, because §10 specifies
  `src/utils/imageStore.js`. Vite and esbuild both resolve `from "./utils"` to the file, and
  `imageStore` names its own import `../utils.js` rather than relying on that. **A
  `src/utils/index.js` would silently re-point every such import**; smoke asserts none exists.
- **`speech_style` joined the whitelist and the profile block**, in the `habit`/`tags` order —
  field first, so content arrives working rather than silently dropped.

### Done in step 6: an on-device console (`5548050`)

Not a plan item, added because step 6's gate is a phone and iOS Safari has no reachable devtools —
while this project's two most phone-specific failures, `QuotaExceededError` from `saveToStorage`
and every `LLMError` kind, are both reported through `console.error`.

**The capture is always on; the panel is opt-in** (`?debug=1`, then persisted). A tool you must
enable *before* the bug is one you use after reproducing it, and some of these need a twenty-round
game to reach. **Every captured string is key-redacted before entering the buffer**, because the
buffer exists to be copied off the phone and pasted into a bug report. Eruda is supported at
`?debug=eruda` but deliberately not the default — it is a third-party script running beside a
stored API key, it cannot work offline, and it only records from the moment it loads. Full
reasoning in `docs/TECH_NOTES.md`.

### Done in step 5

Three commits plus a bug fix found by hand play while the branch was green.

| Commit | What |
| --- | --- |
| `6cdb550` | 175 habits across 30 files + the 30 root mirror copies |
| `26ca206` | the conditional `Habit:` line; goldens moved, +19/−0 |
| `d3541d2` | docs |
| `7fd109c` | **fix** — a Kakao is delivered by the app, never transcribed into the story |

**The goldens moved for the first time since step 1, and the diff was read before committing**:
19 insertions, 0 deletions, every one a `  Habit: ` line, one per member, after `Queer Texture`
and before `Hidden Conflict` where that exists. No other byte moved in any of the three fixtures.

**Scope was wider than this plan said.** "27 group files" was wrong twice over: there are **30**
files (9 groups + `_template`) and **57** members, so the content is **175 strings**, not 27. All
30 are **CRLF**, and `cat -A` piped through GNU sed shows clean `$` and is lying — sed strips the
CR in text mode, which is the same trap that made step 4's mutation run report a SKIP.

**A golden covers what the data happens to contain, not the branch the data never exercises.**
The `Habit:` line is conditional, so an absent habit renders nothing rather than `  Habit: ` with
a trailing space. Mutating it to unconditional leaves **all three goldens green** — every library
member has a habit, so the empty case appears in no snapshot — and only the dedicated
trailing-whitespace guard in Layer I fails. This matters immediately for step 6: a custom member
with no habit is exactly that untested branch. Do not read a green golden as coverage of a case
the fixtures cannot contain.

The same guard's first catch was a flaw in its own harness rather than in the code — slicing the
member-profile section at `"6. CAST IDENTITY"` ends mid-banner and leaves a dangling `║ ` that
reads as trailing whitespace. It now cuts back to the start of the next banner box.

### Found by hand play during step 5: a Kakao written into the story

Reported on DeepSeek Official in zh, on **v1.3.9** — so not a v1.4.0 regression, but fixed here
because the branch was already moving the goldens. A round delivered Irene's Kakao *and*
transcribed it into the prose, phone-screen header and all, so the player read the same three
lines twice: once in the narrator's voice, before she had looked at her phone.

**Root cause is specification by contrast.** The prohibition lived *inside* the LOCKED-channel
bullet — *"A LOCKED member … the story MUST NOT mention her texting"*. A long, emphatic rule
conditioned on LOCKED invites the reading that an unlocked member may be narrated, and nothing
else covered the unlocked case but a generic "no social media in story" line four sections
earlier. That also dates it: the locked bullet landed in **v1.3.6**, which is when a rare symptom
became a regular one. The rule is now unconditional and stated *first*, with the locked case as
an additional constraint.

**The live grader had the identical blind spot, and that is the more reusable half.**
`kkt-narrated-but-locked` runs only `if (!delivered)`, so a round that delivered a Kakao and
duplicated it was unreachable by it. `kktTranscribed` covers the delivered case by matching a
delivered message **verbatim** in the prose. Generalise it: **when a rule is scoped to one
branch, check whether its detector is scoped to the same branch.** Two independent scopings, the
same blind spot, and neither would have surfaced without the other being questioned.

Mutation testing earned its keep again. Two of the six new guards came back **GREEN** on the
first run — the punctuation-reflow fixture used a message with no trailing punctuation to strip,
and the `{sender, content}` fixture passed only plain strings. Both were passing for the wrong
reason, and both now isolate the case they claim to test.

### Habit provenance: what is sourced and what is derived

The rule is **publicly known, persona level, never a claim about a real person's health, body,
relationships or private life** — borrowed from `byhAnita/yuriagent`'s `src/data/facts.js`, which
states it better than this plan originally did. That rule is only honest where the knowledge is
actually reliable, so the content ships in two tiers, tracked rather than blurred. Promoting a
derived habit to a sourced one is a content decision and needs the same care as writing it.

**Sourced (20)** — `red_velvet/` irene, seulgi, wendy, yeri · `twice/` nayeon, jeongyeon, momo,
sana, mina, dahyun, chaeyoung, tzuyu · `blackpink/` jisoo, jennie, rose, lisa · `aespa/giselle` ·
`ive/wonyoung` · `nmixx/lily` · `x/hyewon`.

**Derived (30)** — built from that file's own `private_personality`, plainly fiction:
`red_velvet/joy` · `twice/jihyo` · `aespa/` karina, winter, ningning · all of `itzy/` and `ive/`
bar wonyoung · `nmixx/` bar lily · all eight of `gnz/` · `x/` eunbi, miyeon.

`gnz` is entirely derived on purpose: it is the group this author has the least reliable public
knowledge of, and inventing a detail that *reads* as sourced fact is the specific failure the rule
exists to prevent. Those eight are the first place to spend a correction pass.

Four habits come directly from yuriagent's `FACTS` table (irene, yeri, `blackpink/jisoo`,
`x/hyewon`) — two of which carry the Red Velvet goldens.

**The seven crossover ids are authored once, at their home group**, and repeated verbatim in `x`:
irene and wendy from `red_velvet`, sana and mina from `twice`, sullyoon from `nmixx`, wonyoung
from `ive`, jisoo from `blackpink`. A physical tic belongs to the person, not the roster. Smoke
fails when one copy is edited and its twin forgotten.

**Four things to know before running anything live.** `qwen3.8-max` and `glm-5.2` are out of
free credits on the dev key — pin `qwen3.7-plus` or `qwen3.8-flash` instead, and re-probe with
`node test/smoke.mjs --live-free` rather than trusting this line. `.env.local` pins
`MODEL_ID=aliyun`, which resolves to the exhausted `qwen3.8-max`, so **smoke Layer B cannot pass
on this key** — that is the environment, not a regression, and `--live-free` is the live check
that works. `--identity` should be swept, not left at its default. And `npm run deploy`, the
`main` merge, the tag and any push are red lines needing explicit approval each time.

Everything below §15.0 in this document is design, not progress.

---

## 0. The one-sentence version

A "group" currently bundles three independent things — **who the cast are**, **what world they
live in**, and **which of them are in this run**. Splitting those three is the whole refactor;
every feature below falls out of it.

---

## 1. Release split

The data split is the only risky refactor and everything depends on it, so it ships alone and
first, with no new player-visible worlds riding along.

| Release | Contents | Risk |
| --- | --- | --- |
| **v1.4.0** | Cast library + cross-group roster builder + custom members + card generation + `habit` + save migration + usage panel + affection clamp | High — touches saves |
| **v1.4.1** | Country as a world field + shared address registers + the **story-mode switch** (pace out of Setup, into the tail) + the **world picker on Setup** + the three new worlds + per-world platforms + place map (picker, canon, discoveries) + opening scenario. **Scoped 2026-09-28** — see §15 | Medium — new data, no save migration |
| **v1.4.2** | Unified game entry, custom world builder, player-side KKT/IG, cast relations, place→member affinity prior | Low — additive |
| **v1.5.0** | Story archive + BM25 retrieval into the dynamic tail | Own release; changes what the model remembers |

Each release is validated with `npm run build` + `node test/smoke.mjs` and, for v1.4.0 and
v1.4.1, a live `node test/playthrough.mjs` pass before the release merge.

---

## 2. Architecture

### 2.1 The split

```
                        BEFORE (v1.3.8)                   AFTER (v1.4.x)

  public/groups/<g>/<lang>.json              public/groups/<g>/<lang>.json   (unchanged)
    ├── group lore      ─┐                     └── cast profiles only
    ├── member profiles  ├─ one file          public/worlds/<w>/<lang>.json   (new)
    ├── social platforms │                      ├── lore, identities, paces
    └── history         ─┘                      ├── phases, stat labels
                                                ├── platforms, places
  selectedGroup: "red_velvet"                   └── npc archetypes
    → every member of that group
    → main/sub chosen, rest = NPC             roster (in the save)
                                                ├── worldId
                                                └── entries[] {src, memberId, slot, ...}
```

**The cast library needs no new data file.** `public/groups/*/<lang>.json` already *is* the
library; the group tabs in the builder are exactly a lazy-load boundary — `index.json` for the
tab strip, fetch a group's file when its tab opens. Zero data migration, one source of truth.

**`x` stays as a shipped preset roster, not a deleted file.** Its member profiles are genuinely
rewritten for the X context ("in this cross-group combination she is the eldest"), so that prose
is authored content worth keeping — it becomes `override` entries on a preset roster. Nothing
under `public/groups/` is deleted by this plan.

### 2.2 The roster is the internal representation

The classic single-group path stays on the cover page and is **not** a separate code path: it
builds a roster implicitly from a group id. One engine, two doors.

```
Cover
 ├── [Classic]  pick a group  ──→ buildClassicRoster(groupId, main, subs)  ─┐
 └── [Custom]   roster builder ──→ roster from the builder                 ─┼──→ resolveRoster()
                                                                            │      ↓
                        old save ──→ migrateSave() ─────────────────────────┘   members[]
                                                                                   ↓
                                                                           buildSystemPrompt()
```

`resolveRoster(roster, language)` is the single funnel. It fetches the distinct `groupId`s it
needs, pulls the named members out, applies `override`, splices in inline custom profiles, and
returns the same `members[]` shape `buildSystemPrompt` consumes today. **Nothing downstream of
`resolveRoster` changes.**

### 2.3 Consequence: NPCs become explicit

`getNpcMembers` currently returns *everyone not chosen*. A 9-member group with 1 main + 2 subs
therefore emits **six** NPC profiles into the static prompt whether or not they matter — roughly
720 tokens of cast nobody asked for. Roster entries carry `slot: "main" | "sub" | "npc"`, NPCs
are picked deliberately from the library or from custom members, and `getNpcMembers` stops
deriving. This is a token win as much as a UX one.

For the classic path, migration fills `npc` with the leftover members so existing behaviour is
byte-identical.

---

## 3. Folder structure

```
public/
  groups/                 unchanged — the cast library
    index.json
    red_velvet/ twice/ aespa/ nmixx/ ive/ itzy/ blackpink/ x/ gnz/ _template/
  worlds/                 NEW
    index.json            [{id, name, emoji, color, blurb}]
    kpop_idol/            zh.json en.json ko.json   ← today's behaviour, extracted
    campus/               zh.json en.json ko.json
    office/               zh.json en.json ko.json
    chaebol/              zh.json en.json ko.json
    _template/            zh.json en.json ko.json
  rosters/                NEW — shipped presets
    index.json
    x.json                the current X group, expressed as a roster

src/
  rag/
    groupLoader.js        + cast-library helpers (unchanged fetch/parse core)
    worldLoader.js        NEW — loadWorldIndex, loadWorld, parseWorld
    rosterResolver.js     NEW — resolveRoster, buildClassicRoster
    customCast.js         NEW — localStorage CRUD for custom members + worlds
    archive.js            v1.5.0 — IndexedDB story archive
    retrieve.js           v1.5.0 — BM25
  agent/
    mainAgent.js          buildSystemPrompt reads world instead of hardcoded blocks
    cardGenerator.js      NEW — one-call character-card generation
    probabilityEngine.js  v1.4.2 — log-linear place prior
  platforms/
    RosterBuilder.jsx     NEW
    MemberEditor.jsx      NEW
    WorldBuilder.jsx      deferred past v1.4.1 — see §15
    MapOverlay.jsx        NEW (v1.4.1)
    UsagePanel.jsx        NEW
  utils/
    imageStore.js         NEW — canvas downscale + quota-guarded persistence
```

---

## 4. Data shapes

### 4.1 World JSON — `public/worlds/<id>/<lang>.json`

```jsonc
{
  "world": {
    "id": "kpop_idol",
    "name": "…",
    "emoji": "🎤",
    "color": "#e887b0",
    "setting": "One paragraph. Goes into section 4 of the prompt.",
    "tone": "slow-burn, industry pressure, secrecy"
  },
  "identities": [
    { "id": "练习生", "label": "…", "background": "…", "workTitle": {"zh":"前辈nim", …} }
  ],
  "paces":  ["慢热现实向", "浪漫情感向", "高压舆论向", "修罗海王向"],
  "phases": [
    { "from": 1,  "to": 6,  "title": "…", "beats": "First encounters. …" },
    { "from": 7,  "to": 14, "title": "…", "beats": "…" },
    { "from": 15, "to": 24, "title": "…", "beats": "…" },
    { "from": 25, "to": null, "title": "…", "beats": "…" }
  ],
  "statLabels": { "selfId": "…", "secrecy": "…", "mood": "…" },
  "statNotes":  { "secrecy": "what raises and lowers it in THIS world" },
  "platforms":  { "social": ["bubble", "instagram", "weverse"], "private": "kakaotalk" },
  "places": [
    { "id": "practice_room", "name": "…", "emoji": "💃",
      "desc": "one line", "draws": ["dancer", "leader"] }
  ],
  "npcArchetypes": ["manager", "assistant", "executive", "fan"],
  "scenario": "Opening paragraph used to seed round 1.",
  "roleLabel": "Role"          // SUPERSEDED in step 4 by `castLore.useRole` — see below
}
```

**`roleLabel` never shipped, and step 4 replaced it with a boolean.** The sketch above assumed the
idol position was rendered behind a *label* the world could rename. It is not: `memberLine` joins
`role` into a bare comma list (`Leader, Main Rapper, ENFP, Rabbit`) and prints no label at all, so a
world-supplied label would be a string read only for its **truthiness** — a field with no reader wearing a
noun's clothes, which is the shape this project already tracks four times. `castLore.useRole` says the
one thing the renderer actually branches on: whether a cast position exists in this world.

```jsonc
  "castLore": {
    "useRole": true,        // false => a member's idol `role` never reaches the prompt. Top-level `useGroupLore` is its sibling in intent, not in nesting
    "orgSuffix": "Entertainment", "orgNoun": "Group", "orgHint": "… Agency: {org}",
    "composed": ["…"], "subset": ["…"]
  }
```

> ⚠️ **`kpop_idol` identity ids must stay exactly `练习生` / `Staff` / `韩娱艺人` / `粉丝` /
> `留学生` / `财阀` / `主线成员前女友` / `H`.** Those literals are in `form.identity` in every
> existing save ([App.jsx:38](../src/App.jsx#L38)). Renaming them to something tidier silently
> blanks the identity block for every returning player. Same rule for `PACES` and `STAR_LEVELS`.
> This is the `gpt4omini` lesson: a legacy id is load-bearing precisely because it is stored.

**Stat keys never change.** `selfId` / `secrecy` / `mood` stay fixed forever — they are in the
JSON schema, in `validateAndFixOutput`, in every save. A world supplies only the **label** and
the prompt's **description** of what moves them. "Secrecy" is meaningless in a campus world; it
gets relabelled, not removed. Identical treatment for the five achievement keys.

### 4.2 Roster

Lives in the save, and in `public/rosters/*.json` for presets.

```jsonc
{
  "worldId": "kpop_idol",
  "name": "X",
  "entries": [
    { "src": "library", "groupId": "red_velvet", "memberId": "irene",
      "slot": "main", "override": { "public_image": "…" } },
    { "src": "library", "groupId": "twice", "memberId": "sana", "slot": "sub" },
    { "src": "custom", "memberId": "c_1758…", "slot": "npc",
      "lang": "zh", "profile": { /* full member object, snapshotted */ } }
  ],
  "relations": [ { "a": "irene", "b": "seulgi", "note": "…" } ]   // v1.4.2
}
```

**Custom members are snapshotted inline; library members stay by reference.** Deleting a custom
member from the palette can then never break a running save or a saved preset, while a fix to a
library profile reaches games in progress. The custom-member store is a *palette*, not a
dependency.

**`name` is load-bearing, not decorative — corrected in step 6.** A roster drawn from more than one
source *is its own group*, and `name` is that group's name: the prompt's §4 renders
`[<name> Background]` with the agency derived as `<name> Entertainment`, defaulting to `X`. Before
this, §4 used the **main member's group config**, which handed the model a group it was not playing
— full profiles for three BLACKPINK members who were not in the roster, and an agency it inferred
from the group name. See *"Found by phone play: the cast is a group, not a collection"* in Progress.
The origin groups are deliberately absent from the composed lore, and a roster that is exactly one
whole group still uses that group's own lore verbatim, which is what keeps the goldens fixed.

### 4.3 New localStorage keys

All go in `STORAGE_KEYS`, per the existing note that inline literals are the wrong pattern.

| Key | Holds | State |
| --- | --- | --- |
| `rv_sim_cast_custom_v14` | `[{id, lang, createdAt, profile}]` — custom member palette | ✅ step 6 |
| `rv_sim_rosters_v14` | `[{id, name, createdAt, roster}]` — player-saved rosters | ✅ step 6 |
| `rv_sim_cast_photos_v14` | `{memberId: dataUrl}` — 256×256 WebP | ✅ step 6 |
| `rv_sim_worlds_custom_v14` | `[{id, createdAt, world}]` — custom worlds | ⬜ deferred with `WorldBuilder.jsx` |
| `rv_sim_world` | selected world id (mirrors `rv_sim_group`) | ✅ v1.4.1 step 3 — written only after the world it names has **loaded**, so a world that fails to fetch is not remembered |

**Only the three v1.4.0 keys are declared.** The other two are not added until something reads
them: `NPC_APPEARANCE_CHANCE` and `NPC_COOLDOWN_ROUNDS` have sat unimported in `constants.js` for
several releases and are documented in CLAUDE.md as "either wire them up or delete them", which is
the cost of declaring ahead of the reader. `rv_sim_debug` also exists, set by `?debug=1`, and is
deliberately *not* in `STORAGE_KEYS` — it is read by `debugConsole.js` before React mounts.

### 4.4 Custom member form

The prompt only genuinely requires three fields. Everything else improves quality.

| Tier | Fields |
| --- | --- |
| **Required (3)** | `name`, `birthday`, `private_personality` |
| **Recommended (4)** | `public_image`, `queer_texture`, `speech_style`, `habit` |
| **Advanced (collapsed)** | `name_kr`, `mbti`, `role`, `animal_plastic`, `hidden_conflict`, `emoji`, `color`, `accent`, `tags` |

> ⚠️ **`birthday` is required, not optional.** The entire address protocol is a birth-year
> comparison; a member without one falls back to `"2000-01-01"` and the honorifics go uniform.
> That is exactly the v1.3.6 → v1.3.7 failure, and making the field optional reintroduces it
> one custom member at a time. Ask for the year at minimum.

`emoji` / `color` / `accent` are auto-assigned from a palette so the player never has to care.

### 4.5 Card generation (`src/agent/cardGenerator.js`)

One call, at Setup, on the key the player already entered (page order is Cover → KeyInput →
Setup, so the key exists). Input: a one-line description plus the chosen world's `setting`.
Output: the seven prose fields, which the player then edits.

- Goes through `callLLM` like everything else — provider-agnostic, inherits the retry policy
  and the error layer for free.
- **Must fall back to the blank form on any `LLMError`.** A dead provider cannot be allowed to
  block character creation.
- Response is parsed with the same tolerance as a round (fenced JSON, partial fields); missing
  fields simply stay empty rather than failing the call.

---

## 5. Locale

Custom members are authored in one language. **Do not translate them.**

Tag the profile with `lang` and let the prompt carry the instruction: *"This member's profile is
written in zh; render her in ko."* Models handle this reliably and the app already does
cross-lingual work every round — the `summary` field is always English while the story is zh/ko.
Costs nothing, needs no setup-time API call, cannot fail.

The exception is `name`: kept verbatim, never transliterated, which is the reason the form asks
for it as its own field rather than extracting it from prose.

---

## 6. Prompt assembly and token budget

Section numbering is preserved so the diff stays readable.

| § | v1.3.8 | v1.4.x |
| --- | --- | --- |
| 1 | Language rule | unchanged |
| 2 | JSON output | schema trimmed to the world's declared platforms |
| 3 | Story generation | phase beats come from `world.phases` |
| 4 | Group background | `world.setting` + `world.castLore` / `world.useGroupLore` + roster relations — the agency phrasing is the world's, not `rosterResolver`'s |
| 5 | Member profiles | + `Habit:` line; NPCs are explicit, not leftovers |
| 6 | Cast identity & address | identity text from `world.identities`; token table resolved from the world's `country.register`; **protocol logic unchanged**. **The pace line LEAVES this section** for the dynamic tail as `[Story Mode]` |
| 7 | Social platform rules | only the platforms the world declares |
| 8 | NPC rules | unchanged |
| 9 | Game rules | unchanged |
| 10 | Stat system | + `world.statNotes` — what raises and lowers each stat in THIS world |
| 11 | — | **NEW** Places (canon list) + the who-is-likely-there rule + opening scenario |

**Corrected in step 4: the new section is 11, and this table used to say 8.** Sections 8, 9 and 10
already exist in `buildSystemPrompt` (NPC rules, game rules, stat system) — the row above was
written from §6's *design* numbering rather than from the rendered prompt. Inserting places at 8 would
renumber three sections and every cross-reference inside the prompt that names one (*"section 7"*,
*"Section 6 SPEAKER CONTRACT is binding"*, *"the one section 4 names"*), moving all three goldens for
no change in content and handing a reader a diff in which nothing is findable. Places go **after** the
stat system, immediately before the JSON schema, as **11**.

**Everything added here is static and therefore cached from R1**, with one deliberate exception:
the story-mode rule **leaves** the static prompt for the dynamic tail, so that switching mode mid-run
costs no cached prefix. Calculated, not measured: ~50 tokens moving from the cached prefix to the
always-miss tail is about **+0.5%** of input cost per round, and the static prompt gets ~50 tokens
smaller. No change touches the history ledger.

**The address token table moves into the world file — during the extraction, not after.**
`TOKENS` in `mainAgent.js` maps 언니 / 님 / 씨 / 야 per output language, so it reads as a
*language* table. It is not. It is a **(world, language)** table: Korean seniority is a birth-year
boundary and these honorifics are how it is spoken, whereas a Japanese setting needs 先輩 / さん /
ちゃん with seniority by school year, and a Chinese one has almost no formal peer register to
carry at all. Keeping `unnie` / `xi` while changing the country would put Korean grammar in a
Tokyo scene — the same error class as the zh `呀` bug (CLAUDE.md, *"Korean address forms are
transliterated, never localized"*), where a transliteration was valid in one target language and
collided with existing grammar in another.

So a background country is **not** a second axis alongside the world; a country ships *as* a
world. `kpop_idol` carries today's table **verbatim** — goldens unchanged, this stays a pure
extraction — and a future `jpop_idol` ships its own without reopening `buildSystemPrompt`. Only
the tokens move: the *logic* (direction fixed by birth year, register blended from stage and
Private Personality) stays in code, because it is behaviour rather than content. Cheap while the
file is already open, expensive once three world JSONs exist.

Estimated static-prompt delta, Red Velvet, 1 main + 2 subs:

| Change | Δ tokens |
| --- | --- |
| Explicit NPCs (2 chosen instead of 2 leftover) | 0 |
| Explicit NPCs, 9-member group (1 chosen instead of 6 leftover) | **−600** |
| `Habit:` line per member | +12 × cast |
| Canonical places (~10) | +80 |
| Opening scenario | +60 |
| Relations (v1.4.2, ~4 entries) | +50 |
| Platform trim in non-idol worlds | −100 |

Net: neutral for a small classic cast, meaningfully **smaller** for large groups and non-idol
worlds. The ~5,500-token figure in CLAUDE.md should be re-measured, not assumed, after v1.4.1.

### 6.1 The one hard invariant

> ⚠️ **Discovered places must never enter the static system prompt.** A list that grows mid-game
> invalidates the entire cached prefix the round it changes — the single most expensive mistake
> available in this codebase. Canonical places are static and fixed at game start; places the
> model invents are recorded **client-side only** and exist purely as UI. The model needs no list
> to understand *"I go back to the rooftop"*.

Smoke Layer J asserts the static prompt for a given roster+world is byte-identical across rounds
in which places were discovered.

---

## 7. The place map

### 7.1 Interaction model

The picker rides the **existing choice channel**. Options are already
`["A. …","B. …","C. …","D. Custom"]` plus a free-text row; a 📍 button beside that row opens the
place list and submits *"I head to the practice room"* as the round's choice.

- No new schema field, no new tail entry, no second input per round.
- **Moving costs a round, and should** — a scene is a round, and the phase rules and achievements
  are all driven by the round counter. (This is the opposite of the player-KKT decision in §8,
  for the opposite reason: messaging is asynchronous, going somewhere is not.)

### 7.2 Canon, preference, discovery

`world.places` goes into §8 of the static prompt with the rule: *prefer this list for `scene`;
invent only when the story genuinely needs somewhere new.* When the model does invent one, the
client records it as a **discovered** place — greyed on the map until found, tappable after.
The LLM's generativity becomes map content instead of something to suppress.

Discovered places live in `memory.places` (client state, never serialized into the prompt).

### 7.3 Affinity — v1.4.2

**How the matrix is built: one LLM call at setup, cached in the save.** Not embeddings:

1. Provider coverage breaks the contract — every call in this app goes through one
   OpenAI-compatible `/chat/completions`; Aliyun and OpenAI have embedding endpoints, DeepSeek
   Official effectively does not. Building both paths means the fallback is the one most players
   hit, which is the worst kind of code.
2. The matrix is at most 10 members × 15 places = 150 cells. Cosine similarity is a tool for
   when you cannot enumerate.
3. Similarity is the wrong relation. "Main vocalist" and "recording booth" are not close in
   embedding space; they are close by *reasoning*.

Offline fallback when the call fails: Jaccard overlap of `place.draws` × `member.tags`.

**The matrix does not drift during the game.** A drifting matrix must be stored and sent, which
puts it in the dynamic tail every round — paying miss tokens forever for something the story
layer already handles. `[Affections]` in the tail already tells the model why someone is absent.

**How it is applied.** [probabilityEngine.js:39-43](../src/agent/probabilityEngine.js#L39-L43)
builds a linear score and then clamps (`Math.min(0.7, …)`, floor `Math.max(0.3, …)`) before
normalising into a weighted draw. With four or more members most scores are already pinned at
the clamp, so an additive place term is swallowed. It must be multiplicative, applied after:

```js
// conditional logit — place enters as a log-linear prior on the clamped score
const w = probs.map(p => p.prob * Math.exp(BETA * (affinity[p.id] ?? 0)));
```

`affinity ∈ [0,1]`, `BETA ≈ 1.5` makes a strong match ~4.5× likelier without ever making it
certain. **`BETA = 0` reproduces today's draw exactly** — that is both the compatibility escape
hatch and what keeps the pinned-`Math.random` Layer D guard meaningful.

### 7.4 Going somewhere, and who is there — two halves, and only one is cheap

**Raised by Yuhan 2026-09-28: the place picker should be an alternative to the four options, and
going somewhere should be how you run into someone.** The first half is §7.1 and is already step 5.
The second half is **two different mechanisms wearing one sentence**, and they should not be built
together.

| | Mechanism | Who decides | Cost |
| --- | --- | --- | --- |
| **(a) the rule** | the chosen place reaches the model in the choice string, and §8 says *members whose habit and tags fit this place are likelier to be here, and a member who has been absent is a reason to put her here* | the **model**, inside the round | one sentence of static prompt. No new state, no new call |
| **(b) the engine** | `world.places[].draws` × `member.tags` builds the affinity matrix (§7.3), `pickPrimaryMember` is drawn **before** the call, and the tail carries a *centre this round on X* hint | the **client**, before the round | an LLM call at setup, a matrix in the save, a Jaccard fallback, and the engine rewrite `PROPOSALS.md` §4 has not decided |

**Recommendation: (a) in v1.4.1, and (b) only if (a) demonstrably fails.** Three reasons, in
descending order of how hard they are to argue with:

1. **(b) would build on a lottery whose record is fiction.** `pickPrimaryMember` runs *after* the
   LLM call, and its only consumer is the appearance log it writes for itself to read next time
   (`PROPOSALS.md` §4). A place term added to that draw is as inert as the draw. The engine has to
   reach the prompt first, and **whether it should is an open taste question about whether rotation
   is mechanical** — not something a place feature gets to settle in passing.
2. **(a) is free and (b) is not.** (a) is a sentence in section 8, which is already moving in step 4
   for `places` itself. (b) is a setup-time call, a cached matrix, a save field, an offline
   fallback, and a change to the one function carrying a pinned-`Math.random` guard.
3. **The model is better at this than a table is.** *Who would be in the recording booth at
   midnight* is a reasoning question — which is §7.3's own argument against embeddings, and it
   applies one level further out, against a precomputed table at all.

**What (a) needs, and step 4 must not forget it: the place has to be a FACT in the prompt, not only
a rule.** This is the `[Rounds Absent]` lesson exactly — a rule about who fits a place is inert
unless something says where the player just went, and the canon list does not say that. The fact
arrives in the **choice string** (*"I head to the practice room"*), which is in the tail; the rule
stays in section 8, which is cached. Fact in the tail, rule in the static part, rule pointing at the
fact: the shape `[KKT Channels]` and `[Rounds Absent]` both already use.

**Do not add a `[Place]` line to the tail beside it.** That is the same fact twice, and the second
copy is the one that drifts — the `[NPC Appearances]` failure, which was a label counting
something nothing wrote.

**A discovered place reaches the model only as text in a choice, and that is enough.**
`memory.places` is client state and never serialized (§7.2, and step 5's gate asserts it), so a
place the model invented in round 9 and the player revisits in round 20 is carried by the choice
string plus the ledger entry that invented it. **That is what lets the map grow without the static
prompt moving** — the one invariant §6.1 will not trade.

**Where this meets the rest of the design:** a place is the concrete anchor §19's beats need (a beat
fires *somewhere*, and `world.places` is the list), and §21's epilogue closes on one. Both read
the same field, which is the argument for authoring `places` properly in step 4 rather than
minimally.

---

## 8. Player-side interaction — v1.4.2

Bubble is one-to-many and she may not read it; KKT is one-to-one and she does. That asymmetry is
the design — encode it both as a prompt rule and as a UI affordance (the Bubble composer says so
plainly; the KKT composer does not).

| Channel | Where it lands | Round cost |
| --- | --- | --- |
| Player KKT | **dynamic tail** — `[Player KKT] Irene: "…"` | none; reacted to inside the next round |
| Player IG post | dynamic tail — `[Player Instagram] caption: "…"` | none |
| Player Bubble | dynamic tail, flagged as low-salience | none |

> ⚠️ Player messages go in the **tail, never the ledger**. They are per-round state; putting them
> in the append-only ledger would break the prefix.

New optional output field `playerPostReactions: {memberId: {liked, comment}}`. It must be
optional in the parser — a model that ignores it returns nothing and the round is still valid.

Non-idol worlds declare `platforms.social: ["instagram"]`, so Bubble and Weverse disappear from
both the UI and the JSON schema. **Shipped in v1.4.1 step 6** — see its design section below.
The group-side hook this paragraph used to point at (`socialPlatforms` / `privateChat` in
`groupLoader.js`, parsed since the first version and read by nothing) is **deleted** rather than
wired: platforms belong to the world, because the same five members are idols in one world and
law students in another.

---

## 9. Save migration

### 9.1 The pre-existing bug this also fixes

**Save slots do not record the group.** `SaveOverlay.jsx:13` writes
`{stats, form, messages, currentOptions, socialFeeds, kktMessages, kktUnlocked, memory,
triggeredAchievements}` — no group id — and [App.jsx:507](../src/App.jsx#L507) `loadSave` never
sets `selectedGroup`. Loading a TWICE save while Red Velvet is selected already yields Red
Velvet's `groupConfig` with TWICE member ids in `form`. It does not crash (optional chaining all
the way down); it silently produces a prompt whose `mainMember` is `undefined`.

This predates v1.4.0 and is fixed by the same edit that adds `worldId` and `roster`.

### 9.2 Key stays `rv_sim_saves_v13`

Migration happens **at read time, in place**. Bumping the key to `…_v14` would orphan every
existing save, which is the opposite of the requirement. The name becoming a slight lie is
acceptable — `gpt4omini` set that precedent.

New fields written: `schema: 14`, `worldId`, `roster`, `groupId`.

### 9.3 Migration table

| Save condition | v1.4.0 behaviour |
| --- | --- |
| no `schema` | treat as schema 13 |
| no `worldId` | `"kpop_idol"` |
| no `groupId` | scan for the group containing **the whole chosen cast** — `form.mainMember` *and* every `form.subMembers` entry. Matching on the main member alone is not enough: `x` is a crossover roster sharing seven ids with the groups those members debuted in. A remaining tie → the group the app has selected, if it is a candidate; still tied → first in index order + `console.warn`; no candidate at all → `"red_velvet"` + `console.warn` |
| no `roster` | build from `groupId` + `form.mainMember` + `form.subMembers`; **all remaining group members get `slot:"npc"`**, reproducing today's `getNpcMembers` exactly |
| `form.identity` unknown to the world | keep the raw string, render as a custom identity — never blank it |
| `form.pace` / `starLevel` unknown | same |
| `memory.history === undefined` | existing `isLegacyMemory` path, unchanged |
| roster references a group file that 404s | fail loudly to the cover page with a named error, **not** into the Red Velvet fallback |

That last row matters: `loadGroupIndex`'s catch returning a hardcoded Red Velvet entry is what
made the v1.3.5 path bug invisible for a whole release. A roster that cannot be resolved must
say so.

### 9.4 Test obligation

Smoke **Layer I** — not Layer J, as this section originally said — pins a real v1.3.8 save as
`test/fixtures/save-v138.json` and asserts it migrates, resolves a roster, and builds a prompt
without throwing, and that the resolved member set is *identical* to what `getNpcMembers` produces
today. Layer I is where that equivalence anchor already lives, and a gate reads better next to the
thing it gates. Per the v1.3.7 lesson, every assertion goes through `resolveRoster` /
`loadGroupConfig`, never by reading `public/groups/*.json` directly.

**The fixture is TWICE, deliberately.** Red Velvet is both the app's default selection and the
migrator's last-resort fallback, so a Red Velvet save would pass every check in this section with
the group scan doing nothing whatsoever.

---

## 10. Storage budget

`saveToStorage` currently swallows quota errors: `catch {}`
([utils.js](../src/utils.js)). Once photos exist, a quota-exceeded write would **silently lose a
save**. This must be fixed in v1.4.0 — return a boolean, surface a localized notice.

| Store | Budget |
| --- | --- |
| Saves | ~1.5 MB (existing) |
| Custom members (20 × ~2 KB) | 40 KB |
| Custom worlds (5 × ~6 KB) | 30 KB |
| Rosters (20 × ~1 KB) | 20 KB |
| **Photos (30 × ~15 KB)** | **450 KB** |
| **Wallpapers (8 × ~46 KB)** — step 8, 2:3 | **370 KB** |
| Everything else | < 50 KB |
| Total vs ~5 MB quota | ~2.4 MB (worst case ~3.1 MB, which is the caps and did not move) |

**Both image rows are calculated from the encoder's settings, not measured**, and the wallpaper row
is the weaker of the two: 360×540 at q0.7 is ~2.9× the pixels of a 256×256 at q0.8, so ~46 KB of
stored string — it was ~55 KB while the wallpaper was 360×640, which the second hand test corrected
to 2:3, the ratio the panel actually shows it at and 16% fewer pixels with it. Canvas WebP cannot be
encoded outside a browser, so neither number can be checked by
any offline test — which is why the image sheet prints `N KB used` on screen. **The hand test is
the measurement**; correct this table from it rather than from the arithmetic above.

Worst case is the caps rather than the typical sizes: 30 × 40 KB + 8 × 90 KB = 1.92 MB of images.
Both fit, but quote the right one.

**Photos must be downscaled, not stored as picked.** A phone photo is 3–5 MB and base64 inflates
it ~37%; a single one blows the quota. `src/utils/imageStore.js` draws to a canvas at 256×256,
encodes WebP q0.8 (≈15 KB), rejects anything still over 40 KB, and caps the store at 30 photos.

Photos move to IndexedDB in v1.5.0 alongside the story archive. Not before — localStorage is
synchronous, which keeps rendering trivial, and 450 KB genuinely fits.

---

## 11. Usage panel — v1.4.0

`usage` is **never read anywhere in `src/`** (verified by grep). Every player runs their own key
with no idea what a round costs.

Read `usage.prompt_tokens`, `completion_tokens` and `prompt_tokens_details.cached_tokens` off the
response in `llmTool.js`, accumulate per session, show tokens / estimated cost / cache-hit rate /
p50 latency in the settings overlay.

Three payoffs: it removes real cost anxiety for BYO-key players; it finally settles CLAUDE.md
open question 2 by measuring the cache rate on the *player's own* provider instead of inferring
it from DeepSeek billing; and it makes the project's central engineering claim demonstrable
rather than asserted.

Twelve Aliyun route models report no `cached_tokens` field at all — the panel must render
"not reported" for those, not 0%.

---

## 12. Affection clamp — v1.4.0

`affectionChanges` is returned unbounded and `validateAndFixOutput` only bounds the 0–100
*result*. Across 28 route models that makes progression pace model-dependent: one model can
return +30 in a round and skip three relationship stages. A **±8 per round** clamp makes pacing
consistent regardless of which model the free route happened to serve. Five lines, with a Layer D
regression check.

---

## 13. Story archive + retrieval — v1.5.0

The memory design discards information by design: a full story collapses to a ~100-char summary,
and past 45 summaries the oldest 15 are pruned outright. By round 60 the model has **no** access
to rounds 1–15. Nothing degrades visibly — the prose stays good, it just quietly stops
remembering — which is why this has never been reported as a bug.

- Every full story is archived to **IndexedDB** (~2 KB × 100 rounds = 200 KB).
- Retrieval pulls 1–2 excerpts relevant to the current scene and member, injected into the
  **dynamic tail** — already 100% miss, so the cached prefix is untouched. The architecture's
  constraint is satisfied exactly, not worked around.
- **Lexical (BM25), not vector.** ~100 short English summaries; BM25 runs in well under a
  millisecond, needs no API call, no provider dependency, no embedding drift. Vector search earns
  its complexity at 10⁴+ documents; at 10² it is strictly worse *and* adds a network dependency
  to the component whose whole job is robustness.
- Fires only once history exceeds the prune threshold. Before that everything is still in the
  ledger and retrieval would be pure cost.

Budget: ~300 tail tokens when active, which takes the per-round miss from ~150 to ~450.

`src/rag/` currently only loads group JSON. This is what would make the folder name honest.

### Explicitly not doing

**No backend, no database, no vector store.** The app's best property is that it is a static
bundle on three free mirrors with zero running cost, and a server would also create somewhere for
player API keys to leak. IndexedDB is the database here.

---

## 14. UI sketches (390 × 844)

### 14.1 Cover — two doors

```
┌──────────────────────────────┐
│        Idol Dating Sim       │
│                              │
│  ┌────────────────────────┐  │
│  │ 🎤 Classic             │  │   one tap → group picker,
│  │ Pick a group and play  │  │   today's flow unchanged
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ ✨ Custom cast          │  │   → world picker → roster builder
│  │ Any members, any world │  │
│  └────────────────────────┘  │
│                              │
│  [zh][en][ko]   [☀/🌙]       │
│  ▸ Load save                 │
└──────────────────────────────┘
```

### 14.2 Roster builder

**As shipped in step 6. The sketch below replaces a tap-to-cycle design that was built, hand-tested
on a phone, and reported as confusing** — the roles were symbols (◌ ★ ● ○), so the player could not
tell what they were assigning, and removing someone meant tapping *forward* through every remaining
state to return to none.

```
┌──────────────────────────────┐
│ ← 🎤 Build a cast            │
├──────────────────────────────┤
│ [RV][TWICE][aespa][IVE]… [✨]│  group tabs, ✨ = my members
│ ┌─────────────┬─────────────┐│
│ │ 🐰 Irene    │ 🐻 Seulgi   ││  two columns, so the role
│ │[Main][Sub][N]│[Main][Sub][N]│  names fit as words
│ ├─────────────┼─────────────┤│
│ │ 🐿️ Wendy    │ 🦊 Joy      ││  tapping the ACTIVE role
│ │[Main][Sub][N]│[Main][Sub][N]│  removes her
│ └─────────────┴─────────────┘│
├──────────────────────────────┤
│ Main  Irene ×                │  grouped, named, × removes
│ Sub   Seulgi ×  Sana ×       │
│ NPC   Wendy ×                │
│ [Clear cast]                 │
│ [Save roster]    [Start →]   │
└──────────────────────────────┘
```

Three things the redesign added, each answering a specific complaint:

- **Named buttons, one per role**, two columns so the words fit. The words are what make the
  control legible; the symbols were the whole problem.
- **While the cast is empty, the three roles are explained** a line each — Main is the core romance
  line and there is exactly one, Sub is also romanceable, NPC appears but is not. That is precisely
  when the player does not know what they mean; once someone is picked, the space becomes the cast.
- **The cast summary removes members**, so it never means finding her tab again. Plus a clear-all.
- **Deleting an authored member asks first and names her.** It is not undoable and its button sits
  beside Edit on a small card.

The visual design is **acknowledged as unpolished and deferred by agreement** after the phone test.

### 14.3 Member editor

**Three steps, not one scroll — changed during step 6 at Yuhan's request.** Sixteen fields plus a
photo plus the generate box is unreadable as a single page at 390px: somewhere around field nine you
lose track of what is still required.

```
┌──────────────────────────────┐
│ ← New member               ✕ │
│ [1. Who she is][2. Reads][3.]│  step indicator, tappable
├──────────────────────────────┤
│ ✨ Describe her in one line   │   STEP 1
│ ┌──────────────────────────┐ │
│ │ a reserved cellist who   │ │
│ │ never sleeps before 3am  │ │
│ └──────────────────────────┘ │
│        [ Generate card ]     │   fills steps 2 and 3
│ Name*        [___________]   │
│ Born*        [1999] 1980-2012│   a YEAR, stored as YYYY-01-01
│ Photo  [🎻] [upload]         │
├──────────────────────────────┤
│  [← Back]  [Next →]  [Save]  │   Save is live from ANY step
└──────────────────────────────┘

STEP 2  Private* · Public image · Queer texture · Speech style · Habit
STEP 3  Real name · MBTI · Role · Animal · Hidden conflict   (skippable)
```

- **Save goes live the moment the three required fields are filled, from whatever step.** Being made
  to walk to the end is what makes a wizard worse than the form it replaced, and step 3 is optional
  fields only. The fast path is: type a line, generate, glance, save.
- **Generated values merge *under* what the player typed**, so pressing Generate twice cannot
  destroy their edits.
- **The year field holds its own draft.** Deriving it from `profile.birthday` is the bug in
  Progress: it round-tripped through `YYYY-01-01` and sliced *into* the date. It is `type="text"`
  with `inputMode="numeric"` — iOS gives the same keypad, but a number input refuses any value it
  cannot parse, which is what made a half-typed year undisplayable.
- **The caller mints the member id**, because a photo can be picked on step 1 before anything is
  saved and the photo store is keyed by id.

### 14.4 Map picker (v1.4.1)

```
        story text …
┌──────────────────────────────┐
│ A. Ask her about the song    │
│ B. Stay quiet and listen     │
│ C. Offer to walk her home    │
├──────────────────────────────┤
│ [📍] [ type something…  ] [→]│
└──────────────────────────────┘
        ↓ tapping 📍
┌──────────────────────────────┐
│ Where to?                    │
│ 💃 Practice room             │
│ 🎙️ Recording booth           │
│ 🏠 Dorm                      │
│ 🏢 Company lobby             │
│ ─── discovered ───           │
│ 🌃 Rooftop, 2am              │
└──────────────────────────────┘
```

---

## 15. Work breakdown

### 15.0 Order

The v1.4.0 tasks are listed by area below, but they should not be done in that order. Three
sequencing rules drive everything:

1. **Prove the refactor is behaviour-preserving before starting it.** Pin the current
   `buildSystemPrompt` output to golden files *first*, while the old code is still the only code.
   The extraction in task 1 then has an exact success criterion — byte-identical output for the
   same roster — rather than "looks right".
2. **Ship the independent work separately.** Tasks 9–11 touch nothing structural. Holding them
   behind a long refactor means players wait for value they could have now, and a large
   unreleased delta accumulates on `dev`.
3. **Edit the 27 group JSONs once.** Task 5 is mechanical and large; doing it before the member
   shape is settled means doing it twice.

| Step | Work | Gate before moving on |
| --- | --- | --- |
| **0** | ✅ CI — build + smoke on every push, and the mirror-sync assertion (done) | Done. The mirror guard went into **smoke Layer C, not the workflow** — see `docs/TECH_NOTES.md`: a CI-only check would not have gated `npm run deploy`, whose preflight runs smoke rather than CI. |
| **1** | ✅ Golden prompt snapshots: 3 fixtures (RV classic, 9-member group, single member) pinned into `test/fixtures/` and asserted by smoke Layer J | Done — and it required one src fix first: the prompt was not deterministic, so there was nothing stable to pin. See Progress. |
| **2** | ✅ **Release v1.3.9** — affection clamp (11), usage panel (10), quota-guarded `saveToStorage` (9a), plus `backstorySeed` inherited from step 1 | Built and validated on `dev` (smoke 469 → **535**, 8/8 clean live rounds with 0 static-prompt drifts), then **released 2026-09-24** as tag `v1.3.9`. |
| **3** | World extraction + resolver: tasks 1, 2, 3, 4 + Layer J | **Golden prompts still byte-identical.** This is the whole gate. |
| **4** | Save migration: task 6 | A pinned v1.3.8 save migrates and resolves to the *same* member set `getNpcMembers` returns today |
| **5** | Content: task 5 (`habit` × 27 files) + task 13 (root mirror) | Layer J asserts `habit` reaches the prompt through `loadGroupConfig` |
| **6** | UI: tasks 7, 8, 9b (roster builder, member editor, card generation, photos) | Hand-test at 390px **(done — four passes, each one found bugs nothing offline could)**; live `playthrough.mjs` on a cross-group roster **(done — 10/10 clean, 0 outside-cast names, 0 real agencies)** |
| **7** | **Release v1.4.0** | ✅ **done 2026-09-28** — build + smoke **1204/0** + 105 live rounds, then the normal release flow. Tag `v1.4.0` on deploy commit `7b3ceea`; all three mirrors verified serving the same bytes as the local build |

**Step 1 is the highest-value hour in this plan.** A world/roster extraction that changes the
prompt by accident produces no error and no test failure — it produces slightly different writing
three weeks later, with no way to bisect it. Golden files turn an invisible regression into a
diff. They are also what makes step 3 safe to do in several sittings.

**Step 4 comes before step 6 deliberately.** Migration must be proven against the old save shape
while no new-shape data exists yet. Once the builder can emit rosters, a migration bug can hide
behind hand-built test data.

**Step 2's release is optional but recommended.** All three items are old-save-safe and
independently useful; the usage panel in particular starts collecting the cache-rate evidence
that CLAUDE.md open question 2 has been waiting on, so by the time v1.4.0 lands there is real
data instead of an inherited figure.

### v1.4.0

| # | Task | Files | State |
| --- | --- | --- | --- |
| 1 | `worldLoader.js`, `public/worlds/kpop_idol/*` — extract today's hardcoded blocks verbatim, `TOKENS` included | new + `mainAgent.js` | ✅ |
| 2 | `rosterResolver.js` — `resolveRoster`, `buildClassicRoster` | new | ✅ |
| 3 | `buildSystemPrompt` reads world + roster | `mainAgent.js` | ✅ |
| 4 | `birthday` + `habit` + `tags` in the `parseGroupConfig` whitelist | `groupLoader.js` | ✅ |
| 5 | `habit` in all 9 group JSONs × 3 languages, **plus the prompt line that renders it** | `public/groups/**`, `mainAgent.js` | ✅ — 175 strings across 30 files, not 27 |
| 6 | Save migration + `groupId`/`worldId`/`roster` in the slot | `App.jsx`, `SaveOverlay.jsx` | ✅ |
| 7 | Roster builder + member editor UI | new `platforms/*` | ✅ — redesigned after the phone test, see §14.2 |
| 8 | `cardGenerator.js` | new | ✅ — 9 fields, not 7 |
| 9 | `imageStore.js` + quota-guarded `saveToStorage` | new + `utils.js` | ✅ — both |
| 10 | Usage panel | `llmTool.js`, new `platforms/UsagePanel.jsx` | ✅ (v1.3.9) |
| 11 | Affection clamp | `mainAgent.js` | ✅ (v1.3.9) |
| 12 | Smoke migration / resolver / static-prompt stability checks | `test/smoke.mjs` | ✅ — Layers **I** and **J**, not J alone |
| 13 | Root `groups/` mirror re-synced by hand after (5) | — | ✅ |

> ⚠️ Task 13 is not optional. `deploy.sh` copies only `assets/*.js` and `*.css`; nothing keeps
> the root `groups/` mirror in sync with `public/groups/`. Adding `habit` to the public copies
> and forgetting the root ones means GitHub Pages serves cast data without it, indefinitely.
> The same applies to the new `worlds/` and `rosters/` trees.

### v1.4.1

**Scoped 2026-09-28 on Yuhan's answers, revised the same day for the story-mode switch and the
future entry merge.** Four worlds, not three — `kpop_idol` is brought up to the same shape rather
than left as the special case. **Country becomes a field** on every world, Korea by default,
fictional allowed. **The pace setting leaves Setup entirely** and returns as a four-way *story mode*
switch in Settings, sent in the **dynamic tail**. The slot it vacates on Setup takes the **world
picker**. The unified game entry and `WorldBuilder.jsx` stay future work, but this release is shaped
so that the merge is a deletion rather than a rewrite.

#### Country is a field, and it costs almost nothing — because the mechanism already exists

§6 argued that a background country ships *as* a world, on the grounds that Korean seniority is a
birth-year boundary while a Japanese setting ranks by school year. The decision is the other way, and
it is cheaper than §6 feared for a reason §6 did not notice: **the address protocol already has a
rank override.** `workTitle` makes a `Staff` player `매니저님` and a `财阀` player `회장님` *regardless
of who was born first* — so a professor addressed as `교수님` by her student, or a `팀장님` by her
report, is that existing mechanism with new strings. **No `seniority` field is needed for these four
worlds**, and none is added.

`country` therefore supplies two things and no logic:

- **A name for the setting**, which §4's `setting` paragraph needs anyway.
- **`register`** — which address-form table is spoken. Today there is exactly one value, `korea`.

So `addressForms` moves **out** of the world file into one shared table per language,
`public/worlds/_registers/<lang>.json`, keyed by register. Four worlds all pointing at `korea` must
not become four copies of one table — that is `extractStoryText` and `castTheme.js` again, where
copies drifted and the guard had been written against the one that was still correct. A second
register is one more entry in an existing file, **not** a fourth mirrored tree: `_registers/` stays
inside `worlds/` until a second country actually ships.

**`parseWorld` resolves the register onto `world.addressForms`, so `buildSystemPrompt` is untouched.**
That is what lets step 1's gate be "goldens byte-identical" while the data moves underneath.

**A fictional country inherits a real register**: `{ name: "<player's text>", register: "korea" }`.
Inventing honorifics is not a default. The `呀` bug is what happens when a form is transplanted into
a language that already has a use for the syllable — and that was a real language, with a real
grammar to check the transplant against. A made-up one has nothing to check.

#### The pace setting becomes a story-mode switch, in the tail

**Yuhan's design, and it is better than §19.4's.** v12 shipped `pace` *and* `rhythm: "free"` at once
and §19.4's fix was to keep `pace` at setup and add one boolean to Settings — which freezes the
*class* at game start and makes only on/off live. This makes the class itself live, which is the whole
point of moving it out of the cached prefix.

| Mode | What it drives | Carried over from |
| --- | --- | --- |
| `free` | no external plot events; the relationship is the plot; detail over event | `慢热现实向` |
| `romance` | romantic beats, natural mutual progression | `浪漫情感向` |
| `pressure` | **secrecy changes doubled** — scandal in `kpop_idol`, and the world's own stressful pressure elsewhere | `高压舆论向` |
| `dramatic` | main and sub cast competing for the player's affection | `修罗海王向` |

**The four ids are universal; the four rules are per world.** So the world file carries
`modes: { free: {rule}, romance: {rule}, pressure: {rule}, dramatic: {rule} }` — **keyed, not
positional** — and `t.modes` in i18n carries the four labels once for every world.

**That deletes a whole class of bug rather than fixing it.** The earlier draft of this plan needed
`paces[].name` per language because Setup rendered `t.paces[i]` against a hardcoded `PACES[i]`,
**coupled by position** ([App.jsx:1436-1438](../src/App.jsx#L1436-L1438)) — a world with different
pace ids would have written a kpop id into `form.pace`, `getPaceRule` would have resolved nothing,
and the prompt would have carried a bare Chinese id, which is the dead-code bug step 3 of v1.4.0
fixed returning through a different door. With a universal four-way switch, `PACES`, `t.paces` and
the positional coupling are all **deleted**.

**Four things the move has to get right:**

1. ⚠️ **The tail already has a `[Pacing]` line.** Time Speed writes
   `[Pacing] slow — stay in this moment…` at [mainAgent.js:748](../src/agent/mainAgent.js#L748). Two
   different quantities under one label is worse than the `[Stage Changes]` id-vs-name case, which
   was two labels for one quantity. **Rename both in the same commit** — `[Time Speed]` and
   `[Story Mode]`. It costs nothing: the tail is the always-miss message and no golden pins it.
2. **`free` sends a rule, it does not send nothing.** Omitting the line would strip free-mode games
   of the pace rule that today's `慢热现实向` players have, and a mode that sends nothing is
   indistinguishable from a bug. `free` carries the slow-burn text.
3. ⚠️ **This deletes the only affection-speed dial, and affection already saturates too fast.**
   `慢热现实向` was a *speed*; the four modes are all one axis (what drives the plot). `PROPOSALS.md`
   §1 measured **zero negative affection steps in 100 transitions and every stat saturating by round
   ~22**. Folding slow-burn's text into `free` keeps the texture, but §1's experiment becomes more
   urgent, not less.
4. **Legacy seeding, not migration.** `form.pace` is in every save. On first load of a pre-mode save,
   seed `rv_sim_story_mode` from it if the player has never set one (`慢热`→`free`, `浪漫`→`romance`,
   `高压`→`pressure`, `修罗`→`dramatic`). That is the `rv_sim_qwen_submodel` → paid-model pattern
   already in this repo. `form.pace` then goes dead in the save exactly like `starLevel`, which costs
   nothing and needs no schema bump.

**Cost of the tail move — calculated, not measured.** A rule is ~50 tokens. Moving it from the cached
prefix (~20% of miss price) into the always-miss tail costs roughly 40 full-price-equivalent tokens
against ~7,950 input per round: **+0.5%**, and the static prompt gets ~50 tokens smaller. The same
trade Time Speed already made, and CLAUDE.md already records why placement in the tail is what makes
a mid-run toggle free.

**Future work this is the foundation for:** authored special-event plots per mode (§19), and endings
plus After Story (`番外`). Before building on endings, note `PROPOSALS.md` §6: the five achievements
*accumulate* rather than ending the run, and **two of the five are effectively unreachable** —
`oe_unspoken_waiting` needs secrecy to land on exactly 60, and one condition matches nothing at all.
**Fix the ending precedence before writing After Stories**, or an After Story is as unreachable as
the ending it hangs off.

#### Section 4's cast framing is idol-hardcoded, and the world must own it

**The finding that makes designing toward the entry merge urgent rather than optional.**
`composeRosterLore` emits `<name> is an N-member group under <name> Entertainment`, `These N debuted
together as <name>`, `No other **idol** exists in this story`, and the subset branch prints
`Fandom:`. In a campus world that describes a lecture hall as a K-pop agency. The third branch is
worse: exactly one whole group returns that group's **own** lore verbatim
([rosterResolver.js:224](../src/rag/rosterResolver.js#L224)), so a Red Velvet cast in an office world
inherits Red Velvet's real idol history, SM included.

So section 4's framing comes from the world file:

| Field | `kpop_idol` | the other three |
| --- | --- | --- |
| `castLore` | today's composed template **verbatim**, so the goldens hold | campus "the same cohort"; office "the same team at \<name\>"; chaebol "attached to the \<name\> family" |
| `useGroupLore` | `true` | `false` — always compose, so a real group's idol history cannot leak into a lecture hall |

Without it the three new worlds ship describing every cast as an idol group. It is a data change plus
one branch if done in step 1, and a rewrite of section 4 if done after the prose is authored.

#### `statLabels` is deferred; `statNotes` is taken

None of the four worlds needs relabelled stats. A hidden relationship is a hidden relationship in a
lecture hall, an office or a family compound, and self-identity and mood read correctly in all of
them. §4.1 lists `statLabels`, and the trap is real — the names live in `src/i18n/*.js`
(`t.stats.selfId.label`) with their icons hardcoded in `buildStatsBox`
([App.jsx:261-262](../src/App.jsx#L261-L262)), so a world-supplied label makes the world file a
**second copy of a string i18n owns**, exactly the `identity.name` vs Setup-label case. It therefore
arrives with the first world that genuinely needs it, per §4.3's rule that a field arrives with its
reader.

`statNotes` is the opposite case and is worth having now: *what raises and lowers secrecy in THIS
world* is world-specific prose with no second writer anywhere.

#### `STAR_LEVELS` is dead, and CLAUDE.md overstates its coverage

`STAR_LEVELS = ["资深粉丝", "普通韩娱瓜众", "纯路人", "已脱粉"]` sits at
[App.jsx:58](../src/App.jsx#L58) and **is referenced nowhere.** `form.starLevel` is initialised to
`""`, written by no control, read by no prompt code, and copied into every save. CLAUDE.md's *Known
Inconsistencies* says of `PACES` and `STAR_LEVELS` that "both are now checked against the world" —
**only `PACES` is**; no world file carries `starLevels` and no guard mentions it.

This is the same shape the project already tracks three times — `npcAppearances`, bubble `photoDesc`,
cast photos — a field complete on one side of a boundary and connected to nothing on the other. It is
the **fourth**, and unlike the others it never had a reader at all.

**Recommendation: delete the constant, leave the save field.** Removing `starLevel` from the save
shape is a migration for a value that is always `""`; leaving a dead empty string costs nothing and
`migrateSave` already copies it untouched. Correct the CLAUDE.md sentence in the same commit.

#### Identities per world — proposed, for Yuhan to cut

Seven plus `H` in each, matching `kpop_idol`'s count. **`H` is the custom id in every world**, not a
per-world spelling: `formForRound()` branches on the literal `"H"` and that function had already
drifted across four call sites once (*Known Inconsistencies 2*). New-world ids are ASCII.

**Campus** — a Korean university by default. `workTitle` carries the rank override where there is one.

| id | The player is | Title direction |
| --- | --- | --- |
| `student_of_cast` | a student; the cast are her professors | she uses `교수님` **for** them |
| `prof_of_cast` | faculty; the cast are her students | they use `교수님` **for** her |
| `peer_student` | same year, same cohort | none — pure age register |
| `senior_student` | an upperclassman | they use `선배님` for her |
| `junior_student` | a `후배` | she uses `선배님` for them |
| `ta` | a teaching assistant — authority without rank | mixed, and that is the point |
| `exchange_student` | an international student; outsider register, language friction | none |
| `H` | custom | — |

**Office** — a Korean company by default.

| id | The player is | Title direction |
| --- | --- | --- |
| `peer_colleague` | same level, same team | none |
| `manager_of_cast` | their team lead | they use `팀장님` for her |
| `report_to_cast` | reporting to them | she uses `팀장님` for them |
| `ceo` | the company's head | they use `대표님` for her |
| `new_hire` | the newest hire; everyone is `선배` | she uses `선배님` for them |
| `contractor` | external — a vendor or consultant, in the building but not of it | none |
| `hr` | in HR, which makes a relationship a policy problem | none — the secrecy stat *is* the plot |
| `H` | custom | — |

**Chaebol** — Korean conglomerate families.

| id | The player is | Title direction |
| --- | --- | --- |
| `rival_heiress` | a daughter of a **different** chaebol family, in commercial competition | peer; `회장님` upward only |
| `heiress_fallen` | from a family that lost everything, now in the rival's orbit | none |
| `lawyer` | the family's counsel | they use `변호사님` for her |
| `secretary` | the heiress's executive aide | she uses `회장님` / `실장님` |
| `bodyguard` | security — physical proximity, no social standing | she uses the title; nobody uses hers |
| `journalist` | investigating the family | none — secrecy is the plot |
| `tutor` | tutoring the younger members, living in the house | mixed |
| `H` | custom | — |

> ⚠️ **No same-family option.** A cousin or adopted-sibling route is a standard K-drama shape and is
> deliberately left out rather than quietly included; ask for it explicitly if you want it.

#### Read against each other, those three tables disagree — reviewed 2026-09-28

Requested by Yuhan alongside the org-name field. The method is the one that found nineteen defects
in step 7: read the tables **against each other and against the code that will consume them**, not
one at a time. Four findings, and the first two change what the cast IS, which is why they are
Yuhan's and not mine.

**1. 🔴 The chaebol world does not say what the cast collectively is, and two of its identities
assume opposite answers.** `secretary` is *"the **heiress's** executive aide"* — singular — and
`tutor` is *"tutoring the **younger members**, living in **the house**"*: both require the cast to be
one family under one roof. `rival_heiress` requires the cast to be a family **in commercial
competition with hers**, which also implies one family. So the table's own answer is *one house* —
and that makes the cast **sisters**.

That is not a small implication. Every sub member carries her own affection score, so a harem-capable
run in a one-house chaebol world is a romance with several sisters of the same family — a materially
different premise from the other three worlds, arrived at by inference from two table cells rather
than decided. It also collides with the no-same-family warning directly above: that warning is about
the **player's** kinship, and nobody wrote the cast's.

| Option | What the cast is | Cost |
| --- | --- | --- |
| (a) one house | sisters and cousins of a single family | sub-member routes are sisters; the warning above needs rewriting to say the ban is on the *player's* kinship only |
| **(b) one circle** — **recommended** | daughters of **several** houses who move in one social world | `secretary` and `tutor` need rewording (aide *to the main member's* house; tutor *to her* family) |
| (c) one household's staff | the cast are the people around one heiress | the romanceable cast stops being chaebol daughters, which is the premise |

**(b) is recommended because it is the only one that changes nothing structural.** The kpop world's
cast share a world, not a bloodline; secrecy stays the plot; `rival_heiress` keeps its edge (she
is one of the circle, from a house that competes); and the harem question stays exactly where it is
in every other world. **Note the dependency:** the ex-girlfriend `reason` candidates tabled below
for chaebol — *the merger collapsed*, *an arranged engagement* — assume the two families do business
together, which is true under (a) and (b) and false under (c).

**2. 🔴 In campus, the player's identity re-casts the CAST, which happens in no other world.** In
`kpop_idol` the cast are idols whoever the player is; her identity moves only her own position.
Campus breaks that in both directions at once: `student_of_cast` makes the five of them
**professors**, while `peer_student`, `junior_student` and `senior_student` make them
**students**. Section 4 describes the cast and section 6 the player, and the two are supposed to be
independent — here `castLore` cannot state one thing, because what the cast are depends on a
field in section 6.

There is also an arithmetic problem with the faculty reading. The library cast's birth years put them
at **24 to 32** in `GAME_YEAR`, and five professors at that age is not a plausible faculty — it is
the one reading `student_of_cast` requires, and the prompt renders every member's age from her
birth year, so the model is handed the contradiction explicitly.

**Recommendation: the campus cast are STUDENTS, and the cut is `student_of_cast`, not
`peer_student`.** That revises the cut recommended below. `prof_of_cast` and `ta` both
keep the cast as students and both work; the age axis keeps all three of its directions. If Yuhan
prefers the student×professor fantasy instead, campus is a **faculty** cast and half the table flips
— either is fine, but it has to be one of them, stated in `castLore`, before step 7 authors prose.

**3. 🟡 The office cut should be `ceo`, not `contractor`.** Office carries three
authority-over-the-cast identities (`manager_of_cast`, `ceo`, `hr`) where campus carries
two and `kpop_idol` two, and `ceo` is the one that is already covered twice over: it is
`kpop_idol`'s `财阀` with a different building, and *the whole chaebol world* is that premise
authored properly. `contractor`'s outsider register is the thing office otherwise has none of —
campus has `exchange_student` and chaebol has `bodyguard`, and "in the building but not of
it" is what carries them. The recommendation below is reversed.

**4. 🟡 `useGroupLore: false` is not enough for a non-idol world, and the leftover is in section
4 — not 5, which is where this review first put it.** A member's `role` — *Main Vocal*, *Leader*,
*Maknae* — is an idol-group position, and it reaches the prompt through
[`memberLine`](../src/rag/rosterResolver.js#L88), which composes section **4**. Section 5's profile
block renders `Animal` / `Public` / `Private` / `Queer Texture` / `Speech Style` /
`Habit` / `Hidden Conflict` and **never reads `m.role` at all** — checked in
[`mainAgent.js`](../src/agent/mainAgent.js#L229). Getting that wrong would have put the fix in the
wrong function, which is the reason to name the line rather than the section.

That narrows the blast radius and does not remove the defect: a campus prompt would describe a student
as a main vocal and an office prompt an analyst as a maknae, and this is exactly the shape of the
`[BLACKPINK Background]` leak — a richer, more specific statement two sections away from the rule
it contradicts. `mbti` and `animal_plastic` are world-neutral and stay.

**Fixed in step 4 as `castLore.useRole`, on Yuhan's call of 2026-09-28** (*"add a filter of the idol
role for each cast to keep it only in the library but never reaching LLM context"*). The world says
whether a cast position exists; a world that says no renders no position and no empty separator — the
trailing-space class, which the goldens **cannot** catch here because all 175 library members declare a
`role`. `kpop_idol` says `true`, so its output does not move.

**`role` is not deleted from the library, and that is the point of the word *filter*.** It is on
`parseGroupConfig`'s whitelist, it is in all 30 group files, and the cast picker and member editor are
free to show it — what changes is that a **world** decides whether it reaches the model. The alternative,
stripping it at the loader, would take an idol position out of the idol world too.

**Not findings, checked and cleared:** `hr` and `journalist` both reading *"secrecy is the
plot"* is fine — they are in different worlds and `secrecy` ships in all of them (decision 9).
`rival_heiress` overlapping the ex-girlfriend is fine: one is a standing position and the other a
shared past, which is the distinction the ex route is built on. And the world-name-against-identity-name
collision this section used to warn about is **now asserted** — `chaebol` the world against
`财阀会长` the identity, guarded per language in v1.4.1 step 3.

#### The ex-girlfriend identity ships in every world — decided 2026-09-28

**Yuhan's call, and it costs no code.** `主线成员前女友` is the only identity in `kpop_idol` that is a
shared *history* rather than a structural position, and every one of these premises has a version of
it. It is also the identity the ko golden pins (`red_velvet-solo-ko.txt`), which is why the
constraints below are worth stating before anyone authors the prose.

**The id stays `主线成员前女友` in all four worlds**, against the ASCII rule above, which gains this one
stated exception. Two reasons, and the first is a bug the alternative would cause:

- **Step 3 clears `identity` when the world changes if the new world does not declare it.** A campus
  world spelling the same route `ex_of_main` would drop the player's identity when she switched
  worlds *even though the new world has that exact route* — a silent reset with a correct-looking
  cause. One id across four worlds means switching keeps the route.
- An identity id is **stored in every save on every device**, so `主线成员前女友` can never be renamed
  anyway. A second spelling beside it is two ids for one thing, not a migration away from one.

Giving each new world `ex_of_main` and mapping the old id in `migrateSave` is the alternative.
**Not recommended:** a save migration for cosmetics, and it re-opens the byte-identical-prompt
invariant smoke asserts.

**`reason` and `keepsake` are the variant contract, and a third key is a silent defect.**
[`renderIdentityBackground`](../src/rag/worldLoader.js#L281) substitutes exactly those two, from two
separate bit ranges of `backstorySeed` (`seed % n` and `(seed >>> 16) % n` — separate so the
keepsake is not locked to the reason). A world writing `{transfer}` renders the literal `{transfer}`
into the prompt with no error, which is the trailing-space class of defect. The two keys generalise
cleanly, which is what makes this a contract rather than a limitation: **every ex-girlfriend premise
has a reason it ended and a thing she kept.**

| World | The reunion mechanism its background has to state | `reason` candidates |
| --- | --- | --- |
| `kpop_idol` | a work transfer puts them in the same building (**shipped**) | different career plans / family pressure / too young / too much time apart |
| `campus` | she is back on the same campus — a transfer, a returning student, a new posting | plans after graduation / her family / you were both young / she transferred away |
| `office` | a reorg or a hire puts them on the same team | she took the posting abroad / the promotion / you were both too tired / her engagement |
| `chaebol` | the two families' business puts them in the same room | the merger collapsed / an arranged engagement / the scandal / your family's fall |

**If a world ever needs a third variant key, generalising the loop must reproduce those two ranges
exactly** — `reason` off the low bits, `keepsake` off bit 16 — or the ko golden moves *and*
every ex-girlfriend save in flight re-rolls its backstory. Same frozen-setup-token rule as
`form.pace` in step 2, one field over.

**So each new world's list is six structural plus the ex plus `H`**, matching `kpop_idol`'s
seven-plus-`H` exactly, and one entry comes out of each table above. Recommended cuts, Yuhan's to
overrule:

| World | Cut | Why that one |
| --- | --- | --- |
| Campus | ~~`peer_student`~~ → **`student_of_cast`** | Originally `peer_student`, on the grounds that "pure age register" is the thinnest premise and `senior_student`/`junior_student` cover the axis with direction. **Superseded by the review above:** `student_of_cast` is the one that re-casts the cast as faculty, which no other world's identity does and which their birth years contradict |
| Office | ~~`contractor`~~ → **`ceo`** | Originally `contractor`. **Superseded by the review above:** `ceo` is `财阀` in a different building and the chaebol world is that premise authored in full, while `contractor` is the only outsider register office has |
| Chaebol | `tutor` | "living in the house" duplicates `secretary`'s proximity, while `bodyguard` is the more distinct register — she uses the title, nobody uses hers |

**`chaebol` as a world still collides with `财阀` as a kpop identity** — the identity means *the
player is a chairman in the idol world*, the world means *the conglomerate is the setting*. Two
things, one name, one picker: the `[Stage Changes]` id-vs-name problem one layer up. The world id can
stay `chaebol` since it is ASCII and the identity id is CJK, but the **display names must differ** in
all three languages, and smoke should assert that no world's display name equals an identity's.

#### Steps

| Step | Work | Gate before moving on |
| --- | --- | --- |
| **1** | ✅ Schema + registers + index, `kpop_idol` only: `_registers/<lang>.json` carrying today's `addressForms` **verbatim**, resolved back onto `world.addressForms` by `parseWorld`; `world.country`; `setting`, `tone`, `statNotes`, `platforms`, `places`, `scenario`, `roleLabel`, `castLore`, `useGroupLore`; `modes` with the four keyed rules carried over from today's four pace rules; `public/worlds/index.json`. `parseWorld` validates and **throws** per field. `paces` stays untouched. Root `worlds/` mirror re-synced. **Nothing renders the new fields yet** | ✅ **Done.** Goldens byte-identical and untouched on disk, mirrors in sync, smoke **1204 → 1232**, 14 mutations RED |
| **2** | ✅ Story mode: four-way switch in Settings shaped like Time Speed, `rv_sim_story_mode`, the rule out of section 6 and into the tail via `buildTailRules`, Time Speed's line renamed `[Time Speed]`, `PACES` / `t.paces` / `world.paces` deleted, legacy seeding through `resolveStoryMode` | ✅ **Done.** Goldens moved **once** — 3 files, 3 deletions, 0 insertions, all the `[Pace: …]` line — diff read. Layer J asserts the paired invariant. Smoke **1232 → 1262**, **24 mutations RED** across two rounds |
| **3** | ✅ Setup page: pace picker out, **world picker in** at the same slot, reading `loadWorldIndex` so step 7 adds worlds as **data**; order becomes name / birth year / world / identity; the identity grid is the **world's own** `identities` plus `H`; a world change clears `identity`/`customIdentity` **only when the new world does not declare the id**; `rv_sim_world` persists the pick; `loadSave` restores the save's `worldId` | ✅ **Done.** Goldens byte-identical and untouched. `IDENTITIES` and the seven `t.identities` rows **deleted** — see *What step 3 deleted*. Asserted on what Setup **forwards**, not on its source |
| **4** | ✅ Section **11** (not 8 — see §6) + world-owned section 4: canon places with *prefer this list; invent only when the story genuinely needs somewhere new*, **plus §7.4(a)'s one sentence on who is likely to be at a place**, `scenario` in the cached prefix, `statNotes` into section 10, `castLore.composed`/`subset` rendered by `renderCastLore` in place of four string literals, `useGroupLore` honoured, `resolveRoster` taking a required `world`, `loadSave` fetching the **save's own** world, and `castLore.useRole` filtering the idol `role` out of a non-idol world's prompt | ✅ **Done.** Section 4 and section 5 did **not** move: the only golden diff is section 10's three notes, all of section 11, and the `scene` rule's pointer at it. `update-golden.mjs` run once and the diff read. Smoke **1304 → 1356**, **36 mutations RED**. The token delta is **still unmeasured** — see below |
| **5** | ✅ Discovered places + map picker: `memory.places` client-side (`recordPlace` / `placeKey` / `PLACES_MAX`), `discoveredPlaceIn` reading the model's own `scene` line, 📍 beside the custom-input row opening `MapOverlay.jsx` (§14.4), selection submitting the world-language `t.map.go` template as the round's choice (§7.1 — moving costs a round, by design). **§7.4's engine is NOT here:** the affinity matrix stays in v1.4.2, and step 4's sentence is what makes a place affect who shows up | ✅ **Done.** The goldens did not move and `update-golden.mjs` was **not run at all** — nothing in step 5 is prompt-facing, which is §6.1's point. A sentinel place is asserted to reach **none** of the three messages; the row's own mutation was not expressible, so the guard sits on every route by which the value could leak (see above). Smoke **1356 → 1383**, **23 mutations RED, 0 GREEN** |
| **6** | ✅ Platform-aware schema and overlays: `world.platforms` names ids and `src/config/platformConfig.js` says what each one is; `filterSocialByPlatforms` drops what the world did not declare; the group's `socialPlatforms`/`privateChat` are **deleted** from the loader, the template and all 60 group files | ✅ **Done.** The goldens did not move and `update-golden.mjs` was **not run at all** — every world declares all three social platforms today, so the trimming is provably a no-op until step 7. The row's stated gate (`parseLLMOutput` / `validateAndFixOutput` tolerate an absent or a stray platform) is a property both already had, so the guard sits on the filter and **counts its two readers** instead. Trimming is exercised against a synthetic instagram-only world. Smoke **1383 → 1423**, **34 mutations RED, 0 GREEN, 0 NOT APPLIED** |
| **7** | ✅ Content: campus, office, chaebol — each with the ex-girlfriend identity and six structural ones. **zh authored, en/ko translated**. **§21.3's negative obligation applies here:** no world's `scenario` or `phases` may promise an outcome the ending table cannot produce | ✅ **Done, and it was not data-only.** Reading the first rendered campus prompt found **seven statements in `buildSystemPrompt` that are true of an idol world and were asserted in every world** — the ROLE CONTRACT gave a campus cast *comebacks and a company* two sections after section 4 called them students. Four became `world.castLife`, three became world-neutral wording, and `kpop_idol` is byte-identical on every line the new fields feed. The **address direction was one hardcoded identity id**, so all four to_cast identities would have rendered backwards — now `workTitle.direction` + `because`. The ko fixture caught `"선배님" (선배님)`, a gloss translating a word into itself. The goldens moved **once**, by six lines each, diff read. Smoke **1425 → 1502**, **30 mutations RED, 0 GREEN, 0 NOT APPLIED**; three checks were deleted before the run for duplicating `parseWorld` or pinning a count |
| **8** | **Release** | 🟡 **Prepared and pushed to `origin/dev`, NOT released.** `npm run bump 1.4.1` (15/15 strings), the `RELEASE_NOTES` entry, README's *What's New in v1.4.1*; build clean at **418.29 kB / gzip 146.86**, smoke **1502 → 1513/0**, CI green. **The live gate was not reachable:** `playthrough.mjs` pinned `kpop_idol` in two places, so no world v1.4.1 adds could be played at all — the **fourth** instance of the pinned-field shape, and the one CLAUDE.md predicted. `--world` is added and mutation-verified (**9 RED**), and it refuses a `--world`/`--identity` pair the world does not declare before spending a round. **The live gate is now MET:** 24 rounds on `deepseek-flash` across campus/ko, chaebol/zh and office/en — **23 clean, 0 static-prompt drifts, 0 ledger prefix breaks across 6 collapses**, cache 88.2–90.4%. The one flag is a **pre-existing** total parse failure on an un-truncated response, which `MIN_STORY_CHARS` structurally cannot catch — `docs/PROPOSALS.md` §7, fix stated and deliberately not made. **Two gates remain:** the phone pass at 390px (nothing in v1.4.1 has been seen on a device), and the release itself (`git checkout main`, the `--no-ff` merge, `npm run deploy`, the tag) which is a red line. See CLAUDE.md's *Pick up here* | **The phone pass is DONE (2026-09-29) and found EIGHT things** - no big bugs, and one real one: the run boundary had two writers, so a new game inherited the abandoned run's pending social and notification dots and then wrote them into the next save slot, which is why the symptom looked like it survived a save/load cycle. Also fixed: the cast-images control (a 34px pill beside the button that WIPES the cast, now a full-width card carrying n/total), Setup overflowing 844px so Start sat below the fold, `X Group` under a noun meaning company/family in two worlds, the map button's colours, no editor anywhere for a custom member's emoji (a field with a whitelist entry, a default and no writer - the dead-field shape with the halves swapped), the PDF printing `Round 9` where the screen prints the stats box, and eighteen identity backgrounds describing a relationship already under way while every member starts at Stranger - all four worlds now open round 1 on a first meeting, the ex-girlfriend deliberately excluded in all four. Build **420.50 kB / gzip 147.66**, smoke **1513 -> 1544/0**, **31 mutations, 31 RED / 0 GREEN / 0 WRONG-CHECK**, four goldens moved one line each and the diff was read. **Still not released, and no live round has been played against any of it.** **A SECOND phone pass, 2026-09-29, found the bug the first one was hiding.** With New Game no longer inheriting the abandoned run's socials, the next thing underneath was visible: a save recorded `roster.worldId`, and the cast builder stamps a roster one screen BEFORE the world is picked - so every run from the custom-cast door saved the world selected on the cover, and loading it restored the wrong world's canon places, all four platform buttons and an idol system prompt in a chaebol game. Four symptoms, one stale copy. A roster now carries no world at all (it had no other reader - `resolveRoster` takes one as its own argument) and the save records the loaded `world` every prompt that round was built from. **Slots written before this from the custom door are unrecoverable.** Also: the cast-images card counts and offers main + subs only (an NPC's photo has no reader on any surface) and is named for what it does; the PDF round-header band is lighter than the card with the box centred as a block, fixing a light-theme band that printed #3a2510 on #3a2210. Build **420.98 kB / gzip 147.98**, smoke **1544 -> 1551**, **16 mutations, 16 RED / 0 GREEN / 0 WRONG-CHECK**, goldens byte-identical. Live: chaebol / rival_heiress / zh **4/4 clean, 90.3% cache, 0 drifts, 0 prefix breaks**, and round 1 read as a first meeting in real prose for the first time. **Still not released.**

#### Step 7's design, written before any content — ten decisions, and two dead fields found on the way in

**Step 7 is data only.** Every reader it needs shipped in steps 1-6: the picker reads
`loadWorldIndex`, the identity grid reads `world.identities`, section 4 reads `castLore`, sections
10 and 11 read `statNotes` and `places`, the prompt's platform list reads `world.platforms`. So the
work is authoring three world documents in three languages, plus the guards that keep nine files
from drifting apart. **No `src/` change is planned**, and one arriving is a sign the shape was wrong.

**1. The three worlds, and what each one has that the others do not.** `campus` is an age register
with no contract behind it -- nobody can be fired, so the stakes are social. `office` is the one
where the relationship is a *policy* problem, and secrecy has an owner (HR) rather than an audience.
`chaebol` is the one where the families are parties to it: exposure costs a merger, not a job.
`kpop_idol` keeps what it has -- a contract *and* an audience -- which is why it stays the default.

**2. Platforms: Instagram and KakaoTalk only, in all three. Yuhan's decision B, 2026-09-29.** Bubble
is a member-to-fan subscription product and Weverse a fan community; both are idol infrastructure
and neither has a meaning in a lecture hall. **This is the first time step 6's trimming renders for
real** -- until now it was exercised only against a synthetic world in smoke, because every world on
disk declared all three social platforms. Two consequences to check rather than assume: the top bar
drops to three buttons, and section 2's schema, section 7's rules, the RULES format block and
section 1's slash list all shorten together or one of them is the copy step 6 missed.

**3. The three cast findings of 2026-09-28 are applied, not re-opened.** The campus cast are
**students** and the cut is `student_of_cast`, not `peer_student`; the office cut is **`ceo`**, not
`contractor`; the chaebol cast are **one circle, several houses** (option b), so `secretary` is aide
to *the main member's* house rather than to a singular unnamed heiress. `tutor` is cut anyway, which
retires the other half of that contradiction without rewording it.

**4. Six structural identities plus the ex, per world -- matching `kpop_idol`'s seven exactly.**
`H` is the app's, not the world's, and appears in no world file.

| World | Authored ids |
| --- | --- |
| `campus` | `prof_of_cast`, `peer_student`, `senior_student`, `junior_student`, `ta`, `exchange_student`, `主线成员前女友` |
| `office` | `peer_colleague`, `manager_of_cast`, `report_to_cast`, `new_hire`, `contractor`, `hr`, `主线成员前女友` |
| `chaebol` | `rival_heiress`, `heiress_fallen`, `lawyer`, `secretary`, `bodyguard`, `journalist`, `主线成员前女友` |

**5. The ex keeps one id across all four worlds and gets four reasons and four keepsakes per world.**
`renderIdentityBackground` substitutes exactly `{reason}` and `{keepsake}`, off two separate bit
ranges of `backstorySeed`; a world writing a third key renders the literal `{key}` into the prompt
with no error. The keepsakes are world-specific for the same reason the reasons are -- *the CD you
both listened to* is an idol-era object, and a chaebol ex keeps something her family would notice.

**6. Org naming, which is the one place the composed template can read as nonsense.**
`orgNameFor(castName, orgSuffix)` builds the organisation from the single name the player types, so
each world has to make one name do two jobs the way `X` / `X Entertainment` already does.

| World | `orgSuffix` | `orgNoun` (Setup's label) | What section 4 then says |
| --- | --- | --- | --- |
| `campus` | `University` | school | a circle of N students at *X University* |
| `office` | `Group` | company | one team inside *X Group* |
| `chaebol` | `Group` | house | N heirs of different houses, of which *X Group* is the largest |

`orgSuffix` is prompt-facing English and identical across the three languages; `orgNoun` and
`orgHint` are what the **player** reads on Setup and are authored per language. That split is
already asserted and now has to hold for four worlds instead of one.

**7. `useGroupLore: false` and `castLore.useRole: false` in all three**, which is what stops a real
group's idol history and a member's `Main Vocal` reaching a lecture hall. Note the consequence the
step-4 note already records: with `useGroupLore: false` a **whole single group** takes the `subset`
template, so each new world authors one -- and none of them may carry a `Fandom:` line, because a
fanbase is the thing these worlds do not have.

**8. The language-invariant guard stops being about `kpop_idol` and starts being derived.** Today
smoke compares the English rule half of the three `kpop_idol` files and asserts the localized half
differs. That check is exactly what nine new files need and it names one world. **It loops over
every id in `worlds/index.json` instead** -- the `["groups", "worlds"]` rule from Layer C and the
`SERVED_TREES` scan from the harness revival: the thing that keeps going wrong is a list a human has
to remember to extend. The same applies to the place, phase, org-noun and name-collision checks
beside it, and to the world-name-against-identity-name assertion, which is now four worlds' names
against four worlds' identity lists rather than one against one.

**9. Fixtures: `campus-ko`, `office-en`, `chaebol-zh`**, per the rotation already proposed, and the
six unpinned pairs are named in `test/README.md` rather than left looking like coverage. **The gate
is two-sided:** the three existing fixtures must not move by one byte -- nothing in step 7 touches
`kpop_idol` or any code that renders it -- and the three new ones are *read by hand in all three
languages per world*, which is the step that found nineteen defects last time and which no fixture
can do.

**10. The negative obligation from section 21.3 is checked at authoring time, not after.** No
world's `scenario` or `phases` may promise an outcome the five achievements cannot produce. In
practice that rules out one sentence each world is tempted to write: a public wedding, a family
blessing, a reinstated contract. `phases` ends at *possible proposal or separation*, which all five
endings can reach, and the three new worlds end there too.

#### …and step 7 is not data-only after all: the address title points one way, in code, for one id

**Found reading `buildSystemPrompt` against the identity tables, before authoring anything.**
Decision 1 above says no `src/` change is planned and that one arriving is a sign the shape was
wrong. One arrived, and the shape was wrong in a way the tables had already written down: every
identity table in section 15 carries a **Title direction** column, and the code has no field for it.

[mainAgent.js:265-268](../src/agent/mainAgent.js#L265-L268) decides which way the work title points
by comparing the identity id to a literal:

```js
form.identity === "练习生"
  ? `${playerName} is an undebuted trainee and every member is a debuted senior, so ${playerName} also uses ${workTitle} for them…`
  : `she addresses ${playerName} as ${workTitle} on the job…`
```

So **to_player is the default and to_cast is one hardcoded Chinese string**. Four of the eighteen
identities step 7 authors point the title at the cast — `junior_student` and `new_hire` use
`선배님` upward, `secretary` uses `회장님`, `bodyguard` uses her employer's title — and every one
of them would have rendered the sentence backwards. **That is the inverted age line again**: a
statement the model follows correctly because the prompt states it wrongly, with nothing failing.

**Two fields, and the split is step 6's: the world says which way, the code says what that means.**

- **`workTitle.direction`** — `"to_cast"`, or absent for today's behaviour. Absent rather than
  `"to_player"` so no existing entry is edited into saying what it already means.
- **`workTitle.because`** — the identity-specific clause the to_cast sentence needs a reason from,
  English like the rest of section 6 and therefore language-invariant. `练习生` declares
  *"is an undebuted trainee and every member is a debuted senior"*, which is the clause already in
  the code, so its rendering does not move by one byte.

`parseWorld` throws when `direction` is anything but `"to_cast"`, when a to_cast entry carries no
`because`, and when a `because` appears without a `direction` — the third of those is the field
that would otherwise sit there with no reader, which is the shape this file is currently tracking
seven instances of.

**And the register around the title is the world's too — `world.addressContext`.** The two sentences
say *"on the job"* and *"at work"*, which is true of an agency and of an office and false of a
lecture hall and a family house. A student does not address her professor *on the job*. It is two
language-invariant strings per world (`toPlayer`, `toCast`), `kpop_idol` declares exactly the two
literals it renders today, and the campus, office and chaebol worlds say *on campus*, *at work* and
*in the house*. That is the seventh-defect class from v1.4.0 step 7 caught before it is authored
rather than after: a statement that is true of the world the sentence was written in and false of
every other one.

**The gate is unchanged and is now load-bearing:** `twice-nine-en.txt` pins the to_player sentence
verbatim, so that line must come out byte-identical, and the two existing smoke guards on the
direction — *"relaxes toward the PLAYER's name"* against *"relaxes toward the MEMBER's name"* —
were written from the requirement rather than from the literal, so they survive the refactor
unchanged. **No golden pins the to_cast branch at all**, which is why the mutation round matters
more here than the fixtures do.

#### The hand read found seven more, and they are all in the prompt rather than in the data

**This is what the gate is for, and it fired on the first world rendered.** Reading `campus` end to
end in zh and en, before authoring `office` or `chaebol`, turned up **seven statements in
`buildSystemPrompt` that are true of an idol world and asserted in every world.** None of them is
in a world file, none throws, and none would ever have failed a test: the three goldens are all
`kpop_idol`, where every one of these sentences is correct.

The worst is the ROLE CONTRACT, which is the section CLAUDE.md already records the model reading as
exhaustive:

> The members' working life — **practice, schedules, comebacks, the dorm, this company** — is
> THEIRS… she has **no practice here to be late for** and no place in their schedule

In a campus world that does not merely read oddly: it **states as fact that the cast have practice,
comebacks and a company**, two sections after section 4 has said they are students. That is the
`[BLACKPINK Background]` shape exactly — a specific claim, in an authoritative section, contradicting
a more general rule elsewhere — and the model is entitled to build on it.

**The split follows step 4's discriminator, not step 6's.** The question is whether the text varies
with the thing the file is about, and *what these five people do all day* is the single most
world-specific fact there is. So four strings become `world.castLife`, English like the rest of
sections 6 and 7, and `kpop_idol` declares **exactly the literals it renders today**:

| Key | `kpop_idol` | `campus` |
| --- | --- | --- |
| `theirs` | practice, schedules, comebacks, the dorm, this company | classes, deadlines, club activities, the dorm |
| `notHers` | no practice here to be late for and no place in their schedule | no class here to be late for and no place on their timetable |
| `recentBeat` | the practice she just left | the class she just walked out of |
| `sceneExample` | Practice room, 10PM | Lecture hall, 10PM |

**The other three needed no field, because the right fix was to stop being specific at all.** Each
was a noun doing no work that a world-neutral one cannot do, and generalising them is a better rule
rather than a compromise:

- *"Never flatten members into a generic **idol** type"* -> *"a generic type"*.
- *"She is NOT a member of **the group**"* -> *"She is NOT one of them"*.
- *"In narration a member is her **stage name** alone"* -> *"her name alone"*. A student has no stage
  name. The same phrase in the to_cast work-title sentence goes with it.
- *"All members must be present in **group scenes**"* -> *"in scenes with the whole cast present"*.
- *"The only **company** that exists in this story"* -> *"the only **organisation**"*, which is true
  of an agency, a university and a family firm alike.

**All three goldens move, deliberately, and the diff is the review artifact.** `update-golden.mjs`
runs once and the diff is read line by line: it must be exactly these five wordings and nothing else,
because the four `castLife` strings reproduce `kpop_idol`'s current text byte for byte and must show
as no change at all.

**Left alone, and stated rather than quietly skipped:** section 4's heading is still *GROUP
BACKGROUND* and its composed preamble still says *"this cast is its own group"* and *"never borrow a
real group's history, discography or agency"*. The heading carries a section number five other
sections point at by name, and the preamble's whole job is to stop the model completing the cast from
the real groups these members come from — which is an idol leak in every world, campus included, so
naming a discography and an agency there is load-bearing rather than stale. `group` as the word for
a cast is the one piece of idol vocabulary this release keeps, and it is in *Known Inconsistencies*.

#### Two fields with no reader, found while authoring against `parseWorld`

Not step 7's to fix, and recorded here rather than left for the next reader to rediscover:

- **`world.tone`** is required by `parseWorld`, returned on the parsed world, and read by **nothing**
  in `src/`. Three more copies of a dead string is what step 7 adds by authoring it.
- **`country.name`** is the same. Only `country.register` is read. Section 15's rationale for the
  field said it supplies *"a name for the setting, which the `setting` paragraph needs anyway"* --
  and `setting` is its own authored field, so the name it justified never acquired a consumer.

That is the **sixth and seventh** instance of the shape this project tracks by name. Both are one
line to delete and one line to render; neither is decided here, and section 18 carries them beside
`STAR_LEVELS` and `STORAGE_KEYS.FORM`.

#### Step 6's design, written before any code — nine decisions, and the row's gate is one the code already passes

**1. The per-platform rules are CODE, keyed by platform id. The world declares only which ids.**
This is the opposite call from step 4's `castLore`, and the difference is what the text is about.
`castLore`'s wording describes *this world's* organisation, so three worlds need three wordings.
Instagram's does not: *"Photo social. Style: aesthetic, short caption + emoji"* is true in a lecture
hall, an office and a practice room, and putting it in world files means four copies of one sentence
with nothing keeping them in step. So `src/config/platformConfig.js` holds the catalog — icon,
prompt name, schema fragment, section 7 rule lines, RULES format lines — and `world.platforms`
holds `{social: [ids], private: id}` and no prose at all.

**2. One catalog, five consumers, counted rather than checked for presence.** The schema's
`socialContent` example, section 7's rule lines, the RULES format lines, section 1's
`bubble/instagram/weverse/KKT` slash list, and the top-bar buttons. Five is exactly the number of
places a platform is currently named by hand, and `extractStoryText` is the standing example of what
two copies do; a helper that exists and is used in four of five is the other.

The feed shape (`{bubble: [], instagram: null, weverse: null}` in `App.jsx`) is deliberately **not**
a consumer. It is internal state, and a key for a platform no button opens is unobservable — the
filter in decision 4 is what stops undeclared content getting that far. Adding a sixth derivation
for a value nobody can see is the kind of tidy change that breaks something.

**3. An unknown platform in a WORLD FILE throws at `parseWorld`; an unknown platform in a MODEL
RESPONSE is dropped silently.** The asymmetry is the point and it is not inconsistency. A world file
is authored here, so a platform the app has no overlay for is a typo that must fail loudly — the
unknown-register precedent from step 1, and a top-bar button that opens nothing is worse than a load
failure. A model response is untrusted text, so a stray `weverse` is data to discard, never an error
to raise: it must not break the round.

**4. The row's stated gate is tolerance, and `parseLLMOutput` / `validateAndFixOutput` already have
it — so the guard goes somewhere else.** Both iterate `Object.entries(socialContent)` and neither
enumerates platforms, so a response missing a declared platform or carrying an undeclared one
already parses today. A check written from the row's words would pass against the unfixed code,
which is step 5's lesson arriving a second time: **when the mutation you would need is not
expressible, the guard is aimed at the wrong place.**

What can actually go wrong is downstream of the parse. `executeRound` derives `roundNotifs` and the
stored `socialFeeds` from `parsed.socialContent`, so an undeclared `weverse` becomes a notification
in the strip — a live entry point opening an overlay for a platform this world does not have, with
no button anywhere else in the app. So:

- **`filterSocialByPlatforms(socialContent, socialIds)`** is exported and pure, unit-tested
  directly, the `addSaveSlot` / `membersNamedIn` pattern.
- It is called **once**, in `executeRound`, and the guard **counts the readers**: both the
  notification derivation and the feed write must read the filtered object. One of two is the
  failure mode, and it is the `extractStoryText` failure mode.
- A **declared platform that is absent** stays absent. Nothing is fabricated to fill it, because a
  fabricated `instagram: {}` renders an empty post the model never wrote.

**5. The private channel stays singular.** KKT is wired through `KKT_THRESHOLD`, `kktUnlocked`,
`filterKktByAffection` and the `[KKT Channels]` tail line; every world ships
`private: "kakaotalk"` and all three new worlds are set in Korea. Reading the id from the world
instead of hardcoding it is in scope. Making the private channel plural is not, and would be a
change to the unlock model rather than to platforms.

**6. Platforms resolve from the SAVE's world, and that is already true rather than newly built.**
Step 3's `loadSave` sets `world` from `migrated.worldId` before the phase flips, so a run started
under `kpop_idol` keeps all four platforms for its whole life even if another world is selected
afterwards. The guard asserts that property; it does not re-implement it.

**7. `social_platforms` / `private_chat` leave the group library entirely.** They are parsed at
`groupLoader.js:108-109`, defaulted, and read by nothing — the fifth instance of the shape this
project tracks (`npcAppearances`, bubble `photoDesc`, cast photos, `STAR_LEVELS`). Removing the two
lines from the loader is the fix; removing the keys from `groupConfigTemplate.json` is what stops
the next person setting them and expecting them to work, which is the only way this trap is
actually laid. All 30 group files and their 30 root mirrors lose both keys in the same commit, and
Layer C's mirror check is what proves the two trees still agree. Confirmed by Yuhan, 2026-09-29.

**8. Non-idol worlds declare Instagram and KakaoTalk only.** Confirmed by Yuhan, 2026-09-29, for
step 7's campus, office and chaebol worlds. A member-to-fan subscription product and a fan
community are idol infrastructure; a law student and an aide to a chaebol house have neither. The
consequence is deliberate: in those worlds a round's social content is one post per member instead
of three, and the top bar carries two icons instead of four.

**9. The notification strip reads its label from the catalog, and the hardcoded map goes.**
`{bubble: "bubble", instagram: "IG", weverse: "Weverse", kakao: "KKT"}` in `App.jsx` is a sixth
hand-maintained platform list.

> **Amended during implementation, and the first draft of this decision was wrong.** It said to
> read `t[<platform>].title`, on the reasoning that the per-platform i18n blocks already carry
> one. They do — and `t.kakao.title` is `카카오톡`, the **overlay header**, which is Hangul in all
> three languages. Reading the strip off it would have retitled the strip everywhere for no
> reason anyone asked for. They are two strings with two jobs that happened to agree for three
> platforms out of four. So the catalog carries a `badge` beside `promptName`, the strings are
> unchanged, and step 6 ships **no visible change at all** — which is the right outcome for a
> step whose gate is that the prompt is byte-identical.

**No save field and no migration.** Platforms are derived from `worldId`, which every save has
carried since step 4's migration.

**The gate, in its strong form.** Every world on disk declares all three social platforms today, so
a correct implementation renders a **byte-identical** prompt: the goldens must not move and
`update-golden.mjs` must not be run at all. The trimming is then exercised against a synthetic
instagram-only world in smoke, which is also the only way to test it before step 7's content exists.

**What the mutation run changed, recorded because it is the useful half.** 4 of the first 33
mutations reported GREEN and **not one of them was a weak guard** — all four were guards that
**crashed** rather than failed:

- Three reached into `filterSocialByPlatforms`'s output (`platKept.irene.instagram.caption`) and
  threw a `TypeError` when a mutation changed its shape. The suite died, the harness saw no
  `failed:` line, and it printed GREEN. They are crash-safe now (`?.`, `|| {}`, a `try`).
  **A guard that throws is indistinguishable from a suite that never ran** — the same output, and
  the same wrong conclusion.
- The fourth could not fail at all. *"Every platform a world declares exists in the catalog"* is
  precisely what `parseWorld` throws on, so the only mutation that would break it breaks the world
  load first. **A check that duplicates a validator is decoration.** Replaced with the property
  that fails independently and is what makes the throw worth having: every catalog entry has an
  overlay `App.jsx` can open — which is exactly where the `kakaotalk` / `kakao` id split would
  go wrong.

#### Step 5's design, written before any code — seven decisions, and one the row got wrong

**1. `memory.places` is written by `updateMemory`, from a value `executeRound` derives.**
Shape `[{name, round}]`. That is the same place and the same function that derives
`memberAppearances` from the prose, and `updateMemory` is already the single writer of
memory. Deriving it in `App.jsx` instead would make two writers of one record, which is how
`[Stage Changes]` and `[NPC Appearances]` came to disagree with the lines beside them.

**2. A discovery is a `scene` that names no canon place.** `parsed.scene` is matched against
`world.places[].name` for the **current language** — both sides are the player's language, so this is
never a cross-language comparison.

- **The time is stripped, and a digit is the tell.** Section 11 asks `scene` for *a place and a
  time*, so almost every scene carries one, and without stripping *Rooftop, 2am* and *Rooftop, 3am*
  are two entries on the map. A trailing comma-segment containing a digit is dropped. *midnight* and
  *深夜* survive on purpose: that is what the model wrote and what the player will recognise, and a
  hand-maintained list of time words per language is exactly the kind of list this repo keeps
  regretting.
- **A name with no letter in it is not a place** — `22:00` is a time where a place belongs. That
  rule needs no word list, which is why it is in and a `midnight` rule is not: a scene that is a
  time spelled out (`10PM`) is recorded as written. Corrected after the first run of the rule,
  which returned `10PM` as a place while this section claimed it would not.
- **Dedupe on a normalised key** (lowercased, whitespace and punctuation stripped), capped at 30. At the
  cap it **refuses** rather than dropping the oldest — `addSaveSlot`'s choice, for
  `addSaveSlot`'s reason: eviction takes away somewhere the player can currently tap. The cap is
  a display bound, not a quota; the list gains at most one entry per round.
- Near-duplicates the normaliser cannot see (*Rooftop* vs *the rooftop stairwell*) are accepted as map
  clutter. They cost nothing but a row, because a discovered place reaches the model only as the text
  of a choice the player tapped.

**3. The map shows canon always, discovered under a divider, and nothing is greyed.** §7.2 says a
discovered place is *greyed until found*; that sentence predates the decision that `memory.places`
holds only what has already been found, so there is nothing left to grey. §14.4's own sketch has no
greyed row either. Recorded as resolved rather than quietly dropped.

**4. 📍 supplements the four options; it does not replace them.** §7.4 calls the picker *an alternative
to the four options*, which is what it is from the player's side — but the options are generated per
round and the map is not, so making them exclusive would hide a round's own options behind a list that
is the same every round. It rides `sendMessage`, the existing channel: no new schema field, no
new tail entry, no second input per round (§7.1).

**5. The choice sentence is authored per language and Korean needs a particle.**
`t.map.go` carries `I head to {place}` / `我去{place}` /
`{place}(으)로 향한다`, and the ko one runs through `resolveKoreanParticles` — the
function that exists because the word in front of a particle is a variable. Composing the sentence at
the call site would put `(으)로` into the player's own choice string, which is the unresolved-particle
defect one layer out from where it was fixed.

**6. The step-5 row's own mutation is not expressible, and the guard is wider than the row asks.**
The row says *mutation-verify by making `buildSystemPrompt` read `memory.places`*. It takes
no `memory` argument at all, so that mutation cannot be written — the same shape as step 4's
round-number guard, and the same resolution: **put the guard where the value could actually leak.**
Build all three messages from a memory carrying a sentinel place name and assert the sentinel reaches
**none** of them. Three mutations must go RED: a `[Discovered Places]` line in
`buildDynamicTail`; the places rendered into `buildHistoryLedger`; and `executeRound`
passing them into `memoryContext`, which is the one route by which they could reach the cached
prefix at all.

**7. No golden may move, and that is checkable by `update-golden.mjs` not being run.** Nothing in
step 5 is prompt-facing — that is the whole point of §6.1. Files: `memoryPool.js`
(`createEmptyMemory` + `updateMemory`), `mainAgent.js` (discovery in
`executeRound`), a new `src/platforms/MapOverlay.jsx`, `App.jsx` (the button and the
overlay), `src/i18n/{zh,en,ko}.js`, `test/smoke.mjs`, `CLAUDE.md`.

**Legacy saves need no migration.** `memory.places` is `undefined` on every save written
before step 5, every reader takes `memory.places || []`, and `isLegacyMemory` keys on
`history` — so no schema bump and no `saveMigrator` row. An old save simply opens with an
empty discovered list, which is true of it.

#### Step 4 is done, and the token estimate it was asked to check was low by about 4x

**Measured, on disk:** the three goldens grew **+22 lines** each, and **+1,828 / +2,420 / +1,965
characters** (zh / en / ko). Smoke **1304 → 1356**; the bundle 408.83 → **410.25 kB** (gzip 143.72 →
**144.21**). **36 mutations RED** — 31 in the first pass, and five re-posed after four turned out to be
ill-formed rather than the guards being weak (see below).

**The token figure is a CALCULATION and is marked as one.** There is no tokenizer in this repo and
none of the four providers is being called offline, so the honest offline measurement is characters.
At the ~4 chars/token rule of thumb for English the en fixture's +2,420 characters is roughly
**+600 tokens** `(?)` — against §6's estimate of **+140**. Do not quote the 600 as measured; the
real number is one live round's `usage.prompt_tokens` before and after, which the usage panel
already shows, and it belongs in §10 beside the storage figure that is also still calculated.

**Where §6's estimate went wrong is instructive, and it is not arithmetic.** It costed *Canonical
places (~10) +80* and *Opening scenario +60* — the **data**. What actually landed is the data plus the
rules around it: three `statNotes` sentences (~600 chars), the who-is-likely-to-be-there rule
(~390), the prefer-this-list rule with its escape hatch (~190), the never-replay-the-opening clause
(~140) and the schema's pointer (~110). **A list costs what the list costs; a list the model is told
how to use costs several times that**, and the rules are the part that makes the list do anything.

#### What step 4 renders, and the four decisions it had to make first

Written before the code, per the docs-before-code rule. Step 4 is the step that makes the world own
the prompt's *setting*: section 4's cast framing, section 10's stat prose, and a new section 11
carrying the canon places and the opening.

**1. The new section is 11.** §6's table said 8; 8, 9 and 10 already exist. See the correction under
§6 — renumbering would move all three goldens and break every cross-reference the prompt makes to a
section by number, for no change in content.

**2. `scenario` is unconditional static text, and it cannot be anything else.** The obvious
reading of *"seeds round 1"* is to send it on round 1 and drop it afterwards. That makes the static
system prompt differ between round 1 and round 2, which invalidates the **entire** ~5,500-token cached
prefix on round 2 — the single most expensive mistake available in this codebase (§6.1), and the exact
defect `backstorySeed` was written to close. So the opening ships in section 11 on every round,
framed as *the story's first scene* rather than as an instruction: round 1 opens here, and from round 2
it has already happened. The model reads which round it is from `[Player Status] Round:` in the tail.

**3. Places: the list and the rule are static, and the FACT of where she went is not.** §7.4(a) already
settled this and step 4 must not quietly re-decide it: section 11 carries the canon list plus *prefer
this list; invent only when the story genuinely needs somewhere new*, plus the one sentence about who
is likely to be there. Where the player actually went arrives in the **choice string** (*"I head to the
rooftop"*), which is in the tail. **No `[Place]` line is added to the tail** — that is the same
fact twice, and the second copy is the one that drifts. Fact in the tail, rule in the cached part, rule
pointing at the fact: the shape `[KKT Channels]` and `[Rounds Absent]` both already use.

**4. `draws` is NOT rendered, and that is a decision rather than an omission.** It is a tag
vocabulary (`["main vocal", "producer"]`), authored in step 1 as the input to §7.3's affinity
matrix, whose reader is v1.4.2. Printing it would hand the model a lookup table for precisely the
judgement §7.4 argues the model does better than a table — *who would be in the recording booth at
midnight* is a reasoning question. Section 11 prints `emoji name — desc` and asks the model to
reason from each member's `Habit` and personality instead. **`draws` is therefore the one
field step 1 declared ahead of its reader**; it is recorded here rather than deleted because §7.3 names
the reader and the date.

#### What step 3 deleted, and where it departed from the row above

**Two deviations from the step 3 row as written, both in the direction of less state.**

**1. A world change clears the identity only when the new world does not declare it.** The row said
clear both fields unconditionally. That would make the ex-girlfriend decision below pointless: the
whole reason `主线成员前女友` keeps **one id across all four worlds** is so switching worlds keeps a
route every world has. Unconditional clearing throws it away and the player has to find it again,
with no way to tell that from a reset. `H` survives every switch too — it is the app's escape
hatch, not a world's identity, so her typed words are not collateral.

The clear is keyed on **the world that actually loaded**, not on the picker's click. A world file is
what declares the list, so a world file is what decides; a handler would additionally have to know
what the new world says before it has been fetched.

**2. `IDENTITIES` in `App.jsx` is deleted, and with it the trap CLAUDE.md's Known
Inconsistency 2 spends twenty lines on.** The picker's options now come from `world.identities`
plus `H`, and `formForRound` forwards `form.identity` unchanged for a non-`H` identity.
That was **byte-identical** to the old expression the day it was written — every entry's `label`
equalled its `id` — which is exactly what made it dangerous: it read as an id-to-label mapping,
and localizing those labels (the obvious next edit, with `t.identities` sitting right there for it)
would have emptied the background and the work title out of every real game, because
`getIdentity(world, "Chaebol")` finds nothing. **A coupling deleted is worth more than a coupling
asserted**, and this is the second one this release has deleted rather than guarded after `PACES`.

**The seven non-`H` rows of `t.identities` go with it**, in all three languages. They were a second
hand-maintained copy of `world.identities[].name`, which smoke could only tie together — and step 7
would have owed 21 more rows across three languages for ids the world files already name per
language. The custom label moves to `t.setup.customIdentityOption`, because `H` is the one entry
no world declares. The tie-them-together check is **replaced**, not deleted: what Setup forwards must
be an id the world declares, which is the requirement the old one was approximating.

**A one-option picker is not a control, and that is accepted deliberately.** `index.json` ships one
world today, so step 3's picker renders a single preselected card. It is a statement of the setting
rather than a choice until step 7, and it is built now so that step 7 is **data only** — the same
order as `habit` reaching `parseGroupConfig`'s whitelist before any file declared one, which is
how `birthday` was lost by doing it the other way round.

**Step 1 is done.** `public/worlds/_registers/{zh,en,ko}.json` carries the Korean table once
instead of once per world; `public/worlds/index.json` is the picker's lazy-load boundary;
`kpop_idol` gained `country`, `setting`, `tone`, `statNotes`, `platforms`, `castLore`,
`useGroupLore`, `modes` and ten `places`; `parseWorld` validates every one and throws.
`paces` is untouched and nothing renders the new fields, which is what let the goldens hold.

**`roleLabel` from §4.1 was deliberately NOT added** — that sketch lists it with no stated reader,
and this repo carries `NPC_APPEARANCE_CHANCE` as the standing example of what declaring ahead of a
reader costs. It arrives with whatever prints it.

#### Step 2 is done, and it went two steps past its own row

**`world.paces` is deleted too, not just `PACES` and `t.paces`.** The row said "`paces` stays
untouched", inherited from step 1's gate. Once `modes` supersedes it whole, a required field with no
reader is what this project already tracks four times — and step 7 would have authored four pace
rules per new world that nothing reads. It is out of `REQUIRED`, out of the returned object, out of
all six world files, and `getPaceRule` is now `getModeRule`, a keyed lookup rather than a find over
an array.

**`form.pace` stays in the save and stays in `backstorySeed`**, which is the one thing that could not
change. Dropping it from the hash would re-roll the breakup reason and keepsake of every
ex-girlfriend save in flight — the exact drift `backstorySeed` exists to prevent. It is a frozen
setup token now, like `age`: new saves hash an empty string there, stable for the life of the save.
The story mode is deliberately **not** hashed, because a live value in the seed would make the static
prompt drift on every toggle.

**Two findings, neither of them in scope:**

- **The epilogue call site was passing no `timeSpeed` at all**, so Time Speed has never applied to an
  epilogue in any release. That is the fourth-call-site drift *Known Inconsistencies 2* already
  records for `formForRound()`, in the same function. All four call sites now pass `timeSpeed,
  storyMode,` identically, and the guard counts the pair rather than either name.
- **`STORAGE_KEYS.FORM` (`rv_sim_form_v11`) is a dead key.** Nothing in `src/` reads or writes it,
  so the first version of the legacy seeding — which read `form.pace` from it — was a legacy path
  that could never have fired. A vacuous seed would have looked exactly like a working one. The
  pace actually lives in **save slots**, which `migrateSaveFields` copies untouched, so that is
  where the seed reads from. CLAUDE.md's storage table claimed the key held "character setup form";
  corrected. Add it to §18's dead-constant decision beside `STAR_LEVELS`.

**The mutation sweep's own lesson, and it is a different one from step 1's.** Three of the first
twenty went GREEN, all three on the pace-to-mode map. Step 1's greens were mutations aimed at
*redundant* enforcements, where the requirement held and a neighbouring check fired. These were
not: **nothing tested the mapping at all.** The structural guard — "App seeds through
`seededStoryMode`" — passed while the rule it names was free to return anything. A guard that the
right function is *called* is not a guard on what it *does*. The rule is now one pure exported
function, `resolveStoryMode(stored, legacyPace)` (two functions would have been two answers to one
question), with ten behavioural guards, and the three went RED. **24/24 across both rounds.**

**Also fixed in the same sweep: my own Layer J check could not fail.** It was
`MODE_IDS.map(() => dBuild(dForm(), "zh"))` — the same builder called four times, so "byte-identical
across a mode change" was a tautology. It now varies `form.storyMode`, which is the field a future
implementation would most plausibly carry the mode in, and the Time Speed half varies
`form.timeSpeed` the same way. *A harness that cannot fail is indistinguishable from a passing one*,
applied to a guard written in this very step.

**Two of the first-round mutations went GREEN and reading why was the useful part.** Dropping
`castLore` from `REQUIRED`, and deleting the unknown-register throw, both left the suite green —
because in each case a *different* check fired and its message happened to contain the string the
assertion matched on. The requirement held both times, so those were not guard failures; they were
mutations that did not test what their labels claimed. Re-run as plausible **fallbacks** rather than
deleted throws — `registers?.[id] || Object.values(registers)[0]`, `country?.register || "korea"` —
both went RED, and one assertion was tightened from `.includes("register")` to
`.includes("country.register")` because the neighbouring message also satisfied the loose form.

**Steps 1–6 are the engine and add no new world content; 7–8 are the worlds.** If this runs long,
step 6 is the safe place to cut and ship — the story-mode switch, the map and the platform trim are
all player-visible on `kpop_idol` alone.

**Step 6 is the one that can break a game in flight.** A run started under `kpop_idol` must keep all
four platforms for its whole life, so platforms resolve from the **save's** `worldId`, never from
whichever world is currently selected. Same rule as the roster, and for the same reason.

#### Golden coverage for three new worlds — an accepted gap, stated

Nine new fixtures (3 worlds × 3 languages) is the complete answer and is more snapshot than this
suite can usefully carry. **Proposal: three new fixtures, one per world, rotating the language** —
`campus-ko`, `office-en`, `chaebol-zh`. That covers every language once and every world once.

**It leaves six (world, language) pairs unpinned**, and that is a real gap rather than a technicality:
step 7's lesson is that seven of nine defects were invisible to zh because zh is where the content is
authored. The mitigation is the hand read in step 7's gate, not the fixtures — a fixture stops a
defect recurring, reading is what finds it. Say so in `test/README.md` rather than leaving the
rotation looking like full coverage.

#### The unified game entry — future work, and this release is shaped for it

Yuhan's flow: **one door.** The roster builder is the entry, the player picks main / subs / NPCs as
she does now, and the following page asks name, birth year and **world**.

**It needs no save migration, and the migration he was worried about already shipped.**
[saveMigrator.js:192](../src/rag/saveMigrator.js#L192) writes
`roster: migrated.roster || buildClassicRoster(…)` for every pre-v1.4.0 save, and §2.3's rule fills
the unpicked members in as NPCs so behaviour is byte-identical. **A v1.3.8 Red Velvet save already
resolves through `resolveRoster` today, not through the classic door** — so deleting that door
removes a UI entry point, not a data path.

**The classic *experience* survives the door too**, because the lore rule keys on roster **shape**,
not on which door produced it: exactly one whole group → that group's own lore verbatim. A player who
picks all five Red Velvet members in the unified flow gets byte-identical output to today's classic
path.

**One affordance keeps that true in practice.** Classic auto-fills the leftovers as NPCs; the unified
flow picks them explicitly, so Irene-main + Seulgi-sub and stop is a *subset*, which takes the
different "only these members of Red Velvet exist" branch. So when every picked member comes from one
group, the NPC section offers a one-tap **"add the other 3 as background"** chip. That is the classic
door's only remaining job, done better.

**What v1.4.1 does now so the merge is a deletion rather than a rewrite:** `castLore` /
`useGroupLore` (step 4), the world picker already living on Setup (step 3), and Setup's control order
already being the merged page's order minus the cast step. The cover is left alone; two doors stay.

**What the merge itself then costs:** delete the classic door, add the background chip, and
⚠️ **re-point one guard rather than orphaning it** — `loadSave` pins `phaseRef.current = "game"`
*before* `setSelectedGroup` because the group effect reads it to decide whether to clear the chosen
cast, and smoke Layer G guards that ordering. Delete the classic door and that effect may go with it,
at which point the guard still passes while testing nothing. **A harness that cannot fail is
indistinguishable from a passing one.**

#### What is not in this release

- **`WorldBuilder.jsx` and `rv_sim_worlds_custom_v14`.** §1 bundled a custom-world builder with the
  authored worlds; they are separable, and three authored worlds each carrying an `H` custom identity
  is the player-facing value. A builder that emits a *valid* world — identities with `workTitle`
  direction, four mode rules, four phase lines, places — is a larger UI than the member editor.
- **The unified game entry**, by Yuhan's call, after the worlds exist. This **answers §18 decision
  2**: the classic path does get worlds — in step 3, because both doors already pass through Setup,
  which is earlier than the merge and retires the "new worlds are Custom-door-only" gap the previous
  draft of this plan had to accept.
- **Authored special-event plots per mode** (§19) and **endings + After Story** (§21). The switch is
  their foundation; `PROPOSALS.md` §6's ending precedence is the prerequisite for both.
  **§21.3 names the one obligation this release carries because of them, and it is negative:** step 7
  authors three worlds' prose and none of it may promise an outcome the ending table cannot produce.
- **The place map's second half** — §7.4. Step 5 ships the picker and the discovered-place map; *which
  member is likely to be there* is a prompt rule in step 4, not a mechanism, and the affinity matrix
  that would make it mechanical stays in v1.4.2 behind `PROPOSALS.md` §4.

### v1.4.2

Unified game entry (groups & cast & world on one screen); `WorldBuilder.jsx` +
`rv_sim_worlds_custom_v14`; player KKT/IG composers; `playerPostReactions` in the schema and
parser; relations in §4; affinity matrix call + `BETA` prior in `probabilityEngine.js` (§7.4); **plot
mode (§19)** — authored story beats, offered as option D, injected into the tail; **endings and the
epilogue (§21)** — one resolver, an epilogue composed from ending + story mode + world.

### v1.5.0

`archive.js` (IndexedDB), `retrieve.js` (BM25), tail injection, photo migration to IndexedDB.

---

## 16. Invariants this plan must not break

1. The static prompt is byte-identical across rounds for a given roster + world. Nothing that
   grows mid-game may enter it.
2. The history ledger stays append-only; player messages and retrieved excerpts go in the tail.
3. Stat keys, achievement keys, identity ids, pace strings and provider ids are **stored values**
   and therefore frozen, whatever their label says.
4. Model settings stay out of save slots.
5. Every assertion about member data goes through `resolveRoster` / `loadGroupConfig`, never by
   reading `public/groups/*.json`.
6. No runtime path derives a URL from the hostname; `import.meta.env.BASE_URL` only.
7. Every bug fixed here gets a smoke check that fails against the unfixed code.

---

## 17. Further out — infrastructure, and what to refuse

Sketches only, no commitment. The bar for anything here is the same as everywhere else in this
repo: **it must improve the player's experience or the product's reliability, and it must not
break an old save.** A technique that is interesting but earns nothing for the player is a
liability — it adds a maintenance surface and a thing to explain.

| Version | Item | Player-visible benefit | Save impact |
| --- | --- | --- | --- |
| v1.4.x | **CI (GitHub Actions)** — `npm run build` + smoke on every push; assert root `groups/` matches `public/groups/` | Catches stale cast data on GitHub Pages, which today has no detector at all | none |
| v1.5.x | **Eval suite** — pinned seeds, stored baselines, regression gate on `playthrough.mjs` graders | Writing-quality regressions caught before release rather than by players | none |
| v1.5.x | **LLM-as-judge**, scoped to flagged rounds | Closes the one defect regex provably cannot catch — see below | none |
| v1.6.0 | **Bandit router** — Thompson sampling over the free route | Fewer wasted 90s timeouts before a round starts | route state only, already migrating |
| any | **Export/import** rosters, worlds and cards as JSON files | Players trade content without an account or a server | none |

**CI is the cheapest real win.** The smoke gate currently exists only inside `deploy.sh`, so a
broken `dev` push is invisible until someone runs it by hand. More importantly it closes a bug
class this file already admits to: nothing keeps the root `groups/` mirror in sync with
`public/groups/`, so Pages can serve stale cast data indefinitely. v1.4.0 adds two more mirrored
trees (`worlds/`, `rosters/`), which makes the exposure worse, not better.

**LLM-as-judge is justified by a specific blind spot, not by fashion.** CLAUDE.md records that
the I/you pronoun swap has no mechanical detector — and it cannot have one, because no regex can
decide whether "you" refers to the right person. That is the case for a judge model. Scope it to
a sample or to already-flagged rounds so cost stays bounded, and keep the deterministic graders
as the primary gate: they are free, reproducible, and have caught every defect so far.

**The bandit emerges from existing state rather than being bolted on.** `ALIYUN_FREE_ROUTE` is a
hand-ordered list of 28 models and the route state in `STORAGE_KEYS.ALIYUN_ROUTE` already tracks
exhausted / unavailable / lastModel per key. Extending it to per-model success, latency and
`bad_response` rate is small. Cold start is the obvious objection, and the answer is in
`docs/TEST_FINDINGS.md`: ~600 measured rounds already exist to seed the priors from — offline
priors, online updates. A player only plays tens of rounds, so an uninformed bandit would be
worse than the current hand-ordering; a seeded one is better from round one.

### Explicitly refused

| Not doing | Why |
| --- | --- |
| **Docker** | No server exists. `.nvmrc` pins Node for CI at zero cost. |
| **A backend (FastAPI or otherwise)** | Costs the app its best property — a static bundle on three free mirrors, no account, no running cost, and nowhere for player API keys to accumulate. The only feature that would justify one is community content sharing, and file export/import gets most of that with none of the hosting, moderation or abuse surface. |
| **Multi-agent round loop** (narrator + per-character agents) | Would sharpen character voices and take generation from ~10s to 30s+. One round must feel like one beat; this fails player-first outright. |
| **Tool-calling for structured output** | GPT-6 Luna supports function calling only at `reasoning_effort: none`, and support varies across the 28 route models. Fragmenting the provider-agnostic layer to replace a 4-level parser that already works is a bad trade. |
| **Azure OpenAI** | ~20 lines (`api-key` header, deployment-name URL shape). Cheap, but a config entry, not a capability. Add on player demand. |
| **OpenTelemetry** | Needs a collector, which needs a backend. The v1.4.0 usage panel already gives the useful half client-side. |
| **Vector store / embeddings** | See §7.3 and §13. Wrong tool at 10² documents, and it adds a network dependency to the components whose job is robustness. |

---

## 18. Open decisions

None blocking v1.4.0. Carried forward:

1. **Who authors `tags` for library members?** Derived from `role` at parse time, or added to the
   nine group JSONs by hand. Derivation is cheaper and degrades cleanly; hand-authoring is
   better. Only matters at v1.4.2.
2. **Does the classic path get worlds?** Playing Red Velvet in the campus world is coherent and
   costs nothing — but it makes the cover's two doors less distinct. Defer to v1.4.1.
3. **Preset rosters beyond `x`.** Worth shipping two or three (e.g. a 4-member cross-group set)
   so the feature is discoverable without work from the player.
4. **`BETA` value** needs one live playthrough sweep to settle; 1.5 is a starting point, not a
   measurement.

**Decisions 1–4 above predate v1.4.1's scoping.** Decision 2 — *does the classic path get worlds?* —
is **answered**: yes, in v1.4.1 step 3, because both cover doors already pass through the Setup page
([App.jsx:1285](../src/App.jsx#L1285)). The world picker takes the slot the pace picker vacates, which
is earlier than the entry merge and needs no second picker on the cover.

Answered 2026-09-28 and recorded under v1.4.1 rather than here: country as a world **field** with
Korea as the default; the pace setting replaced by a four-way **story mode** switch in Settings, sent
in the dynamic tail; all three new worlds built, plus `kpop_idol` brought up to the same shape; the
unified game entry designed for but not built, and needing **no save migration** because
`migrateSave` already writes a roster for every pre-v1.4.0 save.

Still open, and none of it blocks starting step 1:

5. **The identity sets for campus, office and chaebol are proposals, not decisions** — seven plus `H`
   each, tabled under v1.4.1. Cut or add before step 7 authors their backgrounds, because a
   background is a paragraph per language and reworking the list afterwards is three times the edit.
   A same-family chaebol route is deliberately absent.

   **Partly answered 2026-09-28: the ex-girlfriend route ships in every world**, keeping the id
   `主线成员前女友` across all four — see *The ex-girlfriend identity ships in every world* under v1.4.1
   for why one id rather than four, and for the `reason`/`keepsake` contract a new world must
   not step outside. **What is still open is which structural identity comes out of each table** to
   keep every world at seven plus `H`; three recommendations are tabled there.
6. **`STAR_LEVELS` — delete the constant, or give it a world field?** It is dead today: defined at
   [App.jsx:58](../src/App.jsx#L58), referenced nowhere, and `form.starLevel` is `""` in every save.
   Deleting is recommended. Wiring it as *prior relationship to the cast* (fan level in kpop, family
   standing in chaebol) is coherent, but that is a new feature wearing a dead field's name.

   **`STORAGE_KEYS.FORM` is the same decision, found in step 2.** `rv_sim_form_v11` is defined in
   `src/utils.js` and **nothing in `src/` reads or writes it**. CLAUDE.md's storage table claimed it
   held the character setup form; corrected in step 2. Persisting the setup form across reloads is a
   real (small) feature — the player re-picks her cast after a refresh today — so this is either a
   deletion or a five-line feature, and it should not stay a constant pretending to be wiring.
7. **Is `WorldBuilder.jsx` in or out?** Out as scoped. In, it roughly doubles the release's UI work.
8. **`PROPOSALS.md` §6's ending precedence is now a prerequisite, not a cleanup.** Two of the five
   endings are effectively unreachable, and endings plus After Story (`番外`) are the feature the
   story-mode switch is the foundation for. Fix the precedence before writing content that hangs off
   an ending nobody can reach.

   **§21 is why, written 2026-09-28, and it is the decision's consequence rather than a second
   question.** The epilogue's register is keyed on the ending id. Two of the five ids are shadowed
   today, so authoring an epilogue register per ending before the precedence is decided writes prose
   for endings nobody reaches — the shape decision 6 already tracks. **This is the one item on this
   list that blocks another.**
9. **✅ RESOLVED 2026-09-28 — `secrecy` stays, in every world.** Yuhan's call, agreeing with the
   recommendation below: the field keeps its name, its polarity and its thresholds, and a per-world
   display `statLabels` (§4.1) remains the answer to wanting different words on screen. Nothing
   is inverted and no migration is owed. **The three reasons are kept rather than deleted**, because
   the second one is a standing constraint on any future stat change, not an argument that has been
   used up:

   Should `secrecy` become `pressure`, inverted, to read uniformly across worlds? Raised by
   Yuhan during step 2. **Recommendation was: no — give the world a display `statLabels` instead,
   and keep the field, its polarity and its thresholds.** Three reasons:

   - **`pressure` is the one name it cannot have.** The story mode `pressure` shipped in step 2, so a
     stat called Pressure sits in the tail beside `[Story Mode: Pressure]` — two different quantities
     under one name, which is precisely the `[Pacing]` collision step 2 existed to avoid and worse
     than the `[Stage Changes]` id-vs-name case, because the model has to guess which is which.
   - **It is an inversion, not a rename, and it lands on thresholds already known to be broken.**
     `secrecy` is read by three of the five achievement conditions (`> 60`, `< 60`, `< 45`), and
     `PROPOSALS.md` §6 records that two of the five endings are effectively unreachable and one
     condition matches nothing at all. Flipping the polarity of the variable those are written in,
     in the same release, makes a mis-flip invisible. It also breaks the migration invariant smoke
     asserts — a pinned v1.3.8 save must build a **byte-identical** prompt — since `100 - secrecy`
     deliberately changes the number the prompt carries.
   - **It buys nothing a label cannot.** All four v1.4.1 worlds are hidden-relationship premises
     (student/professor, manager/report, rival heiresses), so "how well hidden is this" reads
     correctly in every one. That is exactly why §4.1's `statLabels` was deferred rather than
     dropped, and `statNotes` — shipped in step 1 — already carries the per-world prose for *what
     raises and lowers it*.

   **If the inversion is wanted anyway it is its own step with its own gate**, not folded into
   another: the polarity flip, the three achievement conditions, the `100 - secrecy` migration and
   a rewritten migration invariant are one change whose diff has to be readable on its own.

---

9. **`world.tone` and `country.name` have no reader — delete them or render them.** Found while
   authoring step 7 against `parseWorld`. Both are **required** by the validator, both are returned
   on the parsed world, and neither is read anywhere in `src/`: `tone` by nothing at all, `country`
   only for its `register`. Section 15's rationale for the country field said it supplies *"a name
   for the setting, which the `setting` paragraph needs anyway"* — and `setting` is its own authored
   field, so the name it justified never acquired a consumer.

   They are the **sixth and seventh** instance of the shape this plan and `CLAUDE.md` track by name,
   after `npcAppearances`, bubble `photoDesc`, cast photos, `STAR_LEVELS` and the group library's
   `social_platforms`. Step 7 authored three more copies of each because the validator demands them,
   which is the cost of leaving it undecided.

   **Recommendation: render `tone`, delete `country.name`.** `tone` is the one line that would tell
   the model what kind of story this is — *slow-burn, campus seasons, social exposure* — and section
   11 or section 3 is where it would go; it costs about eight tokens and moves all six goldens.
   `country.name` has no candidate reader at all, and `country` keeps `register`, which is the half
   that does the work. Either way it is one line each, and both are Yuhan's call because rendering
   `tone` changes what every existing save sends.

## 18b. A Kakao that the scene makes impossible

**Reported from hand play, v1.3.9, and deliberately not fixed there.** It long predates v1.4.0
and is not a regression; it is a missing mechanism.

A member texts the player something the scene they are both standing in contradicts:

- She is **in the room**, face to face, and texts *"see you tomorrow, good night"* — and the next
  round is still the same scene, in the same place, so the goodbye never becomes true.
- She is **asleep or drunk**, the player has just walked her back to the dorm, and a message
  arrives from someone who cannot be holding a phone.

The player's own verdict is the one to design against: *this ruins the immersion quite a lot.*
It is worse than a flat line of prose, because the game contradicts a fact the player watched
happen.

**Why it happens.** KKT generation is asked for every round and gated on exactly one thing —
affection, via `[KKT Channels]` in the dynamic tail. There is no notion of whether she is
*able* or *has reason* to send one. The prompt knows the scene as a free-text label
(`Scene:practice room`) and knows nothing at all about who is present in it, or her physical
state, or whether the round ends with the two of them parting.

**Why it is not a prompt tweak.** *"Do not text when you are in the same room"* is a rule the
model cannot reliably apply, because the information it needs is not in the prompt. The scene
label is prose, presence is not modelled, and "asleep" exists only inside the story the model
just wrote. Adding the sentence without adding the state is how a rule becomes noise — and the
step 5 finding applies here too: a rule the data cannot support is not a fix.

**The shape a real fix takes**, roughly in cost order:

1. **Presence** as structured state: does this round end with the member present or parted? The
   model already decides it; it would have to *report* it, as a field beside `scene`, and the
   tail would carry it into the next round.
2. **A send condition per member** derived from presence + physical state, rendered into
   `[KKT Channels]` the way the affection lock already is. The lock proved the pattern works:
   state in the tail, rule in the static prompt, filter as the backstop.
3. **Post-filter** as the backstop — drop a delivered message whose precondition the round
   contradicts, exactly as `filterKktByAffection` drops one the lock forbids.

`byhAnita/yuriagent` has already solved the data half of this: its `locations.js` gives every
place an `exposureBase` **and** a `presence` count, decorrelated on purpose. Presence is the
field this bug wants, and v1.4.1's place canon (§8) is where it would naturally land.

**Recommendation: schedule with v1.4.1's places, not before.** Doing it earlier means inventing
a presence model that the place work would then replace. It needs a live playthrough to confirm
the fix, since the symptom is a contradiction between prose and state that no offline assertion
can see.

---

## 19. Plot mode — v1.4.2

Authored story beats, opt-in, injected into the dynamic tail. Agreed in discussion 2026-09-24.
Numbered 19 and placed last so that no existing §-reference in this file, in `CLAUDE.md` or in
`docs/TECH_NOTES.md` has to be renumbered.

### 19.1 Why

The game has **no authored beats at all**. Every scene is invented by the model from the phase
rules, which is why a long session drifts toward pleasant sameness — practice room, late night,
coffee, repeat. The prompt can bias tone; it cannot supply an event decided elsewhere.

`relationshipEvents.js` looks like a counter-example and is not. `proposal_ready` and
`breakup_warning` render a **modal** ([App.jsx:1934](../src/App.jsx#L1934)) and never reach the
prompt. Nothing in the current engine tells the model *what happens this round*.

**And `pressure_warning` is filtered for but never produced** — see 21.1, which is also where it
gets a reader.

The content already exists. `src/config/specialEvents.js` on tag `archive/dev-v12.0.0` is 929
lines of hand-written beats, already trilingual:

| Pool | Tiers | Selected by |
| --- | --- | --- |
| `ROMANTIC_EVENTS` | attraction / ambiguous / pre_confession / together | top affection |
| `PR_CRISIS_EVENTS` | low / medium / high | `secrecy` |
| `DRAMA_EVENTS` | mild / moderate / intense | gap between the top two affections |
| `CAREER_EVENTS` | early / mid / late | round number |
| `EMOTIONAL_EVENTS` | early / late | round number |

Each entry is `{ id, prompt, intro: { zh, en, ko } }` — `prompt` instructs the model, `intro` is
the one-line teaser shown to the player.

### 19.2 What v12 got wrong, and it is the expensive one

v12 placed the event **instance** correctly: it appended a `[SPECIAL EVENT — THIS ROUND ONLY]`
block to the user message, which is the tail. Keep that, including its *"open with 1-2 sentences
that bridge from the previous round"* instruction — without it an injected event reads as a hard
cut away from the scene the player was in.

What it got wrong was the **flag**. `buildSystemPrompt(..., queueDActive = false)` took queue
state as a parameter and rewrote two lines of the static prompt — the JSON schema's option D
(`"D. [reserved]"`) and the options rule — whenever a beat was being offered. Every round with a
queued beat therefore missed the entire ~5,500-token cached prefix.

Same defect class as the `主线成员前女友` randomness found in step 1: invisible, no error, no
failing test, and it silently doubles input cost on exactly the rounds the feature is active. The
rule it violates is CLAUDE.md's **`buildSystemPrompt` must be a pure function of the save**, and
plot mode must not reintroduce it.

| Layer | Carries | Cache |
| --- | --- | --- |
| **Static system prompt** | the `SPECIAL EVENT OVERRIDE` *rule* — unconditional, constant, present whether or not plot mode is on | hits from R1 |
| **Dynamic tail** | the event *instance* — target member, prompt, ~60-100 tokens | already 100% miss |

Marginal cost is ~100 tail tokens on firing rounds only. This is the Time Speed `[Pacing]`
pattern that CLAUDE.md already documents; follow it exactly.

**Option D must not be reserved in the schema.** v12 told the model to emit `"D. [reserved]"` and
then overwrote it client-side. Do the overwrite *without* telling the model: it writes a normal
D, the client replaces that string with the beat's `intro`. The static prompt then never varies.

### 19.3 Determinism — the failure mode to design against

`pickRhythmEventForQueue` picks with `Math.random()`. Harmless for the cache, since the tail is
never cached, and fatal for **↺ Retry**: regenerating would roll a *different* beat, so a player
could reroll until they liked one, and the story would contradict the teaser they just read.

**Decide the beat at the end of round N-1 and store it in `memory`.** Round N only reads. Two
things then fall out for free:

- `preRoundSnapshotRef` already snapshots `memory`, so Retry restores the same beat with no new
  code.
- The teaser must exist before options are rendered anyway — the actual reason v12 needed a queue.

Consume-on-fire mutates the memory **clone** and commits only on success, exactly as
`collapseHistoryIfNeeded` does. A failed round must not burn a beat.

### 19.4 One toggle, and the class comes from the story mode

v12 shipped **two** overlapping settings, which is why the grouping reads as unclear today. Its
form carries both at once:

```js
{ ..., pace: "浪漫情感向", rhythm: "free" }
```

and the two value sets are the same four axes twice over. A player cannot tell the questions
apart. Collapse them: the **story mode** is already a live four-way switch as of v1.4.1 step 2, so
let it pick the pool.

**Rewritten 2026-09-28.** This section was written against `PACES` at `App.jsx:50` and `form.pace`,
both **deleted in step 2**. The mode is no longer a setup field at all: it is `storyMode` in
`rv_sim_story_mode`, changeable mid-run, and its rule reaches the model through `buildTailRules` in
the dynamic tail. That makes the mapping below better than it was — a player who switches to
`dramatic` at round 12 switches pools with it, which a setup-time field could not do — and it makes
`rv_sim_plotmode` the **only** new setting, since the class picker already exists.

| `storyMode` | Pool |
| --- | --- |
| `free` | `CAREER_EVENTS` + `EMOTIONAL_EVENTS` (slice-of-life) |
| `romance` | `ROMANTIC_EVENTS` |
| `pressure` | `PR_CRISIS_EVENTS` |
| `dramatic` | `DRAMA_EVENTS` |

Settings gets **one boolean**, `rv_sim_plotmode`, default **off** — identical current behaviour
for every existing player, and the honest default for a feature that changes how the story moves.
A setting rather than a save field, consistent with Time Speed and now with the story mode itself,
both of which also change the writing. No second class picker. If play shows per-class control is
wanted, it belongs beside the story mode in settings — **not** on the setup page, which is where
this paragraph used to send it and where the mode no longer lives.

### 19.5 Where the beats live

**Not in `src/config/`.** Every beat in those pools is idol-industry specific — the practice room,
the dorm, the agency, `pr_crisis` itself. They are **world content** and belong in
`public/worlds/<id>/<lang>.json` as an `events` block, beside `identities` and `places`.

That is the main reason plot mode waits for v1.4.2 instead of being built now: implementing it
against `src/config/specialEvents.js` means moving it a release later.

Three sources, in priority order:

1. **`form.customPlot`** — free text at setup. Overrides everything, stored in the save.
2. **The world's `events` pools** — the v12 content, once ported into `kpop_idol`.
3. **A generated arc** — if plot mode is on and the world declares no `events` (the normal case
   for a world the player built in v1.4.1), round 1 asks for an optional `plotArc` field, stored
   in `memory` and **never regenerated**.

Source 3 is what makes plot mode work for custom worlds at all, and it is also the riskiest path.
`plotArc` must be **optional in the parser** — a model that ignores it returns nothing and the
round is still valid, the contract §8 already sets for `playerPostReactions`. Generate once,
store, never re-ask: a re-rolled arc is the step-1 backstory bug wearing a different hat.

### 19.6 Save shape — no migration

```js
memory.plot = {
  queued:        null,  // {eventId, poolId, memberId, prompt, intro:{zh,en,ko}, entryRound}
  triggered:     [],    // ids already fired, so a beat cannot repeat
  cooldownUntil: 0,     // round number
  arc:           null,  // source 3 only, generated once at round 1
}
```

A v13 save with no `memory.plot` reads as `undefined` and defaults on load. **No new storage key,
no migration table, no change to `isLegacyMemory`** — older shapes are already wiped to
`createEmptyMemory()`. `form.customPlot` is a form field and behaves the same way.

### 19.7 Scope — cut v12's knobs

v12 carried `queueCooldown`, `dShownCount`, `MAX_QUEUE_STAY`, `MAX_D_SHOWN_COUNT`, `D_COOLDOWN`
and `EMOTIONAL_LATE_ROUND` — six tuning parameters for a feature nobody had played yet. Ship the
smallest thing that can be judged:

- **at most one** queued beat
- offered as option D, with the beat's `intro` as the option text
- expires **3 rounds** after entering the queue if the player never picks it
- **3-round** cooldown after one fires
- a beat never repeats within a playthrough (`triggered`)

Add knobs when real play demands them, not before.

### 19.8 Test obligation

| Check | Layer | Guards |
| --- | --- | --- |
| Static prompt byte-identical: plot off vs on, beat queued vs not | **J** | the v12 `queueDActive` bug exactly |
| Same memory + same round ⇒ same beat | **D** | the Retry reroll |
| Event block in the tail only on the firing round | **D** | placement |
| Legacy save with no `memory.plot` loads and plays | **G** | the migration-free claim |
| A failed round does not consume the queued beat | **D** | clone-and-commit |

Per repo convention each must be verified failing against the unfixed code.

### 19.9 Open questions

1. **Does a beat fire inside the achievement window (round 30+)?** v12 gated pools by round via
   `EMOTIONAL_LATE_ROUND`. Probably yes, but the interaction with `proposal_ready` is unexamined.
2. **Porting effort for the v12 pools** — ~100 entries × 3 languages into `kpop_idol`, and the
   prose was written against a v12 stat model that has since changed.
3. **Should `慢热现实向` fire beats at all**, or is "no beats" the honest meaning of slow-burn
   realistic? v12's `free` rhythm did exactly nothing.

---

## 20. The photo a player uploads has nowhere to appear — step 8

**Reported from Yuhan's hand test of the role-first cast picker, 2026-09-28.** The photo store
shipped in step 6 and works: `imageStore.js` downscales, caps, refuses and prunes correctly, and
the roster builder shows the result. **Nothing in the game ever reads it.** `App.jsx` does not
import `loadPhotos`, so the four social overlays and the game top bar all still draw
`emoji + linear-gradient(color, accent)`, and a player who uploaded nine photos sees them only on
the screen where she uploaded them.

This is the same defect class as `npcAppearances` and the bubble photo frame: **a feature complete
on one side of a boundary and connected to nothing on the other.** It reads as a broken upload
rather than a missing consumer, which is why it comes before the release rather than after it.

### Three decisions for Yuhan, marked as recommendations

1. **One wallpaper per member, not one per platform.** He asked for uploadable backgrounds for
   Bubble, Weverse and KKT. Three per member is 3× the quota and 3× the uploads, and each platform
   already lays its own scrim over it, so one photo reads differently in each. Recommend one, used
   as the chat background in Bubble and KKT, the post image on Instagram, and the header banner on
   Weverse — four jobs per upload instead of one.
2. **The birth-year row stays for migrated saves only.** He asked to remove it from settings
   entirely, and for a new game that is exactly right: the year is set once at Setup and never
   moves, because changing it mid-run re-points every honorific and costs the whole ~5,500-token
   cached prefix. But `correctBirthYear` exists for the one case where the year is genuinely
   unknown — a pre-v1.4.0 save whose year was *reproduced* by the migration from `age`, wrong for
   about half of players and unrecoverable. `birthYearEstimated` is already computed in `loadSave`
   and is exactly that flag. Recommend gating the row on it: invisible in every new game, present
   once for a save that needs it. Nothing is deleted.
3. **Ship it in v1.4.0, before the release.** v1.4.0 is the release that introduces the photo
   uploader. Shipping it with no consumer means shipping a dead control.

### What gets built

**`imageStore.js` is parameterised rather than copied.** It hardcodes one key, one cap and one
square size. Wallpapers need a second key, different caps and a different aspect ratio, and a
second copy of the quota rules is the `extractStoryText` failure — two copies drift and the guard
gets written against whichever one was correct.

- `downscaleCover(file, w, h, quality)` center-crops to the target aspect ratio; `downscale`
  becomes the square call. One implementation, two callers, guarded by call-site count.
- `loadImageMap(key)` / `saveImageMap(key, map)`; `loadPhotos`/`savePhotos` stay as wrappers so no
  existing caller churns.
- `putPhoto(map, id, url, {maxCount, maxChars})` — the limits become arguments defaulting to
  today's values, so the refusal rules have one implementation for both stores.
- New key `rv_sim_cast_walls_v14` as `STORAGE_KEYS.CAST_WALLS`. Device-local, never a save field,
  so no migration. `WALL_W x WALL_H = 360x540` (2:3 as shipped — the plan said 360x640 and the hand
  test corrected it), WebP q0.7, `WALL_MAX_COUNT = 8`, `WALL_MAX_CHARS = 90 KB`.

**The sizes above are calculated from the 256x256 profile, not measured.** 360x540 is ~2.9x the
pixels of a 256x256 at a lower quality, so ~46 KB of stored string against ~20 KB. Real encoded
sizes get measured during implementation and this table gets corrected; §10's budget moves from
~2.1 MB to ~2.5 MB typical and ~3.1 MB worst case against the ~5 MB quota.

**Six consumers, because a member's face has to be the same face everywhere.**

| Surface | Today | After |
| --- | --- | --- |
| Game top bar | 28px gradient + emoji | her photo, gradient ring kept as the fallback |
| `MemberSelector` (the tab strip in all four overlays) | emoji | her photo |
| Bubble | one lavender panel, no avatars | avatar left of every line, wallpaper behind the thread |
| KakaoTalk | 26px gradient + emoji per line | her photo per line, wallpaper behind the thread |
| Instagram | no header, gradient placeholder image | real IG shape: avatar + handle header, wallpaper as the post image, actions and caption below |
| Weverse | plain card | avatar + name header on the card, wallpaper as its banner |

Bubble's `hasPhoto` / `photoDesc` frame is **left alone**: that is a specific picture she sent this
round, and substituting her wallpaper for it would render a description of one image over a
different image.

**Uploads move to the roster builder, on the members actually chosen.** Tapping a member's avatar
in the builder — the main card or any chip — opens one sheet carrying both images: photo
upload/replace/remove, wallpaper upload/remove, both counters (`n / 30`, `n / 8`) and the total
bytes in use. Reasons:

- It covers the library, which is what Yuhan asked for: any member can be given a photo by picking
  her into a slot, and a member in no slot has no surface anywhere that could show one.
- It adds **no new tap target to the picker grid**, which is the whole point of the restructure one
  commit ago — a 20px camera badge beside a 40px assign target on a 390px screen reintroduces
  exactly the mis-tap the role-first layout removed.
- The caps and the byte total are visible before they are hit, which is what the save slots and the
  20-member palette both had to learn the hard way.

**The year text input becomes a scroll wheel**, in Setup and in the member editor. The wheel is a
CSS `scroll-snap-type: y mandatory` column with no library, ~5 rows visible, the selection
centered and highlighted, opening centered on 2000. It **removes a failure mode rather than
restyling one**: `birthdayFromYear` returns `""` for a partial year specifically so a half-typed
`19` cannot reach the address protocol, and a wheel cannot emit a partial year at all. Two ranges,
both already defined and not duplicated — `PLAYER_BIRTH_YEAR_MIN/MAX` (1946-2008) for the player,
`BIRTH_YEAR_MIN/MAX` (1980-2012) for a custom member.

### Guards, all mutation-verified, written from the requirement

- `putPhoto` honours caller-supplied caps, and the wallpaper caps differ from the photo caps.
- `downscale` delegates to `downscaleCover` — call sites counted, not presence checked.
- Every surface that renders a member renders her photo when one exists: **count the consumers**,
  because a helper can exist, be correct, and be used in five of six places.
- `App.jsx` threads both maps into all four overlays — asserted on the call, not on the import.
- **No photo or wallpaper data URL can reach the prompt.** Same class as `displayNameIn`, and worse
  if it fails: a data URL inside the static prompt destroys the cached prefix and bills for it.
  Asserted on what `executeRound` and `resolveRoster` receive.
- The settings birth-year row is gated on `birthYearEstimated`.
- The wallpaper cap and the byte total are rendered at all times, not only once hit.
- The wheel cannot produce a year outside its range, and `birthdayFromYear` always receives four
  digits from it.

**Gate: the goldens must not move.** Nothing in this batch is prompt-facing, exactly as the
role-first picker batch was not.

---

## 22. The cast library is written for ONE world, and the setup flow asks in the wrong order — v1.4.2

**Two defects and one restructure, and they are the same thing.** Both were found in the
third phone pass (2026-09-29); the restructure is Yuhan's design, recorded here with what
it fixes, what it costs, and the three places I think it should differ.

### 22.1 The defect that forces it: idol prose in every world

Reported as an Instagram post in the **chaebol** world: *yerimiese: 录制结束，和成员们吃了顿好的。
忙内的快乐就这么简单～*. The hypothesis was that `role` leaks. It does not — `castLore.useRole`
is `false` for campus, office and chaebol and the structured field is correctly filtered.

**The leak is one field over, and it is in prose.** Yeri's `public_image` opens with the word
忙内. `public_image` is Public Texture, one of the three ★ primary differentiators, and it is
sent in **every** world. Step 7 filtered the structured field and left the sentence saying the
same thing.

**Measured across the library, zh, 2026-09-29:**

| | |
| --- | --- |
| members scanned | 57 |
| members carrying idol vocabulary in a world-agnostic prose field | **57 of 57** |
| field instances | **80** |
| by field | `public_image` 56 · `private_personality` 18 · `queer_texture` 6 |

Vocabulary counted: group POSITIONS (忙内, 队长, 主唱, 主舞, 门面, rapper, 中心位) and idol
ACTIVITIES (出道, 打歌, 回归, 专辑, 舞台, 练习生, 应援, 粉丝, 偶像, 女团, 组合, 演唱会, 综艺,
打榜, 签售). Words true of any world — 直播, 朋友 — are deliberately excluded.

**Irene is not the counter-example she appeared to be.** Her post that round read correctly, and
her `public_image` is *统一饭圈审美的南韩神颜，舞台上高冷优雅，作为队长是全队的定海神针* — a
stage and a group leadership. She was lucky. **That is the worst failure profile available:
universal and intermittent**, so no amount of play establishes that a world is clean.

**The three options, and why the restructure is the only real one:**

| | Cost |
| --- | --- |
| author per-world prose | 57 members x 4 worlds x 3 languages of hand-written texture. Not reachable |
| suppress `public_image` when `useRole:false` | drops one of the three fields the whole cast differentiation rests on, in 3 of 4 worlds |
| **translate her into the world at setup time** | one LLM call per member per run, and it is §22.2 |

**An interim prompt rule is available and is worth taking first**, because §22.2 is a release
away: when `castLore.useRole` is false, the profile block gains one line saying the texture
prose was authored for a performing-idol context and is to be read for **traits, never for
facts** — she has no stage, no comeback and no group position here — with `castLife.theirs`
supplying what she does instead. **A prohibition with no substitute gets routed around**, which
this file has recorded twice, so the substitute is the load-bearing half. It is static-prompt
text, so it costs no cache; it moves the three non-idol goldens, deliberately.

### 22.2 The restructure: world-independent identity, world-scoped detail

**Yuhan's flow, 2026-09-29.** Player info (name, birth year, world, identity) moves BEFORE the
cast picker; the profile editor becomes one screen for custom AND prebuilt members, reached by
tapping a chosen member's bubble; it has two tabs, and **only tab 1 is persisted**.

```
0 Cover
1 Player info      name* · birth year* · world* · identity*      -> [Select your cast]
2 Cast picker      main* / subs / NPCs, chips with x, + per slot -> [Save cast] [Start]
3 Cast library     tab 1 CUSTOM (first), then one tab per group
4 Profile          tab 1 who she is   photo · name* · birth year* · private personality*
                                      wallpaper · habit · emoji
                                      one-line description + [generate her detail] [retry]
                   tab 2 more texture public · queer · speech style · MBTI · hidden conflict
5 Main screen
```

**Why the reordering is a bug fix and not a preference.** `generateCard` receives `world` from
`App`'s state, which on the cast screens is *the world remembered from the last session*. So
"生成她在世界观下的详细设定" already describes her in a world the player has not chosen yet.
**That is the same defect class as the save's `worldId`** — a value read before it is decided —
and asking for the world first makes the generator's input correct by construction rather than
by a guard. See CLAUDE.md, *A copy taken BEFORE the fact is decided*.

**Why the tab split is the right storage rule.** Tab 1 is true of the person; tab 2 is true of
the person *in a world*. Persisting only tab 1 means a member authored in the campus world can
be cast in the chaebol world without carrying a lecture hall into it, and changing the world
mid-setup discards the generated detail rather than silently contradicting the new one. It is
the same asymmetry `beginRun` uses: **forgetting to persist a world-scoped field is harmless;
persisting one leaks a world.**

### 22.3 Three places this should differ from the draft

**1. `name_kr` cannot be removed.** The draft removes 本名. It has **twelve-plus readers**: the
displayed name in Setup's member lists and NPC line, the stats-bar affection tooltip, the
notification strip, the Instagram / Weverse / MemberSelector headers, the prompt's
`Main Member:` line and profile block, the self-address rule in section 6 (*"when she speaks,
`name` and `name_kr` refer to herself"*), and **`membersNamedIn`**, which reads it back out of
the prose to decide who appeared — Chinese narration writes 涩琪, not Seulgi, and that is the
29-of-75 measurement this file already carries. Removing it renames every member in the UI and
silently re-breaks `[Rounds Absent]`. It belongs in tab 2 (optional, prefilled for prebuilt
cast, blank for custom), not deleted.

**2. Deleting 队内定位 leaves a hole; REPLACE it.** `role` is an idol position, so it is right
that it stops being a persisted field a player edits. But a chaebol or office world then has
**nothing at all** saying what she does — and *what these five people do all day* is the most
world-specific fact there is, which is why `castLife` exists. So `role` should become a
**generated, world-scoped tab-2 field**: her position in THIS world, written by the same call
that writes the rest of tab 2, filtered by `useRole` exactly as today. That also closes §22.1
from the other end: the model is told she is the family's in-house counsel instead of inferring
an occupation from 忙内.

**3. `animal_plastic` removal is a prompt change, not a UI cleanup.** It renders as
`line("Animal", m.animal_plastic)` in the profile block, so deleting it changes the prompt for
all 57 prebuilt members and moves every golden. It is world-independent (an animal comparison
is true in a lecture hall), so the cheap answer is to keep the field and drop it from the
**editor**, which is what the draft actually wants — one fewer box to fill.

**And one addition: editing a prebuilt member must not snapshot her.** `resolveRoster` already
honours `entry.override` (`rosterResolver.js:266`), so an edit to a library member should land
there as a diff. Snapshotting her instead would give up the by-reference rule this plan states
in §4.2 — *a fixed profile reaches games in progress* — for no gain. Custom members stay
snapshotted inline, unchanged.

### 22.4 Open, and NOT diagnosed

**A saved cast holding a deleted custom member.** Reported as *"only name + emoji"*. The prose
snapshot is provably complete — `toRosterEntry` copies `{...member.profile, id}` and
`applyRoster` restores `profile: e.profile` — so the roster itself is not what is lost. The
likely loss is her **photo and wallpaper**, which live in separate id-keyed stores
(`rv_sim_cast_photos_v14` / `_walls_v14`) that the palette's delete path prunes by id. **Not
reproduced**, so not designed: reproduce first, then decide whether the images belong in the
saved roster (which would put ~46 KB of data URL into a second store, against §10's budget) or
whether the delete path should spare an id that a saved roster still references.

**A round that names nobody.** Reported: whole rounds referring to a member only as 她, leaving
the player unable to tell who. It has a **second consequence nobody would report**:
`membersNamedIn` observes appearances from the prose, so a round that names no one records no
one as present, and `[Rounds Absent]` then tells the next round she has been away — a false
fact in the tail, which is the defect this file spends a whole section on. One rule fixes both:
every member present in a round is named at least once, in narration, by her name alone. It is
a prompt change in every language, so it moves all six goldens and wants its own commit.

---
## 21. Endings and the epilogue — v1.4.2

**Raised by Yuhan 2026-09-28, immediately after step 2, as a rough mechanism to design against
rather than a feature to build now.** His correction is worth stating first, because it repoints a
finding of mine from that step:

> **What should shape an epilogue is the story mode — the rhythm the run was played in — and the
> world. Not Time Speed.**

That is right, and the reason is structural. **Time Speed is a within-round dial** — how much clock
passes in *this* scene — and an epilogue is one jump past the last scene, so there is nothing for it
to modulate. It keeps being forwarded to the epilogue call (step 2 wired it, and the call-site guard
counts all four), because a dial that reaches three of four call sites is the drift this repo has
recorded twice; but **nothing in the epilogue instruction should read it.** My step 2 note that Time
Speed "has never applied to an epilogue in any release" was a true observation about a wire and the
wrong conclusion about what it was for.

And the **ending** — HE / SE / BE / OE — is chosen by stats and affection. That is exactly what the
five `achievements.js` conditions already do. The missing wire is between the two.

### 21.1 Three things are wrong today, and they are one bug

**1. The ending and the epilogue are separate systems that share no state.**

| | Fires | The button says | Ids it can produce |
| --- | --- | --- | --- |
| `checkAchievement` | every round from 30 on | **"Continue Playing"** | 3 of 5 (`PROPOSALS.md` §6) |
| `specialEvent` | `proposal_ready` or `breakup_warning` | **"End Game & View Epilogue"** | 2 |

So the ending a player earned and the epilogue she reads are keyed on **different triggers**, and
the epilogue call is handed no ending at all. A run that closes on `be_you_left` and a run that
closes on `he_hidden_love` request the identical epilogue.

**2. The epilogue's prompt is one hardcoded English sentence with a fixed tone**, at
[App.jsx:1945](../src/App.jsx#L1945):

> `Generate an epilogue: <specialEvent.title>. A short story set after this event. 150 words in a warm, literary style. Return ONLY valid JSON.`

*"Warm"* is asked for on the breakup path too. And `specialEvent.title` is **already localized**
and already carries an emoji and a label prefix, so the model receives
`Generate an epilogue: 💔 感情危机` inside an English instruction — the same id-inside-a-sentence
shape as the bare `Progression Pace: 高压舆论向` that step 7 of v1.4.0 fixed.

**3. `pressure_warning` has no producer.** [mainAgent.js:861](../src/agent/mainAgent.js#L861)
filters `specialEvent` on three types; `checkRelationshipEvents` returns `love_triangle`,
`proposal_ready` and `breakup_warning` and nothing else. CLAUDE.md claimed all three were
surfaced — corrected. **A filter that enumerates is the cheapest place to find a missing producer**,
cheaper than grepping for writers, and it is the standing dead-mechanism shape with the halves
swapped.

It is **not deleted**, unlike `NPC_APPEARANCE_CHANCE`, and the difference is stated rather than
assumed: that constant had no plan, and this branch has a designed reader in §21.2 — the natural
close of a pressure-mode run.

### 21.2 The design

**One resolver, three sources, and each source answers a different question.**

`resolveEnding(stats, affections, roundNum)` becomes the single answer to *which ending is this*:
exported and pure, in the `addSaveSlot` / `membersNamedIn` pattern. It replaces nothing — it
**is** `checkAchievement`'s condition table, given a name and a second caller.

| Source | Answers | Lives in |
| --- | --- | --- |
| the **ending** | what happened, and the register of the closing — a BE does not close warmly | `achievements.js`, one line per id per language |
| the **story mode** | what an ending *means* in that rhythm | `world.modes[id].epilogue` |
| the **world** | where, and in what life — a comeback stage, a graduation, a quarterly board | `world.epilogueFrame` |

**The mode's epilogue line is a SECOND field, never a reuse of `modes[id]`.** Today's rule is
written in round units — *"secrecy changes doubled"*, *"don't rush"* — and an epilogue's whole job
is to jump to the end, so feeding it the round rule puts two quantities under one label again, which
is the lesson step 2 exists for. What a mode contributes to an *ending* is different in kind:
`free` closes on the relationship itself, `romance` on the confession, `pressure` on
**whether the secret held**, `dramatic` on where the other members landed.

**All three go in the `playerChoice` string, not in `buildSystemPrompt`.** The epilogue is one
call whose ~5,500-token prefix is already cached by the run that just finished; putting ending text
in the static prompt would pay full price on all of it for a single call, *and* would make the
prompt a function of live state. The tail is the always-miss message and this is what it is for —
the same argument that put the story-mode rule there in step 2.

**The trigger has to widen, and this is the player-visible half.** Today a run that never fires
`proposal_ready` or `breakup_warning` has **no path to an epilogue at all**: the only button
that reaches one lives on a modal that may never appear. So:

- **Settings gets an *End this story* entry** that resolves the ending and runs the epilogue.
- **The special-event modal's button names the ending it would close on**, so the player is choosing
  an outcome rather than pressing a button labelled "End Game" and finding out afterwards.
- **The achievement modal stops saying "Continue Playing" and nothing else.** An ending reached at
  round 30 that the player then plays past is fine — they accumulate by design — but it should say
  which ending is currently *live*, because that is the one the epilogue will use.

**And the last place is the epilogue's anchor** (§7.4). `world.epilogueFrame` says what "later"
looks like in that world; the run's final `scene` says where it ended. Both are cheap and neither
needs new state.

### 21.3 Ordering, and what v1.4.1 must not get wrong

**`PROPOSALS.md` §6 is a hard prerequisite**, and §21 is the reason — §18 decision 8 now says so.
The epilogue's register is keyed on the ending id, and two of the five ids are shadowed today.
Authoring an epilogue register for an ending nobody reaches is the `NPC_APPEARANCE_CHANCE` shape,
and it would be three languages deep before anyone noticed.

**Nothing is pre-shaped in v1.4.1, deliberately.** The tempting cheap move is to change
`world.modes[id]` from a string to `{ rule }` in step 4 — while three of the four worlds do not
exist yet — so that adding `epilogue` later touches 3 files instead of 12.
**Recommendation: do not**, for one reason that outweighs the nine files: §21.2 may well want the
epilogue register keyed on **(mode × ending)** rather than on mode alone, and pre-shaping for the
wrong key costs more than the mechanical edit it saves. `getModeRule` is the **single** reader of
that field, so the change is one line plus data whenever it comes.

`world.epilogueFrame` is not added in v1.4.1 either, on the plain rule: **it arrives with whatever
prints it.** Same call that kept `roleLabel` out of step 1.

**So v1.4.1's obligation is negative, and free:** step 7 authors three worlds' prose, and **none of
it may promise an outcome the ending table cannot produce.** A world whose `scenario` or `phases`
promise a public wedding while no reachable ending is a public wedding is two sections of the prompt
disagreeing — the defect class this prompt keeps hitting, and the one nothing fails on.

### 21.4 Test obligation

- `resolveEnding` is pure and unit-tested **on the conditions as decided, not as implemented**.
  The partition guard `PROPOSALS.md` §6 asks for — no reachable state falls through, no ending is
  shadowed — is written *after* the precedence is decided, or it pins today's behaviour as the
  requirement.
- **The epilogue is asserted on what it forwards** — the ending id, the mode id, the world's frame —
  never on the wording of the instruction. Fourth instance of that rule after `--identity`,
`--provider` and `--mode`: **the guard belongs where the value is passed.**
- **Layer J's paired invariant extends to the epilogue call**: the static prompt is byte-identical
  across a change of ending *and* across a change of mode, **paired with** the assertion that the
  tail is what moves. Either half alone is vacuous — step 2 shipped that mistake and caught it in
  its own mutation round.
- A live epilogue per ending per mode is 5 × 4, which is too many to gate on. The honest gate is
  **one live epilogue per ending id** on a single mode, plus the offline forwarding guard for the
  rest of the matrix.
- **`pressure_warning` gets a producer or gets deleted in the same commit.** It does not stay a
  filtered-for value with nothing behind it past v1.4.2.
