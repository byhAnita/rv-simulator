# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **This file is the reference for how the system behaves NOW. It was split on 2026-10-21**
> because it had grown to 493k characters, over the 150k load limit. Nothing was deleted; every
> section moved **verbatim** to one of three homes:
>
> | File | Holds |
> | --- | --- |
> | `docs/MODEL_LAYER.md` | providers, the Aliyun free route and paid mode, the error layer, Deep Thinking flags, output caps, usage metering |
> | `docs/RELEASE.md` | branches, release, hotfix, worktrees, version strings, CI, the three mirrors, Jekyll, `npm run deploy` |
> | `docs/CLAUDE_HISTORY.md` | every post-mortem, phone pass, live-run write-up and old `Pick up here` block, in original order |
>
> **When a sentence here names a section in italics that is not in this file, grep those three.**
> The *Lessons index* near the end lists the archived rules that still bind, one line each.
> Keep this file under ~120k characters: a new post-mortem goes to `docs/CLAUDE_HISTORY.md`,
> with one line in the Lessons index if its rule still binds.
>
> **What is in flight right now is `docs/HANDOFF.md`**, not this file.


## Project Overview

**Idol Dating Sim v1.4.4** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390x844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

Active branches:
- `main` — stable production, served by GitHub Pages + Vercel
- `dev` — default working branch, never deploy from here

See **Branch & Deploy Workflow** for the release, hotfix and merge-back rules.

> **More than one agent works on this repo, one at a time.** If you are not the main VS Code
> session, read **`docs/AGENTS.md`** (roles, scope, and the rules a cloud or third-party agent
> cannot see because they live in Yuhan's personal config) and then **`docs/HANDOFF.md`** (the one
> task in flight, and the exact next command). Stand-in agents **fix bugs and do not design**.

Production numbers (reasoning off). **Four cache figures exist and they are not interchangeable** —
quote the right one, with its source:

| Figure | Source | Status |
| --- | --- | --- |
| ~92% | calculated from the token profile | **estimate**, the ceiling for clean sequential play |
| 86.7% | DeepSeek Official billing, 40 clean rounds, 2026-09-24 | measured |
| ~95.8% | DeepSeek Official billing, hours of real play with regenerates | measured |
| ~83% | Aliyun, across free-route models | measured, different cache, not comparable |

Median round: **6.3s on DeepSeek Official V4.1 Flash**, **~16-17s on Aliyun flash models** — it
tracks the provider, not the game. See open question 2 and the README performance section.

---

## Commands

```bash
npx vite                              # local dev - hot reload, always works
npm run build 2>&1 | tail -12         # validate build
node test/smoke.mjs                   # offline checks: request bodies, error classifier, router, legacy saves
node test/smoke.mjs --live            # + one real round on the provider in .env.local (spends credits)
node test/smoke.mjs --live-free       # + probe every Aliyun free-route model, then one routed round
node test/playthrough.mjs             # live: real multi-round games, one per model family
node test/playthrough.mjs --models all --rounds 10 --jobs 6   # full 28-model sweep
node scripts/update-golden.mjs        # regenerate test/fixtures/*.txt after an INTENTIONAL prompt change, then read the diff
node scripts/analyze-prose.mjs        # writing quality from the newest playthrough: repetition, rotation, pacing
npm run bump 1.3.3                    # rewrite all 15 version strings (note the `--` for --dry)
npm run deploy                        # full deploy: preflight -> build -> patch index.html -> push main
DEPLOY_MSG="fix: desc" npm run deploy # deploy with custom commit message
node scripts/verify-mirrors.mjs       # AFTER a deploy: fetch the bundle AND every data file from all three mirrors
node scripts/zh-review.mjs status     # Yuhan's review of every Chinese data string; docs/ZH_REVIEW.md
node scripts/zh-review.mjs sync       # apply the blocks she ticked in docs/zh-review/*.md
scripts/hotfix-worktree.sh new <slug> # a clean checkout of main to fix one player-reported bug in
scripts/hotfix-worktree.sh status     # what worktrees and hotfix branches exist, and which are debris
```

`npm run deploy` refuses to run unless it is on `main`, the staged paths are clean, `main` is level with `origin/main`, **and the smoke suite passes** — see Branch & Deploy Workflow.

Validate every change with `npm run build` **and** `node test/smoke.mjs`. No lint config.

**A change that introduces a *technique* also gets an entry in `docs/TECH_NOTES.md`, in the same
commit.** A technique is anything where a reader could reasonably ask "why not just do the simple
thing" — a caching strategy, a retrieval method, a statistical model, a routing or build
mechanism. The entry says what it is in plain language, what it replaced and how that fell short,
what it measurably bought, and what it costs. Features do not need one; if the honest answer to
"why this way" is "it's the obvious way", there is nothing to write. This file exists because
CLAUDE.md records how the system *behaves* and a diff records what changed, but neither recovers
why an approach was chosen over the obvious alternative — which is the thing that is unexplainable
six months later.

**Both harnesses must define `import.meta.env.BASE_URL` when bundling `src/`.** Vite fills it at build time and Node has no `import.meta.env` at all, so any module reaching `groupLoader.js` throws `Cannot read properties of undefined` before the first API call. `playthrough.mjs` and smoke Layer I both pass `define: { "import.meta.env.BASE_URL": '"/"' }` to esbuild — `"/"` matching the dev-server base and the `/groups/` paths their fetch stubs serve from disk. v1.3.5 introduced the dependency and killed `playthrough.mjs` outright; it stayed dead until v1.3.7 because nothing offline exercised that bundling path. Layer I now does.

`test/smoke.mjs` reads `API_KEY` (or the older `YURIAGENT_API_KEY`) and `MODEL_ID` from the git-ignored `.env.local`. `MODEL_ID` accepts either a provider id or a model string (`aliyun`/`qwen`/`qwen3.8-max` all resolve to the `qwen` provider). Never print the key, and never move it into a tracked file — Layer C fails the run if a key reaches `src/`, `dist/`, or git history.

**The two live tests answer different questions.** `smoke.mjs --live-free` sends a tiny request to each free-route model and asks *does this model accept our parameters* — cheap, fast, and the thing to re-run after any params change. `playthrough.mjs` plays real games through `executeRound` and asks *can this model actually run the game* — valid JSON every round, the player's language, four `A.`–`D.` options, stats in 0–100, prose with no options or stats box baked in, no chain-of-thought leak, and a history ledger whose prefix stays byte-identical outside collapses (the cache claim). It also grades **writing quality** — honorifics pointed the wrong way in age, a member's real name used to address someone, and Kakao narrated in a round that delivered none. Those rules live in the prompt, which smoke Layer I checks offline; only a real playthrough shows whether a model *follows* them. The player's birth year therefore defaults to the cast's median, so some members are her seniors and some her juniors — a cast that is uniformly older exercises only one direction and cannot catch a reversal. `--age` still pins it, converted to a birth year on the way in. Each model runs in its own child process so router state and `mainAgent`'s module-level social buffer cannot interleave. `--models sample` (the default) covers one model per family; reports land in `test/.out/playthrough-*.json`.

**Every field that selects a whole block of the prompt has to be a flag.** `--identity` exists
because pinning `练习生` meant 7 of the 8 identity backgrounds had never been played live by anything;
`--pace` existed because the same thing was true of the pace, and it started mattering the moment
section 6 began sending the pace's authored rule instead of its id. Smoke asserts the `form` literal
is built from `IDENTITY` rather than from strings — a flag check alone would pass while
`form.identity` stayed hardcoded.

**`--pace` is `--mode` since v1.4.1 step 2, and the guard moved with it.** The story mode is not a
`form` field at all, so smoke asserts `storyMode: MODE` on **the `executeRound` call** — a guard
reading `form` would now be reading the wrong object. `MODE_IDS` is imported from
`src/rag/worldLoader.js` rather than listed in the harness, because a second hand-maintained list of
mode ids is exactly what `PACES` was. **The guard belongs where the value is passed.**

**`node scripts/analyze-prose.mjs` is the third question, and the graders cannot answer it.** A grader
reports what went **wrong**; "0 issues" reads the same whether the model used `欧尼` all game or
avoided honorifics altogether, whether each round opened on a different image or recycled one, whether
the sub members got the scenes section 3 promises them. Most of what makes the game good or bad lives
in that gap. So the harness stores a full transcript for **every** round — prose, scene, options, stat
and affection values, the delivered Kakao ids, the summary — and the analyzer measures repetition
(round-to-round n-gram overlap, reused sentences, openers that rhyme), scene variety, option variety
and stat leakage, member rotation against section 3's rule, how often the address forms actually
appear, and affection pacing against the ±8 clamp.

It **prints numbers and no verdicts, deliberately**. There is no threshold at which the writing is
fine, and a metric that failed a build would be tuned away the first time it was inconvenient. It
found two defects within three rounds of first being run: `scene: "SM娱乐大楼顶层会议室"` under a rule
forbidding company names, and zh prose running at double the length the prompt asks for.

Sampling round 0 alone, which is what the report used to keep, is the worst possible choice for judging
writing: round 0 is the only round with no history behind it, so it is the one round whose prose cannot
repeat itself.

---

## Architecture

### Core Architecture Principles

*   **1-Tier Unified History Ledger:** Memory uses a single `history[]` array — a chronological append-only ledger of `{round, type:'summary'|'full', text, choice?, summary?}` entries. Entries are never deleted mid-ledger; the token prefix stays byte-identical across consecutive rounds, enabling LLM KV cache hits.
*   **In-Place Collapse (Stepped Window):** When full-story entries reach `HISTORY_FULL_MAX` (N=3), all `type:'full'` entries are mutated to `type:'summary'` in-place (using the `summary` string already returned by the LLM each round). The new round is then appended as `type:'full'`. This causes one partial cache miss per N rounds; all other rounds are prefix cache hits on the history block.
*   **3-Tier Prompt Structure:** The prompt is split into three strictly ordered messages to separate immutable from dynamic content:
    1. **Static system prompt** — rules, lore, member profiles, JSON schema (~5,500 tok) -> 100% cache hit after R1
    2. **History ledger** (`buildHistoryLedger`) — append-only summaries + full stories (~2,300 tok) -> hits except the newest entry
    3. **Dynamic tail** (`buildDynamicTail`) — player stats, affections, stage changes, NPC state, KKT, pacing hint (~150 tok) -> always cache miss, kept small
*   **Dynamic fields isolated to tail:** Player stats, affections, stage changes, NPC appearances, and **both live pacing dials** — the `[Story Mode]` rule and the `[Time Speed]` hint — live exclusively in the dynamic tail message and are never embedded in the history ledger or the system prompt, to avoid invalidating the prefix.
*   **Save schema:** `rv_sim_saves_v13`. `isLegacyMemory` detects `memory.history === undefined`. On legacy load, memory is wiped to `createEmptyMemory()` while stats and affections are preserved — no crash.

### Regenerate & Edit Features

The current round can be regenerated or edited without consuming a new round counter or corrupting memory:

