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
| 7 — Release v1.4.0 | ⬜ |

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

### Carried into step 6: correcting a migrated birth year

Migration writes `birthYear = GAME_YEAR - age`, which reproduces the value a legacy save has
always produced and is therefore **still wrong for about half of those saves**. Nothing can
recover the real year from an age. New games are correct; old ones are not, and no loader can fix
that without changing a running game underneath its player.

So the fix is an affordance, not a migration: let the player correct her birth year on a loaded
save. It belongs in step 6 because it is UI, and because editing it mid-run rewrites the static
prompt and costs one full cache miss — a fine price for a deliberate action, and not something to
incur as a side effect of loading.

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

**State as of 2026-09-24.** v1.3.9 is **released** and is what players run: `main` and
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

**Step 6 is in progress and is the current work.** `dev` and `origin/dev` are at `b8e66b0`, **CI
green** (run `36136433425`), smoke **849**. Nine commits so far:

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

**Remaining in step 6:** correcting a migrated birth year on a loaded save (the item carried from
step 4, below), optionally splitting the classic Setup page into steps, and docs. The roster
builder's visual design is **known to be unpolished and deliberately deferred** — Yuhan's call
after the phone test: "works but doesn't look good, we can improve this later."

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
- **Three storage keys, not §4.3's five.** `rv_sim_worlds_custom_v14` and `rv_sim_world` are v1.4.1
  work; this repo already carries `NPC_APPEARANCE_CHANCE` and `NPC_COOLDOWN_ROUNDS` as a standing
  example of what declaring ahead of the reader costs.
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
| **v1.4.1** | The three new worlds + custom world builder + per-world platforms + place map (picker, canon, discoveries) | Medium — new data, no migration |
| **v1.4.2** | Player-side KKT/IG, cast relations, opening scenario, place→member affinity prior | Low — additive |
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
    WorldBuilder.jsx      NEW (v1.4.1)
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
  "roleLabel": "Role"
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
| `rv_sim_worlds_custom_v14` | `[{id, createdAt, world}]` — custom worlds | ⬜ v1.4.1 |
| `rv_sim_world` | selected world id (mirrors `rv_sim_group`) | ⬜ v1.4.1 |

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
| 4 | Group background | `world.setting` + `world.lore` + roster relations |
| 5 | Member profiles | + `Habit:` line; NPCs are explicit, not leftovers |
| 6 | Cast identity & address | identity text from `world.identities`; token table from `world.addressForms`; **protocol logic unchanged** |
| 7 | Social platform rules | only the platforms the world declares |
| 8 | — | **NEW** Places (canon list) + opening scenario |

**Everything added here is static and therefore cached from R1.** No change touches the history
ledger or the cache-miss boundary.

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
both the UI and the JSON schema. The hook already exists and is currently dead:
[groupLoader.js:97-98](../src/rag/groupLoader.js#L97-L98) parses `socialPlatforms` and
`privateChat` and nothing reads them.

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
| Everything else | < 50 KB |
| Total vs ~5 MB quota | ~2.1 MB |

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
| **2** | ✅ **Release v1.3.9** — affection clamp (11), usage panel (10), quota-guarded `saveToStorage` (9a), plus `backstorySeed` inherited from step 1 | Built and validated on `dev` (smoke 469 → **535**, 8/8 clean live rounds with 0 static-prompt drifts). The merge and deploy are red lines and are **not** done — see Pick up here. |
| **3** | World extraction + resolver: tasks 1, 2, 3, 4 + Layer J | **Golden prompts still byte-identical.** This is the whole gate. |
| **4** | Save migration: task 6 | A pinned v1.3.8 save migrates and resolves to the *same* member set `getNpcMembers` returns today |
| **5** | Content: task 5 (`habit` × 27 files) + task 13 (root mirror) | Layer J asserts `habit` reaches the prompt through `loadGroupConfig` |
| **6** | UI: tasks 7, 8, 9b (roster builder, member editor, card generation, photos) | Hand-test at 390px **(done — found 3 bugs, all fixed)**; live `playthrough.mjs` on a cross-group roster **(not yet run)** |
| **7** | **Release v1.4.0** | Build + smoke + live playthrough, then the normal release flow |

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

Three world JSONs × 3 languages; world builder UI; platform-aware schema and overlays; place
canon in §8; map picker; discovered places.

### v1.4.2

Player KKT/IG composers; `playerPostReactions` in the schema and parser; relations in §4;
opening scenario; affinity matrix call + `BETA` prior in `probabilityEngine.js`; **plot mode
(§19)** — authored story beats, offered as option D, injected into the tail.

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

---

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

`relationshipEvents.js` looks like a counter-example and is not. `proposal_ready`,
`breakup_warning` and `pressure_warning` render a **modal** ([App.jsx:1453](../src/App.jsx#L1453))
and never reach the prompt. Nothing in the current engine tells the model *what happens this
round*.

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

### 19.4 One toggle, and the class comes from `pace`

v12 shipped **two** overlapping settings, which is why the grouping reads as unclear today. Its
form carries both at once:

```js
{ ..., pace: "浪漫情感向", rhythm: "free" }
```

and the two value sets are the same four axes twice over. A player cannot tell the questions
apart. Collapse them: [`PACES`](../src/App.jsx#L50) is already chosen at setup and currently only
nudges tone, so let it pick the pool and finally do something.

| `pace` | Pool |
| --- | --- |
| 慢热现实向 | `CAREER_EVENTS` + `EMOTIONAL_EVENTS` (slice-of-life) |
| 浪漫情感向 | `ROMANTIC_EVENTS` |
| 高压舆论向 | `PR_CRISIS_EVENTS` |
| 修罗海王向 | `DRAMA_EVENTS` |

Settings gets **one boolean**, `rv_sim_plotmode`, default **off** — identical current behaviour
for every existing player, and the honest default for a feature that changes how the story moves.
A setting rather than a save field, consistent with Time Speed, which also changes the writing.
No second class picker. If play shows per-class control is wanted, it belongs beside `pace` on
the setup page, not in settings.

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