- **`preRoundSnapshotRef`** (`useRef`) in `App.jsx` — captures `{ stats, memory, kktUnlocked, kktMessages, triggeredAchievements, playerChoice }` before every `executeRound` call (both in `startNewGame` and `sendMessage`). `socialFeeds` is intentionally **not** snapshotted — `popPendingSocial()` already ran and correctly applied the previous round's social to UI state. **`loadSave` nulls it** — see Save Compatibility.
- **`regenerateRound(overrideChoice)`** in `App.jsx` — restores all snapshotted state, removes the last assistant message, calls `resetPendingSocial()` (clearing the discarded round's pending social), then re-calls `executeRound`. With no argument it reuses the snapshot's `playerChoice` (the ↺ Retry path); with one it substitutes the edited choice and updates the snapshot so a later ↺ keeps it.
- **`resetPendingSocial()`** exported from `mainAgent.js` — clears module-level `pendingSocialFeeds` and `pendingNotifications`.
- **Edit last choice (✎ on the newest user bubble)** — replaces the choice and re-runs the round through `regenerateRound(edited)`. Same sanitisation and 300-char cap as `sendMessage`. Round 1 has no user message (it comes from `startNewGame`), so no button appears there.
- **Edit last story (✎ beside ⎘ and ↺)** — edits the prose only, keeping the stats box, and writes to **three** places: `messages[last].content`, `memoryRef.current.history.at(-1).text`, and `.keepFull = true` on that same entry. The first two are required or the player's screen and the model's context silently diverge; the third is required or the edit can be collapsed away before it is ever sent — see **Collapse Logic**. Capped at 4,000 chars so a paste cannot bloat every later round's prompt.
  - **This is free in cache terms.** A story generated in round N first enters the prompt at round N+1, and the button only ever appears on the newest story — so the edited text has never been sent and nothing cached is invalidated.
  - The original English `summary` is **kept**. It is the collapse target, and blanking it would make `collapseHistoryIfNeeded` fall back to `text.substring(0,150)` — a truncated slice in the player's language, which is worse than a slightly stale gist. `keepFull` is what makes that choice safe: without it, keeping the stale summary meant the edit was thrown away on every third round.
  - ↺ Retry after an edit discards it, by design: it regenerates from the pre-round snapshot.
- **UI**: `⎘ Copy`, `✎ Edit` and `↺ Retry` appear bottom-right of the last assistant message only, hidden during loading and gated on `preRoundSnapshotRef.current`. Copy strips the stats box and option lines, leaving pure story text. The editor **auto-grows to its content** (min 220px, capped at 66vh): a story is 600-2,400 characters, so a fixed box means scrolling to read your own text. Opening an editor hides **both** the option bar and the custom-input row, and `sendMessage` closes it, because `editingIdx` is an index into `messages` and appending a turn would point the draft at the wrong message. Smoke Layer G guards all three.

### A new round scrolls to its own top (v1.4.4 P10)

The story panel used to scroll to the END on every change, so a round landed on its last line
and the player scrolled back up to find its stats box. `storyScrollAction(prev, next)` in
`src/utils/storyScroll.js` is the rule, pure and unit-tested: **"bottom"** while a round is
generating (her choice and the loading dots), **"round"** when one arrives (loading ended, or the
message count changed with nothing loading, which is a loaded save), and **nothing** otherwise,
so saving an edited story no longer jumps. On "round", App scrolls the panel itself to the top of
the newest assistant message, whose wrapper carries `lastRoundRef` in **both** render branches
(with and without a stats box). Guarded in Layer G, 7 mutations RED.

### Data Flow per Round (cache-optimized)

```
Player choice
  -> executeRound({..., reasoningEnabled, aliyun, timeSpeed})
  -> memory = clone(memory)            // collapse works on a clone; a failed round
  -> collapseHistoryIfNeeded(memory)   // must not destroy the caller's full stories
  -> buildHistoryLedger(memory)        // serializes history[] - CACHEABLE prefix
  -> buildDynamicTail(memory, members) // stats, affections, KKT - always tail
  -> buildSystemPrompt(...)            // static - 100% cache hit
  -> callLLM([system, ledger, tail + pacing + choice], ..., reasoningEnabled, aliyun)
     // 90s timeout, per-error-kind retry; Aliyun free mode walks the route
     // throws LLMError {kind} -> App shows t.errors[kind] as the round's message
  -> parseLLMOutput()                  // 4-level fallback
  -> validateAndFixOutput()
  -> update stats / affections
  -> detect stage changes / events / achievements
  -> pickPrimaryMember() -> memberAppearances
  -> updateMemory: append historyEntry {type:'full', text, choice, summary}
  -> store social feeds in pendingSocialFeeds (displayed NEXT round)
  -> return { story, options, stats, ... }
```

> **Cache performance:** Every N rounds one collapse miss; all other rounds hit on everything above the dynamic tail. Static system prompt hits every round after R1. Measured steady-state: ~95.8%.

### Key Modules

| Path | Role |
| --- | --- |
| `src/App.jsx` | All React state, page routing (Cover→KeyInput→Setup→Game), themes, settings overlay, story export, save/load |
| `src/agent/mainAgent.js` | `executeRound`, `buildSystemPrompt`, `parseLLMOutput`, `validateAndFixOutput`, `popPendingSocial`, `resetPendingSocial`, `createInitialStats` |
| `src/agent/memoryPool.js` | 1-tier history ledger: `createEmptyMemory`, `updateMemory`, `collapseHistoryIfNeeded`, `buildHistoryLedger`, `buildDynamicTail`, `isLegacyMemory`, `getTopMember`; plus the discovered-place record, `recordPlace` / `placeKey` / `PLACES_MAX` |
| `src/agent/probabilityEngine.js` | `calculateProbability`, `pickPrimaryMember` — picks which target member drives this round |
| `src/tools/llmTool.js` | Unified OpenAI-compatible client + per-provider reasoning flags, 90s timeout, per-kind retry, Aliyun free-credit router |
| `src/tools/llmErrors.js` | `LLMError`, `parseErrorBody`, `classifyError` — maps every provider's HTTP errors to one `kind` |
| `src/tools/usageMeter.js` | Session token/cost/latency accumulator: `recordUsage`, `getUsageSummary`, `resetUsage` |
| `src/tools/aliyunRoute.js` | Free-route state per API key: `getFreeCandidates`, `markModel`, `recordServedModel`, `getFreeRouteStatus`, `resolvePaidModel` |
| `src/rag/groupLoader.js` | `loadGroupIndex()`, `loadGroupConfig(id, lang)`, `getNpcMembers()` — the **cast** library |
| `src/rag/worldLoader.js` | `loadWorldIndex()`, `loadWorld(id, lang)`, `parseWorld`, `MODE_IDS`, `getIdentity`, `getPaceRule`, `renderIdentityBackground`, `resolveKoreanParticles` — the **setting**: country, identities, paces, story modes, phase beats, places, and the address register it resolves |
| `src/rag/rosterResolver.js` | `resolveRoster(roster, lang, world)`, `buildClassicRoster()`, `composeRosterLore()`, `renderCastLore()` — turns "who is in this run" into the `members[]` the prompt consumes, and section 4 into lore about the cast rather than about a group. **`world` is required and has no default**, the same rule `buildSystemPrompt` follows: since v1.4.1 step 4 the world owns section 4's wording |
| `src/rag/memberNames.js` | `familyNameOf` — a member's surname from `name_kr`, with the `family_name` override where the derivation is wrong. `givenNameOf` — her given name, with the `given_name` override; the address ladder and `membersNamedIn` both read it, so the name the prompt teaches is the name the matcher sees (v1.4.4 P1) |
| `src/rag/customCast.js` | the player-authored member **palette**: `upsertMember`, `removeMember`, `sanitizeProfile`, `rosterFromPicks`, `birthYearOf`/`birthdayFromYear`. A palette, not a dependency — see Cast, world, roster |
| `src/agent/cardGenerator.js` | `generateCard` — one `callLLM` call turning a one-line description into a member card. **An accelerator, never a gate**: every failure returns a blank profile |
| `src/utils/imageStore.js` | cast photos: `downscale` (canvas, browser only) split from the quota rules, which are pure and unit-tested |
| `src/tools/debugConsole.js` | the on-device console: always-on key-redacted ring buffer + `?debug=1` panel. See TECH_NOTES |
| `src/rag/saveMigrator.js` | `migrateSave(save, lang)`, `migrateSaveFields`, `SAVE_SCHEMA` — brings a pre-v1.4.0 save up to `groupId`/`worldId`/`roster`/`birthYear`, reproducing what it already implied; plus `correctBirthYear`, the one value it deliberately does **not** fix |
| `src/config/constants.js` | Numeric game constants (see below) |
| `src/config/modelConfigs.js` | 4 providers; Aliyun `ALIYUN_FREE_ROUTE`, `ALIYUN_PAID_MODELS`, `getAliyunModelParams`, `MODEL_PRICES_PER_1M`, `estimateCallCostUsd` |
| `src/config/platformConfig.js` | `PLATFORMS`, `platformsOf`, `filterSocialByPlatforms` — what each social platform IS. The world declares only WHICH ones it has |
| `src/config/stageConfig.js` | 7 relationship stages with score thresholds and display labels |
| `src/config/relationshipEvents.js` | Stage-transition special events |
| `src/config/achievements.js` | 5 ending achievements + trigger conditions |
| `src/i18n/` | `useTranslation(lang)` hook + `${var}` interpolation; zh/en/ko |
| `src/platforms/` | Overlay components: Bubble, Instagram, Weverse, Kakao, Save, Help, Map, MemberSelector, UsagePanel |
| `src/utils.js` | `STORAGE_KEYS`, `loadFromStorage`, `saveToStorage` (returns a boolean — see below) |

### State Management

* **React hooks only** — no Redux/Zustand
* **`useRef` for mutable non-rendering data**: `statsRef`, `memoryRef`, `preRoundSnapshotRef`, `phaseRef`, `inputRef`, `bottomRef`
* **Module-level globals** in `mainAgent.js`: `pendingSocialFeeds`, `pendingNotifications` (survive re-renders, reset on new game / retry)
* **Themes**: `THEMES = { dark, light }` map at the top of `App.jsx`; the active object is bound to `const th` and every inline style reads tokens off `th`. Adding a themed color means adding the key to **both** theme objects.

### localStorage keys

| Key | Source | Holds |
| --- | --- | --- |
| `rv_sim_saves_v13` | `STORAGE_KEYS.SAVES` | Save slots |
| `rv_sim_api_key_v11` | `STORAGE_KEYS.API_KEY` | API key |
| `rv_sim_form_v11` | `STORAGE_KEYS.FORM` | **Nothing. Dead key** — the constant is defined in `src/utils.js` and no file in `src/` reads or writes it. Found in v1.4.1 step 2 while looking for a legacy `form.pace` to seed the story mode from; the pace actually lives in save slots. This row used to claim "character setup form". Either wire it up or delete the constant — `docs/V140_PLAN.md` §18 carries the decision, beside `STAR_LEVELS` |
| `rv_sim_social_v11` | `STORAGE_KEYS.SOCIAL_FEEDS` | Social feed cache |
| `rv_sim_model_v11` | `STORAGE_KEYS.SELECTED_MODEL` | Provider id |
| `rv_sim_reasoning_v13` | `STORAGE_KEYS.REASONING` | Deep Thinking on/off |
| `rv_sim_aliyun_mode` | `STORAGE_KEYS.ALIYUN_MODE` | `"free"` / `"paid"` |
| `rv_sim_aliyun_paid_model` | `STORAGE_KEYS.ALIYUN_PAID_MODEL` | Paid-mode model id |
| `rv_sim_aliyun_route` | `STORAGE_KEYS.ALIYUN_ROUTE` | Free-route state `{keyHash, exhausted, unavailable, lastModel}` |
| `rv_sim_qwen_submodel` | inline literal | **Legacy, read-only** — seeds `ALIYUN_PAID_MODEL` once for players upgrading from the 3-sub-model UI |
| `rv_sim_theme` | inline literal | `"dark"` / `"light"` |
| `rv_sim_timespeed` | inline literal | `"slow"` / `"default"` / `"fast"` |
| `rv_sim_story_mode` | inline literal | `"free"` / `"romance"` / `"pressure"` / `"dramatic"`. Absent until the player opens Settings or loads a pre-v1.4.1 save, which **seeds** it from that save's `form.pace` through `resolveStoryMode` — a seed, not a migration |
| `rv_sim_fontscale` | inline literal | `1` / `1.25` |
| `rv_sim_language` | inline literal | `zh` / `en` / `ko` |
| `rv_sim_group` | inline literal | Selected group id |
| `rv_sim_world` | inline literal | Selected world id, from the Setup picker (v1.4.1 step 3). Written **only after that world has loaded**, so a world that fails to fetch is not the one the next session opens on; an id the index no longer lists falls back to `DEFAULT_WORLD_ID` |
| `rv_sim_cast_custom_v14` | `STORAGE_KEYS.CAST_CUSTOM` | Player-authored member palette, capped at 20 |
| `rv_sim_rosters_v14` | `STORAGE_KEYS.ROSTERS` | Player-saved rosters, capped at 20 |
| `rv_sim_cast_photos_v14` | `STORAGE_KEYS.CAST_PHOTOS` | `{memberId: dataUrl}`, 256x256 WebP, capped at 30 |
| `rv_sim_cast_walls_v14` | `STORAGE_KEYS.CAST_WALLS` | `{memberId: dataUrl}`, 360x540 WebP (2:3), capped at 8 |
| `rv_sim_debug` | inline literal | `"1"`/`"eruda"` — the on-device console, set by `?debug=1`. Read before React mounts, so deliberately not in `STORAGE_KEYS` |

Note the inconsistency: only nine keys live in `STORAGE_KEYS`; the rest are inline string literals in `App.jsx`. Prefer moving new keys into `STORAGE_KEYS`.

## Key Constants (`src/config/constants.js`)

```js
GAME_YEAR           = 2026 // renders the player's age FROM her birth year; also the
                           // legacy fallback that derives one when a save has none
PLAYER_BIRTH_YEAR_MIN = GAME_YEAR - 80   // + validPlayerBirthYear(): one range, two
PLAYER_BIRTH_YEAR_MAX = GAME_YEAR - 18   // writers (Setup, and the in-game correction)
HISTORY_FULL_MAX    = 3    // N: full-story entries before collapse trigger
HISTORY_PRUNE_BATCH = 15   // batch-prune this many oldest summaries when total summaries > N*3
KKT_MAX             = 10   // Q: KakaoTalk messages stored per member
KKT_THRESHOLD       = 30   // affection score required to unlock KKT per member
MAIN_INITIAL_AFFECTION       = 12
SUB_INITIAL_AFFECTION_MIN    = 5
SUB_INITIAL_AFFECTION_MAX    = 10
AFFECTION_MAX_DELTA          = 8    // per member per round, both directions
NPC_APPEARANCE_CHANCE        = 0.3  // DEAD - not imported anywhere
NPC_COOLDOWN_ROUNDS          = 2    // DEAD - not imported anywhere
```

`NPC_APPEARANCE_CHANCE` and `NPC_COOLDOWN_ROUNDS` are **not referenced by any module**. Either wire them up or delete them — do not document them as live behavior.

**`npcAppearances` and the `[NPC Appearances]` block were a third such mechanism, and are gone.**
`executeRound` did `const npcAppearances = { ...memory.npcAppearances };` and wrote it back
**unchanged** — nothing anywhere added an entry, so the object was `{}` for the life of every save,
`buildDynamicTail`'s `Object.keys(...).length > 0` guard was never satisfied, and the example line this
file used to show had never been sent to any model. Section 8's `2-round cooldown` therefore named a
cooldown the model was given no information to apply.

Replaced in step 7 by `[Rounds Absent]`, which counts every member including the NPCs from
appearances observed in the prose — see *3-Tier Prompt Structure*. An old save may still carry
`npcAppearances`; nothing reads it.

---

## Add-on Features (v1.4.4)

| Feature | State | Persisted as | Wiring |
| --- | --- | --- | --- |
| Deep Thinking | `reasoningEnabled` | `rv_sim_reasoning_v13` | -> `executeRound` -> `callLLM` per-provider flags |
| Story Mode | `storyMode` (`free`/`romance`/`pressure`/`dramatic`) | `rv_sim_story_mode` | -> `executeRound` -> `buildTailRules` -> the world's `modes[id]` rule, appended to the **dynamic tail**, never the system prompt |
| Time Speed | `timeSpeed` (`slow`/`default`/`fast`) | `rv_sim_timespeed` | -> `executeRound` -> `buildTailRules` -> a `[Time Speed]` line in the **dynamic tail**, never the ledger |
| Day/Night | `theme` (`dark`/`light`) | `rv_sim_theme` | `THEMES[theme]` -> `th` token object, threaded into every overlay as a `theme` prop |
| Text size | `fontScale` (`1`/`1.25`) | `rv_sim_fontscale` | `Math.round(base * fontScale)` on story/option text; passed to Bubble and Kakao overlays |
| Export | `exportClipboard` / `exportTxt` / `exportPdf` | — | Shares `extractStoryText()`; PDF renders themed HTML into a hidden iframe and calls `print()` |
| Help Center | `showHelp` | — | `HelpOverlay.jsx`, 4 tabs x 3 languages; the Errors tab reads `t.errors` so it always matches the in-game notices |

**Placement is what makes both dials free, and `buildTailRules` is the one function that places them.** Both lines are concatenated onto the `[CURRENT STATE]` message, *after* the cached system prompt and ledger, so toggling either mid-run costs nothing in cache terms. Never move either into `buildSystemPrompt` or `buildHistoryLedger` — Layer J asserts the static prompt is byte-identical across a change to each, paired with the assertion that the tail is what moves instead, because either half alone is vacuous.

**They used to share one label, and that was the bug v1.4.1 step 2 had to avoid.** Time Speed wrote `[Pacing] slow — …`, and the story-mode rule was about to write a second, different quantity under the same name. That is worse than the `[Stage Changes]` id-vs-name case, which was two labels for one quantity: **two quantities under one label leaves the model to work out which line means what.** They are `[Story Mode: …]` and `[Time Speed]` now, renamed in the same commit. No golden pins either, because the tail is the always-miss message.

**`free` sends a rule; it does not send nothing.** A mode that omitted its line would strip a free-mode game of the slow-burn texture every `慢热现实向` player has today, and would be indistinguishable from the wiring being broken. An unrecognised mode id — localStorage can hold anything a previous build left there — resolves to `free` rather than to silence.

**Export text extraction.** `storyRounds()` filters `messages` for visible, non-error assistant turns, splits on `\n\n`, and **classifies** each paragraph: one starting with `╔` or `╚` is the stats box, one matching `/^[A-D]\.\s/` is an option line, the rest is prose. If the stats-box glyph or option prefix format ever changes, this filter breaks silently.

**It returns `{n, statsBox, text}` rather than dropping the box, since v1.4.1.** The PDF
wants the round header the player actually reads — the affections, the three stats, the
scene, the chapter — and clipboard and TXT do not: the box is a 30-column frame drawn
out of box-drawing characters, and it only lines up in a fixed-width font, which neither
of those two controls. **The way to serve both from one filter is to return the parts
separately, not to grow a second filter beside it** — which is what `extractStoryText`
and `exportPdf` each having their own copy already cost this repo once. `text` is
byte-identical to what it always was, which is what says clipboard and TXT did not move.

In the PDF the box **is** the round header: a `<pre>` in a fixed-width family, in place of
the `Round 9` bar, which survives only for a message that has no box at all (a story the
player edited down, or a turn written before the box existed). Printing both would be two
answers to one question — the box already carries the round number. The scene name is the
model's text and now reaches the header, so **one escaper covers both halves of a card**.

**It is ONE function because it was two, and they had drifted.** `extractStoryText` (clipboard, TXT) and
`exportPdf` each carried a copy, and the PDF one filtered only `!m.hidden` — so every "tap ↺ Retry"
notice landed in the exported PDF, which the v1.3.2 fix above says never happens. It also numbered its
rounds off that different filter, so one error notice in a run numbered the same round differently in
TXT and in PDF, and it missed the `╚` fix when that was made. **The guard was written against the copy
that was correct and could see none of it** — it now reads the single definition and counts the call
sites.

**And `╚` is in that filter because an absent value was rendered as an empty line.** `buildStatsBox`
put an empty string where the sub-member line goes when a run has no subs, which split the box into two
`\n\n` paragraphs — so the bottom border survived a filter that only dropped `╔`. Fixed at the source
with `filter(Boolean)`; the `╚` clause stays as the backstop, since this filter is the thing that breaks
silently. The `🎭` chapter was raw too — `start` / `develop` / `climax` / `resolve` printed untranslated
beside four fields that all carry a localized label — and is now `t.stats.chapters`, with a guard that
`getChapterByRound` returns only the four the tables cover.

---

## 1-Tier Stepped Window Memory Architecture

### Memory Shape

```js
// createEmptyMemory() - src/agent/memoryPool.js
{
  playerStats:       null,   // {selfId, secrecy, mood, week, scene, chapter}
  affections:        {},     // {memberId: number}
  topMemberId:       null,
  history:           [],     // unified ledger - [{round, type, text, choice?, summary?, keepFull?}]
                             //   type:'summary' -> text is ~100-char English sentence
                             //   type:'full'    -> text is full story, choice is player pick,
                             //                     summary is the ~100-char collapse target
                             //   keepFull       -> player edited this story and it has not been
                             //                     sent yet; spare it from exactly one collapse
  kktMessages:       {},     // {memberId: [{sender, content}]} max Q per member
  stageChanges:      [],     // [{memberId, from, to}] last 10
  memberAppearances: {},     // {memberId: [roundNums]} last 10
  npcAppearances:    {},     // {memberId: lastRoundNum}
  places:            [],     // [{name, round}] places the MODEL invented, observed from
                             //   its own `scene` line. CLIENT-SIDE ONLY - it is read by
                             //   the map picker and reaches no prompt message at all.
                             //   See "The map grows and the prompt does not"
}
```

### Round-by-Round Cache Trace (N=3, static system prompt omitted)

Notation: `Fx` = full story from round x (~500 tokens), `Sx` = collapsed summary of Fx (~25 tokens).
Timing: collapse runs at **start** of round before building the ledger; new story is appended **after** LLM returns.

```
Round | Ledger sent to LLM   | Ledger cache status                | History after round
------|----------------------|------------------------------------|---------------------
R0    | (empty)              | -                                  | [F0]
R1    | F0                   | MISS (first appearance)            | [F0 F1]
R2    | F0 F1                | F0 HIT . F1 MISS                   | [F0 F1 F2]
R3    | collapse->[S0 S1 S2] | ALL MISS - shorter tokens at pos 0 | [S0 S1 S2 F3]
R4    | S0 S1 S2 F3          | S0 S1 S2 HIT . F3 MISS             | [S0 S1 S2 F3 F4]
R5    | S0 S1 S2 F3 F4       | S0 S1 S2 F3 HIT . F4 MISS          | [S0 S1 S2 F3 F4 F5]
R6    | collapse->[S0..S5]   | S0 S1 S2 HIT . S3 S4 S5 MISS *     | [S0..S5 F6]
R7    | S0..S5 F6            | S0..S5 HIT . F6 MISS               | [S0..S5 F6 F7]
R8    | S0..S5 F6 F7         | S0..S5 F6 HIT . F7 MISS            | [S0..S5 F6 F7 F8]
R9    | collapse->[S0..S8]   | S0..S5 HIT . S6 S7 S8 MISS *       | [S0..S8 F9]
R10   | S0..S8 F9            | S0..S8 HIT . F9 MISS               | [S0..S8 F9 F10]
R11   | S0..S8 F9 F10        | S0..S8 F9 HIT . F10 MISS           | [S0..S8 F9 F10 F11]
R12   | collapse->[S0..S11]  | S0..S8 HIT . S9 S10 S11 MISS *     | [S0..S11 F12]
R13   | S0..S11 F12          | S0..S11 HIT . F12 MISS             | [S0..S11 F12 F13]
R14   | S0..S11 F12 F13      | S0..S11 F12 HIT . F13 MISS         | [S0..S11 F12 F13 F14]
R15   | collapse->[S0..S14]  | S0..S11 HIT . S12 S13 S14 MISS *   | [S0..S14 F15]
```

**Pattern at each collapse (`*`):** the 3 newly-converted `S`s occupy token positions previously held by 3 large `F`s, so they always miss (S ~25 tokens, F ~500 tokens — positions diverge immediately). The already-summarised prefix `S0..S(k-3)` stays byte-identical and keeps hitting.

**Convergence:** the stable-hit `S` prefix grows by 3 entries every N rounds. By R30, ~24 `S`s are permanently cached (~600 tokens). The 3 fresh-miss `S`s add only ~75 tokens of miss per collapse — a shrinking fraction of the total ledger. Combined with the always-cached ~5,500-token system prompt, steady-state measured hit rate lands at **~95.8%**.

### Collapse Logic (`collapseHistoryIfNeeded`)

Called at the **start** of each round, before building the prompt, **on a clone of the caller's memory**. It mutates in place, so running it on the live object meant a failed LLM call left the full stories permanently collapsed — the player's next attempt sent a degraded ledger. `executeRound` now clones first and only hands the clone back on success.

Counts `history.filter(h => h.type === 'full').length`. If `>= HISTORY_FULL_MAX`:
- Rebuild every `full` entry as `{round, type:'summary', text: h.summary || h.text.substring(0,150)}` — the long story text is dropped
- **Except entries flagged `keepFull`** — see below
- Do NOT remove or reorder entries — the prefix must stay byte-identical for entries that existed in the previous round
- Batch prune: if total summary count exceeds `HISTORY_PRUNE_BATCH * 3` (45), drop the oldest `HISTORY_PRUNE_BATCH` (15) summary entries — one miss penalty every ~45 rounds

**`keepFull` is what makes an edited story survive to the model.** The collapse runs *before* the ledger is built, so an entry the player edited can be converted to its summary in the very round it was supposed to be sent — and `saveStoryEdit` deliberately keeps the *original* summary, so the edit is discarded having never left the browser. With `HISTORY_FULL_MAX = 3` this hit **every third round**: history `[F0 F1 F2]`, player edits `F2`, next round collapses all three. Shipped broken from the day edit controls landed; fixed in v1.3.6.

The flag is set by `saveStoryEdit`, honoured by `collapseHistoryIfNeeded` (which spares the entry), and cleared by `updateMemory` when the next entry is appended — that append happens at the end of the round the entry was sent in, so "cleared" and "has been delivered at least once" are the same moment. The next collapse then takes it normally.

It costs one full entry (~500 tokens) for about two rounds, and only when the player actually edits. It adds **no** new cache miss: a collapse already invalidates every position from the first converted entry onward, so sparing one entry inside that window changes nothing that was still hitting. Old saves have no `keepFull` on any entry, which reads as `false` — legacy memory collapses exactly as before.

### Update Flow (`updateMemory`)

Called at the **end** of each round. Appends `historyEntry: { round, type:'full', text: story, choice: playerChoice, summary: parsed.summary }` to `history[]`, and clears `keepFull` from every earlier entry (see Collapse Logic). KKT messages normalized to `{sender, content}` before append and capped at `KKT_MAX` per member. `stageChanges` and `memberAppearances` capped at last 10. No FIFO truncation on `history` — the ledger is append-only by design.

### 3-Tier Prompt Structure

```
Message 1 - system (STATIC, 100% cache hit after R1):
  buildSystemPrompt() -> rules, lore, all member profiles, identity + pace blocks, JSON schema

Message 2 - user (HISTORY LEDGER, append-only):
  "[HISTORY]\n" + buildHistoryLedger(memory) ->
    Round 1: <~100-char summary>      (the player's number, index + 1 - v1.4.4 P12)
    Round 2: <~100-char summary>
    ...
    === Round 4 ===
    <350-450 word full story>
    Choice: B
    === Round 5 ===
    <350-450 word full story>
    Choice: A
  (falls back to "[HISTORY]\n(no history yet)" on round 1)

Message 3 - user (DYNAMIC TAIL, always cache miss, kept small):
  "[CURRENT STATE]\n" + buildDynamicTail(memory, members, roundMemberIds, language) ->
    [Player Status] SelfId:38 Secrecy:97 Mood:82 Scene:practice room
    [Affections] 🐰Irene:24(Acquaintance) | 🐻Seulgi:12(Stranger)
    [Stage Changes] 🐰Irene: Stranger→Acquaintance
    [Rounds Absent] 🐰Irene:0 | 🐻Seulgi:4 | 🐥Joy(npc):6
    [KKT Channels] Irene:unlocked | Seulgi:LOCKED
    [KKT Messages - round-relevant members]
    Irene: hey are you free tonight | you okay?
  + "[Chapter] 承 development (rounds 7-14): this is round 7" — buildChapterLine, the
    chapter of the round being GENERATED (v1.4.4 P2)
  + "[Prologue] ..." — buildPrologueLine, ROUND 1 ONLY (v1.4.4 P6)
  + "[Story Mode: Free] ..." — the world's rule for the current mode, always sent
  + "[Random Events] this round has one|none this round" - drawn by drawEvent (v1.4.4 P8)
  + optional "[Time Speed] slow|fast ..." line, only when it is not the default
  (both from buildTailRules, which is the only thing allowed to place them)
  + "Player choice: B\n\nGenerate the next round. Output ONLY valid JSON."
```

**`[Rounds Absent]` is the fact that makes section 3's rotation rule applicable.** Section 3 has
always said *"sub members need meaningful scenes every 2-3 rounds. Do not let any romanceable member
disappear for more than 3 rounds"*, and step 7's live runs showed it comprehensively ignored — Seulgi
absent 9 rounds in one 25-round game, Wendy appearing **once in twenty** in another, and an NPC the
prompt says must appear in the background appearing never.

**The model was not refusing the rule; it could not apply it.** Nothing in the prompt said how long
anyone had been away. `[Affections]` is a score, not a history, and `[NPC Appearances]` never rendered
(see Key Constants). So the tail now counts it:

```
[Rounds Absent] 🐰Irene:0 | 🐻Seulgi:4 | 🐿️Wendy:never | 🐥Joy(npc):6 | 🐢Yeri(npc):2
```

The number is **rounds of absence**, so `0` means she was in the previous round and `4` means she has
missed the last four — the unit section 3's rule is already written in ("more than 3 rounds"). The line
is omitted entirely on round 1, when every value would read `never`.

Same shape as `[KKT Channels]`: **the tail carries the fact, the static section carries the rule, and
the rule points at the line.** Duplicating the rule into the tail would be the two-rules-disagreeing
failure this prompt keeps hitting.

### Two ways into a run, and one function that starts one

`startNewGame` and `loadSave` both begin a run, and **everything the previous run left
behind has to be cleared on both paths.** They were separate lists of setters and they
had drifted three ways by v1.4.1 — reported from hand play as *"the socials and the
Kakao notices all carry across"*:

- **New Game POPPED the module-level social buffer and merged it in.** Round 1 has no
  previous round of its own, so what `popPendingSocial()` returns there is the
  *abandoned* run's last round — and the merge keeps whatever it is handed
  (`instagram: feed.instagram || p[mid]?.instagram`) against an `initFeeds` entry that is
  `null`. So a new game opened with somebody else's Instagram post and her notification
  dots already on the phone. `loadSave` had cleared it since v1.4.0.
- **And it then wrote that run's feeds into the next save slot**, which is why the
  symptom looked like it survived a save/load cycle: the pollution happened at New Game
  and was persisted by the next save. A slot written before this fix keeps it.
- **`loadSave` left `topMember` pointing at the other run's member**, so the top bar
  showed her face and read her affection against an id the loaded save has no entry for
  — `getAffection` returns 0, so she also showed as a Stranger.
- **Neither closed an open achievement or special-event modal.**

`beginRun({ socialFeeds, kktMessages, kktUnlocked, topMember })` is the one writer.
**Everything it touches is cleared unconditionally and what a run STARTS with is passed
in**, and that asymmetry is the point: forgetting a surface in the argument list leaves it
empty, which is the harmless direction, where forgetting a setter at one of two call sites
leaks the other run's state into this one — which is what happened here twice. Smoke
asserts each surface on `beginRun` **and** that neither call site clears anything by hand.

`popPendingSocial()` now has exactly one caller, `sendMessage`, which is the only place a
previous round exists to display. The guard counts it.

### Save Compatibility (`isLegacyMemory`)

`rv_sim_saves_v13` is the current standard. On `loadSave`, if `memory.history === undefined`, memory is reset to `createEmptyMemory()` (pool wiped) while stats, form, and affections are still restored. Prevents the old `summaries`/`fullStories` (v12) and `storyRounds` (v11) shapes from crashing the engine.

**Since v1.4.0 `loadSave` also migrates the slot** through `saveMigrator.js#migrateSave`, which
fills `schema: 14`, `worldId`, `groupId`, `roster` and `form.birthYear` for any save written
before the split. The key stays `rv_sim_saves_v13` — bumping it would orphan every existing save,
which is the opposite of the requirement — so `schema` is how a reader tells the shapes apart.
Migration runs at read time, in place, and **reproduces rather than fixes**: every value written
is one the save already implied, so a game in flight builds a byte-identical prompt before and
after. Read `docs/TECH_NOTES.md`, *"Migration that reproduces rather than fixes"*, before changing
any of it; the birth year in particular is preserved *wrong* on purpose.

**The load is all-or-nothing, and the order in `loadSave` is load-bearing.** Identifying a
pre-v1.4.0 save's cast means fetching the library, so the load can fail; every fallible step
therefore completes before the first setter runs, or a failure leaves the player in a game
assembled out of two different saves. `phaseRef.current` is pinned to `"game"` *before*
`setSelectedGroup`, because the group effect reads it to decide whether to clear the chosen
members and the effect that mirrors `phase` into it has not run yet — loading from the cover page
would otherwise wipe the cast that was just resolved. A roster that cannot be resolved aborts with
a notice rather than falling into `loadGroupIndex`'s hardcoded Red Velvet entry, which is the
swallow that made the v1.3.5 path bug invisible for a release. Smoke Layer G guards each of these.

**This closes a bug that predates v1.4.0: save slots recorded no group.** `loadSave` never set
`selectedGroup`, so loading a TWICE save while Red Velvet was selected yielded Red Velvet's
`groupConfig` under TWICE member ids — no crash, thanks to optional chaining all the way down,
just a prompt whose main member was `undefined`.

**`preRoundSnapshotRef` must be cleared on every game boundary.** It holds the pre-round state that ↺ Retry and the ✎ edit controls restore, and it is set only by `startNewGame` and `sendMessage`. `loadSave` must null it: otherwise a player who plays game A and then loads save B sees ↺ on B's last message, and tapping it restores **game A's** stats and memory into B. This also gives the intended gating for free — after loading a save there is no ↺ and no ✎ until one round has been played in this session, so the edit features can never touch a history entry they did not create.

**Model settings are not part of a save.** Save slots hold no provider or model field, so model-layer changes cannot break them — keep it that way. Legacy *settings* are handled at read time instead: `rv_sim_model_v11 = "qwen"` still resolves (the id never changed), `rv_sim_qwen_submodel` seeds the paid pick through `resolvePaidModel` (unknown or removed ids -> `qwen3.8-max`), `rv_sim_aliyun_mode` accepts only `"paid"` and otherwise means `"free"`, and `aliyunRoute.js` treats any malformed `rv_sim_aliyun_route` as empty. `test/smoke.mjs` Layer G guards all four.

---

## LLM System Prompt

Built in `mainAgent.js#buildSystemPrompt()`. Enforces:

1. **Language lock** — output language tied to the player's UI language (`zh`/`en`/`ko`)
2. **JSON schema** — valid JSON every round, no markdown fences
3. **Member personality matrices** — injected from group RAG JSON
4. **Identity block** — one of the 7+1 identities, selected at build time. The pace block sat beside it until v1.4.1 step 2, which moved it to the dynamic tail as the story mode: a setting the player can change mid-run must not sit in the cached prefix
5. **Story arc** — four chapters by round, 起 1-6 / 承 7-14 / 转 15-24 / 合 25+, each with its goal, the world's texture and its end beat; the tail's `[Chapter]` says which one this round is in (v1.4.4 P2, below)
6. **Unknown-character rule** — only the members in MEMBER PROFILES and the player have names; everyone else is a role from the world's archetype list, with no name of any kind and at most one visible detail, and a recurring stranger is the same role with the same detail. **Rewritten in v1.4.4 (P9)** because the old wording, *"only characters listed in MEMBER PROFILES may appear by name"*, is a permission about the cast and reads as silence about everyone else, and Yuhan's play had the model inventing strangers' names. Ownership plus a substitute is the shape that fixed the Kakao rule, applied again
7. **summary field** — always English, ~100 chars, stored on each `history` entry as the collapse target and mutated into `text` when that entry collapses `full` -> `summary`. Never shown to the player.
8. **Speaker contract + address protocol** — who "I" and "you" are, and what each character is allowed to call the others. See below.
9. **What moves each stat in THIS world** — section 10 prints one line per stat from `world.statNotes`. The stat *keys* are permanent and their *labels* are i18n's; the world supplies only the prose saying what raises and lowers them, which is the half no other file holds a copy of.
10. **Canon places** — section 11, from `world.places`, names only. The opening scene and the place descriptions were deleted on 2026-10-01; see *Where she is decides who is there*.

### The address ladder: age x position x closeness (v1.4.4 P1)

**The blend above shipped a new employee calling her CEO 欧尼 from round 1**, found in Yuhan's
chaebol play. Each member's Address line was computed from birth year alone, the work title was one
"Work override" sentence in REGISTER far from the members it applied to, and a specific per-member
line beats a general note. REGISTER also said the direction "NEVER reverses, at any affection
level" and that a near-age member "is already casual while the score is still low" - the opposite
of a relationship that has to be earned. All three sentences are **deleted, not added beside**.

**Now the code computes the forms and the model reads one.** Every member has two Address lines,
one per direction, each with three rungs chosen by HER stage in `[Affections]`:

```
  Address, 新人 -> her: R1 "代表nim" | R2 "欧尼" or "珠泫欧尼" in private, "代表nim" in front of others | R3 "珠泫" or a couple's word; in front of others "代表nim"
  Address, she -> 新人: R1 "新人xi" | R2 "新人" | R3 "新人" or a couple's word. She must NEVER call 新人 "欧尼".
```

- **R1 = 0-30, R2 = 31-65, R3 = 66+**, named in REGISTER by the localized stage labels the tail
  prints (`rungStagesFor` in `stageConfig.js`), so the rule and the fact use one vocabulary.
- **Direction stays hard:** only the younger ever says unnie, only the junior in position uses a
  title. A title sits on the junior's side at R1 and stays the public form at every rung, which is
  where secrecy comes in: a private form slipping out in front of others is a risk the story may use.
- **Every step happens on screen, as a beat**, never silently; a rung is never skipped; going back
  up is a deliberate cold move. Her Private Personality decides who moves first and how soon -
  that is where the old blend survives.
- **A couple's word is the story language's own** (the one place "transliterate, never localize"
  does not apply). The clause forbidding a transliterated Korean word renders only outside ko,
  because in ko the native word IS Korean - the ko fixture showed it on the first read.
- **An NPC has no score**: R1, then R2 once the story makes them familiar, never R3.
- What is left of the work title in REGISTER is one `Title:` line giving its reason (`because`,
  `addressContext`), since no ladder says why the title exists.

**Names: given names outside the idol world (Q2).** In `kpop_idol` a member is her stage name in
dialogue and narration, as before. Elsewhere NO ONE IN THIS CAST IS AN IDOL, so dialogue uses her
Korean **given name** (`珠泫`, `Ju-hyun`, `주현`) and narration her **real name**, full or given.
The SPEAKER CONTRACT's narration example used to teach the stage name in every world, which in a
chaebol run contradicted the not-an-idol rule two sections earlier: the one name the example taught
was the one the prose must not use, so the model narrated with a title (`裴代表nim走了过来`). It now
follows the world and shows the stage name and the title as the wrong answers.

`givenNameOf` (`memberNames.js`) derives the given name from `name_kr` exactly as `membersNamedIn`
always did, and a `given_name` field overrides it for the 17 (member, language) pairs where that is
wrong - the Japanese members in zh, Lisa, Lily, Ningning, Tzuyu in ko (`docs/V144_PLAN.md` P1b).
It is on `parseGroupConfig`'s whitelist in the same commit, and `membersNamedIn` reads the same
helper, so `[Rounds Absent]` sees a member the prose calls `Aeri`. Like `family_name`, it is a fact
and sits outside the zh review.

**Found on the way:** the own-name rule printed `"undefined"` for a custom main with no `name_kr`.

All six goldens moved by exactly these lines and the diff was read. 17 mutations, 17 RED. **Not
verified live**: whether models actually walk the ladder, and step down on screen, is a playthrough
question, and the next measurement for it.

### What a stage allows, and which chapter the story is in (v1.4.4 P2)

**Section 9 named the stages and said nothing about what each one allows**, so a member at 12 had
no statement anywhere that she should not already care - and in Yuhan's chaebol play Irene looked
after the new employee on day one (F3). **Section 3 printed all four phases every round and never
said which one the round was in**, while the stats box showed the player a chapter the model was
never told (F4). Both come from the design doc (`docs/.dating-simulator.txt` §九 and 起承转合).

- **Section 9 now carries one behaviour line per stage** (`STAGE_BEHAVIOUR` in
  `stageConfig.js`), printed beside the localized stage name the tail uses, plus the design doc's
  three prohibitions: nobody is drawn to the player without a reason the story has shown; no
  confession or confirmed relationship before the Flirting stage has been played on screen; not
  every round is sweet. **A member behaves by HER OWN stage**, never by the chapter.
- **The chapters live ONCE, in `src/config/chapters.js`**: id, label (起承转合), round range, the
  design doc's goal and end beat. `getChapterByRound` (the stats box) and `buildChapterLine`
  (the tail) both read it, so the two cannot disagree about which chapter a round is in.
- **A world supplies only its texture, keyed by chapter id** - `world.phases` is a map like
  `world.modes`, and `parseWorld` throws on a missing id. It used to be an array carrying its own
  `from`/`to` in all twelve world files: a second copy of the boundaries `getChapterByRound`
  hardcoded, tied to it by nothing. **Deleted, not guarded.**
- **The fact is in the tail, the rule in section 3, and the rule points at the fact**:
  `[Chapter] 承 development (rounds 7-14): this is round 9`, plus *the last round of this chapter*
  on 6, 14 and 24, because that is where an end beat has to land.
- **Phase 4 said "Established relationship" in every world**, which told the model the
  relationship exists by round 25 whatever the scores say. Deleted.

**Reading the rendered diff found the ex-girlfriend case for the third time.** The first draft of
起 said *the distance of a first meeting* and its end beat *remembers her name for the first time*,
and 有印象 said *starts remembering her name* - all false for the one identity whose premise is a
shared past. All three are reworded to hold for both kinds of start (*distance at the start*;
*reaches toward her of her own accord*; *keeps track of her*), so no identity check was needed.

**Fixed in P12: the model saw three numberings of one round.** The ledger labelled a round by its
stored index from 0 (`R0:`, `=== Round 4 ===` for the fifth), `[Player Status] Round:` printed
the rounds COMPLETED, one behind the round being written, and `[Chapter]` counts from 1 like the
player's stats box. And since P1, `R1`/`R2`/`R3` are the address ladder's rungs, while the
ledger wrote a round's summary as `R1: ...` - two quantities under one label. Now the ledger
renders the player's number (`h.round + 1`) and summaries read `Round N:` like full entries, and
`Round:` is gone from `[Player Status]`, since `[Chapter]` already carries the round. **The
stored `round` values are unchanged**, because `[Rounds Absent]`, `memberAppearances` and the
map read them and agree with each other. Every existing save's ledger misses the cache once, on its
first round after the update. Asserted as agreement - the ledger's labels run 1..k and `[Chapter]`
names k+1 - on a ledger built the way play builds it, with both summaries and full entries: the
first fixture collapsed everything to summaries, and a mutation of the full-entry label stayed GREEN
until it was rebuilt. 6 mutations RED.

**Fixed in P11:** every world's romance rule said *"Members flirt during Flirting stage"* in
English in all three languages, while a zh tail prints 暧昧期 - two names for one stage, the
`[Stage Changes]` id-vs-name shape, and a second copy of a rule section 9 now states. It now says
*"Members flirt once their own stage in [Affections] allows it (section 9), never before"*: it
names no stage, so no language can disagree, and it points at the rule instead of copying it. A
guard derived over every world, language and mode fails on any stage name from another language's
ladder; 4 mutations RED. Tail only, so no golden moved.

**Typical events were REMOVED on 2026-10-21 (Yuhan's call, after a measured comparison).**
Each identity used to carry a `典型事件` list: examples of the kind of moment the relationship
can have, meant as a direction rather than a plot. They went through three shapes, and each one
produced its own kind of sameness:

- **In the static background** (v1.4.3 and before), every event, the intimate ones included,
  was in front of the model from round 1. A model shown a beat is primed by it: a live run
  staged the new employee's template folder in **round 1 in 3 of 3** runs.
- **In the tail, unlocked by stage** (P3), an event was staged the very round it unlocked, 4 of
  4, and then echoed for up to six rounds.
- **In the tail, offered once with a cooldown** (P3b, `eventSchedule.js`), the model took
  every offer the round it appeared in 4 of 6 runs, so events landed on R2, R6, R10 and R14: a
  clock set by the cooldown. **A line at the end of the context reads as a cue**, whatever the
  rule beside it says.

**And removing them cost nothing measurable.** 18 runs of 14 rounds, three arms: cross-game
4-gram overlap was 0.045-0.053 in every arm, and the `none` arm read as directed stories. The
identity background, `[Chapter]` and the stage rules supply the direction; what makes two games
of one identity alike is the identity premise, which all three arms share. See
`docs/V144_PLAN.md`, *P3b results* and *P3 removed*.

So `identity.events`, the `[Possible events]` tail line, section 6's events rule, the schema's
`event` key and its RULES line, `eventSchedule.js` and `memory.events` are all gone, and the
82 event strings left the world files. **`parseWorld` throws on an `events` field**, because a
field with no reader is the shape this file tracks seven times; a smoke guard also feeds a
sentinel event through the prompt builders. An old save may still carry `memory.events`;
nothing reads it. What stays from P3 is the background split (`[身份背景]`, 优势/劣势,
`[初见]`) and `narrationNameOf` in identity text: her real name outside the idol world, as
P1's narration rule says, where it used to print `集团继承人Irene` in every world.

All six goldens moved by exactly these lines and the diff was read. 18 mutations, 18 RED, one only
after a fix: dropping a stage's behaviour line CRASHED the suite twice - first in the prompt builder,
then in the guard itself (`STAGE_BEHAVIOUR[i].split` with no null-safety, the trap recorded under
*A restaging is an OVERLAY*). **Not verified live**: whether a model now holds a Stranger at a
distance, and lands an end beat in a chapter's last round, needs a playthrough.

### The translationese bug: in-language text in a prompt is a style example

**Reported after v1.4.2, fixed in v1.4.3** (released 2026-10-02; Yuhan's play on the released
build confirms it). The generated Chinese read like machine translation. Five lessons, in the order
they cost time:

**1. It was not a commit, so bisecting versions could not find it.** The first plan was to
diff v1.3.9 against v1.4.2 and blind-read each difference. Blind read 4 put v1.3.9, v1.4.2 and two
bisection arms within sampling variance of each other: **translationese is a RATE every version
has**, and n=6 per arm cannot resolve a difference smaller than the noise between two runs of the
same code. The question that found it was *where in the text* the stiff Chinese sits, not *which
change* introduced it.

**2. The instrument was a native reader locating it, not a grader.** Yuhan's reading put it in
**the scene description each round opens on, and rigid metaphors**. Both mapped onto two rules
unchanged since v1.3.9 — *"Open with 1-2 sentences establishing scene atmosphere"* and
*"Literary, emotional, sensory details"*. An instruction to open on atmosphere, every round, asks
for stock imagery, and stock imagery is where a model's Chinese is weakest. Replacing them (read 5:
翻译腔 6 -> 3 of 12, openings on a person 0 -> 15 of 18, similes 5.6 -> 3.8 per 1k characters) is
what fixed it. No assertion written in advance could have located this; only reading could.

**3. Chinese text in the prompt teaches the register more strongly than any English rule.** The
place blurbs, the opening scene and the habit lines were Chinese written or translated by a model
— aphoristic contrasts like `声音清楚而表情不清楚` — and they sat in the static prompt as the
strongest style example the model got. Deleting them (and having Yuhan rewrite `[初见]` herself)
was the first change that her reads judged better.

**4. A style rule names the language's own tradition.** The shipped line asks for *"native
Chinese romance novel style"* in zh, English in en, Korean in ko — a rule describing Chinese
abstractly in English is what produced the translated voice in the first place. A plain-spoken,
one-simile variant tested better on 翻译腔 and was rejected by Yuhan as too casual: the target is
a register, not the absence of one.

**THE RULE THIS EARNS: no agent adds Chinese (or Korean) prose to the prompt, a world file, a group
file or a register without Yuhan's review.** That covers descriptions, openings, examples, rule
text and translations alike. English rule text is fine; any in-language narration is either
written by Yuhan or reviewed by her before it is committed. A model-written Chinese sentence in
the static prompt is not neutral data — it is copied, register and all, into every round. Korean
additionally needs a native reader; nobody on this project is one.

**Since 2026-10-19 the rule is enforced, not remembered — `docs/ZH_REVIEW.md`.** Every Chinese
string in the world, register and group files is collected by `scripts/zh-review.mjs`;
`docs/zh-review/ledger.json` holds the hash of each as Yuhan last saw it; smoke **Layer Z** fails
on any string whose hash is not there. She edits a Markdown sheet per file and ticks what she
approves, and only a tick moves a hash, so an agent that edits the JSON and runs `sync` stays red.
Baselined at 619 strings, all `pending`.

**5. Every cheap instrument failed before the reader worked, and each failed differently.** The main
session's own reading - a non-native one - called v1.4.2 and v1.3.9 equal and quoted v1.3.9's
similes as evidence. Yuhan's first read preferred v1.3.9 decisively, but it was **unblinded** (the
harness printed the arm labels), and the blind repeat of the same comparison put them level. A
dialogue-share proxy reversed sign between two runs of identical code (12.3 vs 17.7, then 13.5 vs
10.3). An LLM pairwise judge (`deepseek-v4-pro`, temperature 0, both orders) preferred the wrong arm
in 12 of 18 judgements and contradicted itself on 6 of 9 pairs. **For register the instrument is a
native reader, blind, with several samples per arm** - and asking her *where* the stiff sentences
sit, rather than *which version* is worse, is what turned a rate into a location.

### `buildSystemPrompt` must be a pure function of the save

**The same save must produce a byte-identical system prompt on every round, forever.** This is not a style preference — it is the load-bearing assumption behind the entire 3-tier design. `executeRound` rebuilds the system prompt from scratch every round (`mainAgent.js:579`) and relies on the ~5,500 tokens coming out identical so the provider serves them from cache. One character of drift costs the whole prefix.

It also has to hold *across sessions*: a player who saves at round 12 and loads a week later must get the same prompt, or their backstory changes under them.

**This was broken for one identity from the start.** `主线成员前女友` (the main member's ex-girlfriend) composes its background from two `Math.random()` picks — the breakup reason and the keepsake:

```js
- 你和${name}曾是学生时代的恋人，几年前因${reasons[Math.floor(Math.random()*4)]}分手
```

Because the whole prompt is rebuilt per round, those re-rolled **every round**, with two consequences. The cheap one is billing: the static prompt could never cache for these players, so they paid full input price on ~5,500 tokens every round while the architecture claimed ~95.8%. The expensive one is the writing — the model was handed a *different* breakup reason and a different keepsake each round, on a route whose entire premise is a shared past. A player would see the game contradict its own backstory with no way to describe the bug beyond "she keeps forgetting".

**Measured live, A/B, same model and settings in both arms** (Aliyun, `qwen3.8-flash` pinned, 8 rounds each, identity `主线成员前女友`, zh): the unfixed code drifted the static prompt in **7 of 8 rounds** and measured a **60.5%** cache hit; the fixed code drifted **0 of 8** and measured **87.2%** — **+26.7 points**. 87.2% matches the ~83% this project sees on Aliyun generally, which is the point: the fix restores normal behaviour rather than inventing any. Aliyun figures only; not comparable with the ~95.8% DeepSeek Official number (open question 2).

The fix keeps the variety and removes the drift: both indices are now derived from **`backstorySeed(form, mainId)`**, an FNV-1a hash over fields fixed at character setup (`name`, `age`, `pace`, `mainId`). Different playthroughs still get different backstories; one playthrough gets one backstory. It needs no new save field and no migration, so an old save simply stops drifting on its next load — which also means the reason and keepsake it settles on may differ from the one it last happened to roll. That is the intended trade: a stable past the player can rely on beats matching a value that was never stable to begin with.

**Anything else that reaches the static prompt must clear the same bar.** No `Math.random()`, no `Date.now()`, no locale-dependent formatting, no iteration over an unordered `Set` or object whose key order is not fixed by construction. Derive from the save, or compute once at setup and persist it. Smoke **Layer J** enforces this: it builds each prompt twice and asserts byte-equality across all 8 identities in all 3 languages, which is what fails against the unfixed code.

**`playthrough.mjs` now checks the same thing live**, rebuilding the system prompt each round and reporting `system-drift@<rounds>` plus a `static system prompt: N drifts across M rounds` summary line. It is the larger of the two cacheable blocks and had no invariant at all, while the smaller one (the history ledger) has had `prefixBreaks` since v1.3.2.

**Why this survived every live run ever made:** `playthrough.mjs` hardcoded `identity: "练习生"`, so 7 of the 8 identities — including the only one containing randomness — had never been played by any automated test. It now takes `--identity`.

### Golden prompt snapshots (`test/fixtures/`)

Three full system prompts are committed as text files and asserted byte-for-byte by smoke Layer J. They exist because **a prompt regression throws no error and fails no test** — it produces slightly different writing some weeks later, with nothing to bisect. That was the exact risk profile of the v1.4.0 cast/world/roster split, which moved large blocks of `buildSystemPrompt` into `worldLoader.js` while intending to change nothing.

**They earned their keep on that split.** The extraction was generated from the live literals and verified against the old code across 1,368 renders — every identity × language × name × seed, 0 mismatches — and the goldens still caught something that could not: a **trailing space** after the NPC-archetype list. No reviewer sees a trailing space; one character of drift costs the whole ~5,500-token prefix. They also now cover the world data itself, so editing `public/worlds/**` produces a located diff rather than silence.

| Fixture | Covers |
| --- | --- |
| `red_velvet-classic-zh.txt` | 5 members, main + 2 subs + 2 NPCs, zh token table (`欧尼`/`呀`/`nim`/`xi`), no work override |
| `twice-nine-en.txt` | the largest cast (9), en forms, `Staff` work override, both seniority directions |
| `red_velvet-solo-ko.txt` | one romanceable member and 4 NPCs, native ko forms, and the `主线成员前女友` backstory — so the randomness bug above cannot return silently |

**A golden file is not a specification, and a diff against one is not a failure.** It records what the code does today. When you change the prompt *on purpose*, run `node scripts/update-golden.mjs`, then **read the diff** — it is the review artifact, and the only place a one-word change to a shared rule shows up as the eleven lines it actually touched. Commit the regenerated files with the change that caused them.

Regenerating to make a red suite green, without reading the diff, converts the only prompt regression detector this repo has into a rubber stamp. If a diff appears that you did not intend, that is the tool working.

### LLM Output JSON Schema

```js
{
  "scene": "Location in player's UI language",
  "statChanges": { "selfId": 0, "secrecy": 0, "mood": 0 },
  "affectionChanges": { "<mainId>": 0, "<subId>": 0 },
  "socialContent": {
    "<memberId>": {
      "bubble": [{ "content": "msg", "hasPhoto": false }],
      "instagram": { "caption": "...", "likes": 800000 },
      "weverse": { "content": "...", "likes": 2000, "comments": 100 }
    }
  },
  "kktMessages": { "<memberId>": ["message text"] },
  "story": "350-450 words in player's UI language. Pure narrative, no stat bars, no options.",
  "summary": "One English sentence ~100 chars - who appeared and what emotionally shifted.",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."]
}
```

**`scene` is ONE SHORT PHRASE, and that is a layout requirement rather than a preference.** It is
printed in the stats box as `📍<scene>` — one line of a 30-character ASCII box, on a 390px phone. The
rule used to say "a short location description" with `"Practice room, 10PM"` as the example, and step
7's English run answered with 250-character sensory paragraphs:

> `"Practice room B, now almost completely dark except for the amber emergency light above the door and the faint blue glow of a forgotten phone screen on the floor. The mirrors hold the last ghosts of the day's rehearsals. Outside, the building has gone quiet."`

Eight wrapped lines inside a box built for one. "Short" was not a bound, so the rule now says what the
shape is — a place and a time, nothing else — and says where it is printed, since a reason is what this
prompt responds to.

**It also has to move.** The same run repeated a byte-identical `scene` for **five consecutive rounds**
(9 through 13, all "near midnight… neither of you has broken the hush") on the *harem* pace, which is
the opposite of standing still. Nothing asked it to change, so the rule now does.

**"zh was unaffected on both counts" — written here from reading a few zh scenes — was wrong on both
counts, and the numbers say so.** Corrected once `analyze-prose.mjs` measured scene *length* and
consecutive-identical *runs* instead of only distinctness:

| baseline run | scenes over a one-line box | longest identical run | worst rotation gap |
| --- | --- | --- | --- |
| zh `财阀` / `高压舆论向` r25 | **25 of 25** (median 62 chars, max 148) | 2 | 9 |
| zh `练习生` / `慢热现实向` r20 | 20 of 20 | **9** | **17** |
| zh `韩娱艺人` cross-group r20 | 20 of 20 | 4 | 16 |
| en `Staff` / `修罗海王向` r20 | 20 of 20 | 5 | 14 |
| ko `主线成员前女友` r20 | 20 of 20 | 2 | 8 |

Every language was affected, and the **worst** repeat was a Chinese run holding one scene for **nine
consecutive rounds** — worse than the English five this section was written about. "23 distinct scenes
in 25 rounds" was true and measured the wrong thing: 23 distinct paragraphs are still 23 paragraphs,
and a distinct-count cannot see either failure. The rotation column is the same story — gaps of 16 and
17 rounds in runs the graders scored 20/20 clean.

**The mistake is the one this file keeps recording, in a new place: a count that is easy to take
stood in for the property that mattered.** Reading a few scenes and counting distinct ones felt like
evidence. It is in `test/reports/2026-09-27-step7-baseline.md` as numbers now, and the post-fix arm
shows **0 of 25 over bound** with median 12 — directionally strong, though that run is the
model-confounded one, so treat it as evidence the rule works rather than as a measurement of by how
much.

**This block is transcribed from a golden fixture, not from memory.** It said 250-350 words against
the prompt's 350-450, gave `bubble` as an array of bare strings and `weverse` as a string (both of
which `validateAndFixOutput` *repairs* rather than requests), and named the fourth option
`"D. Custom"` — which is the placeholder `validateAndFixOutput` pads a short list with, never
something the model is asked for. The custom-input row is the app's, beside the four options. When
this drifts, read `test/fixtures/*.txt` and copy.

### JSON Parsing Pipeline (4-level fallback)

**Corrected 2026-10-20: this list used to name a "regex field extraction" level that does not
exist.** What the code does: a pre-pass escapes raw newlines inside `story` and auto-closes a
truncated object, then four `JSON.parse` attempts (direct; outermost `{...}`; fences stripped;
unquoted keys and trailing commas fixed), then a **fallback marked `parseFailed`**, whose
`story` is the first 500 characters of the raw text.

**That fallback never reaches the player any more.** `isUsableRound` is the probe `callLLM`
retries on, and it rejects `parseFailed` outright - before 2026-10-20 it measured the
fallback's 500-character slice against a 40-character floor and passed it, so the one output
least fit to show was the one the retry could not catch. Measured live the night it was
fixed: **7 of 64** `deepseek-flash` rounds in one window, each a complete response
(`finish: stop`) with one stray `}` after an Instagram object. They now cost a retry
(`bad_response`: two same-model retries, then the next route model or the error notice).
The verbatim response is `test/fixtures/response-stray-brace-zh.json`; see
`docs/PROPOSALS.md` §7.

`validateAndFixOutput()` post-parse repairs: unescape `\n`, `\"`, `\/`, `\\` in the story field; fill a missing `summary` with `""`; and clamp every `affectionChanges` delta to ±`AFFECTION_MAX_DELTA` — see below.

### Affection pacing is the game's, not the model's

`affectionChanges` arrives unbounded. The prompt asks for ±1 to ±10, but a prompt is a request,
and the only enforcement that existed bounded the **result** to 0–100 — which says nothing about
how fast you get there. A model returning `+30` in one round moved the player through three
relationship stages at once, firing their stage-transition events in a burst and skipping the
writing those stages exist to produce.

That is not a hypothetical spread across 28 free-route models of very different sizes. The whole
point of the router is that the player does not know or care which model served the round, so
**pacing cannot be a property of the model** — a run that switches models mid-game would visibly
change speed for no reason the player can see.

`validateAndFixOutput` clamps each delta to ±8 — deliberately *below* the ±10 the prompt asks for,
not equal to it. The prompt keeps its wider range because asking for the range you want produces
better-distributed values than asking for the range you will merely tolerate; the clamp is the
backstop for models that ignore the request entirely. At ±8 a compliant model is almost never
touched, while a model returning +30 needs ~11 rounds to cross the board instead of 4.

It clamps the **delta**, not the result, and runs before the 0–100 bound at the application site —
so the two are independent and a clamped delta still cannot push a member out of range.

**v1.4.4 P4: the rise is also capped by the chapter.** ±8 bounds the speed of any one round;
it says nothing about the shape of a run, and the P3b baseline reached Confirmed (66+) by round
14 in 17 of 18 runs - the end of 承, where the design doc wants the two of them only beginning
to notice. Each `CHAPTERS` entry now carries `maxRise` (起 +4, 承 +6, 转 and 合 +8), and
`capAffectionRise(changes, round)` caps positive deltas to it in `executeRound`, after the ±8
and before the deltas are added. **Falls are never capped**: a cold move must stay as sharp as
the story makes it. `round` is `roundNum + 1`, the number `[Chapter]` prints.

Same shape as everything else in the tail: **the fact is in `[Chapter]`** (*"affection rises at
most +4 a round in this chapter"*), **the rule is in RULES** (*"never above the rise [Chapter]
allows"*), and the rule points at the fact, so no static line carries a chapter's number. The
prompt's own *+/-1 to +/-10* stays, for the reason above: a model asked for the range you want
distributes better than one asked for the range you tolerate.

### Round 1 opens with a narrator's prologue (v1.4.4 P6)

Round 1 used to open straight into a scene, so the player met the cast before the story had said
where she is or who they are to her. On round 1 only, the tail carries a `[Prologue]` line from
`buildPrologueLine(round)`: `story` begins with 2-4 sentences in the narrator's voice, addressed
to her as "you" (this world, who she is in it, who the cast are to her), then a blank line and
the first scene.

- **Tail, never static.** A static line would be in front of the model every round. Here the
  lesson of the typical events (*a tail line reads as a cue to act on now*) is the point: round
  1 is when it should be acted on, once.
- **Inside `story`, not a schema key**, so the static prompt and the goldens do not move for one
  round's text.
- **It names the three static rules it could otherwise contradict:** the scene after it opens
  as section 3 says every round opens (it points at that rule since P7, never restates it), the cast are no closer than `[First meeting]` allows, and nobody outside
  MEMBER PROFILES is named. It counts toward the story's length.
- Generated per run, so no in-language text is authored.

### One line of atmosphere, how she looks, and whose eyes (v1.4.4 P7)

Yuhan's design, three `prose` rules in `public/worlds/_registers/<lang>.json`, the same English
in all three languages:

- **`openWith`**: one short sentence of atmosphere (light, a sound, the weather or a smell, said
  plainly, no simile, no tour of the room), then a person by the second sentence at the latest.
  **This walks back half of the v1.4.3 fix on purpose, and is bounded because of it**: *"1-2
  sentences establishing scene atmosphere"* is what blind read 5 tied to the translationese. The
  old wording must not return in any language; smoke checks all three.
- **`style`** adds one or two concrete details of how a member looks today, never an inventory
  and never the same detail every round.
- **`pov`**, a new `PROSE_KEYS` entry beside the PRONOUN RULE: the narration stays with the
  player and shows only what she perceives; a member's inner state shows in what she says and
  does. "First-person view" in the plan is read as the player's view, narrated as "you"; see
  `docs/V144_PLAN.md`, *P7 design*.

P6's prologue line now points at this rule instead of restating it. Live 9 of 9 rounds opened as
asked. **Yuhan's blind read (2026-10-21) tied overall but put the stiffness in the atmosphere
sentence**: 4 of 6 were marked, every one with light, air or a shadow as the subject of a
figurative verb (`阳光斜斜切进`, `空气又干又软`, `影子泡得发软`), while the two she rated natural
state a plain fact (`音乐停了，只剩下空调出风口的嗡嗡声`). *"No simile"* does not reach a figurative
verb. What the opening becomes is her decision and gates the release; `docs/V144_PLAN.md`,
*P7 blind read: the result*.

### Random events, at a rate the story mode sets (v1.4.4 P8)

- **The code draws the event rounds; the model is never asked to keep a rate.** `EVENT_RATES`
  in `mainAgent.js` holds a probability per `MODE_IDS` entry: free 0, and 1/3 in romance,
  pressure and dramatic (Yuhan's call: 1/2 cost continuity). `executeRound` calls `drawEvent(mode, round)` once per call (round 1, the
  prologue round, never draws; ↺ Retry draws again), and `buildTailRules(..., hasEvent)` sends
  `[Random Events] this round has one...` or `none this round: event is null.` as its own line
  after `[Story Mode]`; free mode sends its own "none" line. The rate depends on the mode and
  never on the world, so it is one table, not a sentence in twelve world files. The tail is the
  always-miss message, so `Math.random()` here costs no cache.
- **Why drawn, measured:** told a rate, the model overshot it in a way that depended on the
  mode, not the number. A live A/B at 1/4 (`docs/V144_PLAN.md`, *P8 A/B*): described, pressure
  ran 22/33 with 16 back-to-back event rounds, since its mode rule asks for scrutiny incidents
  and the model labelled each one; drawn, the model wrote an event on 17/17 drawn rounds and on
  2/49 undrawn ones, and none of the drawn events was a member's gesture (3 of 10 were, in
  described romance).
- **The schema's `event` key sits between `story` and `summary`** and reports what the story
  already contains. The RULES line defines an event as something that happens TO the people in
  the scene, never a member's own gesture, and points at `[Random Events]`, `[Chapter]`,
  `[Affections]` and `[Player Status]`. No example events, for P3's reason.
- **The heading is the screen's and never the ledger's.** `withEvent` appends
  `t.game.randomEvent` + the sentence as a paragraph of `storyContent`, so the round's message,
  the save, the copy and the export all carry it. The history entry's text is the story alone.
  The first build put the heading in the ledger and the model copied it into its own story on
  round 6, against a rule saying not to. A marker in the model's context is a pattern it
  imitates; removing the marker fixed what the rule could not. `splitEvent` lifts a
  model-written heading paragraph back out (validator) and keeps one out of an edited story
  (`saveStoryEdit`).
- **An event on an undrawn round is not deleted by code**, free mode included: the prose
  carries it either way. The harness's `event-in-free-mode`, `event-not-drawn` and
  `drawn-event-missing` graders are where it shows, and every transcript stores the round's
  event and `eventDrawn`.
- **Not verified:** en and ko have not been played with P8, and whether a drawn event can land
  at a bad moment (mid-confession) has not been read by Yuhan.

---

## Member Probability Engine

`src/agent/probabilityEngine.js`:

```
weight = affection(40%) + balance(30%) + recency(20%) + random(10%)
```

* `calculateProbability(memberId, allTargetIds, affections, memory)` — a member absent for 4+ rounds floors at 0.3; otherwise the weight caps at 0.7
* `pickPrimaryMember(...)` — weighted draw over `allTargetIds`, returning the single member who drives this round; the result feeds `memberAppearances`

**Scope correction:** the engine does **not** select which members appear in the prompt. In `executeRound`, `roundMemberIds = allTargetIds` (main + all subs), so KKT injection covers every target member. The engine's only live output is `primaryId`.

**And `primaryId` is a closed loop — found in step 7 and not yet decided.** `pickPrimaryMember` runs
at `mainAgent.js:756`, **after** the LLM call, and its result is used for exactly one thing: writing
`memberAppearances: {[primaryId]: [roundNum]}`. The only reader of `memberAppearances` is the recency
term of `calculateProbability`. So nothing about this engine reaches the prompt, the UI, the save's
meaning or the player: it is a lottery that records its own results so it can consult them next time.

The record is also fiction. The **model** decides who appears in a round; the engine draws a name
afterwards and logs that she appeared. A member the prose never mentioned is recorded as present, and
the one who carried the scene may not be — so the recency term below is computed over data that does
not describe the game.

Do not read the formula above as game behaviour. Whether to wire it into the prompt (a "centre this
round on Wendy" hint in the tail, drawn *before* the call) or delete it is written up in
`docs/PROPOSALS.md` §4, with §5 for the appearance data it would need. It is a taste decision about
whether rotation should be mechanical, not something a test can settle.

The recency window's reference round comes from the tail of `memory.history`. It previously read `memory.storyRounds` — a v11 field removed in v13 — which pinned `lastRound` to `0`, degenerated the filter to `r >= -3` (every recorded appearance counted as recent), and left both the recency penalty and the "absent 4+ rounds" floor effectively dead. Fixed in v1.3.1; `test/smoke.mjs` Layer D guards it with pinned `Math.random`, and that guard is verified to fail against the old implementation.

---

## Social Media System

The platforms **the world declares** are generated by the LLM per round and displayed in the **next** round (delayed display hides LLM latency — the player checks social while the next round generates). `kpop_idol` declares all four below; a non-idol world declares Instagram and KakaoTalk only — see *The platforms belong to the world, not to the cast*:

| Platform | Content | Unlock |
| --- | --- | --- |
| Bubble | Text messages array | Always |
| Instagram | `{caption, likes}` | Always |
| Weverse | Post text string | Always |
| KakaoTalk (KKT) | Private messages | affection >= `KKT_THRESHOLD` (30) |

Social content is stored in module-level `pendingSocialFeeds`. `popPendingSocial()` runs at the start of each round to display the previous round's content; `resetPendingSocial()` discards it during a Retry.


## Relationship Stages (7)

Defined in `src/config/stageConfig.js`:

**Corrected in v1.4.0 step 6 — this table named four stages that exist nowhere in the code.** It
said Friend / Close Friend / Crush / Lovers for the middle four; `DEFAULT_STAGE_NAMES` has always
been the Chinese list below, and `buildSystemPrompt` has always sent the English list beside it. The
names here were invented by the documentation. Found by reading the rendered prompt end to end.

| Score | `DEFAULT_STAGE_NAMES` (what the tail emits) | Section 9 of the prompt |
| --- | --- | --- |
| 0-15 | 陌生人 | Stranger |
| 16-30 | 有印象 | Acquaintance |
| 31-50 | 产生兴趣 | Interest |
| 51-65 | 暧昧期 | Flirting |
| 66-80 | 确认关系 | Confirmed |
| 81-90 | 热恋期 | Passionate |
| 91-100 | 考验期 | Trial |

**Localized in v1.4.0 step 6.** `getStageName` took no language, so the dynamic tail emitted the
Chinese labels to every player's model — an English game sent `Irene:24(有印象)` while section 9 of
its own prompt listed `Acquaintance`, two vocabularies for one scale with nothing saying they
corresponded. The UI had it in the open too: an English game showed Chinese stage labels under every
member.

`STAGE_NAMES` is now keyed by language and `stageNameIn(aff, language)` is what every call site uses.
Three things make it safe:

- **zh is byte-identical**, so no existing save's prompt moves.
- The tail is the **always-miss** message, so localizing it costs no cached prefix. Section 9 does
  move — it now prints `stageNamesFor(language)` — and that moved all three goldens deliberately.
- **`STAGE_BANDS` is derived from `DEFAULT_STAGE_THRESHOLDS`**, not typed beside them, so section 9
  cannot describe a scale the code does not implement. Smoke ties the two together: the prompt's list
  must be exactly the names the tail will emit, per language.

The Korean set (`남남 / 안면 / 관심 / 썸 / 연인 / 열애 / 시험기`) is a judgement call worth a native
reader's eye — `썸` for the ambiguous stage is the idiomatic choice but `관심`/`연인` are plainer than
the Chinese originals.

Stage transitions trigger special events in `relationshipEvents.js`. `executeRound` surfaces
`proposal_ready` and `breakup_warning` as `specialEvent`.

**It filters on a third type, `pressure_warning`, that nothing produces.**
[`mainAgent.js:861`](src/agent/mainAgent.js#L861) names three; `checkRelationshipEvents` returns
`love_triangle`, `proposal_ready` and `breakup_warning` and nothing else. This file claimed all
three were surfaced — corrected 2026-09-28. **A filter that enumerates is the cheapest place to find
a missing producer**, cheaper than grepping for writers, and it is the same shape as the four dead
mechanisms above with the halves swapped.

It is **not deleted**, unlike `NPC_APPEARANCE_CHANCE`, and the difference is stated rather than
assumed: that constant has no plan, and this one has a designed reader arriving in
`docs/V140_PLAN.md` section 21 — the natural close of a pressure-mode run. Until then it is a branch
that cannot be taken, documented as one.

## Achievements (5 endings)

`src/config/achievements.js`: `he_hidden_love`, `se_public_love`, `be_exposed_separation`, `oe_unspoken_waiting`, `be_you_left`.

They accumulate rather than ending the run: `checkAchievement` runs every round from 30 on, returns
the **first** definition whose condition holds, and each id fires at most once.

**And nothing a player reads is derived from which one fired.** The achievement shows a modal whose
button says *Continue Playing*; the **epilogue** is launched from a different modal — the
`specialEvent` one — and its prompt is a hardcoded English sentence asking for *"150 words in a
warm, literary style"* regardless, on the breakup path too ([App.jsx:1945](src/App.jsx#L1945)). So
the five conditions currently decide a title and nothing else, and two runs that ended in opposite
places request the identical epilogue.

**A run can also have no way to finish at all.** The only button that reaches an epilogue lives on
the `specialEvent` modal, which fires on `proposal_ready` or `breakup_warning` and may
never appear — and the state that matches none of the five conditions (discreet, cheerful,
moderately loved; see `docs/PROPOSALS.md` §6) is the same run that fires neither event. **The hole
in the condition table and the hole in the trigger are one run.**

Designed, not built: `docs/V140_PLAN.md` §21, scheduled for v1.4.2, with `PROPOSALS.md` §6 as a
hard prerequisite because the epilogue's register is keyed on the ending id. **Time Speed is
deliberately not what shapes an epilogue** — it is a within-round dial and an epilogue is one jump
past the last scene; the **story mode** and the **world** are, which is Yuhan's correction of
2026-09-28 and the reason §21 exists.

**Four of the five are what a player actually reaches — read `docs/PROPOSALS.md` §6 before changing a
condition.** `oe_unspoken_waiting` requires `topAff > 90`, and the two conditions tested before it
claim `topAff > 90` for every secrecy value *except the single integer 60* — so the one ending about
loving each other while she has not accepted herself is reachable only when secrecy lands exactly
there. Separately, `topAff < 90 && secrecy >= 45 && mood >= 85` — a discreet, cheerful, moderately
loved run — matches nothing at all.

Both are fixable in a line, and neither is fixed here: the five titles carry an authorial intent about
what each ending *means*, so the precedence between them is a decision rather than a bug fix.

---

## Page Flow

```
Cover Page
  -> Select group (required) + language + theme -> New Game or Load Save
      |
Key Input Page
  -> Enter API key + choose provider (Aliyun: Free credits auto-route | Paid model list + cost guide)
      |
Player Info Page          <- BOTH doors, and it comes BEFORE the cast (§22.2)
  -> Name + Birth year + World + Identity
     (Identity follows the world because an identity is a position INSIDE
      one: the grid is that world's own `identities` plus `H`, and a world
      change clears an id the new world does not declare. The pace picker
      was on Setup until v1.4.1 step 2 and step 3 put the world picker in
      the slot it vacated; §22.2 moved all four onto their own page)
      |
      +-- classic door --> Setup Page: Main member + Sub members
      |                       |
      +-- custom door ----> Roster Builder -> Setup Page: the chosen cast
                                               + the organisation's name
      |
Game Page (loop)
  -> Read story -> Choose A/B/C/D, Custom, or 📍 a place -> Next round
     (settings overlay: reasoning, story mode, time speed, theme, font,
      export, help)
```

"New Game" is disabled (dimmed + toast) until a group is selected.

## Cast, world, roster (v1.4.0)

A "group" used to bundle three independent things. They are now separate, and the split is what
every v1.4.x feature depends on:

| Concept | Lives in | Answers |
| --- | --- | --- |
| **Cast** | `public/groups/<id>/<lang>.json` | who these people are |
| **World** | `public/worlds/<id>/<lang>.json` | what setting they live in |
| **Roster** | the save, as `roster` | which of them are in *this* run, and in what slot |

`resolveRoster(roster, language)` is the single funnel: it fetches the groups an entry names,
applies `override`, splices in inline custom profiles, and returns the same `members[]` shape
`buildSystemPrompt` has always consumed. **Nothing downstream of it changes.** The classic
"pick a group" path is not a separate code path — `buildClassicRoster` expresses it as a roster.
One engine, two doors.

## Model layer and release workflow

Moved to their own documents on 2026-10-21, verbatim. Read them before touching the area:

- **`docs/MODEL_LAYER.md`** - before touching `llmTool.js`, `llmErrors.js`, `aliyunRoute.js`,
  `modelConfigs.js`, `usageMeter.js`, any provider's request parameters or the retry policy.
  Four rules from it that bite most often: thinking is OFF by default and every provider sets the
  OFF state explicitly; the response reader uses `choice.message.content` only, never
  `reasoning_content`; `glm-5.3` cannot stop thinking and `qwenOpen` never thinks; a number the
  usage meter does not know is rendered `—`, never `0`.
- **`docs/RELEASE.md`** - before any release, hotfix, version bump, deploy or mirror question.
  The rules that bite most often: `main` never takes a direct source commit (only `--no-ff`
  merges); **after every deploy, merge `main` back into `dev`**; `npm run bump <x.y.z>` rewrites
  all 15 version strings and `--dry` needs `npm run bump x -- --dry`; `.nojekyll` at the repo root
  is load-bearing; every runtime URL comes from `import.meta.env.BASE_URL`; `index.html` stays in
  dev mode on `dev`; after a release run `node scripts/verify-mirrors.mjs`; push, deploy, tag and
  merge into `main` are Yuhan's (red lines).

---

## Project Status

**Released:** v1.4.3, deployed 2026-10-02, tagged `v1.4.3` on deploy commit `adf19b9`.

**On `dev`, unreleased:** v1.4.4 - P1-P12 done and the release notes written; the
release waits on Yuhan (blind read, phone test, push). `docs/V144_PLAN.md`'s table is the authority on progress, and
`docs/HANDOFF.md` is the baton (what is in flight, what is not verified, the exact next step).

The history of every release before this one, with its measurements, is in
`docs/CLAUDE_HISTORY.md` under *Project Status*.

---

## Lessons index (rules from archived sections that still bind)

Each line names the section in `docs/CLAUDE_HISTORY.md` that holds the evidence.

**Prompt and model behaviour**
- **Address forms are transliterated, never localized**: zh `欧尼` (never 姐), `nim`/`xi` in
  Latin, `呀` only standalone; en `unnie`/`-nim`/`-ssi`; ko native. Transliterate only where the
  target language has no competing function for that syllable. Address forms are spoken (inside
  quotes), never narrated. Seniority is a birth-year boundary. - *Korean address forms are
  transliterated, never localized*
- **Korean particles after a variable word are resolved by `resolveKoreanParticles`**; a Latin
  name keeps the `은(는)` dual. - *Korean particles cannot be authored*
- **Who owns which life**: the player's identity is hers (ROLE CONTRACT); the members' working
  life is `world.castLife.theirs`. When a contract enumerates, the model treats what it omits as
  unconstrained. - *Whose life is whose — the ROLE CONTRACT*
- **Read the non-authoring language's golden** (en, ko) for agreement with the code; seven of
  nine defects in one read were invisible in zh. - *Reading it a second time found nine more*
- **A Kakao is delivered by the app, never by the story**, for every member; `story`/`summary`
  come before `socialContent`/`kktMessages` in the schema because key order is generation order;
  the ownership rule supplies a substitute (she leaves a note). `[KKT Channels]` in the tail says
  which channels are open. - *The platforms belong to the world, not to the cast*
- **The world declares WHICH platforms exist, `platformConfig.js` says what each IS**; an unknown
  platform in a world file throws, one in a model response is dropped by
  `filterSocialByPlatforms`. - same section
- **A non-idol world has the `NO ONE IN THIS CAST IS AN IDOL` rule** and the restaging law names
  the zh rank words (队长, 主唱, 门面, 忙内) but NOT the ko ones (막내 is ordinary Korean). - *A fully
  restaged cast still had its real namesakes*; *A rule written in English about a word the model
  is copying in Chinese*
- **`castLore.useRole` filters `role` out of a non-idol prompt and `world_position` fills the
  slot**; a restaging is ONE overlay field, `world_detail`, stamped with its world id; the whole
  cast is placed by one call with a per-member fallback. - *The filtered slot is FILLED*; *A
  restaging is an OVERLAY*; *One call places the whole cast*
- **Section 4 is composed from the roster**: one whole group keeps its lore verbatim, a subset
  names only who is present, a mixed cast is its own group, and origin groups are never named. -
  *A cast drawn from more than one source is its own group*
- **`memory.places` reaches no prompt message**; a place is recorded from the model's `scene` and
  moving costs a round. - *The map grows and the prompt does not*
- **`membersNamedIn` matches stage name, `name_kr` and the given name**, two characters minimum;
  a false fact in the tail is worse than none. - *`[Rounds Absent]` shipped telling the model
  things that were not true*
- **Rotation is not fixed**, and an n=1 A/B on this harness is not evidence. - *…so rotation is
  unresolved*
- **`buildSystemPrompt(..., world)` takes a required world with no default**; `parseWorld`
  validates and throws rather than whitelist-copying; an identity's `id` is stored and never
  renamed, its `name` is what the prompt and Setup print. - *Where she is decides who is there*
  and the end of *The map grows and the prompt does not*
- **`parseGroupConfig` is a field whitelist**: add a new member field to it in the same commit,
  and assert on member data through `loadGroupConfig`, never by reading the JSON. Group files are
  CRLF. `habit` was removed in v1.4.3. Every optional profile field renders nothing when empty. -
  *Group JSON Structure*
- **A work title points one way** (`workTitle.direction: "to_cast"` or absent); read a direction
  against the *form*, not just for being legal. - *A work title points one way*; *The secretary
  called the heiress by her own title*

**Harness and tests**
- **A live flag is a hypothesis about the grader first** (9 of 13 were grader bugs). Read the
  stored prose before changing the prompt. - *105 live rounds*; *64 live rounds*
- **Every field that selects a whole prompt block needs a harness flag**, and the guard belongs
  on the `executeRound` call; grep the harness for any symbol a commit adds to a boundary the app
  owns (`startNewGame`, `loadSave`) before trusting a live row. - *…and it could only ever test
  one of the four providers*; *The fifth was not a pinned field at all*
- **The harness must serve every tree `src/` fetches** (derived scan). - *`playthrough.mjs` had
  been dead since step 3*
- **A mutation that reports GREEN and a mutation that never ran are the same line of output**:
  derive the newline from the file (CRLF), abort on a missed anchor, never background a mutation
  run, restore from a copy, never from `git checkout` while the change is unstaged. - *One profile
  editor, and an edit to a prebuilt member is a DIFF*; *A restaging is an OVERLAY*
- **A layout harness must load `src/index.css`** (`font: 18px/145%`), and `scrollHeight` is
  floored by the scroller. - *The harness had been measuring a different app*

**UI**
- **Save slots refuse at 10, never evict**; `saveToStorage` returns a boolean that player-data
  writers must check. - *The tenth save is the last one*; *`saveToStorage` returns a boolean*
- **The document never scrolls**: `.rv-page`/`.rv-fixed`/`.rv-card` carry the heights, the
  safe-area insets and `box-sizing`; no viewport unit in `src/`. - *The header was under the
  clock*; *The top of a page was unreachable*
- **Layers stack by `castTheme.js#Z`**, asserted as relations; a floating layer uses a solid
  token (`th.panelBg`). - *A modal opened from inside a sheet has to outrank it*; *A layer you can
  read through*
- **A stored photo is the frame's own `background-image`** (`photoFill`), never a child something
  else clips - iOS does not clip it. - *The second fix made the square reachable*
- **A wheel always displays a value**: seed every `YearWheel` at mount, and the `selfScroll`
  latch is cleared on every exit. - *A birth year is stated once*
- **An effect's dependency list belongs to the whole effect**: split effects by what they read. -
  *A layer you can read through, and a dependency list…*
- **The player is asked before the cast on the custom door** because `generateCard` reads the
  world; the classic door is one page. - *The player is asked before the cast*; *The classic door
  is one page again*


## Known Inconsistencies (fix before they bite)

1. **`src/App.jsx` duplicates the i18n cover strings.** The cover text exists in both `src/i18n/*.js` and a hardcoded fallback object in `App.jsx` (~line 712), which is why the version lives in 15 places instead of 12. `npm run bump` keeps them in step and smoke Layer C fails if they drift, so this is contained rather than dangerous — but collapsing the fallback into one source would delete six of the fifteen. See **Version strings** under Branch & Deploy Workflow.

   **`App.jsx` duplicates the i18n cover strings.** The cover text exists in both `src/i18n/*.js` and a hardcoded fallback object in `App.jsx`, so a bump edited in only one place leaves the two disagreeing depending on which path renders. Worth collapsing into one source before the next release.

2. **`executeRound` never receives `form.identity` — it receives `formForRound()`.** The stored id is
   rewritten on the way in, because `"H"` means "the player typed her own identity" and the prompt has
   to see her words rather than the escape hatch. That rewrite was **four copies of one expression**,
   and in step 7 the fourth turned out to have drifted: the **epilogue** call site omitted the `"H"`
   branch entirely, so a player who wrote her own identity reached the ending — the single round the
   whole run builds toward — with the literal placeholder `[自定义]` in section 6 where her words
   belong. It is one function now, and smoke counts `executeRound` call sites against uses of it.

   **The trap beside it was worse, and v1.4.1 step 3 DELETED it.** `IDENTITIES` in `App.jsx` gave
   every entry a `label` equal to its `id`, so `IDENTITIES.find(...).label` was an identity
   function — which is what made it dangerous rather than merely redundant. Localizing those labels is
   the obvious next thing anyone would do, with `src/i18n/*.js` already carrying an `identities`
   table for exactly that, and it would have silently emptied the identity **background** and the
   **work title** out of every real game, because `getIdentity(world, "Chaebol")` finds nothing.
   **No test written before step 7 would have noticed**: the goldens, the live harness and every check
   in `smoke.mjs` pass the raw id, which is the one thing the app did not pass.

   The list is now `world.identities` plus one named constant, `CUSTOM_IDENTITY_ID`, and
   `formForRound` forwards `form.identity` unchanged for anything else — so *what App.jsx
   forwards is an id the world declares* is true by construction and not by assertion. The old guard
   was written from that requirement rather than from "label equals id", which is why it survived the
   deletion as a source check on the construction instead of needing to be rewritten from scratch.
   **Byte-identical the day it shipped**, since every label already equalled its id: the goldens did
   not move and could not have.

   `PACES` was the same shape one field over — a fourth copy of a list the world file owns, coupled
   to `t.paces` **by position** — and it is **deleted** in v1.4.1 step 2 rather than guarded. The four
   story-mode ids that replaced it are universal across every world, so there is no per-world list to
   keep in step with anything: the labels live once in `t.modes`, keyed by id, and the rules live in
   `world.modes`, keyed by the same ids. The guards are written so that bringing either list back
   fails the suite. **A coupling deleted is worth more than a coupling asserted** — the guard that
   existed here only caught a list that had already drifted.

   **`STAR_LEVELS` is not, and the sentence that used to claim it was wrong.** It is
   `["资深粉丝", "普通韩娱瓜众", "纯路人", "已脱粉"]` at `App.jsx:58` and it is **referenced
   nowhere**: `form.starLevel` is initialised to `""`, written by no control, read by no prompt
   code, and copied into every save. No world file carries `starLevels` and no guard mentions it.
   That makes it the **fourth** instance of the shape this file already tracks three times —
   `npcAppearances`, bubble `photoDesc`, cast photos — a field complete on one side of a boundary
   and connected to nothing on the other, except that this one never had a reader at all. Either
   delete the constant or give it one; `docs/V140_PLAN.md` §18 carries the decision.

3. **Section 4 keeps the group file's own copy of an edited member's prose.** A whole single
   group in a world with `useGroupLore: true` renders its `groupLore` **verbatim**, and that
   block duplicates the three texture fields section 5 renders per member. So an edit to
   Irene's `public_image` through the custom door in `kpop_idol` leaves the old sentence in
   section 4 and the new one in section 5 - two sections disagreeing about one member, which
   is the failure this file spends the most words on. It needs all four of: the custom door, a
   cast that is exactly one whole group, a world with `useGroupLore: true`, and an edit to one
   of those three fields. The fix is either to stop duplicating the prose in single-group lore
   or to compose lore for an edited cast, and **both move goldens** - see `docs/V140_PLAN.md`
   §22.5.

### Cost strings must track README

`MODEL_CONFIGS[*].gameplay` (rendered through `t.guide.billing`) and each `ALIYUN_PAID_MODELS[*].gameplay` (rendered in the paid-mode cost box) are hand-derived from the README cost table — **when provider pricing changes, update both**. zh quotes hours per ￥1, en per \$1, ko per ₩1,000.

Derivation: README token profile (7,664 cache-hit + 336 cache-miss input, 800 output per round, 12 rounds/hour). CNY-priced Aliyun models convert at ￥7.1 = \$1; ₩1,000 = \$0.72. Peak-priced models are blended: Aliyun DeepSeek is 2x for 14 of 24 hours daily (08:00–22:00 Beijing), DeepSeek Official is 2x for 35 of 168 weekly hours.

**`MODEL_PRICES_PER_1M` is the third copy and carries the same obligation.** Added in v1.3.9
for the usage panel, it holds `[cacheHit, cacheMiss, output]` per 1M for the models whose
providers publish all three, plus the peak window where one applies. Unlike `gameplay`, it is not
a rounded per-hour string but the arithmetic itself, so a stale entry produces a wrong number
with four decimal places of false precision. Change it in the same commit as the README table.

**Each entry is priced in the currency the provider actually bills, and converted once for
display.** This is not tidiness — pricing DeepSeek Official from the README's USD sheet made the
panel read **6.7% high** against a real bill, and that was caught only by comparing the panel to
the billing page. `deepseek-flash` bills CNY; the README quotes DeepSeek's USD sheet; and those
two sheets do not convert at the ￥7.1 this repo uses everywhere else. All three rates give
exactly **￥6.67 = \$1** — DeepSeek's own internal rate — so converting its USD figures at 7.1
over-charged every line by the ratio between the two. Store the billed currency, convert at the
boundary, and the arithmetic stops depending on whose FX assumption you inherited.

Verified against a real bill (DeepSeek Official, `deepseek-v4.1-flash`, 40 rounds, off-peak,
2026-09-24): 240,000 cache-hit + 36,862 cache-miss input + 39,696 output priced at ￥0.02 / ￥1 /
￥4 per 1M gives **￥0.2004**, and the platform billed **￥0.20**. Those CNY rates are back-derived
from that bill rather than read off a price page — the ￥6.67 agreement across all three is what
makes them trustworthy, and they should be replaced with published figures if DeepSeek ever
publishes a CNY sheet.

It is **deliberately incomplete**, and that is a feature rather than a backlog item. A model is
absent when its price is not published: Gemini 3.5 Flash-Lite (the README costs it from a
comparable tier), `qwen3.6-flash` (Aliyun lists no cache-hit price, so the README row *assumes*
the usual 20% of input), and the Aliyun models the README gives only per-round figures for —
including the `qwen3.8-max` default. Those render `—` in the panel. Do not fill a gap by
back-deriving a per-1M price from a per-round estimate: that turns an estimate into something
that looks like a measurement.
