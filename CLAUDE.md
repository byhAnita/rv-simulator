# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Idol Dating Sim v1.4.1** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390x844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

Active branches:
- `main` — stable production, served by GitHub Pages + Vercel
- `dev` — default working branch, never deploy from here

See **Branch & Deploy Workflow** for the release, hotfix and merge-back rules.

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

### The tenth save is the last one, and the eleventh is refused

**`[newSave, ...saves].slice(0, 10)` deleted the player's oldest run, silently.** Reported from hand
play in v1.4.0 step 6. A slot id is `Date.now()`, so **no save has ever replaced another** — every
one is a new slot — and the eleventh therefore pushed the first off the end. The list looked normal;
it just had a different last entry, and a run was gone for good.

This is the same failure `saveToStorage` was given a return value for, one level up: silence is the
wrong default for the one operation whose whole purpose is durability. The difference is the remedy.
**A refused save costs one tap once the player is told; an evicted save cannot be recovered at all** —
so the cap refuses.

- **`addSaveSlot(saves, newSave)` in `src/utils.js`** is the rule, pure and exported so it is tested
  rather than reachable only by filling ten slots by hand. It returns `{ok, saves, reason}` and on
  refusal hands back **the same array object**, so a caller that renders the result cannot show a
  slot that does not exist.
- **Nothing is ever truncated**, including a legacy list that somehow holds more than ten: trimming
  it would be the very loss being fixed. The guard asserts on **ids**, not length — eviction and
  refusal both yield ten items, so a length check passes against the bug.
- **Overwriting an existing slot stays legal at the cap**, because it frees the slot it takes.
  Nothing does that today; it is there so adding overwrite later cannot bring the eviction back.
- The UI shows **`n / 10` at all times** and disables Save at the cap with a persistent notice naming
  both ways out — delete a slot, or export the story from Settings. The cap used to be invisible
  until it destroyed something.

### `saveToStorage` returns a boolean, and save slots must check it

It used to be `try { … } catch {}`. A `QuotaExceededError` was therefore
indistinguishable from success, and `SaveOverlay` proved how bad that is: it called
`setSaves(updated)` *before* writing, so a refused save still appeared in the slot list. The
player saw their save, closed the overlay, and discovered weeks later that it had never existed.
Silence is the wrong default for the one operation whose entire purpose is durability.

localStorage is ~5MB and a slot carries the full `messages` array, so ten slots of a long run
genuinely reach it — this is not a theoretical limit. It gets tighter in v1.4.0, which adds
custom members, worlds, rosters and photos (see `docs/V140_PLAN.md` §10).

The split is deliberate and not laziness:

- **Player data checks the result.** `SaveOverlay` writes first, renders second, and on failure
  leaves the list showing exactly what is on disk plus a **persistent** in-panel notice — not a
  toast, which would be gone in three seconds. `t.save.quotaFull` when there are slots to delete,
  `t.save.quotaRetry` when there are none and the advice has to be different.
- **Preferences ignore it.** Theme, font scale, language, time speed. A lost preference is
  visible immediately and re-settable in one tap, so a modal about it would cost more than the
  failure.

`aliyunRoute.js` also ignores the result, for a third reason: its state is a cache of what the
router learned, and the worst case of losing it is re-walking the route once.

---

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

## Model Layer

### Providers (`src/config/modelConfigs.js`)

| id | Display | Model string | Default? | Notes |
| --- | --- | --- | --- | --- |
| `qwen` | Aliyun | free route / paid picker (see below) | ✅ **default** | Alibaba Cloud Bailian: Qwen, DeepSeek and GLM behind one `sk-ws-` key. The code id stays `qwen` so saves and `rv_sim_model_v11` keep working — only the UI label changed |
| `deepseek` | DeepSeek V4.1 Flash | `deepseek-flash` | | DeepSeek's own platform. The button is named for the model, not the platform, so the player can see what they will run; the platform name lives in the card description. The legacy `deepseek-v4-flash` name is retired upstream and served by V4.1 anyway |
| `gpt4omini` | GPT-6 Luna | `gpt-6-luna` | | key `gpt4omini` is legacy, the model string is current. Replaced GPT-5.6 Luna in v1.3.8 — same endpoint and parameters, 4.5x cheaper per round on published pricing |
| `gemini` | Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | | OpenAI-compat endpoint |

All four use `format: "openai"` and go through the same `fetch` in `llmTool.js`. `character-plus` and the three Qwen sub-models (`qwen3.7-max` has no JSON mode) were removed.

### Aliyun modes

`aliyunMode` (`free` default / `paid`, persisted to `STORAGE_KEYS.ALIYUN_MODE`) reaches the client as `executeRound({ aliyun: { mode, paidModel, onModelSwitch, onRouteStep } })` -> `callLLM`. `aliyun: null` behaves as paid mode on `qwen3.8-max`.

- **Free** — `callAliyunFreeRoute` walks `ALIYUN_FREE_ROUTE` (28 models, best storytelling first; every entry has its own ~1M-token new-user allowance) and serves the round from the first model that answers:
  - `free_exhausted` -> marked used up for this key, permanently (see the recovery probe below)
  - `model_unavailable` -> skipped for 24h (not activated, or a dated snapshot retired)
  - `bad_request` -> skipped for the browser session and `console.error`ed — it means that model's family entry is wrong
  - `bad_response` (truncated or degenerate output, after same-model retries) -> next model, marked for 1h
  - `timeout` -> marked for 1h, next model — but see the two-timeout rule below
  - `rate_limit` (after same-model retries) -> next model for this round only, nothing marked
  - anything else -> stops the round
  
  When the route runs dry it throws `free_all_exhausted` carrying `.cause = {model, kind, code, message}` — the last model that was skipped and why. Without it a mis-parameterised model is invisible: its `bad_request` is swallowed by the walk and the round reports only "all models exhausted". Layer H asserts on `.cause`.
  
  When the served model differs from the previous round's, `onModelSwitch` fires a toast; `onRouteStep` fires before each attempt after the first, so the UI can say "trying another model".

  **Round budget.** A walk stops after `MAX_MODELS_PER_ROUND` (4) attempts or `ROUND_BUDGET_MS` (120s, doubled with Deep Thinking on), whichever comes first. Without it a player whose key has many spent models pays a long silent walk on the first round after exhaustion, and a rotated key re-walks the whole route.

  **Timeout: slow model vs bad connection.** A per-attempt limit of 90s (180s with Deep Thinking on — measured, ~15% of thinking rounds exceed 90s) applies to the *first* attempt only; every later attempt in the same round gets `RETRY_TIMEOUT_MS` (30s), because a healthy model answers in 10-20s. **Two consecutive timeouts abort the round** with `timeout` and the second model is not marked: two failures at very different limits indicate the player's connection, not the models. Worst case is 90 + 30 = 120s, matching the budget.

  **Recovery probe.** `exhausted` marks are permanent, because for a given Aliyun account a spent free tier does not come back. The one thing that changes it is a top-up — so when the route is empty, the walk fires a single probe at the first route model, at most once per hour (`lastProbe` in the route state). If it answers, the account clearly has balance: every `exhausted` mark is cleared and the round is served. This is what stops a player who tops up from being permanently stuck in `free_all_exhausted`. `resetFreeRoute(apiKey)` does the same thing on demand, behind a control on the key page.

  **The reset control is always visible in free mode**, sitting on the status row. It was first shipped gated behind `available < total`, which meant a fresh key (28/28) never showed it at all — the one affordance for a stuck route was invisible until the route was already damaged. Smoke Layer G guards against that gate returning.

  State lives in `STORAGE_KEYS.ALIYUN_ROUTE` and resets when the API key's FNV-1a hash changes — which is what makes a brand-new account with a brand-new key start from a full route. A *rotated* key on the same account also resets, and then re-learns its marks; the round budget caps that cost at 4 failed calls rather than 28. Switching model costs one full prompt-cache miss — acceptable, since it happens only on exhaustion.
- **Paid** — the player picks from `ALIYUN_PAID_MODELS` (9 models, each with a `gameplay` cost string; `peakPricing` marks DeepSeek's 2x daytime rate). `resolvePaidModel` maps unknown ids to `qwen3.8-max`, which covers `qwen3.7-max` arriving through the legacy `rv_sim_qwen_submodel`.

**Free mode depends on a console switch.** Aliyun returns `403 AllocationQuota.FreeTierOnly` only when the account is unverified or "stop when free quota is used up" is ON. Otherwise it silently starts pay-as-you-go billing and no router can notice. The key page warns about this in free mode.

**Token Plan (`sk-sp-`) cannot be called from the browser.** It requires `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`, whose CORS preflight answers 401 with no `Access-Control-Allow-Origin` (probed 2026-09-15; `dashscope.aliyuncs.com` answers `*`). `callLLM` rejects `sk-sp-` keys up front with `token_plan_key`, and the key page's Token Plan subscription hint is gated behind `ALIYUN_TOKEN_PLAN_SUPPORTED = false`. Turning it on needs a server-side proxy first.

**Per-model params (`getAliyunModelFamily` / `getAliyunModelParams`).** Aliyun hosts three vendors behind one endpoint and they do not share a parameter dialect, so each model resolves to a family (by id pattern, no per-model list to maintain when Aliyun adds a snapshot). Source: `docs/api_references/aliyun_references.md`.

| Family | Models | Thinking | `reasoning_effort` when ON | Cap field | Cap OFF / ON |
| --- | --- | --- | --- | --- | --- |
| `qwen38` | `qwen3.8-max*`, `qwen3.8-flash` | toggle + `preserve_thinking` | `medium` (of `low`/`medium`/`xhigh`) | `max_completion_tokens` | 8192 / 65535 |
| `qwenHybrid` | `qwen3.{5,6,7}-{plus,flash}*` | toggle + `preserve_thinking` | **omitted** — the reference's effort table does not cover them | `max_completion_tokens` | 8192 / 65535 |
| `qwenOpen` | `*-397b-a17b`, `*-122b-a10b`, `*-35b-a3b`, `*-27b` | **never** — always `false` | n/a | `max_tokens` — open-weight builds are not on the `max_completion_tokens` list | 8192 / 8192 |
| `deepseek` | `deepseek-v4-*` on Aliyun | toggle | `high` (of `high`/`max`) | `max_completion_tokens` | 8192 / 65535 |
| `glm` | `glm-5.2`, `glm-5.1` | toggle | `high` (of `high`/`max`) | `max_completion_tokens` | 8192 / 65535 |
| `glmAlways` | `glm-5.3` | **none sent** | `max` (its only value) | `max_completion_tokens` | 32768 / 65535 |

**`glm-5.3` cannot stop thinking.** It rejects `enable_thinking:false` / `thinking.type:'disabled'` (documented), so it gets no toggle and an OFF cap large enough for thinking plus answer. Live data confirms the cap is needed: it spends 2,300-8,000 reasoning tokens per round regardless, and hit 9,019 completion tokens once. It costs roughly 2x the tokens and time of everything else even with Deep Thinking off, which is why it sits **last** in the free route.

`qwen3.8-2.4t-a95b` had the same restriction, undocumented, and was removed from the route entirely — it could not finish a round inside 90s (0 of 12). Its `qwenOpenAlways` family went with it. If it is ever re-added, it needs both a family with no thinking toggle and a much longer timeout.

**Deep Thinking is a no-op for `qwenOpen`.** Those builds score 12/12 clean with thinking off and 1/4 with it on — they return the whole JSON escaped inside a string, which no parser level can recover. The family therefore always sends `enable_thinking: false` and ignores `reasoningEnabled`.

Only the live probe can find this class of bug: the reference documents what a parameter does, not which models reject it, and it says nothing about which models *break* under a legal parameter. `node test/smoke.mjs --live-free` covers the first, `node test/playthrough.mjs` the second. Re-run both whenever a model is added to `ALIYUN_FREE_ROUTE` or a family pattern changes.

**Effort levels are chosen for the player.** The settings page only exposes Deep Thinking on/off; when it is on, each family uses one level below its maximum (`max` only where that is the sole legal value). Never surface `low`/`medium`/`high` to players.

**The one-below-maximum rule does not survive a long ladder — `gpt4omini` is a deliberate exception.** GPT-6 Luna offers `none`/`low`/`medium`/`high`/`xhigh`/`max`, so the rule would pick `xhigh`. The rule was written for two- and three-rung ladders, where one-below-max is a moderate setting; on six rungs it is near-maximal. A round asks for ~800 tokens of prose, not deep reasoning, and the README's "Thinking ON" costs assume ~1–2K reasoning tokens — an assumption `high` satisfies and `xhigh` would quietly break, raising every player's bill for a quality gain nobody has measured. It also cuts against what the model is for ("focused, high-volume tasks"). If another provider ships a ladder this long, weigh it the same way rather than applying the rule mechanically.

### Error Layer (`src/tools/llmErrors.js`)

Every failed call throws `LLMError {kind, provider, model, status, code, message}`. `parseErrorBody` accepts OpenAI-style `{error:{code,message}}` (verified live on both Aliyun endpoints), DashScope-native `{code,message}`, and Gemini's `{error:{status,details[].reason}}`, array-wrapped or not. `classifyError(provider, httpStatus, body)` then picks one kind, using `docs/error_code/*.md` as the source of truth:

| kind | Sources | Same-model retry |
| --- | --- | --- |
| `auth` | 401 everywhere; Gemini 400 `API_KEY_INVALID`; Gemini/OpenAI 403 permission; Aliyun `AccessDenied.Unpurchased`; missing key | none |
| `free_exhausted` | Aliyun 403 `AllocationQuota.FreeTierOnly`; Aliyun 429 "Free allocated quota exceeded" | none |
| `free_all_exhausted` | router ran out of candidates | none |
| `balance` | Aliyun `Arrearage` / overdue bills; DeepSeek 402; OpenAI 429 `credit_balance_exhausted`, `*_spend_limit_exceeded`, `*_usage_limit_exceeded`, `insufficient_quota` | none |
| `rate_limit` | every other 429 | 2s, then 5s |
| `server_busy` | 500 / 503 | 1s, 1s |
| `network` | `fetch` rejected (offline, DNS, CORS) | 1s, 1s |
| `timeout` | 90s abort; Gemini 504 | none |
| `model_unavailable` | Aliyun 403 `AccessDenied` / `Endpoint.AccessDenied` / `Model.AccessDenied`, 404 everywhere | none |
| `bad_request` | other 400 / 422, incl. Aliyun `InvalidParameter.NotSupportEnableThinking` | none |
| `bad_response` | HTTP 200 whose content is unusable: empty, `finish_reason: "length"` (truncated mid-JSON), or a parsed story under `MIN_STORY_CHARS` (40) | 2 retries, then next model |
| `content_blocked` | Aliyun `DataInspectionFailed` | none |
| `region` | Gemini `FAILED_PRECONDITION`; OpenAI 403 unsupported country | none |
| `token_plan_key` | `sk-sp-` key on Aliyun | none |
| `unknown` | anything unmatched | none |

Order matters inside the Aliyun rule: `free_exhausted` and `balance` are matched on code/message **before** falling back to status, because `Throttling.AllocationQuota` is a 429 that means either "free quota gone" or plain TPM throttling, and `Arrearage` arrives as a 400.

**`bad_response` exists so broken output never reaches the player.** A truncated response is unusable by construction — the parser's repair levels cannot close a string cut deep inside `socialContent`, so level 4 returns `text.substring(0, 500)` and the player is shown raw JSON. Measured on `glm-5.1` at 5 of 12 rounds before this existed. The degenerate case is the twin: `validateAndFixOutput` replaces any story under 20 chars with `"The story continues..."`, silently accepting a dead round (`qwen3.8-max`, ~8% of rounds). Both are now retried instead of rendered, as is a completely empty body — which previously returned `""` and let the parser's safe defaults stand in. The story-length check is supplied by `executeRound` as a `validateContent` callback so `llmTool.js` stays ignorant of the game schema.

**UI contract.** `App.jsx#llmErrorNotice(e)` renders `t.errors[e.kind]` — one short line in the player's language, most ending with "tap ↺ Retry" — as the round's assistant message tagged `{error: true}`, and `console.error`s the raw `kind/code/message`. The tag keeps error notices out of story exports and save slots. The Help Center **Errors** tab renders the same `t.errors` strings with what to do for each.

### Reasoning / Deep Thinking (`llmTool.js`)

`reasoningEnabled` defaults to **false** and is threaded App -> `executeRound` -> `callLLM` -> `callLLMOnce`. Providers differ in their default, so each branch sets the OFF state explicitly rather than relying on omission:

| Provider | OFF | ON |
| --- | --- | --- |
| `deepseek` | `thinking:{type:'disabled'}` (thinking is the upstream default — must disable) | `thinking:{type:'enabled'}`, `reasoning_effort:'high'`, `max_tokens: 65536` |
| `qwen` (Aliyun) | `enable_thinking: false` **boolean** (Qwen 3.x, and DeepSeek/GLM on Aliyun, all default ON), plus `preserve_thinking: false` where supported | `enable_thinking: true` + the family's `reasoning_effort` from `getAliyunModelParams(model)`; the `qwenOpen` family stays `false` — see above |
| `gemini` | field omitted — Gemini 3+ has no documented off switch; `thinkingLevel` bottoms out at `MINIMAL`, which is flash-lite's default | `reasoning_effort:'high'`, `max_tokens: 65535` |
| `gpt4omini` | `reasoning_effort:'none'` (documented on the model page, so OFF is explicit) | `reasoning_effort:'high'`, `max_completion_tokens: 32768` — **`high`, not `xhigh`**; see the note under Effort levels |

`preserve_thinking` is always `false`, never `true`: the game never sends `reasoning_content` back, and Aliyun bills preserved thinking as input on the next round. The `qwen3.8-max`/`qwen3.8-flash` docs also require echoing `reasoning_content` in its own field when preserving, which this architecture deliberately does not do.

The response reader uses `choice.message.content` **only** — never falls back to `reasoning_content`, so chain-of-thought can never leak into the story.

### Output token cap

`buildRequestBody` resolves two things per request: **which field** carries the cap and **which value** it takes.

- Field: `cfg.capField` per provider (`max_completion_tokens` for Aliyun and OpenAI, `max_tokens` for DeepSeek Official and Gemini), overridden per model on Aliyun by `getAliyunModelParams(model).capField`.
- Value: `cfg.maxOutputTokens` with reasoning off, `cfg.maxOutputTokensReasoning` with it on; on Aliyun, the family's `[OFF, ON]` pair.

| Provider | OFF | ON |
| --- | --- | --- |
| `qwen` (Aliyun) | 8192 (`glm-5.3`: 32768) | 65535 (`qwenOpen`: 8192, it never thinks) |
| `deepseek` | 8192 (upstream non-thinking default) | 65536 (upstream thinking default is 64K) |
| `gpt4omini` | 8192 | 32768 — at 8192 reasoning tokens could consume the whole budget and return empty content. GPT-6 Luna allows 128000; this is a ceiling, not a reservation |
| `gemini` | 8192 | 65535 |

A round only needs ~800 output tokens; these are ceilings, not reservations. Aliyun honors **both** cap names — verified live 2026-08-26: a cap of 16 truncates with `finish_reason:'length'` under either — so the per-model split is about matching the documented field, not about one being rejected. `test/smoke.mjs --live` asserts the cap is genuinely honored, not merely accepted, since an ignored unknown field would still return HTTP 200.

### Usage metering (`usageMeter.js` + `UsagePanel.jsx`)

Every provider returns a `usage` block and until v1.3.9 **nothing in `src/` read it**. Players run
their own key, so the cost of a round was invisible to the only person paying it — and this
project's central engineering claim, the ~95.8% cache hit, was something the README asserted
rather than something the app could show. The panel lives in the settings overlay.

**It is a module-level sink, not a value returned from `callLLM`.** `callModelWithRetry` and
`callAliyunFreeRoute` both return a plain string, and widening that to carry usage would touch
every branch of the route walk for a number none of them use. The sink also records the right
thing: `callLLMOnce` reports on **every** HTTP 200, so same-model retries and the attempts on
models the router walked past are all counted. Those are billed. A per-round return value would
report only the call that happened to succeed, and would understate a bad route walk by 4x.

Session-scoped and never persisted — no new storage key, nothing to migrate, and nothing leaves
the device. It does not reset on a new game: "what has this key cost me today" is the question a
BYO-key player actually has.

**A number that is not known is rendered as `—` or "not reported", never as `0`.** This is the
whole design constraint, and two separate cases force it:

- **Cache.** Twelve Aliyun route models send no `cached_tokens` field at all. Folding their prompt
  tokens into the denominator would drag a perfectly healthy cache toward 0% and tell the player
  the architecture is broken. Their calls are excluded from the rate and counted in
  `unmeasuredCalls`, which the panel names. Note the distinction the meter keeps: a **reported**
  `cached_tokens: 0` is a real 0% and is included; an **absent** field is not a measurement.
- **Cost.** Several served models have no published per-1M price — see `MODEL_PRICES_PER_1M`
  under Cost strings. One of them in a session sets `costComplete: false` and the panel says the
  real figure is higher, rather than showing a partial total that looks whole.

Where a price does exist, the peak multiplier is applied **at the moment of the call**, not at
render time, so a session spanning 22:00 Beijing is still costed correctly. Cached tokens are
subtracted from `prompt_tokens` before the miss rate is applied, since every provider counts them
inside it.

Smoke **Layer K** covers the meter and the pricing arithmetic offline.

---

## Add-on Features (v1.4.1)

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
    R1: <~100-char summary>
    R2: <~100-char summary>
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
    [Player Status] SelfId:38 Secrecy:97 Mood:82 Round:6 Scene:practice room
    [Affections] 🐰Irene:24(Acquaintance) | 🐻Seulgi:12(Stranger)
    [Stage Changes] 🐰Irene: Stranger→Acquaintance
    [Rounds Absent] 🐰Irene:0 | 🐻Seulgi:4 | 🐥Joy(npc):6
    [KKT Channels] Irene:unlocked | Seulgi:LOCKED
    [KKT Messages - round-relevant members]
    Irene: hey are you free tonight | you okay?
  + "[Story Mode: Free] ..." — the world's rule for the current mode, always sent
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

#### `[Rounds Absent]` shipped telling the model things that were not true

**Found by the step 7 re-validation, and it is the reason the feature looked ineffective.**
`memberAppearances` is observed from the prose by `membersNamedIn`, and that function matched a
member's **Latin stage name only**. Narration may use a member's real name freely — only *address*
forms are confined to dialogue — and Chinese prose does it constantly:

> `门外的走廊传来轻微的动静，那是涩琪和胜完刻意放轻的脚步声。`

Seulgi and Wendy are both in that scene and neither was recorded. Measured on one pinned 25-round zh
run: **29 of 75 (round, member) pairs name her only as 涩琪 or 胜完**. Those rounds sent the model
`Seulgi:5` about a member who had just been in the previous scene.

**A false fact in the tail is worse than no fact**, and worse in a specific way: it contradicts the
model's own context, so the line stops being information and becomes noise to discount. Everything
`[NPC Appearances]` was deleted for — a label counting something the game does not have — applied to
its replacement in a quarter of rounds, which is exactly the trap this file keeps recording.

`membersNamedIn` is now **exported and pure**, unit-tested directly rather than only through a live
round, for the same reason `addSaveSlot` is. It matches the stage name, `name_kr`, and the given-name
form prose actually writes (`孙胜完` → `胜完`, `배주현` → `주현`, `Bae Ju-hyun` → `Ju-hyun`), longest
alias first with masking. **Two characters minimum for either real-name form** — a single CJK
character sits inside ordinary words, the same reason the prose analyzer stopped counting a bare `아`.

**`scripts/analyze-prose.mjs` had the identical bug**, so every rotation number this project has
recorded — including the six committed baselines — measured which name form the model chose rather
than who was in the scene. It read **20% rule violation on a run whose real figure is 0%**. The
harness now stores `name_kr` in `report.roster` so the analyzer can see past the stage name at all.

#### …so rotation is unresolved, and the A/B that was supposed to settle it could not

Four 25-round runs, `qwen3.7-plus-2026-05-26` **pinned and recorded in every arm**, identical flags
(`--rounds 25 --lang zh --identity 财阀 --pace 高压舆论向 --subs 2`), differing by exactly one line —
`buildDynamicTail`'s `parts.push` for `[Rounds Absent]`. Measured with the corrected matcher:

| | with the line | line removed |
| --- | --- | --- |
| **section 3 broken, % of (round, member) pairs** | **26.7%** and **0%** | **5.3%** and **16%** |
| distinct scenes / 25 | 23, 8 | 15, 7 |
| reused sentences | 0, 48 | 14, 2 |

**Run-to-run variance inside one arm is larger than any difference between the arms.** Two runs of
identical code and identical flags produced 0% and 26.7% rule violation, 0 and 48 reused sentences, 23
and 8 distinct scenes. **No claim about `[Rounds Absent]` survives that**, in either direction — and an
n=1 A/B on this harness is not evidence about a prompt change, which is the methodological lesson of
step 7 and the correction to `test/README.md`'s A/B section.

What *is* established, because it needs no comparison: **rotation is not fixed.** Three of the four
runs break section 3 in 5–27% of (round, member) pairs, and all six committed baselines sit between
12.5% and 40% on the old (over-strict) matcher. Nothing in the prompt has yet moved that.

**And the one arm that mattered had never been run**: every measurement above was generated by code
whose absence counts were partly false. A run on the corrected code is the first honest test of the
idea, and `docs/PROPOSALS.md` §4 carries the decision that follows it.

**Do not read `rotation.worstGap` as the answer.** It is a maximum: the confounded pre/post pair reads
9 → 9 while the rule rate moves 16% → 21.3%. `rotation.rulePct` is the rule's own unit and is the row
to read.

**One line covers everyone, and it replaces `[NPC Appearances]` rather than reviving it.** That block
rendered a different unit (`Joy(last: round 2)`) for a rule about the same thing, from a field nothing
ever wrote — so it is gone, along with `npcAppearances` itself. Two labels counting the same quantity
in two units is how the `[Stage Changes]` id-vs-name mismatch happened one line up. An old save may
still carry `npcAppearances`; it is simply ignored.

**Appearances are observed, not drawn.** `executeRound` derives them from the prose — a member appeared
if the story names her — which is what finally makes `memberAppearances` describe the game. The lottery
in `probabilityEngine.js` used to write a single fabricated entry per round for whichever member it drew
*after* the round was generated; see `docs/PROPOSALS.md` §4 for what is left to decide about the engine
itself. Longer names are matched and masked first, so a member whose name is a substring of another's
cannot have her absence reset by someone else appearing.

**Every line in the tail names a member the way every other line does.** `[Stage Changes]` used to
print the raw member id beside an `[Affections]` line printing `🐰Irene`, so the model had to match
`irene` to a name one line above — and a custom member's id is a timestamp, which matches nothing at
all. It falls back to the id only for a member the roster no longer contains.

**`[Affections]` lists only `roundMemberIds`** — main plus subs, the members who actually have a
score. Listing the whole roster printed every NPC as `0(Stranger)` for the entire game, which told
the model in round 30 that the main member's groupmate, present in most scenes, is a stranger. An
empty `roundMemberIds` still lists everyone, so a two- or three-argument caller is unchanged.

**KKT injection rule**: only inject KKT history for `roundMemberIds` whose **current** affection is at or above `KKT_THRESHOLD`, and only in the dynamic tail — never in the ledger. Affection can fall, and the stored messages do not disappear when it does; re-checking the threshold at build time is what stops a member who dropped back below 30 from silently keeping her channel open in the prompt.

**`[KKT Channels]` is the line that stops the model narrating a text it was not allowed to send.** `filterKktByAffection` runs *after* generation, so for two releases the model was asked for `kktMessages` from every target member, wrote the story around the message it had just sent, and then watched us delete the message and keep the prose — "you get a Kakao from Yeri" with nothing in the Kakao overlay. The lock is per-round state, so it belongs in the tail, not in the static schema. Fixed in v1.3.6; the static prompt's rule points at this line.

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
5. **Phase rules** — rounds 1-6 (stranger), 7-14 (familiar), 15-24 (pressure), 25+ (consequences)
6. **Unknown-character rule** — only members in MEMBER PROFILES may appear by name; other roles are unnamed archetypes (manager, assistant, executive, fan)
7. **summary field** — always English, ~100 chars, stored on each `history` entry as the collapse target and mutated into `text` when that entry collapses `full` -> `summary`. Never shown to the player.
8. **Speaker contract + address protocol** — who "I" and "you" are, and what each character is allowed to call the others. See below.
9. **What moves each stat in THIS world** — section 10 prints one line per stat from `world.statNotes`. The stat *keys* are permanent and their *labels* are i18n's; the world supplies only the prose saying what raises and lowers them, which is the half no other file holds a copy of.
10. **Canon places and the opening** — section 11, from `world.places` and `world.scenario`. See *Where she is decides who is there*.

### Who is speaking, and what she calls whom

Three failures shipped together here, and they look like one bug to a player:

**The age line was inverted.** `ageDiff = playerBirthYear - memberBirthYear` is positive when the **player** is younger — but the sentence it produced was printed inside the **member's** profile as `Age Texture: 15 years younger`, which reads as the member being the junior. Every member in every group carried a backwards age statement. The model was following the prompt correctly; the prompt was wrong.

**The player had no Korean address form.** Members ship as `${m.name}(${m.name_kr})`, the player as a bare `Name: …`. When the model needed a Korean-sounding way to address her, the only ones in the prompt were the members' own — which is how you get Irene saying *"Bae Ju-hyun, thanks for the coffee"* to the player. It is not confusion about who is speaking; it is a vocabulary the prompt never supplied.

**Dialogue was explicitly exempt from the pronoun rule** (*"members may address the player by name, nickname, or title — that is fine"*), so nothing defined `I` / `you` inside quotation marks.

The fix is a per-member **Address** line computed from birth years plus the player's identity, and a `CAST IDENTITY & ADDRESS` section carrying the speaker contract. Both are derived from data fixed at game start, so they sit in the static system prompt and cost nothing per round.

**Direction is hard, register is soft — this distinction is the whole design.** Which titles exist between two people, and which way they point, is decided by birth year and never flips: if the player calls her *unnie*, she never calls the player *unnie*. How much of that formality is actually spoken is a blend of three things the prompt hands over together — the age gap, the current stage from `[Affections]` in the dynamic tail, and her Private Personality. A same-age member is already informal at Stranger; a blunt member drops honorifics early where a reserved one keeps them well past Flirting; a wide age gap leaves a trace of deference even at Lovers. Prescribing a form per stage would flatten exactly the texture that makes members feel different, so the prompt states the inputs and lets the model blend them.

Korean workplace register overrides age where it genuinely would: a **Staff** player is `매니저님` and a **Chaebol** player `회장님` regardless of who was born first, softening toward her name as they get close.

### Whose life is whose — the ROLE CONTRACT

**A fourth failure in this family, reported from hand play and fixed in v1.4.0 step 6.** The player's
identity and the members' leaked into each other, in both directions at once:

- A **Chaebol** player is the company's chairman, and Irene said *"作为会长，我…"* — claiming the
  player's office — while narration wrote *"Irene越过你离开走向会长办公室"*, treating 会长 as a third
  person in a room the 会长 is standing in.
- The same player was handed the members' working life back: her own trainee practice, and Irene
  reminding her not to be late for tomorrow's.

**Neither was the model's.** Two things in the prompt caused it, and both are the absence of a
statement rather than a wrong one:

1. **The role had no owner.** Section 6 listed `Identity: 财阀` as a bare label in a flat run of
   `Identity:` / `Progression Pace:` / `Main Member:` / `Sub Members:` — so the player's occupation
   sat in the same unowned list as the roster. It is now `<player>'s identity:`.
2. **`会长` entered the prompt only as an address form.** `workTitle` supplies `会长nim` / `회장님` as
   what members *call* her, and nothing said the title *names* her. A floating role noun is one the
   model may attach to anyone.

And the amount of context on each side is wildly asymmetric: sections 4 and 5 give the members
thousands of tokens of practice rooms, comebacks, dorms and schedules, against one line for the
player's job. When the model needs an occupation for anyone, idol is what is available — so the
player drifts into the group's calendar unless told she is not on it.

**The SPEAKER CONTRACT governed pronouns and names and said nothing about roles**, which is the
third time a contract in this section has been read, correctly, as exhausting its subject: dialogue
was once exempt from the pronoun rule, address forms once had no narration/dialogue scope, and now
roles were not mentioned at all. **When a contract enumerates, the model treats what it omits as
unconstrained.** Check what a new rule's neighbours *do not* say.

The `ROLE CONTRACT` now sits beside it, and the "unless her identity places her there" clause is
load-bearing: a **练习生** player really does have practice and a **韩娱艺人** really does have a
comeback, so the rule cannot be a flat denial. Note also that `练习生` points its work title the
other way — she uses `선배님` *for* the members — so the contract is written about the identity, never
about the title's direction.

### Reading the whole rendered prompt, once, found six more

Prompted by the report above: if one setting statement was unclear, others would be. The artifact to
read is a **golden fixture** — it is the rendered prompt, every substitution already made — and
reading all 240 lines of one turned up six defects that throw no error and fail no test. None was a
wrong rule; five were two rules disagreeing, and one was debris.

| Found | Was |
| --- | --- |
| **Editing debris in every prompt ever sent** | a bare `// Change to:` line sat between the JSON rules and the memory context |
| **The schema example named a real agency** | `scene` was exemplified as `"SM Practice Room, 10PM"`, handing every cast SM's name whatever company they are under — the YG leak again, but written in as an example to follow |
| **Section 1 contradicted section 6 on Korean** | *"Korean words (like unnie, xi) may appear **rarely** with … **translation in parentheses**"* against section 6's exact table, no gloss, and *"frequent enough to feel Korean"*. Section 1 is headed HIGHEST PRIORITY, so it won — and its own example `unnie` is spelled `欧尼` by the table it was overruling. It predates the address protocol. It now defers to section 6 instead of competing |
| **The round counter was offered as a stat** | *"Player 4 stats: … \| 📅Round"*, beside three the model may actually change |
| **Section 10 contradicted the schema** | stat changes were *"NOT mandatory"* while `RULES` demanded *"at least 1 field non-zero"* |
| **A fragment from an earlier edit** | `- Relationship stages: - Stages: 0-15 Stranger…` |

**The pattern in five of the six is a stale rule left beside a newer one.** Nothing in this repo
fails when two sections disagree; the model simply picks, and it reasonably picks the one marked
HIGHEST PRIORITY or the one carrying more specific detail — which is the same mechanism that made
section 4 outrank section 6 in the cross-group bug. **When a rule is added to the prompt, grep for
what the old one said about the same thing and delete it.** A prompt is not append-only.

Guarded in Layer I, one check per finding, each mutation-verified. The language-rule check **sweeps
all three languages**, because the first version tested only the English prompt: the contradiction
lived in the zh and en rules separately, so mutating zh left the guard green and only the zh golden
moved. A per-language rule needs a per-language check.

**Both of that read's open items are now closed.** The stage labels are localized (see Relationship
Stages), and section 4's preamble is conditional on `groupConfig.loreComposed`:

| Roster | Preamble |
| --- | --- |
| a real group | *"This is the established world-setting. Draw from it freely — reference group history…"* — **verbatim**, which is what the goldens pin |
| composed, or all-custom | *"It has NO published history… build their shared past as the story goes… Never borrow a real group's history, discography or agency"* |

Asking a composed cast for "group history, inside jokes and past events" is asking the model to
invent one, and **the nearest history it knows belongs to the real groups the members came from** —
the leak the composed lore exists to close, requested in the preamble two lines above the lore that
closes it. `loreComposed` is set in **two** places in `resolveRoster` (the spread branch and the
synthesised all-custom branch), and each has its own guard, because the all-custom branch is where
the request is most obviously wrong and it does not share a line of code with the other.

**The classic door's preamble is unchanged, word for word** — smoke asserts the whole sentence, so
"one engine, two doors" still holds at section 4.

### Reading it a second time found nine more, and seven were invisible to zh

Same method on the same artifact, at the start of step 7: read all 240 rendered lines of each of the
three goldens rather than the diff. **Reading only the zh fixture would have found two of the nine** —
seven of them are defects a Chinese game cannot express, because zh is the language the data is
authored in and every other language is a translation of it.

| Found | Was | Who saw it |
| --- | --- | --- |
| **The player's pace never reached the model** | `Progression Pace: 高压舆论向` — the bare stored id, in every language, while the authored rule that says *"secrecy changes doubled"* was referenced by nothing | everyone |
| **…and the label was an internal key** | so an English player's prompt carried a Chinese id she cannot read, while Setup showed her "High Pressure Scandal" | en, ko |
| **The identity had both defects** | `Alex's identity: 财阀` | en, ko |
| **Section 1 forbade the members' own names** | `DO NOT output English characters` in the ko rule — and every member in MEMBER PROFILES is named by her **Latin** stage name. Section 1 is HIGHEST PRIORITY, so the two could only resolve one way | ko |
| **The ko narration example taught a grammar error** | `"<name>는 창가에 서 있다"` — a topic particle chosen by how the name is *pronounced*, so right for Joy and wrong for Irene (아이린**은**) | ko |
| **Korean particles after every interpolated word** | `Irene가`, `미숙함로`, and a literal unresolved `편지을/를` | ko |
| **The key enumeration listed 7 of 8 keys** | `scene` was required by the schema and absent from the list that guards it | everyone |
| **Three empty-value renders in section 6** | a solo run printed a blank line where sub members go; a custom main printed `Kim()`; a custom identity printed a second blank line | ko fixture (subs), no fixture (the others) |
| **"a young WLW woman"** | hardcoded, against a field that accepts ages 18 to 80 | everyone |

Plus two wordings that were merely unclear — *"Choose the three yourself"* (choose *which* three?)
and a shared *"It relaxes toward her given name"* clause on a Work override whose two branches point
the title in **opposite** directions, so it named the wrong person in one of them — and, in the
world data, a trailing space in one pace rule and `scences` in another.

**The lesson is about which fixture you read, not about reading one.** `zh` is where the content is
authored; `en` and `ko` are where a translation can disagree with the code that consumes it. The
first read covered six defects and they were all visible in zh, so nothing suggested the other two
fixtures carried a different *kind* of defect. They do: every one of the seven above is a statement
that is true of the Chinese data and false of a translation of it. **Read the non-authoring
language's fixture, and read it for agreement with the code rather than for typos.**

Guarded in Layer I, one check per finding, all 27 mutations verified RED.

**The pace rule is measurably doing something, which is the payoff for wiring it.** `高压舆论向` says
*"secrecy changes doubled"*; `慢热现实向` says *"affection grows slowly… no rushing"*. Live, from the
same starting secrecy of 100: the high-pressure run fell to **11 in 25 rounds**, the slow-burn run to
**91 in 20**. An 89-point drop against a 9-point one is not noise, and before step 7 neither run could
have differed, because the only thing either sent was the id.

### Korean particles cannot be authored, because the word in front of them is a variable

`{name}` is whichever member the player picked and `{keepsake}` is one of four, so `ko.json` could
not write one form — and what it wrote instead was wrong for about half of all casts. It is the same
shape as the `Alex--ya` double hyphen: a defect that breaks no test, throws no error, and is only
visible to someone who reads the language.

So the world file writes the pair in its conventional order (`은/는`, `이/가`, `을/를`, `과/와`,
`으로/로`) and **`resolveKoreanParticles` in `worldLoader.js` picks**, running last in
`renderIdentityBackground` because every word in front of a particle has just been substituted in.
Three rules:

- **Hangul decides exactly.** A syllable encodes its own final consonant: `(code - 0xAC00) % 28`,
  where 0 means it ends in a vowel. So `미숙함으로`, `편지를`, `사진을` are not guesses.
- **ㄹ is the one exception** and it is in the set: 서울**로**, never 서울으로. Jongseong index 8.
- **A Latin name is left as `은(는)`, deliberately.** Guessing from the last letter is worse than not
  trying — Irene reads 아이린 and ends in a consonant though its last letter is a vowel; Winter reads
  윈터 and ends in a vowel though its last letter is not. The parenthetical dual is exactly what
  Korean writes when the noun is a variable, and it is never wrong.

**It is inert on zh and en**, which carry no pairs, and smoke asserts that — a resolver that could
rewrite a language it was not written for is worse than none.

The one remaining hardcoded particle was in `mainAgent.js`, not the data: the SPEAKER CONTRACT's ko
narration example. That one is fixed by **changing the frame rather than resolving it** — `의 시선이
창가로 향했다` needs no name-dependent particle at all, and an example carrying `은(는)` would teach
the model to write the parenthetical into prose.

### Korean address forms are transliterated, never localized

The setting is South Korea and the audience is K-pop fans, so Korean address forms stay Korean in every output language. Rendering 언니 as the Chinese 姐 (or the English "big sister") reads as a domestic family drama and throws away the register the game is built on. The prompt carries a token table plus a markers block that bans the native substitutes **by name** — a generic "keep it Korean" is not enough, because 姐 is what a model reaches for by default.

**Since v1.4.0 that table is data rather than code**, and since v1.4.1 step 1 it lives in
`public/worlds/_registers/<lang>.json`, keyed by **register**, with each world naming the register
its `country` speaks. It reads like a per-*language* table and it is not: it is keyed on
**(register, language)**. These forms encode Korean seniority, which is a birth-year boundary; a
Japanese setting needs 先輩/さん/ちゃん and seniority by *school year*, and a Chinese one has almost
no formal peer register to carry at all. Keeping `unnie`/`xi` while changing the country would put
Korean grammar in a Tokyo scene.

**A country is a FIELD on the world, not a world of its own** — corrected in v1.4.1, where the
earlier rule ("a background country ships *as a world*") turned out to be over-cautious. The
address protocol already has a rank override: `workTitle` makes a `Staff` player `매니저님`
*regardless of who was born first*, so a professor addressed as `교수님` by her student is that
same mechanism with new strings, not a second seniority axis. `country` therefore carries a name
and a `register` pointer and no logic at all.

**Four worlds set in Korea must not carry four copies of one table.** That is why the register is
resolved rather than duplicated: `parseWorld` looks up `country.register` and attaches the result
as `world.addressForms`, so `buildSystemPrompt` reads exactly what it always read while exactly
one copy exists on disk. A world naming a register nobody ships **throws**; it does not fall back,
because a prompt with no address protocol in it reads as the model simply declining to use
honorifics. Only the tokens are data; the *logic* — direction fixed by birth year, register blended
from stage and Private Personality — stays in code, because it is behaviour rather than content.

| | 언니 | 님 | 씨 | 야/아 |
| --- | --- | --- | --- | --- |
| zh | `欧尼` — never `姐`/`姐姐` | **`nim`, in Latin** — never `尼姆` | **`xi`, in Latin** — never `西` | **standalone `呀！` only** — never `小饼呀` |
| en | `unnie` — never "big sister" | `-nim` | `-ssi` | `-ya`/`-ah` |
| ko | `언니` | `님` | `씨` | `야`/`아` |

**zh deliberately mixes scripts.** 언니 has a settled Chinese transliteration that fans read fluently (`欧尼`), but 님 and 씨 do not — a reader knows `会长nim，早上好` at sight and stumbles over `会长尼姆`. Romanization for those two, Chinese characters for the other; the split is by what the audience actually reads, not by consistency.

**야 is the exception that shows where transliteration stops working — fixed in v1.3.9.** The rule
above says keep the Korean form and trust the reader. That holds for 欧尼 and `nim` because
neither is a Chinese word: the syllable arrives carrying only its Korean meaning. It **fails** for
야, because the obvious transliteration `呀` *is* an existing Chinese particle with a different
job. Korean 야 is a vocative suffix attached to a name (`민지야`); Chinese 呀 is sentence-final.
Transliterating the sound therefore imports the wrong grammar, and `小饼呀，你来了，吃饭了吗`
parses as Chinese and reads as slightly off — the plain `小饼，你来了` is what a native speaker
writes, because the sentence is ordinary small talk that wants no particle at all.

So zh keeps 呀 **only in the use where the two languages agree**: standing alone at the head of a
line as an exclamation — `呀！你胆子真大了` — for surprise, embarrassment or mock indignation.
Warmth in Chinese is carried by the bare given name or a nickname, not by a suffix. `en` is
unaffected (`Yerim-ah` collides with nothing in English) and `ko` is native.

Generalise it when adding a form: **transliterate only where the target language has no competing
function for that syllable.** Where it does, keep the Korean form for the sense the two share and
express the rest the way the target language actually does it. Reported from hand play in
v1.3.9 by a native speaker, which is the only way this class of bug is ever found — it breaks no
test and throws no error.

**Address forms are spoken, not narrated.** `欧尼` / `nim` / `xi` and every per-member Address
line belong **inside quotation marks**. In narration a member is her stage name alone:
`Irene正站在窗边`, never `Irene欧尼正站在窗边`. The SPEAKER CONTRACT scoped *pronouns* to narration
from v1.3.6 but said nothing about address forms, and the token examples carried no scope marker,
so the model reasonably applied them everywhere. Also reported from hand play in v1.3.9.

zh also romanizes 씨 as **`xi`**, not `ssi`, because that is the pinyin a Chinese reader maps back to 시.

`playthrough.mjs` grades this from the other side: `sinicized-honorific` fires on `<Name>姐` in zh and `<Name> sister` in en, so a model that localizes anyway is caught in real prose.

Comparison is by **birth year, not age gap in years** — Korean seniority is a birth-year boundary, so a 1994 and a 1995 member are not peers even though they are months apart. The old `±2 years` tolerance erased that distinction.

**The player's birth year is collected, not derived — v1.4.0 step 4.** Setup asks for
`form.birthYear` and the prompt renders her age from it; through v1.3.9 it ran the other way,
`playerBirthYear = GAME_YEAR - playerAge`, which assumes her birthday has already passed this
year and is therefore **wrong for roughly half of all players**. Reported from hand play in
v1.3.9: a player born 1999-11-19 entering age 26 derived **2000**, so Yeri (born 1999) became her
senior when the two are peers, and the game told her to say `欧尼` to her own age group.

Age cannot determine a birth year — the information is not in it — and since seniority is a hard
year boundary with no tolerance, a one-year error flips the relationship outright whenever it
lands on a member's birth year. For a cast spanning three or four years that is a large fraction
of the cast, which is why this was worth a save field rather than a heuristic.

**`age` did not leave the save; it stopped being the source of truth.** `backstorySeed` hashes
it, and that seed must stay frozen for the life of a save or an identity backstory re-rolls
mid-game. So setup writes `age` once, derived from the birth year, and nothing edits it
afterwards. Birth year is the live value; age is a frozen setup token that the prompt also
happens to print.

**Old saves migrate to `birthYear = GAME_YEAR - age` — the same arithmetic, done once.** That is
deliberately *not* a fix: it reproduces the value the save already had, so a game in flight is
byte-identical before and after migrating and nobody's honorifics move under them. Smoke asserts
exactly that. The consequence is that **a pre-v1.4.0 save keeps its ±1 error**, because nothing
can recover a birth year from an age.

**So the player is given the year back — `correctBirthYear`, in the settings overlay, since step
6.** It is the counterpart to the migration's deliberate non-fix and lives in the same file for
that reason. Three rules, each one a guard:

- **It writes `birthYear` and never `age`.** Setup's `setBirthYear` writes both, because that is
  where `age` is minted; the correction writes one, because `backstorySeed` hashes `age` and a
  recomputed one re-rolls the identity backstory mid-save. They are therefore **two functions and
  must stay two** — smoke turns red if the UI calls Setup's.
- **An unchanged year returns the same object**, so re-confirming a correct year is not a
  ~5,500-token cache miss. Only a real change pays, which is the right price for a deliberate act
  and the wrong one for a no-op.
- **`validPlayerBirthYear` is one function in `constants.js`.** It used to be a copy in `App.jsx`;
  a second writer of the field is exactly how the two start disagreeing about which years are legal.

Whether the year is an *estimate* is session state, decided in `loadSave` by whether
`save.form.birthYear` existed **before** `migrateSave` filled it — read it from the migrated copy
and nothing is ever flagged. It is deliberately not a save field: the row is permanent and
self-describing, and the flag only chooses one extra line of explanation.

**`parseGroupConfig` is a field whitelist, and it was dropping `birthday`.** v1.3.6 shipped the corrected address protocol and it was **inert in the running app**: `groupLoader.js#parseGroupConfig` rebuilds each member field by field, `birthday` was not on the list, and `buildSystemPrompt` fell back to `"2000-01-01"` — so the entire cast reached the prompt as one birth year and the age line was uniform nonsense rather than merely backwards. Fixed in v1.3.7.

The lesson generalises past this field: **a test that reads `public/groups/*.json` directly tests the formatter, not the feature.** The v1.3.6 checks did exactly that and passed while the app was broken. Anything asserting on member data must load it through `loadGroupConfig`, which is what smoke Layer I now does. When you add a member field to a group JSON, add it to the whitelist in the same commit or it will not exist at runtime.

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

1. Direct `JSON.parse` on the LLM response
2. Strip markdown fences, retry `JSON.parse`
3. Regex field extraction (the story regex handles `summary` sitting between `story` and `options`)
4. Return safe defaults — never crash the round

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


### The platforms belong to the world, not to the cast

**A group JSON declared `social_platforms` and `private_chat` from the first version, and nothing
ever read them.** `parseGroupConfig` manufactured `socialPlatforms` / `privateChat` with defaults,
[groupLoader.js:108-109](src/rag/groupLoader.js#L108-L109), and no file in `src/` consumed either —
the fifth instance of the shape this file already tracks four times (`npcAppearances`, bubble
`photoDesc`, cast photos, `STAR_LEVELS`). Both are **deleted** in v1.4.1 step 6, from the loader,
from `groupConfigTemplate.json`, and from all 30 group files and their 30 root mirrors.

They were also in the wrong file. **The same five members are idols in one world and law students
in another**, and a cast file cannot know which — so the platform list is `world.platforms`, and
step 7's campus, office and chaebol worlds declare Instagram and KakaoTalk only. A member-to-fan
subscription product and a fan community are idol infrastructure.

**The world declares WHICH platforms exist; `src/config/platformConfig.js` says what each one IS.**
That split is the opposite of the one `castLore` takes, and the difference is what the text is
about. `castLore` describes *this world's* organisation, so three worlds genuinely need three
wordings. Instagram's rule — *"Photo social. Style: aesthetic, short caption + emoji"* — is true in
a lecture hall exactly as it is in a practice room, so putting it in world files would be four
copies of one sentence with nothing keeping them in step.

The catalog is the single source for **five** renderings of that list, which is five chances for
the sixth to be the copy that still says weverse:

| Consumer | Was |
| --- | --- |
| section 2's `socialContent` schema | `"bubble":[…],"instagram":null,"weverse":null` inline |
| section 7's rule lines | six hand-written bullets |
| the RULES format lines | four hand-written bullets |
| section 1's `bubble/instagram/weverse/KKT` | a literal inside each language's `socialRule` |
| the top bar's buttons | four `{icon, type}` literals in the JSX |

The **feed shape** in `App.jsx` is deliberately *not* a sixth consumer. It is internal state, and a
key for a platform no button opens is unobservable — the filter below is what stops undeclared
content getting that far.

**An unknown platform in a WORLD FILE throws; an unknown platform in a MODEL RESPONSE is dropped
silently.** The asymmetry is the design, not an inconsistency. A world file is authored here, so an
id the app has no overlay for is a typo that must fail loudly — the unknown-register rule from step
1, and a top-bar button that opens nothing is worse than a load failure. A model response is
untrusted text, so a stray `weverse` is data to discard: it must never break the round.

**`filterSocialByPlatforms` is where that happens, once, in `executeRound`.** It is pure and
exported so it is unit-tested directly rather than only through a live round, the same reason
`addSaveSlot` and `membersNamedIn` are. Two things it does not do: it does not **invent** a declared
platform the model omitted (an empty `instagram: {}` renders a post nobody wrote), and it does not
**mutate** the response. And it must run before *both* readers — the notification derivation and the
feed write — because the notification strip is a live entry point that would otherwise open an
overlay for a platform with no button anywhere else in the app. The guard **counts the readers**;
one of two is the `extractStoryText` failure.

**Platforms resolve from the SAVE's world**, never from whichever world is selected. That is already
true rather than newly built: step 3's `loadSave` sets `world` from `migrated.worldId` before the
phase flips, so a run started under `kpop_idol` keeps all four platforms for its whole life. No save
field, no migration.

**That was right about the READER and wrong about the WRITER, for two releases.** `loadSave`
does resolve platforms from `migrated.worldId` exactly as described — and `migrated.worldId`
came from a slot that recorded `roster.worldId`, which the cast builder stamps one screen
before the player picks a world. So a chaebol run saved `kpop_idol` and loaded back with all
four platform buttons, and the sentence above was true of every line of code it names. Fixed
in the second phone pass; see *The second phone pass*. **A claim about where a value is read
from says nothing about whether the value is right.**

**The prompt is byte-identical and the goldens did not move.** Every world on disk declares all three
social platforms in that order, so a correct implementation renders exactly what step 5 rendered —
`update-golden.mjs` was not run at all. The trimming is exercised against a synthetic
instagram-only world in smoke, which is the only way to test it before step 7's content exists.

**One guard here was replaced because it could not fail.** *"Every platform a world declares exists
in the catalog"* is precisely what `parseWorld` throws on, so the mutation crashed the load before
the check ran — a check that duplicates a validator is decoration. What can fail independently, and
what makes the throw worth having, is the other end: **every catalog entry has an overlay `App.jsx`
can open.** The `ui` field is where that goes wrong, since the world says `kakaotalk` and the
overlay has always been `kakao`.

**The KKT unlock is enforced in two places, and both are needed.** `filterKktByAffection` drops messages from members below the threshold *after* the response arrives — that is what keeps them out of the overlay. But the story was written in the same response, around a message the model believed it had sent, so filtering alone leaves prose describing a text that never appears. The `[KKT Channels]` line in the dynamic tail tells the model which channels are open *before* it writes, and the static prompt forbids narrating a text from a locked member. Filtering stays as the backstop for a model that ignores the instruction.

**A Kakao is delivered by the app and never by the story — for every member, not only locked ones.** The prohibition used to live *inside* the LOCKED-channel bullet, which reads as permission for an unlocked one: a long, specific, emphatic rule conditioned on "LOCKED" invites the inference that an unlocked member may be narrated. That is specification by contrast, and it dates the symptom — the locked bullet landed in v1.3.6, which is when a rare bug became a regular one. Reported from hand play on DeepSeek Official in zh: a round delivered Irene's Kakao *and* transcribed it into the prose, complete with a phone-screen header, so the player read the same three lines twice — once in the narrator's voice, before she had looked at her phone. Fixed in v1.4.0 by stating the rule unconditionally and *first*, with the locked case as an additional constraint rather than the only home for it.

**The live grader had the identical blind spot**, which is the more useful half of the lesson. `kkt-narrated-but-locked` runs only `if (!delivered)`, so a round that delivered a Kakao and duplicated it was invisible to it by construction. `kktTranscribed` covers the delivered case by matching a delivered message **verbatim** in the prose — language-independent, and prose does not coincidentally contain a whole chat line. When a rule is scoped to one branch, check whether its detector is scoped to the same branch.

**The third attempt at this rule changes the schema's key ORDER, not its wording — and it is the
first live flag in this project that survived reading the prose.** Step 7's long run put
`kkt-transcribed-in-story` on **3 of 20 rounds** in a `练习生` zh game, against 1 in 64 previously.
Reading all three stories confirmed the model, not the grader: round 12 wrote *"是Irene发来的消息：
保温杯记得明天还给她。走楼梯小心台阶。"*, round 14 a phone buzzing with the message quoted, round 18
three of Irene's messages quoted as displayed text with the screen dimming and lighting again. The
rule they break is unconditional, stated first, and already gives the reason ("before she has looked
at her phone").

**The cause is mechanical. `kktMessages` sat immediately before `story` in the schema, and a model
emits keys in the order it is shown them** — so the last thing in its context when the prose began
was a Kakao it had just written, and the most emotionally loaded line it had. Round 18's entire scene
is built on those messages. Telling it not to, louder, is what the previous two attempts did.

`story` and `summary` now come **before** `socialContent` and `kktMessages`, and section 2 says so
explicitly rather than leaving the order to imply it. **Social content gains the same way**: written
after the story it can react to the round, where before it was composed against a round that did not
exist yet — which is why section 7 can now ask for posts about *this* day.

Two things this touched that are worth knowing:

- **`parseLLMOutput`'s newline repair was anchored on the key that FOLLOWS `story`** — `"options"`,
  then `"(?:summary|options)"` when summary was inserted between them. It is the repair that keeps a
  model emitting raw newlines inside `story` parseable at all, and it had therefore stopped working
  silently at each past reorder. It now matches any following key.
- **Measure `parseLevel`, not just the flag.** The reorder asks a model to emit ~800 tokens of prose
  earlier in its response, and the 4-level parser exists because weaker route models struggle with
  long JSON. The harness records `parseLevel` per round; compare `direct` rates before and after
  rather than assuming. **Measured: `direct` on 85 of 85 rounds across four configurations** — the
  reorder cost nothing at all on that axis.

**The reorder cut it from 15% of rounds to 4%, and the fourth attempt is an ownership statement.**
Post-reorder: 2 transcribed Kakao in 45 zh rounds, against 3 in 20 before. Both survivors read the same
way, and neither is a model being careless — they are the model reaching for a beat it is good at:

> `是涩琪，通过公司内部系统发来的消息` — "a message from Seulgi, through the company's internal system"

**It routed around the rule.** The prohibition names "a Kakao message, a chat transcript, a phone screen
lighting up, or a notification", so the model invented a channel that is none of those. The second case
names no channel at all. So the rule is now stated as **ownership**, the shape that fixed the identity
bug: `${playerName}`'s screen belongs to the app, nothing in the prose lights it up or is read off it
*whatever the channel is called* — and, crucially, **the substitute is supplied**, because a
prohibition with nothing behind it leaves the model needing the beat and finding a loophole. When a
member wants to reach her and is not in the room, she leaves something: a note under the door, food in
the fridge, a jacket over the chair. The model already writes that beautifully — the same round that
invented the company messaging system also left 紫菜包饭 in the fridge with a crooked bear sticker on
it. It did the right thing and then added the wrong thing on top.

**`statChanges` and `affectionChanges` are still emitted BEFORE the story**, so the model commits to
the numbers before writing what earns them. The same argument says they should move too; it is written
up as a proposal rather than done, because one change at a time is what makes the next measurement
mean anything. See `docs/PROPOSALS.md`.

**Not fixed, and not a regression: a Kakao the scene makes impossible** — she texts "good night" from inside the room, or while asleep. Affection is the only gate; nothing models presence or physical state, so the prompt lacks the information such a rule would need. See `docs/V140_PLAN.md` §18b, which schedules it with v1.4.1's place canon.

### Three more worlds, and the seven things the prompt still thought were universal

**v1.4.1 step 7 adds `campus`, `office` and `chaebol` as data** — nine world documents, three
languages each, plus three golden fixtures. The step was scoped as *data only*: every reader it
needs shipped in steps 1-6. It was not data only, and the reason is worth more than the content.

**Reading the first rendered campus prompt end to end found seven statements in
`buildSystemPrompt` that are true of an idol world and were asserted in every world.** None is in
a world file, none throws, and none could ever have failed a test — all three goldens were
`kpop_idol`, where every one of them is correct. The worst was the ROLE CONTRACT:

> The members' working life — **practice, schedules, comebacks, the dorm, this company** — is
> THEIRS… she has **no practice here to be late for**

In a campus world that is not merely odd. It **states as fact that the cast have practice,
comebacks and a company**, two sections after section 4 has said they are students — the
`[BLACKPINK Background]` shape, a specific claim in an authoritative section contradicting a
general rule elsewhere, which the model is entitled to build on.

**Four of the seven became `world.castLife`; three became world-neutral wording.** The test is
step 4's: does the text vary with the thing the file is about? *What these five people do all day*
is the most world-specific fact there is, so it is data. *"a generic idol type"* is a noun doing
no work a neutral one cannot do, so it is simply better English.

| `world.castLife` | `kpop_idol` | `campus` |
| --- | --- | --- |
| `theirs` | practice, schedules, comebacks, the dorm, this company | classes, deadlines, club activities, the dorm |
| `notHers` | no practice here to be late for and no place in their schedule | no class here to be late for and no place on their timetable |
| `recentBeat` | the practice she just left | the class she just walked out of |
| `sceneExample` | Practice room, 10PM | Lecture hall, 10PM |
| `socialReach` | 800000 | 340 |

**`socialReach` is there because a schema example is an instruction.** The Instagram format rule
hardcoded `{"caption":"...","likes":800000}`, so a campus world told the model a student's post
gets eight hundred thousand likes — a number the player then **reads in the overlay**. The shape
is Instagram's and stays in `platformConfig.js`; the magnitude is the world's. It is the one thing
about that platform that is not the same in a practice room and a lecture hall, and step 6 put it
on the wrong side of the line it drew.

The three that needed no field: *"a generic idol type"* → *"a generic type"*; *"NOT a member of
the group"* → *"NOT one of them"*; *"her stage name alone"* → *"her name alone"* (a student has no
stage name); *"in group scenes"* → *"in scenes with the whole cast present"*; *"the only company
that exists"* → *"the only organisation"*. All three goldens moved by exactly those six lines,
`update-golden.mjs` was run once, and the diff was read.

**Left alone deliberately:** section 4 is still headed GROUP BACKGROUND and its composed preamble
still says *"never borrow a real group's history, discography or agency"*. The heading carries a
number five other sections point at by name, and the preamble's job is to stop the model
completing the cast from the real groups these members come from — an **idol** leak in every
world, campus included, so naming a discography there is load-bearing rather than stale.

### A work title points one way, and until step 7 that way was one hardcoded id

`buildSystemPrompt` decided which direction a work title points by comparing the identity id to a
literal: `form.identity === "练习生"` meant *she uses it for them*, and everything else meant *they
use it for her*. **Four of the eighteen identities step 7 authors point the title at the cast** —
`junior_student` and `new_hire` say `선배님` upward, `report_to_cast` says `팀장님` upward,
`secretary` says `실장님` — and every one of them would have rendered the sentence backwards.
**That is the inverted age line again:** a statement the model follows correctly because the
prompt states it wrongly, with nothing failing.

Two fields, and the split is step 6's — the world says which way, the code says what that means:

- **`workTitle.direction`** — `"to_cast"`, or **absent** for today's behaviour, so no existing
  entry is edited into saying what it already meant.
- **`workTitle.because`** — the identity-specific reason the to_cast sentence is built from,
  English like the rest of section 6. `练习生` declares the clause that was already in the code, so
  its rendering does not move by one byte.

`parseWorld` throws when `direction` is anything but `to_cast`, when a to_cast entry has no
`because`, and when a `because` appears **without** a direction — that third one is the field that
would otherwise sit there with no reader, which is the shape this file tracks seven instances of.

**`world.addressContext` is the register around the title**, two language-invariant strings
(`toPlayer`, `toCast`). The sentences said *"on the job"* and *"at work"*, which is true of an
agency and an office and false of a lecture hall: a student does not address her professor *on the
job*. `kpop_idol` declares exactly the two literals it already rendered.

**And the ko fixture found a defect zh and en cannot express.** `workTitle.form` is a
transliteration in zh and en (`前辈nim`, `sunbae-nim`) and is **already Hangul** in ko — so the
gloss printed `"선배님" (선배님)`, a parenthetical translating a word into itself. The gloss is now
dropped when it would repeat the form. No golden had ever pinned it, because the one ko fixture
uses the identity with no work title. **This is the rotate-the-fixture-language rule paying for
itself on its first run.**

### The platforms a non-idol world declares, and step 6 rendering for real

`campus`, `office` and `chaebol` declare **Instagram and KakaoTalk only** (Yuhan's call,
2026-09-29). Bubble is a member-to-fan subscription product and Weverse a fan community; both are
idol infrastructure with no meaning in a lecture hall.

**This is the first time step 6's trimming renders against real content** — until now every world
on disk declared all three social platforms, so the trimming was provably a no-op and was
exercised only against a synthetic world in smoke. All five renderings shorten together: section
2's schema (`{"instagram":null}`), section 7's rules, the RULES format block, section 1's slash
list (`DO NOT output Korean in instagram/KKT content`), and the top bar. A guard on the rendered
campus prompt now asserts that no undeclared platform reaches it **and** that every declared one
does — either half alone is vacuous.

### A whole group takes the SUBSET template, so "part of" was false

`useGroupLore: false` sends **every** cast down the composed path, and a whole single group then
takes the `subset` template. `kpop_idol`'s subset says *"This story follows **part of** {label}"*,
which is true there because it only ever fires on a genuine subset. In the three new worlds it
fires for a complete roster too, so the same sentence would have been false for most players.
Their templates say *"The cast of this story is {members}"* instead — true either way. Found by
reading the first rendered campus prompt, not by any check.

### The golden fixtures now render the way the app does

`test/fixtures/prompts.mjs` built its prompts straight from `loadGroupConfig`, **bypassing
`resolveRoster`** — which is where section 4 is composed. That was byte-identical for a whole
single group in `kpop_idol` (`isWholeSingleGroup` keeps the group's own lore verbatim) and would
have been **wrong** the moment a fixture used a world declaring `useGroupLore: false`: the fixture
would have pinned Red Velvet's real idol history in a lecture hall, which the running app never
produces. It also keyed its world cache by **language alone**, so two fixtures in one language but
different worlds shared the first one's world.

Both are fixed, and routing every fixture through `resolveRoster` left the three existing goldens
byte-identical — which is what says the change was a correction rather than a rewrite.

| Fixture | Pins the branch |
| --- | --- |
| `campus-ko` | a work title pointed **at the cast**, which no golden had ever covered |
| `office-en` | a title pointed at the player in a world that is not an agency |
| `chaebol-zh` | the ex-girlfriend backstory in a **second** world, so a re-roll is visible again |

**Six of the twelve (world, language) pairs stay unpinned.** That is an accepted gap, not an
oversight: a fixture stops a defect recurring, and reading is what finds it.

### Two fields in every world file have no reader

**`world.tone`** is required by `parseWorld`, returned on the parsed world, and read by **nothing**
in `src/`. **`country.name`** is the same — only `country.register` is ever read. Step 7 authored
three more copies of each because the validator demands them.

That is the **sixth and seventh** instance of the shape this file tracks by name, after
`npcAppearances`, bubble `photoDesc`, cast photos, `STAR_LEVELS` and the group library's
`social_platforms`. Each is one line to delete and one line to render; `docs/V140_PLAN.md` §18
carries the decision.

### Three checks were deleted from this step's own guards, before the mutation run

Written, then removed for the reason step 6 recorded and this step repeated:

- **"declares seven identities"** pins today's data, not a property, and no single edit breaks it
  without tripping the loader first.
- **"a to_cast identity always says why"** and **"a to_player one never does"** duplicate what
  `parseWorld` throws on, so the only mutation that could break them breaks the load first.

What replaced them is the **rendered** direction, asserted on a real campus prompt, which fails
independently. **A check that duplicates a validator cannot fail**, and neither can one whose
mutation crashes: three of the first nineteen mutations here threw instead of failing — a 404 from
a renamed world, a `parseWorld` throw from a blanked place name — and the harness prints a stack
trace where a verdict belongs.

**One mutation was left on disk by an interrupted run**, and the world files were regenerated from
their source rather than hand-repaired. A mutation harness killed mid-entry does not restore; if a
run is interrupted, verify the tree before trusting the next result.

### A bubble photo was a UI feature that could not fire and could not have rendered

`BubbleOverlay` draws a photo frame when a post says `hasPhoto`, and the only thing inside that frame
is `photoDesc` — **which appeared in no schema**. So the frame could only ever come out empty, and it
never came out at all, because the schema example pinned `hasPhoto: false` in both places it appears
and a model follows an example. Found by reading the overlay against the rendered prompt in step 7.

The schema now asks for the pair and says when to set it. `validateAndFixOutput` keeps the two
consistent — a post claiming a photo with nothing to describe has `hasPhoto` cleared — because the
component renders the frame off the flag alone, and normalising in the engine covers a save written by
an older build as well.

---

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
Setup Page
  -> Main member + Sub members + Name/Birth year + World + Identity
     (the pace picker was here until v1.4.1 step 2; step 3 put the WORLD
      picker in the slot it vacated, which is how BOTH cover doors get
      worlds - they both pass through this page. Identity follows the world
      because an identity is a position INSIDE one: the grid is that world's
      own `identities` plus `H`, and a world change clears an id the new
      world does not declare)
      |
Game Page (loop)
  -> Read story -> Choose A/B/C/D, Custom, or 📍 a place -> Next round
     (settings overlay: reasoning, story mode, time speed, theme, font,
      export, help)
```

"New Game" is disabled (dimmed + toast) until a group is selected.

---

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

### A cast drawn from more than one source is its own group

**Section 4 of the prompt is composed from the roster, never from one group's config.** Getting
this wrong shipped a bug found by phone play in v1.4.0 step 6: a cast of Jisoo (BLACKPINK), Irene
(Red Velvet), a custom member, and Mina + Sana (TWICE) was handed `[BLACKPINK Background]` plus
full Public / Private / Queer Texture prose for **all four** BLACKPINK members — three of whom were
not in the roster. Round 1 put Jennie, Rosé and Lisa in the story and set the company to YG.

Neither symptom was the model's. **Section 6's rule says only members in MEMBER PROFILES may appear
by name, and section 4 was contradicting it two sections earlier with richer detail.** "YG" is in no
file in this repo; it was inferred from the premise the prompt handed over. Where two sections
disagree, the one with more specific detail wins.

The rules now, all in `rosterResolver.js#composeRosterLore`:

**Since v1.4.1 step 4 the WORDING of all three rows is the world's, not this file's.** The three
branches below are unchanged — they are chosen by the shape of the cast — but the sentences each one
emits come from `world.castLore.composed` and `world.castLore.subset`, rendered by
`renderCastLore`. They used to be four string literals in `rosterResolver.js` saying
*N-member group under X Entertainment* and *no other idol exists in this story* — true of an idol world
and false of a lecture hall. `kpop_idol`'s template is those literals verbatim, so the goldens
did not move.

Two rules the renderer adds, both of them the conditional-field rule section 5 already follows:

- **A template line whose value is absent is DROPPED**, not rendered with a gap in it. That is what
  lets `Fandom: {fandom}.` be its own element and simply disappear for a cast whose group
  declares no fanbase — the label lives in the world file instead of in a ternary in code.
- **An unknown placeholder THROWS.** A template is data, so a typo in a world file would otherwise
  reach the model as a literal `{labl}` in section 4 — the unresolved-particle class of defect,
  which renders as plausible text nobody reads.

**And `useGroupLore: false` sends EVERY cast down the composed path**, so a Red Velvet roster in
an office world cannot inherit Red Velvet's real idol history, SM included. A whole single group then
takes the **subset** template rather than the composed one: it really is that group, and its real name
is what the player picked — what it loses is the group file's dated History block.

| Roster shape | Section 4 |
| --- | --- |
| exactly one whole group | that group's own `groupLore`, **verbatim** — this is what the classic door always produces, and what keeps the goldens fixed |
| a subset of one group | that group's real name, listing only the members present, plus an explicit "no other member of \<group\> exists in this story" |
| more than one group, or any custom member | **its own group**: `[<name> Background]`, `<name> is an N-member group under <name> Entertainment`, default name `X`, editable at Setup |

**The cast is a group, not a collection of people from other groups.** The first attempt said they
came from different agencies and that any scene putting two of them together needed a reason — which
fights the setting, because secrecy, dorms, schedules, group activities and the phase beats are all
group machinery. As a group it is a premise instead of a constraint, and naming the agency is what
stops one being invented.

**Never name the origin groups in composed lore.** That is the leak: a model told the cast is
BLACKPINK completes the group from its own knowledge. Nothing downstream needs them — a member's
profile says who she is, and her real-world affiliation plays no part in the game.

### The idol role is filtered by the world, and stays in the library

A member's `role` — *Main Vocal*, *Leader*, *Maknae* — is a position in an idol **group**. It
reaches the prompt through `memberLine`, which composes section 4; section 5's profile block
never reads it. So a campus prompt would have described a student as a main vocal and an office prompt
an analyst as a maknae — the `[BLACKPINK Background]` shape exactly: a specific-sounding claim
two sections away from the rule it contradicts, which the model is entitled to build on.

**`castLore.useRole` is the filter, and it filters what the MODEL sees and nothing else.**
`role` stays on `parseGroupConfig`'s whitelist, in all 30 group files, and on every cast
screen; stripping it at the loader would take an idol position out of the idol world too. `mbti`
and `animal_plastic` are world-neutral and are not filtered. `kpop_idol` declares
`true`, so nothing about today's output moves.

It is a **boolean**, not a label. `roleLabel` was in `docs/V140_PLAN.md` §4.1's sketch and
never shipped: `memberLine` joins `role` into a bare comma list and prints no label at
all, so a world-supplied label would be a string read only for its truthiness — a field with no reader
wearing a noun's clothes. **The goldens cannot catch a regression here**, because all 175 library
members declare a `role`, so the filtered branch appears in no fixture.

### `useRole` filters the FIELD and the prose says it anyway

**Found in the third phone pass, 2026-09-29, from an Instagram post in the chaebol
world:** *yerimiese: 录制结束，和成员们吃了顿好的。忙内的快乐就这么简单～*. A recording
session and a maknae, in a family compound.

`castLore.useRole` is working. It is `false` for campus, office and chaebol, and
`role: 副rapper·忙内` is correctly kept out of `memberLine`. **The leak is one field
over and it is prose:** Yeri's `public_image` *begins* with 忙内, and `public_image`
is Public Texture — one of the three ★ primary differentiators, sent in **every**
world. Step 7 filtered the structured field and left the sentence saying the same
thing, which is the shape this file keeps recording: **a rule applied to one field
while its neighbour states the same fact in a form the rule cannot see.**

**Measured over the library, zh:** **57 of 57 members**, **80 field instances** —
`public_image` 56, `private_personality` 18, `queer_texture` 6. Counting group
positions (忙内, 队长, 主唱, 门面, rapper) and idol activities (出道, 打歌, 回归, 专辑,
舞台, 练习生, 粉丝, 偶像, 女团, 组合, 综艺). This is not a Yeri defect; it is what the
library IS.

**And Irene is not the counter-example she looked like.** Her post that round read
fine; her `public_image` is *舞台上高冷优雅，作为队长是全队的定海神针*. She was lucky.
**Universal and intermittent is the worst failure profile there is**, because no
amount of clean play establishes that a world is clean — the same reason the
`[Rounds Absent]` A/B could not conclude.

Authoring per-world texture is 57 x 4 x 3 hand-written fields and is not reachable;
suppressing `public_image` in three of four worlds gives up the field the whole cast
differentiation rests on. **The real fix is to translate her into the world at setup
time**, which is `docs/V140_PLAN.md` §22 — and §22 is also where a defect Yuhan found
independently turns out to be the same one: `generateCard` reads `world` from state on
a screen the player reaches BEFORE picking a world.

**Not fixed here.** §22.1 carries the interim prompt rule (read the texture for traits,
never for facts, with `castLife.theirs` as the substitute) and the reason it needs its
own commit: it moves the three non-idol goldens.

### Where she is decides who is there

Section 11 carries `world.places` — ten canon places, each `emoji name — desc` — with
the rule *prefer this list; invent somewhere new only when the story genuinely needs a place this list
does not have*, and the schema's `scene` rule points at it.

**The rule is cached and the fact is not.** Where the player actually went arrives in the **choice
string** (*I head to the rooftop*), which is in the always-miss tail; the rule that a member whose
Habit and personality fit a place is likelier to be there stays in section 11, which is cached. **No
`[Place]` line is added to the tail beside it** — that is the same fact twice, and the second copy
is the one that drifts, which is what `[NPC Appearances]` was. Fact in the tail, rule in the
static part, rule pointing at the fact: the shape `[KKT Channels]` and `[Rounds Absent]` use.

**`draws` is deliberately not rendered.** It is a tag vocabulary feeding the affinity matrix in
`docs/V140_PLAN.md` §7.3, whose reader is v1.4.2. Printing it would hand the model a lookup
table for exactly the judgement §7.4 argues the model makes better than a table does — *who would be in
the recording booth at midnight* is a reasoning question.

**`world.scenario` is unconditional static text, and it cannot be anything else.** Sending it on
round 1 and dropping it afterwards would make the static system prompt differ between round 1 and round
2, invalidating the entire ~5,500-token cached prefix on round 2 — the most expensive mistake available
here. It ships every round, framed as the story's *first scene*: round 1 opens here, and from round 2 it
has already happened and is never replayed. The model reads which round it is from `[Player Status]`
`Round` in the tail. `buildSystemPrompt` takes no round argument at all, so the
cache-unsafe version is not expressible — which is why the guard is on the tail instead.

**The section is 11 because 8, 9 and 10 already exist.** `docs/V140_PLAN.md` §6's table said
places would be section 8; 8 is NPC rules, 9 game rules, 10 the stat system. Inserting at 8 would have
renumbered three sections and silently repointed the five places the prompt refers to its own sections
by number (*the one section 4 names*, *Section 6 SPEAKER CONTRACT is binding*). Smoke derives the
heading numbers from the rendered prompt and asserts they read 1..11 in order, each exactly once.

### The map grows and the prompt does not

**A place the model invents becomes map content rather than something to suppress — v1.4.1 step 5.**
When a round's `scene` names none of the world's canon places, the client records it in
`memory.places` as `{name, round}`, and a 📍 button beside the custom-input row lists the
canon places and the discovered ones. Tapping one submits *"I head to \<place\>"* as the round's
choice, so **moving costs a round** — a scene *is* a round, and the phase rules and achievements are
all driven by the round counter.

**`memory.places` reaches no prompt message, and that is the invariant rather than a detail.** A
list that gains a row mid-game changes the static prefix the round it changes, which costs the whole
~5,500 tokens — the same class of defect the ex-girlfriend backstory's `Math.random()` was, and
that one measured **26.7 points** of cache hit rate. The model needs no list: *where she went* arrives
in the **choice string**, which is in the always-miss tail, and the ledger already holds the round that
invented the place. Smoke asserts a sentinel place reaches **none** of the three messages.

**The step-5 plan row asked for a mutation that cannot be written**, and the fix generalises:
*mutation-verify by making `buildSystemPrompt` read `memory.places`* — it takes no
`memory` argument at all, so a check built that way would be vacuous. **Put the guard where the
value could actually leak**: the two builders that do take memory, and `memoryContext`, which is
the static prompt's only text input and which `executeRound` passes the empty string.

**A discovery is recognised from prose, so it is a heuristic, and the two rules it needs are stated
rather than left to be found.** A trailing comma-segment containing a **digit** is dropped, because
section 11 asks `scene` for *a place and a time* and without stripping *Rooftop, 2am* and
*Rooftop, 3am* are two rows on one map; a name with **no letter in it** is not a place, which is how
`22:00` is rejected without a per-language list of time words. A time spelled out (`10PM`)
is therefore recorded as written — accepted, because telling those from place names needs exactly the
hand-maintained list this avoids. Near-duplicates the normaliser cannot fold (*Rooftop* vs *the rooftop
stairwell*) are map clutter and cost a row and nothing else.

**At the cap (`PLACES_MAX` = 30) a new place is REFUSED, not swapped for the oldest** —
`addSaveSlot`'s choice for `addSaveSlot`'s reason: an evicted place is somewhere the player
can no longer go back to. The guard asserts on the **contents**, because refusing and evicting both
leave thirty rows and a length check passes against the bug.

**`updateMemory` is the single writer**, beside `memberAppearances` and for the same
reason — two writers of one record is how the tail's member lines came to disagree. Smoke scans
`App.jsx` for a write to `.places` and fails on one. And **no migration**:
`memory.places` is absent from every older save, every reader takes `|| []`, and
`isLegacyMemory` keys on `history`.

**The picker supplements the four options rather than replacing them.** The plan calls it *an
alternative to the four options*, which is what it is from the player's side — but the options are
generated per round and this list is the same every round, so making them exclusive would hide a
round's own options behind a fixture.

**The sentence it submits is a per-language template, not a concatenation.** `t.map.go` carries
`{place}`, and ko carries the `으로/로` pair for `resolveKoreanParticles` to
pick — the word in front of a Korean particle is a variable here, which is the whole reason that
function exists. A Latin place name in a ko game resolves to the parenthetical dual
(`Rooftop으로(로)`), which is never wrong. It is inert on zh and en, and smoke asserts that.

Composed lore does **not** repeat the prose fields; section 5 carries them for exactly the members
present. The single-group lore duplicates them and that is inherited token cost, not a pattern to
extend.

**An all-custom cast has no group config at all**, and `buildSystemPrompt` reads
`groupConfig.groupLore` unconditionally, so returning `null` threw before round 1. `resolveRoster`
synthesises one. Reachable, because a custom member can be the main.

**The guard that should have caught this asserted the opposite** — *"lore follows the main member's
group, not the first group listed"* pinned the bug as intended behaviour. A guard written from the
implementation instead of from the requirement does that; the defence is to ask what the check would
look like if the behaviour were wrong.

Library members stay **by reference** so a fixed profile reaches games in progress; custom
members are **snapshotted inline** so deleting one from the palette cannot break a running save.

`buildSystemPrompt(form, members, mainId, subIds, groupConfig, memoryContext, selectedModel,
language, world)` — **`world` is required and has no default.** A default would be a second copy
of every string in `public/worlds/`, and the two would drift silently; it would also let a
missing-wiring bug render as plausible output instead of failing. Callers load it once per game
with `loadWorld()`, exactly as they already load the group config.

**`parseWorld` validates and throws; it does not whitelist-copy.** See the `birthday` note below
for why that distinction is not pedantic.

**An identity carries a `name` as well as an `id`, and a story mode carries only a rule.** The `id` is
a *stored* value sitting in every save on every device, so it can never be renamed — which is why it is
Chinese in all three languages and why the prompt must not print it. `name` is what section 6 prints,
authored per language. It falls back to the id, so a world file lacking one still renders something
true rather than a blank line.

**Since v1.4.1 step 3 that `name` is also the Setup label, and there is exactly one copy of it.**
This file used to say smoke asserted the world's `name` equalled a `t.identities[id]` row in
`src/i18n/<lang>.js` — true, and the wrong remedy: two hand-maintained copies of one string, tied
together by a check, where the drift is invisible because both sides render something plausible. The
seven UI rows are **deleted**; the picker reads `world.identities[].name`, so what the player
picked and what the prompt prints are the same characters by construction, and step 7's three worlds
owe no i18n rows at all. Only `H` has a label in `t.setup.customIdentityOption`, because it is
the app's escape hatch and no world declares it. What smoke asserts now is what the old check was
approximating: the name is present, is not the CJK id showing through in en/ko, and is short enough
to be a button in a two-column grid at 390px.

**A story mode needs no `name` for two reasons, and the second is the one that matters.** Its rule
already opens with a self-describing `[Story Mode: Pressure]`, which is what the model needs — and the
four ids are **universal across every world**, so the labels live once in `t.modes` instead of once per
world. `world.modes` is therefore a map **keyed by id**, not an array: `paces` was an array read as
`t.paces[i]` against a hardcoded `PACES[i]` in `App.jsx`, coupling two hand-maintained lists **by
position**, so a language with a shorter list mislabelled every entry after it and a world with its own
pace ids would have stored one the world never declared. `PACES`, `t.paces` and `world.paces` are all
deleted in v1.4.1 step 2 rather than extended per world.

Read `docs/TECH_NOTES.md`, *"World data as a fetched document"*, before changing the world shape,
and `docs/V140_PLAN.md` §2 and §4 for the full design.

---

## Group JSON Structure

`public/groups/{id}/{lang}.json` — no code changes needed to add a group.

```
public/groups/
  index.json              <- [{id, name, emoji, members_count, color}]
  red_velvet/ twice/ aespa/ nmixx/ ive/ itzy/ blackpink/ x/ gnz/
    zh.json en.json ko.json
  _template/              <- copy this to add a new group
```

Key fields: `group.name`, `group.lore`, `members[]` (each with `id`, `name`, `emoji`, `color`, `accent`, `personality`, `queerTexture`, `speechStyle`).

**Adding a field to a group JSON is not enough to make it reach the app.** `groupLoader.js#parseGroupConfig` rebuilds every member from an explicit whitelist, so a field that is not listed there is silently dropped between the file and the prompt — no error, no warning, just a `undefined` the consumer quietly defaults. `birthday` sat in every group JSON and never reached `buildSystemPrompt` for the whole life of the age-texture feature. Add the field to the whitelist in the same commit, and assert on it through `loadGroupConfig`, never by reading the JSON.

**`habit` went on the whitelist ahead of any file that declared it, and `tags` still is** — `habit` is authored in v1.4.0 step 5, `tags` in v1.4.2. Putting the field first means the content arrives working instead of arriving silently dropped, which is exactly how `birthday` was lost.

**`habit` is a concrete, observable, repeatable physical behaviour — something the model can stage in a scene.** `private_personality` says *expresses affection through caretaking*, which cannot be blocked into a shot; *straightens your collar mid-sentence without asking* can. It is the staging handle for the three prose fields, not a fourth description of them, which is why it sits outside the `CRITICAL: ★` line naming Public / Private / Queer Texture as the primary differentiators.

**Content is sourced, not invented, and that is a different rule from the fields around it.** `queer_texture` is fiction because it has to be; a habit is the one field fans actually know, and a fabricated concrete detail is both less useful to the model and more misleading than a real one. So: **publicly known, persona level, and never a claim about a real person's health, body, relationships or private life.** Where that knowledge is not reliable — parts of `gnz`, `nmixx` and `x` — the habit is instead *derived* from that file's own `private_personality` and is plainly fiction. The two tiers are tracked per member in `docs/V140_PLAN.md`; do not silently promote a derived habit to a sourced one.

**Member ids are not unique across the library, so a shared id carries the same habit in every group.** A physical tic belongs to the person, not the roster: `x` is a crossover roster sharing seven ids, and smoke fails when one copy is edited and its twin forgotten.

**EVERY optional field in the member profile block is conditional.** An absent one renders *nothing*
— never a label with a trailing space, and never the string `undefined`. Only `Age` and `Address` are
unconditional, because both are computed and can never come out empty.

This generalised in step 6, and it had to: a custom member is allowed to carry only the three fields
`docs/V140_PLAN.md` §4.4 requires (`name`, `birthday`, `private_personality`), and that rendered
**four defects in one profile block** — `undefined` twice (emoji, animal) and a trailing space twice
(`  Public: `, `  Queer Texture: `). Step 5 had fixed one instance of a class with five more members.
Note `resolveRoster` snapshots a custom profile straight into `members[]`, so it never passes through
`parseGroupConfig` where the `|| ""` defaults live — and an empty string produces the same trailing
space as `undefined` anyway, so the condition tests for *content*, not presence.

A trailing space is invisible to a reviewer while costing the whole ~5,500-token cached prefix; it is
the single byte the goldens caught during the step 3 extraction.

**The goldens cannot catch this class of regression, and that is measured, not assumed.** Reverting
the conditionals leaves **0 of 3 goldens moved while 8 Layer I checks fail** — all 175 library member
records are complete, so the empty branch appears in no snapshot. Custom members are the branch no
fixture can contain. Do not read a green golden as coverage of a case the fixtures cannot hold.

57 members × 3 languages, plus `_template`. All 30 files are **CRLF** — `cat -A` piped through GNU sed shows clean `$` and is lying, because sed strips the CR in text mode.

`name` is the Latin stage name in **all three** language files; `name_kr` is the localized real name (`裴珠泫` / `Bae Ju-hyun` / `배주현`). A Hangul *stage* name (`예리`) exists in no group JSON.

Group JSON size directly drives the static-prompt token count (Red Velvet ~8KB, TWICE ~14KB), so a 9-member group has a noticeably larger cached prefix than a 4-member one.

---

## Branch & Deploy Workflow

### Branches

| Branch | Role |
| --- | --- |
| `main` | Exactly what players are running. Served by GitHub Pages + Vercel. Tagged on every release. |
| `dev` | Integration branch for feature work. Branched from `main` at v1.3.2. **Never deployed.** |
| `hotfix/<slug>` | Off `main`, one bug, short-lived. Merged into `main`, then `main` into `dev`. |
| `feat/<slug>` | Optional, off `dev`, for work risky enough to want to abandon cleanly. Not needed for routine changes. |
| `dev-v12.0.0` | **Frozen**, last active 2026-07-31, 46 commits behind the v1.3.x line. Never merge it. Also reachable as tag `archive/dev-v12.0.0`. |

**`main` never takes a direct source commit.** The only things that land on it are `--no-ff` merges from `hotfix/*` or `dev`, and `deploy.sh`'s own build-artifact commit. Committing a fix straight onto `main` means that between the first commit and the deploy, `main` is a state nobody has tested — and if you get interrupted there, the branch that defines "what players run" is sitting broken. A `hotfix/*` branch costs one extra command and means **`main` only ever receives changes that were already validated**. If the fix turns out to be wrong, you abandon a branch instead of reverting `main`.

This is enforced, not just asked for: `deploy.sh` refuses to run when the smoke suite is red, so an untested tree cannot reach players even if the process is skipped.

**The branch is named `dev`, not `dev-v<version>`, on purpose.** Its predecessor was `dev-v13.0.0`, created for a release target that never shipped; when the plan changed, the branch belonged to nothing and was never merged again. A plain `dev` has no expiry condition.

### The rule that keeps `dev` alive

**After every deploy, merge `main` back into `dev`.**

```bash
git checkout dev && git merge main && git push origin dev
```

This is not optional and not occasional. `deploy.sh` commits build artifacts (`assets/index-*.js`, a production-mode `index.html`) straight onto `main`, so **every single release leaves `main` with a commit `dev` does not have.** Skip the merge-back a few times and `dev` is behind; skip it for a month and it is another `dev-v12.0.0`. Nothing else in this workflow is fragile — this is. `deploy.sh` prints the command on completion for exactly this reason.

### Daily work

Stay on `dev`. Validate with **both** commands before every commit.

```bash
git checkout dev
npm run build && node test/smoke.mjs
git commit -am "feat: ..." && git push origin dev
```

### Release

Bump the version and write the new README "What's New" section as the **last commits on `dev`**, so the release merge is the only thing `main` sees.

```bash
git checkout dev
npm run bump 1.4.0                                # rewrites all 15 version strings
# hand-write the "## What's New in v1.4.0" section in README.md
npm run build && node test/smoke.mjs
git commit -am "chore: bump to v1.4.0" && git push origin dev

git checkout main && git pull
git merge dev --no-ff -m "release: v1.4.0"
npm run deploy                                    # red line: pushes to production
git tag v1.4.0 && git push origin v1.4.0
git checkout -- index.html                        # see note below
git checkout dev && git merge main && git push origin dev
node scripts/dev-index.mjs                        # back to dev mode
```

**The `index.html` step is not optional and not cosmetic.** `deploy.sh` restores that file to dev mode as an *uncommitted* change, and the deploy commit just rewrote the same file on `main` with the new bundle hash — so `git checkout dev` refuses to switch with "local changes would be overwritten". Discarding it is safe: `scripts/dev-index.mjs` regenerates it exactly, which is what the last line does.

Tag the **deploy commit**, not the merge commit — `npm run deploy` adds a commit after the merge, and a tag placed before it points at a tree whose `index.html` is still in dev mode.

### Hotfix (player-reported bug on a released build)

**First decide whether you need a hotfix at all.** If `dev` has nothing unreleased (`git log main..dev` is empty), there is no reason to branch the process — fix it on `dev` and cut a normal release. The hotfix path exists only for the case where `dev` holds in-flight work that cannot ship yet.

```bash
git checkout main && git pull                # start from exactly what players run
git checkout -b hotfix/<slug>

# 1. reproduce the bug first — a fix you cannot reproduce is a guess
# 2. fix in src/
# 3. add a regression check to test/smoke.mjs (see below)
npm run build && node test/smoke.mjs
npm run bump 1.3.3                           # hotfixes bump too, see below
git commit -am "fix: description"
git push -u origin hotfix/<slug>             # gives a Vercel preview URL to hand-test on device

git checkout main
git merge hotfix/<slug> --no-ff -m "fix: description (v1.3.3)"
npm run deploy                               # red line: pushes to production
git tag v1.3.3 && git push origin v1.3.3
git checkout -- index.html
git checkout dev && git merge main && git push origin dev
node scripts/dev-index.mjs
```

Deleting the merged `hotfix/*` branch afterwards is your call — the merge commit and the tag both record it, so nothing is lost, but branch deletion is a red-line action and is never done automatically.

**Always add a regression check to `test/smoke.mjs` as part of the fix**, and verify it fails against the unfixed code. This is already the convention in this repo — the Layer G key-page guards each encode a bug that reached a hand test. It also does double duty on the merge-back: if `dev` has rewritten the same area, the merge will conflict, and the guard is what proves the fix survived however you resolve it. Resolve in favour of `dev`'s structure, keep the fix's behaviour, and let the check confirm it.

**Hotfixes bump the version too.** The cover screen's version string is how a player tells you what they are running, so a build in the wild should never be ambiguous. A hotfix bumps the patch digit and adds a line to the current README "What's New" section rather than opening a new one.

### Version strings

Fifteen strings across six files must agree, and `npm run bump <x.y.z>` rewrites all of them:

```bash
npm run bump 1.3.3           # writes; run the validators afterwards
npm run bump 1.3.3 -- --dry  # show what would change, write nothing
```

**The `--` before `--dry` is mandatory.** Without it npm keeps the flag for itself (expanding it to its own `--dry-run`) and never passes it through, so `npm run bump 1.3.3 --dry` performs a **real bump** while looking like a rehearsal. Verified the hard way. `node scripts/bump-version.mjs 1.3.3 --dry` has no such trap.

| File | Count | Where |
| --- | --- | --- |
| `package.json` | 1 | `"version"` |
| `src/i18n/{zh,en,ko}.js` | 3 | `cover.desc` |
| `src/App.jsx` | 3 | the fallback cover strings, zh/en/ko |
| `README.md` | 6 | title, version badge, cost-section heading, three ASCII sketches |
| `CLAUDE.md` | 2 | the Project Overview title, the Add-on Features heading — **matched by anchor**, see below |

**CLAUDE.md is matched by anchor, not by version regex — most of its version numbers are history.** This file is largely changelog and post-mortem prose: "fixed in v1.3.7", "### v1.3.8 — GPT-6 Luna", "v1.3.5 introduced the dependency". Rewriting those would falsify the project's own record, which is worse than the drift the bump is meant to prevent. So `ANCHORS` in `scripts/bump-version.mjs` names the two lines that carry the *current* version as exact strings, and every other mention is untouched. Each anchor must match exactly once: zero means the heading was reworded, more than one means it is no longer unique, and either way the count check aborts the bump and fails smoke.

Both headers were added to the bump in v1.3.8, after the v1.3.7 release shipped with them still reading v1.3.6 — they look static, so they get forgotten.

**`**v1.3.8 is the current release.**` in Project Status is deliberately *not* anchored.** That whole paragraph is rewritten by hand each release anyway (it carries the check count, the live-test results and the branch state), so a stale version there is caught by the act of editing it. Anchoring it would only add a failure mode.

**The README "What's New in v…" heading is deliberately not bumped.** It is a changelog entry, not a version string — a release *adds* a new section and leaves the old ones alone. `bump` skips every line containing `What's New in` for exactly this reason; rewriting it would silently relabel the previous release's notes.

Two things keep this honest: the bump script realigns the ASCII sketch lines so a width change (`1.3.9` -> `1.3.10`) cannot break the art, and **smoke Layer C asserts all 15 agree with `package.json`**, so a partial bump fails the suite — and therefore fails `deploy.sh` preflight.

### Commit identity

Commits must be authored as `52732052+byhAnita@users.noreply.github.com` (set globally, and locally in this repo). **Vercel refuses to deploy a commit whose author it cannot match to a GitHub account** — it rejected the old `1677037640@qq.com` outright, blocking the deployment entirely.

Use the noreply alias rather than one of the account's real addresses: all of them are marked Private on GitHub, which normally also enables *Block command line pushes that expose my email*, and committing as one would start getting pushes rejected with `GH007`. Commits made before 2026-09-16 keep the old address — that is baked into their hashes and not worth rewriting history over.

### CI (`.github/workflows/ci.yml`)

Every push to `main`, `dev`, `hotfix/**` or `feat/**`, and every PR into `main` or `dev`, runs:
`npm ci` -> `node scripts/dev-index.mjs` -> `npm run build` -> `node test/smoke.mjs`.

**No secrets, and none should ever be added.** Offline smoke reads fixtures from `docs/`, mocks
`fetch` for the router layers, and skips every live layer when `API_KEY` is absent. The live
layers spend credits and are deliberately a local, deliberate action — putting a key in Actions
would make every push bill someone.

`dev-index.mjs` runs before the build for the same reason Vercel and Cloudflare need it: a clean
checkout of `main` has `index.html` in production mode, and Vite would re-bundle the committed
output instead of compiling `src/`. Without that step CI would pass while testing nothing.

**CI does not assert `index.html`'s mode.** It is committed in production mode on `main` and dev
mode on `dev`, so there is no single correct state across branches — such a check would fail every
push to `main`. `deploy.sh`'s `EXIT` trap is what restores the working tree.

This does not replace `deploy.sh` preflight, which still runs smoke itself. CI catches a broken
commit at push time; preflight is what makes it impossible to ship one.

### Vercel

Vercel builds **from source**, unlike GitHub Pages which serves the committed root `index.html` + `assets/`. Config lives in `vercel.json`:

```json
{ "framework": "vite", "installCommand": "npm ci",
  "buildCommand": "node scripts/dev-index.mjs && npm run build",
  "outputDirectory": "dist" }
```

**`scripts/dev-index.mjs` is not optional, and removing it fails silently.** `index.html` is committed in *production* mode because that is what Pages serves — but Vite reads `index.html` to find its entry, so on a clean clone it takes the committed `./assets/index-<hash>.js` as the entry and **re-bundles the previous build instead of compiling `src/`**. Measured: 4 modules transformed instead of 55. The build succeeds, the bundle is the right size, the site runs — it is just frozen at whatever `npm run deploy` last committed, so every branch preview shows `main`'s code while looking perfectly healthy. `dev-index.mjs` rewrites the entry to `/src/main.jsx` first (idempotent). Smoke Layer C asserts the build command still calls it.

Because Vercel builds from source, its production deployment can be **ahead of** the GitHub Pages one: a merge to `main` updates Vercel immediately, while Pages only changes when `npm run deploy` commits new artifacts. Deploy promptly after merging, or the two hosts disagree.

Branch previews are the reason this matters — pushing `hotfix/*` gives a URL to hand-test on a real phone before the fix reaches `main`.

### Cloudflare Pages

`idol-dating-sim.pages.dev` is the third mirror. Cloudflare does **not** read `vercel.json`, so the same two settings go in its dashboard by hand:

| Setting | Value |
| --- | --- |
| Build command | `node scripts/dev-index.mjs && npm run build` |
| Output directory | `dist` |

It has the identical entry-point trap as Vercel — without `dev-index.mjs` it re-bundles the committed build and serves a frozen site that looks fine.

### The three mirrors

| Host | URL | Source of truth |
| --- | --- | --- |
| GitHub Pages | `byhanita.github.io/rv-simulator/` | committed root `index.html` + `assets/` + `groups/` |
| Vercel | `idol-dating-sim.vercel.app` | built from `src/` |
| Cloudflare Pages | `idol-dating-sim.pages.dev` | built from `src/` |

Only Pages serves committed artifacts, which is why `npm run deploy` exists at all. The other two rebuild on any push to `main`, so **deploy promptly after a release merge** or the three disagree.

**The root `groups/`, `icons.svg` and `manifest.json` are load-bearing, not duplicates of `public/`.** `groupLoader.js` fetches `${base}groups/index.json` at runtime, and Pages serves the repo root — delete them and every group fails to load there. They are byte-identical to `public/` apart from a trailing newline, and smoke Layer C asserts the two `manifest.json` copies still parse equal.

**Nothing *automates* these mirrors — `deploy.sh` copies only `assets/*.js` and `*.css` — smoke Layer C fails when one drifts.** Two checks per tree: the file trees must match name-for-name, and every file must match in content with trailing whitespace stripped. Before that guard existed, editing a group JSON under `public/` left the Pages site serving the old cast data indefinitely, with no error and nothing a player could report.

**Root `worlds/` is the second such tree, added in v1.4.0.** The Layer C check loops over `["groups", "worlds"]` rather than naming one, because every mirrored tree added is another chance to forget — `rosters/` will be one more string in that array, not a third copy of the check. Copy `public/<tree>/` over root `<tree>/` by hand in the same commit; the suite tells you when you forget, and CI tells you on push.

`dist/` is **not** tracked. It was, contradicting `.gitignore`, until Cloudflare stopped serving it statically; it carried a bundle hash that existed nowhere else in the repo.

### Never derive a path from the hostname

**Every runtime URL must come from `import.meta.env.BASE_URL`**, which Vite fills from `base` in `vite.config.js` — `'./'` in a build, `'/'` under the dev server. The app is served at two different depths (`/rv-simulator/` on Pages, `/` on the other two), so a path that hardcodes either one breaks the others.

This shipped and reached players. `groupLoader.js` chose its prefix with `hostname.includes('localhost') ? '/' : '/rv-simulator/'`, so both mirrors requested `/rv-simulator/groups/index.json`, got a 404, and fell into `loadGroupIndex`'s `catch` — **which returns a hardcoded Red Velvet entry**. The cover page showed one group instead of nine and logged nothing a player would see, because the fallback swallowed the failure. Fixed in v1.3.5; smoke Layer C now fails the build if any `src/` file contains the literal subpath outside a comment.

The manifest has the same constraint and a subtler trap. `index.html` must reference it as **`/manifest.json`**, not `./manifest.json`: the leading slash makes Vite treat it as a public-dir asset and rewrite it to `./manifest.json` for the relative base. The relative form instead makes Vite resolve the *root* copy and emit a **second, hashed manifest** under `assets/` — one directory deeper, where the relative `./icons.svg` inside it no longer resolves. Making the manifest paths relative without this change fixes nothing.

### index.html rule

Always stays in **dev mode** (`<script type="module" src="/src/main.jsx">`). `deploy.sh` patches to production mode, commits + pushes, then restores dev mode. Never manually edit `index.html`.

Restoration is handled by an `EXIT` trap, so the dev-mode tag comes back even if the build, commit or push fails partway. If you ever do find it stuck in production mode (pointing at `./assets/index-*.js`), restore the dev `<script>` tag before deploying.

### What `npm run deploy` does

Preflight — the script **aborts before touching anything** if any of these fail:

1. Current branch is `main`. The script's `git push origin main` pushes the `main` ref regardless of where `HEAD` is, so running it from `dev` would commit the build onto `dev` and push a stale `main`.
2. `src/`, `README.md` and `CLAUDE.md` have no uncommitted changes. The script stages those paths, so anything half-finished in the working tree would otherwise ship to players silently. Commit first — that is the documented flow anyway.
3. `main` is not behind `origin/main`. Fails early with a clear message instead of after the commit is already made.
4. **`node test/smoke.mjs` passes.** This is the mechanism behind "`main` is always stable" — a red suite cannot reach players, whatever the process. There is deliberately no override; a failing check means fix it or remove it, not ship past it.

It also **warns, without aborting**, when `v<package.json version>` is already a tag — the signature of a forgotten `npm run bump`. A warning rather than a hard stop, because re-deploying a botched release at the same version is legitimate.

Then:

5. **`node scripts/dev-index.mjs`** — force `index.html` into dev mode, and install the `EXIT` trap that restores it. Without this the script only worked when `index.html` already happened to be in dev mode; after a `git checkout -- index.html`, a branch switch or a previous failed run it is in *production* mode, and Vite then either re-bundles the old output or dies on `Could not resolve ./assets/<hash>.js`.
6. `rm -rf dist`, then `BASE_URL="./" npm run build` — relative-path Vite build
7. **Only now** `rm -rf assets` and copy `dist/assets/*.js` + `*.css` into root `assets/`. Deleting `assets/` before the build meant a failed build wiped the bundle GitHub Pages was serving, leaving the live site broken until someone thought to run `git checkout -- assets/`.
8. Patch `index.html` to reference the hashed filenames
9. `git add index.html assets/ src/ README.md CLAUDE.md` -> commit -> `git push origin main`
10. Restore `index.html` to dev mode (not committed), via the `EXIT` trap
11. Print the tag and merge-back commands

**The staging list is not everything.** `deploy.sh` does not stage `test/`, `docs/`, `package.json` — or `deploy.sh` itself. In the release flow this never bites, because the merge from `dev` brings them. It does bite if you edit them on `main` and expect deploy to pick them up — commit those yourself first. Preflight check 2 only covers the paths the script *does* stage, so it will not catch these.

---

## Project Status (2026-09-28)

**v1.4.0 is the current release, deployed 2026-09-28.** `main` and `origin/main` are at
`7b3ceea`, the deploy commit, tagged `v1.4.0`; `dev` is level with it plus one `index.html`
commit. All three mirrors serve `index-BEbGT01U.js`, and the served bundle was checked
**byte-identical to the local build** rather than only matching by hash.

It is the largest release this project has made — the cast/world/roster split (steps 3-5), the
custom-cast UI (step 6), the prompt re-read and live re-validation (step 7), and four hand-test
passes of step 8. Smoke **578 -> 1204**. What a player sees: she builds her own cast from any
number of groups or from a member the model invents for her, gives anyone a photo and a wallpaper
she crops herself, states her birth year instead of her age, cannot lose a save to the eleventh
one, and reads the release notes in the Help Center's new **More Info** tab.

**What it does NOT claim is rotation.** Three of four controlled arms still break section 3 in
5-27% of (round, member) pairs, and the A/B that was supposed to settle `[Rounds Absent]` is
inconclusive because within-arm variance exceeded the between-arm gap. The README and the release
notes say nothing about rotation, which is what the evidence supports.

**v1.3.9 was the release before it**, on 2026-09-24. Seven player-visible changes, all
old-save-safe and none touching the save schema.

Four were planned: the **usage panel** (the `usage` block every provider returns had never been
read by anything in `src/`), the **±8 affection clamp**, **quota-guarded `saveToStorage`**, and
**`backstorySeed`** — committed back in `37f8a1c` and unreleased until now.

Three came from a 40-round hand playthrough run *after* the branch was already green, and are the
more instructive half: **honorifics leaking into narration**, **`呀` transliterated into Chinese
where the syllable already has a different job**, and a **`Alex--ya` double hyphen** that had been
in every English prompt since v1.3.6. A fourth defect from the same session — the usage panel
reading **6.7% high** — was caught only by comparing it against the provider's billing page. See
`docs/V140_PLAN.md`, *"What a hand playthrough found that a green branch did not"*: most of these
are register judgements a native speaker makes, which no assertion written in advance could reach.

Validated offline (`npm run build` + **578 checks** in `node test/smoke.mjs`, up from 469) and
live across ~90 real rounds: 8/8 clean on `主线成员前女友`, 32 clean across two identities and two
models in zh, 6 in en, **0 static-prompt drifts** and **0 ledger prefix breaks** throughout. The
usage meter was confirmed against a real Aliyun response end-to-end, and separately reconciled to
the token against a real DeepSeek Official bill.

v1.3.8 carried the GPT-6 Luna swap and the bump-script coverage for this file. It was exercised
live across ~130 real rounds in Korean and Chinese: 0 honorific reversals, 0 phantom Kakao, 0
sinicized honorifics, 30 collapses with **0 ledger prefix breaks**. Positive evidence too, not just absent flags — sample prose shows `Irene欧尼，前辈nim，这么晚还没回去？`, which is the intended register.

**In progress: v1.4.0–v1.5.0 — see `docs/V140_PLAN.md`, whose Progress table and "Pick up here"
section are the authority on where the work stands.** It splits the single `group` concept into
**cast library / world / roster**, which is the change every feature in that line depends on.
Read it before touching `groupLoader.js`, `buildSystemPrompt`'s section layout, or the save
shape. Two pre-existing bugs it also closes are documented there: save slots record no group id,
and `saveToStorage` swallows quota errors.

Steps 0 (CI), 1 (golden prompts) and 2 (the v1.3.9 release) are **done and released**.

**Step 3 — world extraction + resolver — shipped in v1.4.0** (`3bbc033`..`45dcdbe`, CI green). It
ships no player-visible change by design, so it rode with v1.4.0 rather than justifying a release of
its own: `public/worlds/kpop_idol/<lang>.json` + `worldLoader.js`,
`buildSystemPrompt` rendering from it, `rosterResolver.js`, and `habit`/`tags` on the
`parseGroupConfig` whitelist. **The gate held — goldens byte-identical throughout and
`update-golden.mjs` never run.** Smoke **578 → 630**; the JS bundle shrank 324.73 → 317.51 KB
(gzip 116.59 → 109.97) because the identity prose is now fetched per language instead of shipped
to every player in all three.

**Step 3 uncovered two blocks of dead code, and one was a real feature gap — closed in step 7.**
`paceRules` was built into a local and never referenced, so the player's pace reached the model
**only as a bare id** on the `Progression Pace:` line — `浪漫情感向` and nothing else, while the
authored text it was supposed to send says things like *"secrecy changes doubled"* and *"love
triangle scenes probability doubled"*. Step 3 kept the wiring out because it moves the goldens and
that step's whole gate was that they do not move; step 7's prompt read found the same gap from the
other end (an English player's prompt carried an unreadable Chinese id) and `getPaceRule` is now
what section 6 prints. The second block, a leftover local resolving `"H"` to `form.customIdentity`,
was inert — `App.jsx` already resolves it upstream — and is deleted.

**Steps 3 through 8 all shipped in v1.4.0**, released 2026-09-28. Smoke **578 → 1204** across them.
Everything from here to the end of this section was written while they were unreleased, and is kept
as the record of how each one was validated — read the dates, not the tense.

### The first phone pass of v1.4.1 found eight things, and one was a bug

Hand-played on `dev.idol-dating-sim.pages.dev`, 2026-09-29, the first time any of
v1.4.1 had been seen on a device. **No big bugs** — which is the finding for a release
validated entirely offline — and eight smaller ones, of which exactly one loses
something a player would notice.

| Reported | What it was |
| --- | --- |
| the upload-photo button is too small to find | the only entry point to the photo store was a 34px pill in a two-button row whose **other** button wipes the cast |
| Setup does not fit on one screen | four stacked header lines pushed Start below the fold, behind half a row of identities |
| an office cast works at `X Group` | the org **noun** and the org **suffix** are two halves of one sentence, and they disagreed in two of the four worlds |
| the 📍 button's colour is wrong | the two round buttons on the input row said *tappable* two different ways |
| the socials and the Kakao notices carry across a new game and a load | **the run boundary had two writers** — see *Two ways into a run* |
| nowhere to change a custom member's emoji | a field with a writer, a whitelist entry and a default, and no editor |
| the PDF prints `Round 9` where the screen prints the box | see *Export text extraction* |
| every identity reads like a relationship already under way | see below |

**Three of them are the same shape as things already in this file, one field over.**

**`emoji` is the shape this file tracks seven times, with the halves swapped.**
`npcAppearances`, bubble `photoDesc`, cast photos, `STAR_LEVELS`, `social_platforms`,
`world.tone` and `country.name` are all a feature complete on one side of a boundary and
connected to nothing on the other. `emoji` was the inverse: it is on
`PROFILE_FIELDS`, it is respected by `withDefaults` (`profile.emoji || palette[i]`), it
is drawn by six surfaces — and **nothing could ever put a value in it**, so the fallback
was the only branch that had ever run and a custom member was whichever glyph her
palette index landed on for the life of the save. **A default with no way to override it
is not a default; it is a constant with an unreachable branch.** The editor now writes
the field, through `normalizeEmoji` — one *grapheme*, because a flag is two code points
and a ZWJ family is seven, so slicing by code point stores half an emoji — and the
palette is `EMOJI_PALETTE`, exported rather than retyped beside it.

**The identity backgrounds described a relationship the affection score contradicted.**
Step 7 authored eighteen identities whose prose reads as a history already under way —
*she had already covered for you*, *you were already the last two to leave* — while every
member starts at **Stranger** and `MAIN_INITIAL_AFFECTION` is 12. So round 1 opened on a
cast who behaved like old colleagues and scored like strangers, and the whole affection
curve had nothing to climb from. `kpop_idol` implied the opposite in its own wording
(`自然相识`, `新任Staff`, `新任年轻女会长`) and the three new worlds did not, which is how
they were authored without it. **All four worlds now carry one `[初见]` / `[First
meeting]` / `[첫 만남]` block**, so the check is a scan rather than a reading, and a world
added later fails smoke until it says the same thing.

**The ex-girlfriend is excluded, in all four worlds, and that is the half that makes the
guard worth having.** Her premise IS a shared past, and appending *you have never really
spoken* would have contradicted her own paragraph. Stranger affection is already right
for her — her block opens the run at a distance (*刻意保持距离、眼神闪躲、礼貌但疏离*), which is
what 12 points means for someone you used to know. Smoke asserts both directions: every
other identity carries the block, and she never does. **A blanket append would pass the
first check and fail the game.** The two fixtures that pin her — `chaebol-zh` and
`red_velvet-solo-ko` — did not move when the other four did, which is the same statement
made by the goldens.

**The organisation's noun and its suffix are one sentence.** `orgHint` reads *公司：{org}*
and `{org}` is `orgNameFor(castName, orgSuffix)`, so a suffix of `Group` under a noun
meaning *company* told an office player her company was called *X Group*, and under a
noun meaning *family* told a chaebol player the leading **family** was *X Group*. The
suffix stays Latin in all three languages — that is the convention `kpop_idol` sets with
`Entertainment`, and a K-pop audience reads a brand name at sight — so office takes
`Ltd.` and chaebol keeps `Group` with its noun corrected to the family's **business**,
which is what a Korean chaebol group actually is. **Nothing derivable catches this**:
`parseWorld` takes any string, and all three goldens are whole single groups, which take
the subset template and never render `{org}` at all. It is two pinned regressions and a
derived shape check, and the shape check now runs on **all four** worlds rather than on
`kpop_idol`, which is the one world where neither defect could occur.

**What the four UI fixes have in common** is that none of them is a logic error and none
was reachable by any check written in advance — the fourth batch of this kind in two
releases. The cast-images control is now a full-width card the size of the main-member
slot, with `n / total` on it, because *a number the player can see beats a cap that only
speaks when it refuses* is the third screen to need that lesson; Clear cast moved off its
row, because **a destructive control and the best thing on the screen should not be the
same shape**. Setup's header is one row and lost only the heading (which the Start button
already says) and *Key configured* (which is the normal state — a **missing** key still
shouts, in red). The 📍 button took the send button's colours, asserted as a **pair**,
since either one alone is a colour nobody can be wrong about.

**31 mutations, 31 RED, 0 GREEN, 0 WRONG-CHECK**, each reddening its own named check,
each restored in a `finally`, tree verified afterwards. Smoke **1513 → 1544**. Four
goldens moved, one line each, and the diff was read.

### The second phone pass: a save recorded a world the run was never played in

The first pass's eight fixes were re-tested on a device on 2026-09-29. Five
passed, two wanted an adjustment — and the New Game fix being confirmed is what
made the **bigger** bug visible underneath it: *"the places get mixed across
worlds… chaebol presents all four platforms… kpop places are shown when loading
a chaebol save… the cast produce an idol practice social in a chaebol world"*.

**Four symptoms, one stale copy, and it is a copy taken one screen too early.**
`SaveOverlay` recorded `worldId: roster?.worldId`. A roster is stamped with a
world by the **cast builder** — `rosterFromPicks(picks, world?.id)` — and the cast
builder runs on the screen BEFORE Setup, which is where the player picks the
world. `startNewGame` then spread `pendingRoster` through unchanged. So every run
started from the custom-cast door saved whichever world was selected on the
cover, and `loadSave` — which is correct, and fetches `migrated.worldId`
faithfully — dutifully restored it. A chaebol run reloaded as an idol run:
`world.places` gave the practice rooms, `platformsOf(world)` gave all four top-bar
buttons, and `buildSystemPrompt` was handed `kpop_idol`'s `castLife`, which is why
the cast posted about practice in a family compound.

**The classic door was unaffected**, because `startNewGame` passed `world?.id` at
the moment the run began. One door correct and one stale is what made it read as
"sometimes".

**The fix is that a roster carries no world at all.** `resolveRoster(roster, lang,
world)` has always taken the world as its own argument, so `roster.worldId` had
**no reader anywhere** — its entire contribution was to be the thing `SaveOverlay`
read. It is deleted from `buildClassicRoster`, from `rosterFromPicks` and from both
builder call sites, and the save now takes `worldId` as a prop from the loaded
`world` object every prompt that round was built from. **Only the run knows what
was played**, and a second copy of a fact is the copy that drifts. The goldens did
not move by one byte, which is what says the field was dead.

**Slots written before this fix cannot be repaired.** The intended world was never
stored, so nothing can recover it — a save written from the custom door is now an
idol run and will load as one. Same shape as the polluted social feeds one batch
earlier: **a bug that writes to durable storage leaves a permanent second copy of
itself, and fixing the writer does not reach it.**

**The guard that should have caught this asserted the field was PRESENT.** A loop
over `["schema", "groupId", "worldId", "roster"]` checked that a new slot records
each one — and the field was present and wrong for two releases. *Test the value's
source, not the key's existence.* The new guards assert where the value comes from,
and **count both `SaveOverlay` mount sites**, since one of two is the
`extractStoryText` failure exactly.

**And the platform check could not have found it either, for a different reason:
it was written about `campus`.** *"No undeclared platform reaches the prompt"* is a
sentence about every world, and the check named one — the one world where a chaebol
defect cannot appear. It now loops over `allWorlds`, derives each world's declared
set from its own file, renders that world's prompt and compares; mutated, it fails
naming `chaebol` and `office`. This is the org-suffix lesson from the first pass,
one field over: **a guard pinned to one instance of the class it is about is a
sample, not a guard.**

**Two adjustments came with it.** The cast-images card counts, and the sheet it
opens now lists, **main and subs only**: every surface that draws a face is built
from `allTargetMembers`, and an NPC posts no social and sends no Kakao, so her
photo has no reader anywhere in the running game while still spending one of the
30 photo or 8 wallpaper slots. The card is also named for what it does —
*（可选）上传头像和壁纸* — rather than *照片*. And the PDF's round header band is now
**lighter than the card** with the box centred in it as a block: the light theme
was printing `#3a2510` text on a `#3a2210` band, so the stats box was very nearly
invisible on paper. Centred as a block rather than line by line, because the
frame's lines are equal width only if every CJK glyph in the monospace fallback is
exactly two columns — the one thing box-drawing output cannot assume.

**12 mutations, 12 RED, 0 GREEN, 0 WRONG-CHECK.** Two reported GREEN on the first
run and neither guard was at fault: one mutation **crashed** the suite before it
printed a verdict (an undefined identifier after the import was removed), which
produces an empty failure list and is indistinguishable from a guard that cannot
fail — the harness now reports CRASHED. The other was a real guard weakness: the
delegation check matched **one** of the builder's two `rosterFromPicks` call sites,
so mutating the other left it green. It counts them now. Smoke **1544 → 1551**.

### Pick up here — v1.4.1 is prepared and NOT released, 2026-09-29

**This block is the authority on what is open. The v1.4.0 one below it is history.**

**All eight steps of v1.4.1 are written; step 8's release has not happened.** `main..dev` holds
the whole release — steps 1–7, the bump, and the harness fix step 8 turned up — and it is **pushed
to `origin/dev` and nowhere else**. `main` is untouched at `7b3ceea`, tagged `v1.4.0`, and is
still what players run; `dev` is never deployed. The tree is clean; nothing is stashed and nothing
is running. A count is deliberately not written here: it goes stale on the next commit, and
`git log --oneline main..dev` is the authority.

**Verified, by measurement, offline:** `npm run build` clean at **418.29 kB / gzip 146.86**;
`node test/smoke.mjs` **1511 passed / 0 failed**; `npm run bump 1.4.1` rewrote **15/15** version
strings and left every historical version in this file and in README's old *What's New* headings
alone. Mutation rounds across steps 1–8 total **194 RED, 0 GREEN, 0 NOT APPLIED**. The goldens
moved **three times** in the whole release — step 2's `[Pace: …]` deletion, step 4's sections 10
and 11, step 7's six generalised wordings — each diff read before committing.

**The live gate is MET — 24 rounds across all three new worlds, 2026-09-29, on `deepseek-flash`:**

| run | rounds | cache | drifts | prefix breaks |
| --- | --- | --- | --- | --- |
| `campus` / ko / `junior_student` | **8/8 clean** | 88.2% | 0 | 0 of 2 collapses |
| `chaebol` / zh / `主线成员前女友` | **8/8 clean** | 90.4% | 0 | 0 of 2 collapses |
| `office` / en / `report_to_cast` | 7/8, one `parse:FALLBACK` | 89.5% | 0 | 0 of 2 collapses |

**0 static-prompt drifts across all 24 rounds** — including the chaebol run, which is the
ex-girlfriend identity whose backstory used to re-roll every round, so `backstorySeed` is now
confirmed stable in a **second** world. The chaebol row is also the only one of the three that
ran both ROLE CONTRACT graders, `主线成员前女友` being the one id all four worlds share; the other
two printed their skipped graders, which is the coverage line working as designed.

**The one flag is a pre-existing bug, not a v1.4.1 regression, and it is worse than `docs/
PROPOSALS.md` §7 recorded.** The round was NOT truncated (`finish: stop`, 832 completion tokens)
and every parse level still failed, so the player would have seen 500 characters of raw JSON under
four English buttons — on the healthiest provider this project has. And `MIN_STORY_CHARS` cannot
fix it: `hasUsableStory` decides whether `bad_response` retries by calling **`parseLLMOutput` and
measuring the result**, which on a total failure is level 4's own `text.substring(0, 500)`. 500 is
above every threshold anyone would set, so **the retry machinery can never fire on the one case
where the output is least usable.** Written up in §7 with the fix stated and deliberately not made
— it changes the retry path for every player on every provider and wants its own measurement.

**TWO phone passes are done.** The first found eight things and all eight are fixed;
the second confirmed five of them on the device, adjusted two, and found the save's
world — see *The second phone pass*, above. What has now been looked at on a phone:
the Setup world picker, the four-world identity grid, the 📍 button, the cast
builder, the custom-member editor, the PDF export, the emoji field, and a new game
and a save load back to back.

**The first-meeting frame has now been read in real prose**, which it never had been:
a live `chaebol` / `rival_heiress` / zh run opened round 1 with *这是你们第一次真正说话
——之前你们只在报道照片里见过彼此*, in a scene the model chose for that world (a banquet
hall after closing). 4/4 clean, 90.3% cache, 0 drifts, 0 prefix breaks.

**NOT verified:** the third batch's own fixes have not been seen on a device — the
images card, the PDF band and the save's world are offline-green and
mutation-verified, and two of the three are layout. **The save fix cannot be tested
offline end to end**: the guards assert the value's source in `SaveOverlay` and that
both mount sites pass it, which is the ceiling for a React component here — the
round trip itself wants a device. Steps 5 and 6 remain unexercised live and step 4's
token delta is still unmeasured.

**A save slot written before this batch records the wrong world if it came from the
custom-cast door**, and that is unrecoverable. Start a fresh run to test it.

**The third phone pass CONFIRMED the world fix** — the place list and the top bar's
platforms both follow the save's world now — and found three small things, all fixed
in `631071b`: the PDF started every round on a new page, a save slot could not tell
two worlds apart, and a saved cast could not be deleted.

**It also found the biggest open defect in the release, and it is NOT fixed:** the cast
library's texture prose is written for the idol world and reaches all four. See
*`useRole` filters the FIELD and the prose says it anyway* — **57 of 57 members**. The
interim prompt rule and the real fix are both in `docs/V140_PLAN.md` §22, which also
carries Yuhan's setup-flow restructure and the three places I think it should differ
(`name_kr` has twelve readers and cannot go; deleting `role` leaves a non-idol world
with nothing saying what she does; `animal_plastic` is a prompt field, so removing it
moves every golden).

**Two more from that pass, neither diagnosed, both in §22.4:** a saved cast holding a
custom member who was later deleted comes back as name + emoji — the prose snapshot is
provably complete, so the suspect is her photo and wallpaper in the id-keyed stores the
palette's delete path prunes, **not reproduced**; and whole rounds that name nobody, only
她, which the player cannot follow **and** which makes `membersNamedIn` record no one as
present, so `[Rounds Absent]` then reports a false absence. One prompt rule fixes both.

#### The fourth phone pass — three commits confirmed, one UI bug fixed

**`631071b` passed on the device**: the PDF flows continuously, a save slot names its world, a
saved cast can be deleted. Nothing outstanding from that batch.

**One bug came with the pass and is fixed:** Setup's year wheel displayed a year the form did not
hold, so Start refused with *请完成所有选项* and nothing on screen was left to fill. See *A wheel
always displays a value* — the entry the member editor already had, extended rather than
duplicated. **4 mutations, 4 RED**, one of them GREEN first for reading its own comment. Smoke
**1558 → 1561**; no golden moved, because nothing prompt-facing changed.

**That fix exposed a second one, confirmed and fixed in the next commit:** the wheel's self-scroll
latch was cleared on one path only, so seeding it on mount left the latch set and every scroll the
player made was discarded until she tapped a row. Reproduced in a real browser first — **Setup
stuck, the member editor unaffected** — see the same section. **4 mutations, 4 RED.** Smoke
**1561 → 1562**.

**§22.1's interim prompt rule is now DECIDED: take it, this release.** Yuhan, 2026-09-29 —
*"interim prompt rule now and totally clean it when we do section 22"*. It is the next commit,
it moves the three non-idol goldens deliberately, and it is the last thing before §22.2.

#### The exact next step — §22 is AGREED and not started

**`docs/V140_PLAN.md` §22 is the authority and it is settled**, agreed with Yuhan on
2026-09-29 in the form recorded there: player info before the cast picker, one profile
editor for custom and prebuilt members reached by tapping a chosen member's bubble, two
tabs, and **only tab 1 persisted**. Tab 1 is `photo · name* · birth year* · private
personality*` then `wallpaper · MBTI · habit · emoji`, then the one-line description and
the generate/retry pair. The test for which tab a field is in: *would this sentence still
be true if she were cast in a different world?*

The three agreed departures from the first draft, each load-bearing: **`name_kr` stays**
(twelve-plus readers, `membersNamedIn` among them); **`role` is replaced, not deleted**, by
a generated world-scoped position, or a non-idol world has nothing saying what she does;
**`animal_plastic` leaves the EDITOR and stays in the data**, since it renders in the
profile block and removing it would move every golden. An edit to a library member lands
on `entry.override`, which `resolveRoster` already honours — never a snapshot.

**Nothing of §22 is implemented.** The order of work, and the one decision still open:

1. Yuhan's hand test of `631071b` (the PDF flow, the save-slot world label, the saved-cast
   ×) — **owed from him, nothing to do until it arrives.**
2. **DECIDED — take the §22.1 interim prompt rule now** (Yuhan, 2026-09-29), with §22.2's
   generated tab 2 replacing it properly in v1.4.2. It moves the three non-idol goldens, so
   it gets its own commit and the diff is read.
3. Then §22.2, which is a multi-file change and therefore wants its own written plan and
   confirmation before code, per the global config.

**Every line of the release sequence is still a red line and none of it has been done.**
`main` is untouched at `7b3ceea`, tagged `v1.4.0`, and is still what players run.

**The exact next command** is the phone pass, on the Cloudflare branch alias (deterministic,
unlike Vercel's), which needs no deploy because `dev` is pushed:

```
dev.idol-dating-sim.pages.dev
```

**`--world` is new, and it is why that gate could be met at all.** The harness
pinned `kpop_idol` in two places, so it could not exercise a single line of what v1.4.1 adds — the
fourth instance of the shape this file tracks three times, found by the prediction that said to go
looking for a fourth. It is added, mutation-verified (**9 RED, 0 GREEN**), and it **refuses a
`--world` / `--identity` pair the world does not declare** before spending a round. Note what it
still cannot do: `IDENTITY_ROLE` is keyed on the kpop ids, so both ROLE CONTRACT graders are silent
in a new world. The run now prints which graders did not execute, so a clean row does not overstate
itself.

Then the release itself, every line of which is a red line and none of which has been done:

```bash
git push origin dev
git checkout main && git pull
git merge dev --no-ff -m "release: v1.4.1"
npm run deploy
git tag v1.4.1 && git push origin v1.4.1
git checkout -- index.html
git checkout dev && git merge main && git push origin dev
node scripts/dev-index.mjs
```

**Two decisions are still Yuhan's and neither blocks the release:** §18 decision 9 — `world.tone`
and `country.name` have no reader, and step 7 authored three more copies of each — and
`PROPOSALS.md` §6's ending precedence, which §21 needs before v1.4.2 can start.

### Pick up here — v1.4.0 is released, 2026-09-28 (historical)

**v1.4.0 is deployed and is what players run, and the tree is clean.** `main` = `origin/main` =
`7b3ceea`, tagged `v1.4.0`; `dev` = `origin/dev`, which is that commit plus the dev-mode
`index.html` and the docs. `main..dev` holds only those, so the merge-back is done. **No
uncommitted changes, nothing stashed, nothing running, nothing waiting on a machine** — this is a
clean starting point for the next batch.

**Verified, by measurement:** `npm run build` clean at 404.59 kB / gzip 142.78; `node
test/smoke.mjs` **1204 passed / 0 failed**; all three mirrors serve `index-BEbGT01U.js` and the
bundle fetched from Cloudflare is **byte-identical** to the local build, contains `v1.4.0`, all
three More Info labels and the avatar fix's `backgroundOrigin`. Goldens untouched since the step 7
re-validation — nothing in step 8 is prompt-facing.

**Not verified:** the release was hand-tested on `dev.idol-dating-sim.pages.dev`, not on the
production URLs. They serve the same bytes, so this is a formality rather than a gap, but it has
not been done. No live round has been played against v1.4.0's code on a production mirror.

**The zh save button keeps `(最多10个)` — decided, not overlooked.** An in-flight edit dropping it
sat in the working tree during the release, on the reasonable argument that the panel now shows
`n / 10` at all times so the caption is redundant. It was **stashed for the deploy and then dropped
on Yuhan's call**, so `save.saveBtn` reads `💗 保存当前进度 (最多10个)` and matches the deployed
bundle. Do not re-open it as a tidy-up; the caption is what a player sees before she has opened the
panel at all, which is the moment the cap matters most.

The release-process lesson from it is worth keeping: an uncommitted change in a path `deploy.sh`
stages is a **release decision**, not an obstacle. It would have changed the bundle hash — verified,
the same build with it in produced `index-CSLDaEkY.js` against the deployed `index-BEbGT01U.js` — so
preflight refusing was correct, and `git stash push <path>` is the resolution that neither ships an
unreviewed edit nor destroys someone's work.

**The exact next command**, for the highest-value open item — three of the four providers have
never played a live round, which is what open question 3 has been waiting on:

```bash
node test/playthrough.mjs --provider gemini --rounds 8    # needs a Gemini key in .env.local
node test/playthrough.mjs --provider gpt4omini --rounds 8
```

**Also open, in rough order of value:**

- **`docs/V140_PLAN.md` §10 still carries a calculated storage figure.** The image sheet prints
  `N KB used` on a real device; read it and replace the arithmetic. See the paragraph below.
- **The router fix from `56cc684` is live-untested** and needs an Aliyun `sk-ws-` key;
  `.env.local` holds a DeepSeek one.
- **The post-fix `[Rounds Absent]` arm is still owed**, and needs 3+ replicates per arm to say
  anything at all — `docs/PROPOSALS.md` §4.
- **The harness stores only a count of delivered Kakao, not their text**, so a
  `kkt-transcribed-in-story` flag cannot be reviewed after the fact. Fix that before acting on the
  one survivor.
- **The Bubble avatar repeats on every line** — raised twice, still Yuhan's design call.
- Pre-existing: the 126-char truncated round accepted with English fallback options
  (`docs/PROPOSALS.md` §7); Chinese comments in `probabilityEngine.js`, `achievements.js`,
  `relationshipEvents.js` and `stageConfig.js`; `DEFAULT_CAST_NAME` `"X"` colliding with the
  shipped group `x`; §18b's impossible Kakao; splitting the classic Setup page; the ~1.7x
  cost-table understatement (§2) and zero negative affection steps (§1).

**What the five batches in this release were**, kept for the record:

- **the role-first cast picker**, rebuilt on Yuhan's design — see *The cast picker is organised by
  role, not by member*;
- **step 8: photos in the game, wallpapers, and the year wheel**, from his hand test of the first —
  see *The photo store shipped with no reader* and *A birth year is stated once*;
- **step 8's second pass: the crop the player chooses, and three phone-only rendering bugs** — see
  *Four of those six surfaces were wrong on a phone*. **33 mutations, all RED**, three red only
  after a fix;
- **step 8's third pass: the avatar clip path, Instagram fitting its panel, the wheel on the name
  field's line, and `npm run bump 1.4.0`** — see *The first fix cured the one surface that was
  never broken*. **18 mutations, all RED.** That avatar fix was **wrong**; see the next bullet;
- **step 8's fourth pass: an avatar with nothing to clip, and release notes inside the game** —
  see *The second fix made the square reachable*. **16 mutations, all RED.** Third attempt at one
  bug, and the first two were the same mistake in different syntax. Confirmed fixed by hand on a
  phone before the release.

**Step 8's one unmeasured number is still unmeasured, and it moved.** Canvas WebP cannot be encoded
outside a browser, so the wallpaper's ~46 KB is calculated and the storage budget it feeds (~2.4 MB
typical) is calculated with it. That figure went **down** with the 2:3 correction — 16% fewer pixels
— and it is still arithmetic. The image sheet prints `N KB used` on screen; read it and correct
`docs/V140_PLAN.md` §10 from the real figure.

**The second pass adds 33 mutations, all RED, and three were red only after a fix — two of them
were the guards' own presence-versus-behaviour trap again.** Breaking the vertical centring in
`cropRect` left every crop assertion green, because all of them used a wide source against a square
frame where that term is exactly zero. Deleting `onWallChange` from the editor's props left its guard
green, because the name still appeared at the call site that depends on it. And `cropRect` clamped
twice, so neither clamp could be shown to work at all. The harness itself had a fourth: four of the
first thirty mutations **never applied**, because a multi-line `from` written with unix newlines
matches nothing in a CRLF file — the same silent-no-op the perl version of the harness had, reported
as GREEN both times. **A mutation that reports GREEN and a mutation that never ran are the same line
of output.**

**38 mutations in the first pass, all RED, and two of them were red only after a fix** — both were this file's own
rules failed by its own guards. One asserted an oversized wallpaper is refused, which stays true
when the cap is wrongly pinned to the photo limit; the half that fails is *accepting* an image
between the two caps. The other matched `removePhoto(walls, id)`, which also appears in `setWallFor`,
so deleting the delete-path line left it green. **Count the call sites; do not test presence.**

**The sanity run is done, on DeepSeek, and it is the first live exercise of the fixed
`membersNamedIn`:** 8/8 clean rounds on `deepseek-flash`, median 5,459ms, `direct` parse 8/8, **89.6%
cache**, 2 collapses with **0 prefix breaks**, **0 static-prompt drifts**. Rotation reads Irene 8/8
(max gap 0) and Seulgi 5/8 (max gap 2) — **compliant with section 3, and the first honest rotation
measurement this project has taken**. It is n=1 on 8 rounds in one config, so it settles *nothing*
about `[Rounds Absent]`; it establishes that the fixed code runs and reports sane numbers.

**The router fix from `56cc684` is still live-untested**, and cannot be tested without an Aliyun
`sk-ws-` key — `callAliyunFreeRoute` is Aliyun-only and `.env.local` currently holds a DeepSeek key.

**The controlled re-validation is done — 100 live rounds, four 25-round arms, one model pinned and
recorded in every arm.** It found two bugs and could not answer the question it was run to answer.

- **`[Rounds Absent]` was shipping false absence counts** — `membersNamedIn` matched the Latin stage
  name only, and 29 of 75 (round, member) pairs in one run named her only as 涩琪 or 胜完. **Fixed**,
  now an exported pure function with behavioural guards, both mutations RED. See *`[Rounds Absent]`
  shipped telling the model things that were not true*.
- **`analyze-prose.mjs` had the same bug**, so every rotation figure recorded before today — the six
  committed baselines included — measured naming style. **Fixed**; the harness now stores `name_kr`.
- **The A/B is inconclusive and that is the finding.** Two runs of identical code gave 0% and 26.7%
  rule violation. Within-arm variance exceeds the between-arm gap, so nothing supports keeping or
  removing the line. `docs/PROPOSALS.md` §4 says what it would take to decide.
- **Rotation is still not fixed** — three of four arms break section 3 in 5–27% of pairs. This needs
  no comparison and is safe to state.

**Still genuinely unfinished, and unchanged by today:**

- **one `kkt-transcribed-in-story` survived the ownership rule**, once in 25 rounds on the post-fix
  code too. The harness stores only a **count** of delivered Kakao, not their text, so the flag it
  raises cannot be reviewed afterwards — fix that before acting on this one.
- a **126-character truncated round was accepted** and rendered with English fallback options — two
  separate defects, both written up in `docs/PROPOSALS.md` §7.
- `qwen3.7-plus-2026-05-26` is **out of free credits** as of today; 100 rounds exhausted it. Re-probe
  with `node test/smoke.mjs --live-free` before pinning anything — and note `--live-free` needs an
  Aliyun `sk-ws-` key and fails every probe with `auth` on any other, which is correct behaviour and
  reads alarmingly.
- **three of the four providers have still never played a live round.** The harness could not reach
  them until step 7; `--provider gemini` and `--provider gpt4omini` are now one command each, and
  open question 3 (`reasoning_effort:'none'` on OpenAI, Gemini with thinking off) has been waiting on
  exactly that.

**The release happened on 2026-09-28** — `main` at `7b3ceea`, tagged `v1.4.0`. The open decision
recorded here at the time was whether v1.4.0 should ship claiming rotation is addressed. It did
**not**, in the README or in the in-game release notes, which is what the evidence supports.

**Step 7's pre-release review found nineteen defects.** The method was the one that worked in step 6, applied harder: read all three
rendered goldens end to end rather than the diff, read the prompt *against the code that consumes it*,
and then run 105 live rounds and read the prose instead of the pass/fail line. Nine of the nineteen were
invisible to any test that existed, and **seven of those were invisible to the zh fixture** — the
language the data is authored in. The full list is in this file under *Reading it a second time*, *105
live rounds*, *A Kakao is delivered by the app*, *Korean particles*, *[Rounds Absent]*, *a bubble photo*,
*Known Inconsistencies 2*, and the stats-box note under *Add-on Features*. What was deliberately **not**
changed is in `docs/PROPOSALS.md`, with the measurement that would settle each one.

**Step 6 is the first of these with player-visible changes**: a second door on the cover leading to
a roster builder, a three-step member editor with LLM card generation, cast photos, an on-device
console behind `?debug=1`, and the birth-year correction a migrated save needs. It was **hand-tested on an iPhone against the Cloudflare
branch alias** — `dev.idol-dating-sim.pages.dev` — which found three bugs nothing offline could:
the birth-year field could not be typed into, the role picker hid what it was assigning, and a
cross-group cast was described as the main member's group (see *"A cast drawn from more than one
source is its own group"*). All three are fixed.

**Hand play then found three more, after the offline suite and the live gate were both green** — and
they are the more instructive half of step 6, because none of them was findable by any check written
in advance: the player's identity and the members' leaking into each other (*"Whose life is whose"*),
**save slots silently deleting the oldest run past ten** (*"The tenth save is the last one"*), and,
from reading the whole rendered prompt on Yuhan's prompting, six stale or contradictory setting
statements (*"Reading the whole rendered prompt, once, found six more"*). The save bug is the worst
of everything step 6 turned up: it destroyed player data rather than misdescribing it.

**The goldens moved three times in step 6, each deliberately and each diff read** — the ROLE
CONTRACT, the six prompt-review fixes, and section 9's localized stage names. They were
byte-identical through the first eleven commits, which is what the step's own gate asked for.

**For branch previews use Cloudflare, not Vercel.** Cloudflare's alias is a deterministic
`<branch>.<project>.pages.dev`; Vercel's preview hostname embeds a team slug that exists nowhere in
this repo and cannot be derived from it.

**Step 6's live gate is met.** The reported roster — Jisoo (BLACKPINK) main, Irene (Red Velvet) and
a custom member as subs, Mina and Sana (TWICE) as NPCs — played **10/10 clean rounds** in zh:
**0** outside-cast names among the 14 members of those groups who are not in the roster, **0** real
agencies, **0** static-prompt drifts, 3 collapses with **0** ledger prefix breaks, 81.2% cache. A
classic single-group control ran 6/6 clean at 85.6%. Section 4 read `[X Background] / X is a
5-member group under X Entertainment`, naming none of the four origin groups.

**A second, wider run after the later fixes: 64 rounds, four configurations** — see *"64 live rounds
across four configurations validate step 6"* under Project Status for the numbers and for the two
grader bugs it exposed.

Remaining in step 6, optional: splitting the classic Setup page. **It does not block the release**,
which is step 7. The roster builder's design was the other open item and is now done — see below.

### The cast picker is organised by role, not by member

**Reworked on Yuhan's design, step 7.** The builder listed every member in the library and hung
three small role buttons off each card. Two things were wrong, and the second is why this was a
restructure rather than a restyle:

- **It did not match the decision.** A player picks her main, then optionally some subs, then
  optionally some background faces. She never walks the library asking "what is Yeri for".
- **It could not be tapped.** Up to twenty-seven adjacent ~18px targets at 390px, each assigning a
  **different** role — so a mis-tap assigned the wrong part rather than missing.

Note the first version was tap-to-cycle on symbols, replaced after a phone test by those three
*named* buttons. **The second attempt fixed legibility and left the structure wrong**, which is why
the lesson is recorded here and not in the commit alone.

Now three sections — main, subs, NPCs — each showing its members as chips with an `x`, and a `+`
opening `MemberPicker.jsx` for that slot. Four rules the shape encodes:

- **The sheet's behaviour follows the slot's cardinality.** One main, so choosing her closes it;
  subs and NPCs are "as many as you like", so it stays open and counts.
- **A member holds exactly one slot, so tapping her elsewhere MOVES her**, and the picker names the
  role she currently holds. Ids key every per-member map in the save, so one member in two slots
  would merge her own state; the alternatives are a silent no-op or a duplicate.
- **Chip order comes from `rosterFromPicks`**, not from the picks object — within-slot order reaches
  the prompt and prompt order is a cache boundary, so two answers to "what order" is one too many.
- **Each section explains its role whether or not it is filled.** The old legend showed only while
  the whole cast was empty, so it had vanished by the time the player reached the NPC decision.

**Five defects went with it, and two are repeats of lessons already in this file:**

| Found | Was |
| --- | --- |
| **The player's font scale never reached these screens** | threaded into the story, the options, Bubble and Kakao — and into neither cast screen, which were also the smallest type in the app. A player who asked for larger text got it everywhere else |
| **Type below the readable floor** | 8px for a line the player has to read (which group a shared member came from), 9 and 9.5 elsewhere, against 11-13 in the rest of the app. `castTheme.js` now holds the floor and every size passes through `scaleFont` |
| **The raw group id was shown to the player** | `red_velvet`, `gnz` — where every other surface shows the display name. **The `[Stage Changes]` defect one layer up**, and a custom member's id is a timestamp |
| **The 20-member cap was invisible until hit** | exactly what the save slots taught (*"The tenth save is the last one"*), one screen over. It now reads `n / 20` at all times |
| **`pickMainHint` described a control deleted two redesigns ago** | in all three languages. **The i18n form of "a prompt is not append-only"** |

**`castTheme.js` exists because the palette was three copies of the same fifteen literals**, one per
cast screen. That is the convention the older overlays set and it is wrong here: these three are one
flow the player walks in a single sitting, so a token edited in the builder and forgotten in the
sheet makes the sheet look like a different app. Same argument as `extractStoryText`, where two
copies had drifted and the guard had been written against the one that was still correct.

**`displayNameIn` shows the name the player recognises, and must never reach the prompt.** zh sees
`裴珠泫`, ko `배주현`, en `Irene` — en's `name_kr` is a romanized legal name ("Bae Ju-hyun"), longer
than the stage name and not what an English reader knows her as, so en keeps `name`. Same split as
the zh address-form table and for the same reason: what the audience reads, not consistency. The
prompt is unaffected and guarded: `name` is the cast's canonical identity everywhere the model can
see it, and `membersNamedIn` reads it back out of the prose to decide who appeared.

**Saving a roster asks what to call it, and the label must never land on `roster.name`.** Those two
fields look interchangeable and are not: `roster.name` is the composed **group** name, which
`rosterResolver` renders into section 4 as *"\<name\> is an N-member group under \<name\>
Entertainment"* — so a cast saved as "my Irene run" would have debuted under that name in the story.
`savedRosterEntry` is a function with a test for exactly that reason.

**`assignSlot` and `savedRosterEntry` are exported pure functions**, the `addSaveSlot` pattern: five
guards that matched the component's *source* now test behaviour, and they went red the moment the
logic moved — which is what a regex over an implementation does. Five more encoding the old layout
were replaced by guards written from the same requirement.

### The photo store shipped with no reader — step 8

**Reported from Yuhan's hand test of the role-first picker.** `imageStore.js` worked: it
downscaled, capped, refused and persisted. The roster builder showed the result. **`App.jsx` never
imported it**, so the game top bar, the four social overlays and the tab strip inside them all still
drew `emoji` over a `linear-gradient(color, accent)`, and a player who uploaded nine photos saw them
only on the screen where she uploaded them.

**This is the third instance of one shape in this file** — a feature complete on one side of a
boundary and connected to nothing on the other:

| | The half that existed | The half that did not |
| --- | --- | --- |
| `npcAppearances` | a tail block and a cooldown rule | anything that ever wrote an entry |
| bubble `hasPhoto` | an overlay that draws a photo frame | `photoDesc` in any schema |
| **cast photos** | **a store, an uploader, a cap, a prune** | **any consumer in the running game** |

All three read to a player as a broken control rather than a missing consumer, which is exactly how
this one was reported. **The check that finds this class is not a test — it is asking, for each
feature, which file READS what it wrote.** A green suite says the writer works.

**`memberFace.jsx` is one definition of "her photo, or her gradient and her emoji"**, consumed by all
six surfaces. Six copies is six chances for one of them to be the copy still showing the emoji —
`extractStoryText` is the precedent, where two copies had drifted and the guard had been written
against the one that was still correct. Guarded by counting the consumers, because a helper can
exist, be correct, and be used in five of six places.

**One wallpaper per member, not one per platform.** Her wallpaper is the chat background in Bubble
and KakaoTalk, the post image on Instagram, and the header banner on Weverse — four surfaces per
upload. Three separate backgrounds would be 3x the quota and 3x the uploads for a photo each
platform already lays its own scrim over.

**It is safe on Instagram because the post image has always been decorative.** The schema asks for
`{caption, likes}` and has never carried a description of an image; the table in this file claiming
`{imageDesc, caption}` was wrong, and is corrected above. Bubble's `hasPhoto`/`photoDesc` frame is
therefore the opposite case and is **left alone** — that is a specific picture she sent this round,
and substituting her wallpaper for it would render a description of one image over a different one.

**`imageStore.js` is parameterised, not copied.** A second store with different caps and a different
aspect ratio is exactly where a second copy of the four refusal rules would appear, so the caps are
an argument (`PHOTO_LIMITS` / `WALL_LIMITS`), `downscale` is one aspect ratio of `downscaleCover`,
and `loadPhotos`/`loadWalls` are wrappers over one keyed accessor.

**`pruneOrphans` is gone, and it was a latent data-loss bug this change would have activated.** It
kept only the ids its caller listed, and its one caller passed the **custom palette** — so once a
library member could have a photo, deleting one authored member would have deleted every library
photo in the store. It was harmless only because nothing could put one there. The delete site now
removes the one id that stopped existing, which needs no id universe — and this screen has none
anyway, since group configs are fetched per tab and a group the player never opened is
indistinguishable from a group that is gone. Not kept for v1.5.0: a function with no caller is what
`NPC_APPEARANCE_CHANCE` is a standing example of, and it is eight lines to write again.

**Uploads live in one sheet on the cast already chosen.** The obvious place is a camera badge on each
card in the picker grid, and that grid is three columns at 390px where the card itself is the assign
target — a 20px badge beside a 40px one is the adjacency that made the pre-step-7 builder untappable,
where a mis-tap did not miss but assigned the wrong role. One entry point reintroduces nothing, and
gives both caps and the bytes in use somewhere to live: `n / 30`, `n / 8` and `N KB used`, **visible
at all times** rather than at the moment they refuse. That is the third screen to need that lesson
after the save slots and the member palette.

**The quota figures are calculated, not measured, and the app now reports the real one.** 360x540 at
q0.7 is ~2.9x the pixels of a 256x256 at q0.8, so ~46 KB of stored string against ~20 KB; §10's
budget moves from ~2.1 MB to ~2.4 MB typical against the ~5 MB quota, worst case ~3.1 MB. Canvas WebP
cannot be encoded outside a browser, so none of that can be measured offline — which is why the sheet
prints `N KB used`. A number nobody can observe is a number nobody can trust.

### Four of those six surfaces were wrong on a phone — the second hand test

The feature reached the game and then had to survive being looked at. None of the four is a logic
error; each is the gap between what the code specifies and what a phone renders, which is the class
this project can only find by hand.

**The crop was automatic, and an automatic crop is indistinguishable from a bug.** `downscaleCover`
took the largest centred region with the target's aspect ratio — correct for an arbitrary image, and
wrong every single time for a face, because a photo taken at arm's length puts the head in the top
third. It was reported as *"the ratio of the photo and wallpaper is not fixed"*, which is exactly
what a crop nobody chose looks like from the outside: the output varies with the input for a reason
the screen never states.

So the player frames it: `ImageCropper.jsx`, drag to pan, pinch or slider to zoom, confirm. Three
things make it more than a restyle:

- **The frame is the shape the image will be seen in** — a circle for a photo, 2:3 for a wallpaper.
  A square preview of a round avatar is a preview of something that never appears.
- **The maths is pure and lives in `imageStore.js`** (`coverScale`, `clampOffset`, `cropRect`), not in
  the component. A wrong crop region is invisible until the image is already in the game, and the
  component can only be tested by hand; the region can be tested offline, so it is.
- **`cropRect` at zoom 1 with no pan reproduces the old centred crop exactly**, which smoke asserts.
  The behaviour survives as the cropper's opening position instead of as a second code path, and
  `downscale`/`downscaleWall`/`downscaleCover` are **deleted** — an automatic crop beside a chosen
  one is two answers to one question.

**And it had two clamps of one rule, which is two clamps neither of which can be shown to work.**
`cropRect` clamped the offset *and* bounded the result into the image. Break either and the other
covers for it, so the guard that exists to catch a blank corner passes against both halves being
wrong — found while mutation-testing, not while writing it. One enforcement now, with a
`Math.max(0, …)` that is documented as a floating-point floor rather than a bound.

**2:3, not 9:16 — the ratio has to be the one the image is SEEN at.** The wallpaper was sized to the
overlay panel. It is never shown at the panel's size: the title bar and the member strip take ~72px
off a 600px panel, so the surface is 360x528, and 9:16 lost a sixth of every upload to a crop nobody
asked for. Instagram is the one surface that cannot show the whole thing, and its square became a
**4:5 portrait post** — a real Instagram ratio, trimming ~17% where a square would have taken 33%.

**One wallpaper, one job.** Weverse used it as a post card's banner while the other three used it as
a background, so a single upload meant two different things depending on which tab you opened. It
now backs the Weverse feed exactly as it backs Bubble and KakaoTalk, and the post card goes nearly
opaque over it — a 5% tint is invisible against a plain panel and useless against a photograph,
which is the same reason the chat bubbles keep opaque fills on top of the scrim.

**A square photo inside a round frame, on iPhone only.** `MemberFace` drew the `<img>` as a flex
child and left the clipping to the parent's `overflow: hidden` + `border-radius` — the one shape
WebKit declines to clip. The tab strip, which puts the radius on the `<img>` itself, was never
affected, and that difference is the whole diagnosis. The photo is now positioned `inset: 0` and
carries `borderRadius: "inherit"`, so its shape does not depend on anyone clipping it; the frame
gained `isolation: isolate` and an explicit `boxSizing: border-box`, the second because every caller
passes a 1px border and content-box sizing insets the photo inside its own ring.

**A `display:none` file input inside a `<label>` does not open the picker on iOS Safari.** That is
how the member editor's uploader shipped **untappable** — the only way to give an authored member a
photo, on the only device this app is built for. `CastImageSheet` had always used a ref and a
`.click()`, so the pattern that works was one file away. **The guard is derived**: every
`type="file"` in `src/` is scanned, none may be wrapped in a label, and every one must reach the
cropper — so a third uploader cannot reintroduce either. Its first version read the *comments*
explaining the fix and failed on its own documentation, which is the second time that has happened
in this batch's guards.

**A custom member could be given a photo and a wallpaper nowhere.** The image sheet lists the
*chosen* cast, and she is authored before she is chosen. The editor now carries both, through
`setPhotoFor`/`setWallFor` — the same writers the library uses, because a second write path is a
second set of caps to forget.

**The year wheel had no edges.** Five rows at 36px is 180px of loose numbers with no frame and no
surface of its own, sitting in Setup beside a 38px name field — so it read as floating over the
page rather than as one control. Three rows at 34px inside a bordered, rounded, clipped box, and
the viewport is `ROW_H * VISIBLE_ROWS + 2` so the border does not cost the pixel that would put
`scrollSnapAlign: center` permanently one off from `scrollTop = index * ROW_H`.

### The first fix cured the one surface that was never broken — the third hand test

Three more from the phone, and the first of them is the instructive one.

**A fix validated against the working case is a fix validated against nothing.** The square-photo-in-a-round-frame fix of the second pass gave the `<img>` a radius of its own, and the reasoning was sound: the tab strip puts the radius on the `<img>` and the tab strip was never broken. It shipped, and the avatars were still square in Bubble, KakaoTalk and Weverse — and correct on Instagram, *which is the one surface whose shape that fix could reach*. The delta I had used as the diagnosis was a delta between two working copies.

The real discriminator is one line away and was in the diff of the same batch: **Bubble, KakaoTalk and Weverse are exactly the avatars sitting inside a scrolling container that carries a background image, and Instagram's is not.** A scroller with a background becomes its own composited layer on iOS WebKit, and a rounded `overflow` clip on a descendant is not applied across that boundary — which is why the *gradient-and-emoji* default came out square too, and no radius on an `<img>` could ever have helped it. Still **unverified** as a mechanism: it is inferred from which three broke and which one did not, not from a repro. The fix does not rest on it, because `clip-path` does not clip by overflow at all.

- **The shape is a `clip-path`** — **this was also wrong; see *The second fix made the square reachable* below, where removing `overflow: hidden` is what let the square through.** `circle(50%)`, or `inset(0 round Npx)` for the cast screens' rounded squares — and `overflow: hidden` plus `isolation: isolate` are **gone** rather than kept beside it. `border-radius` stays because it is what rounds the *border*. A shape enforced twice is a shape neither enforcement can be shown to hold, which is what `cropRect`'s double clamp cost an hour of mutation testing to find one release ago.
- **The three scrollers drop `background-attachment: local`**, which was a second, separate bug hiding in the same line. With `local`, `cover` sizes the wallpaper against the whole **scrollable content**, so a long KakaoTalk thread displayed a crop the player never framed — the exact promise the cropper exists to keep. Default attachment pins it to the padding box, which is what a chat wallpaper does anyway: the messages move over it, not with it.

**A fixed aspect ratio decides the layout before the container does.** Instagram's post was 4:5 — a real portrait ratio, chosen to waste less of a 2:3 upload — which is 450px of a 600px panel that has already spent ~115 on its title bar, tab strip and post header. So the caption and the like count sat below the fold on **every** post, and the player had to scroll to read the thing the round actually generated. The frame now takes what the panel has left (`flex: 1 1 0` against siblings that cannot shrink) and `cover` trims the rest. The scroll survives only as a backstop for an unusually long caption; KakaoTalk keeps its scroll on purpose, because a thread is history.

**A caption inside a control's own column moves the control.** Setup's year wheel was in a flex row with the name field and looked like a second row, because the "Birth year" caption above it pushed the wheel down by the caption's own height. The captions are lifted into the section label, so the row holds exactly two boxes and centres them — and the wheel box's centre *is* the selected year, since the band sits at the middle row by construction.

### The second fix made the square reachable — the fourth hand test

**Three fixes for one bug, and the first two were the same mistake in different syntax.** The
avatar came out square inside its round ring on Bubble, KakaoTalk and Weverse. Attempt one put a
radius on the `<img>` and cured Instagram, which was never broken. Attempt two moved the frame to
`clip-path` and **removed `overflow: hidden`**, reasoning that one enforcement is better than two.
It was still square.

**Attempt two did not merely fail; it made the failure worse, and the report said so in words this
file had not read carefully enough.** "The square edge **inside** the circle" is not "the frame is
square" — it is a circle with a square in it. That is precisely what the component does when its
clip does not apply: `border-radius` still clips the element's **own** background, so the gradient
frame is a clean circle, while the `<img>` child — no longer held by any overflow clip — paints as
a full square on top of it. **Measured**, in Chromium with `clip-path` forced off: the current
component renders a full square, and the fix renders a circle.

**The fix is to delete the child.** Her photo is the frame's own `background-image`, sized with
`background-size: cover` and `background-origin: border-box`. There is no descendant, so no
clipping mechanism can fail; `border-radius` clipping an element's own background is the most
basic rounding in CSS. `overflow`, `clip-path` and `isolation` are all gone.

**`photoFill` is the one definition and it has three consumers**, because `MemberPicker` and
`RosterBuilder` were clipping an `<img>` the same way — not in the configuration that has ever
failed, but the same shape, and *count the call sites* is the standing rule here. `MemberSelector`
keeps its `<img>`: that one carries its **own** `border-radius`, which is why the tab strip has
never been reported square, and it is the difference the guard is written on. `ImageCropper` keeps
its `<img>` too, because the preview is panned by transform and must be a child.

**How it was finally diagnosed, after two fixes reasoned from the wrong evidence.** A repro
harness in the scratchpad: esbuild bundles the *real* `memberFace.jsx` and the *real* crop pipeline
into a page, headless Chrome screenshots it, and the image is read. Chromium cannot reproduce an
iOS compositing bug — so the harness reproduces the **consequence** instead, by forcing
`clip-path: none` and looking at what is left standing. Test images are **generated** (a flat red
fill, and a checkerboard inside a 20px magenta frame so any letterboxing is unmissable) rather
than downloaded: a real face hides an edge artefact that a hard frame cannot, and nothing about a
real photo needs to touch this machine or this repo.

The first thing that harness did was clear a hypothesis out of the way. Yuhan's own reading was
that the saved crop might be wrong — "check if the scale/ratio is wrong". It is not: the pipeline
writes a 256x256 WebP with `sx=0 sy=150 sw=900 sh=900` from a 900x1200 source, which is exactly
the centred square, and the decoded image has no transparent margin. **Ten minutes of rendering
settled a question two rounds of reasoning had not.**

**The guards moved from the mechanism to the requirement.** They used to assert
`clipPath: clip, WebkitClipPath: clip` — today's CSS, pinned. They now assert that the component
**renders no child**, that its shape is its own `border-radius`, and — derived from a scan of
`src/` — that no screen shows a stored photo as a child something else has to clip. A fourth
screen cannot quietly reintroduce it.

### What's New belongs in the game, not only in README

**A player opens the game; she does not open the repository.** Every release note this project has
written has lived in `README.md`, which is on GitHub, behind a link in the Help Center's last tab.
Reported by Yuhan: put it where she already is.

The Help Center's fourth tab is therefore **More Info** (`更多` / `더보기`) rather than Contact, and
it renders one or two sentences per release, newest first, above the contact details it already
carried. The panel's content area already scrolled, so the list can grow a release at a time.

- **`src/config/releaseNotes.js` is ONE array with all three languages side by side**, not three
  copies in `src/i18n/*.js`. A missing translation in an i18n file is invisible until a Korean
  player opens the tab; here it is a hole in a row. Smoke asserts every entry carries all three.
- **Smoke ties `RELEASE_NOTES[0].version` to `package.json`.** Without that the list silently stops
  at whichever release last remembered to add a line — the failure README's *What's New* heading
  already has a guard for, one file over. It also makes the tab's "you are playing this" badge on
  the top entry true by construction rather than by hope.
- **A version number in that file is history, so `npm run bump` must not touch it** — the same rule
  as README's old headings and this file's post-mortems. The guard probes a version the notes
  actually *name*, because bumping the current version would find nothing to rewrite and pass
  vacuously. That is the second vacuous guard caught in this batch by asking what it would take to
  fail.
- **Renaming a tab strands the prose that points at it.** The unrecognised-error line told the
  player to "report it from the Contact tab", in all three languages, and Contact no longer exists.
  This is `pickMainHint` again — a control described in three languages that had been deleted two
  redesigns earlier. The guard is derived from `TABS`: the line must name the tab that is actually
  last, so the next rename fails the suite until the prose follows.

### `npm run bump` would have rewritten this file's own history, in `src/`

Found by running `npm run bump 1.4.0`: smoke reported **five** cover strings in `App.jsx` where `EXPECTED` declares three, and two in each `src/i18n/*.js` where it declares one.

Nothing had drifted. `bumpFile` rewrites every **line** containing the old version, and `src/` is now full of comments that say `v1.4.0 step 6 - the custom cast` and `a pre-v1.4.0 save`. **This is the CLAUDE.md anchoring lesson, one directory over, and it had never bitten because v1.4.0 is the first version this code documents itself against while also being the version being bumped to.** Left alone, the next bump would have relabelled every one of those comments as a thing that happened in v1.4.1.

In `src/`, the only version string that is **state** is a cover description, so a line must contain `desc:` to be eligible; every other mention is history. Guarded by probing `bumpFile` with a literal comment line rather than with the real file — the real file is what the count check already reads, and the rule has to hold for a comment nobody has written yet.

### A birth year is stated once, and the control cannot express a wrong one

Two changes to one field, both from the same hand test, and they point the same way.

**The settings correction is now gated on `birthYearEstimated`.** It shipped in step 6 always
visible, on the argument that a typo at Setup produces the same wrong honorifics as a migration does.
That argument is real and it is outweighed: the year decides which way **every** address form points
— Korean seniority is a hard year boundary — and it sits in the static system prompt, so a change
re-points the whole cast's honorifics mid-run *and* costs the entire ~5,500-token cached prefix. A
control that invites fiddling at that price is the wrong trade.

It survives for the one case it was built for: a pre-v1.4.0 save whose year `migrateSave`
**reproduced** from `age`, deliberately and wrongly, for about half of those saves and unrecoverably.
`birthYearEstimated` already means exactly "the year was filled in for her", so it is the gate.
**Nothing was deleted** — `correctBirthYear`, its guards and its translations all stand, and a new
game simply never shows the row, because a new game's year was stated by the player.

**Setup and the member editor now pick the year from a wheel, and that removes a failure mode rather
than restyling one.** `birthdayFromYear` returns `""` for anything under four digits on purpose: a
half-typed `19` must leave the profile invalid, because a two-digit year reaching the address
protocol makes the entire cast either senior or junior at once. A wheel's every value is a year in
range, so the invalid intermediate state **stops existing** instead of being caught downstream. The
member editor lost that field entirely in step 6 to a `type="number"` that refused to render its own
partial value; the class of bug goes with the text box.

Two ranges, neither duplicated: `PLAYER_BIRTH_YEAR_MIN/MAX` (1946-2008) for the player,
`BIRTH_YEAR_MIN/MAX` (1980-2012) for a custom member. **The guards assert the RANGE, not the
control** — handing Setup the idol bounds would let a player be 14, and handing the editor the
player's would offer a 79-year-old idol, and neither looks wrong on screen.

**A wheel always displays a value, which is a new way to lie.** Showing `2000` while `birthday` is
still empty makes the field look filled while Save stays disabled with nothing to point at, so a new
member is **seeded** at the year the wheel opens on. The displayed value is the stored one from the
first frame; scrolling is how she changes it, not how she supplies it.

**Setup was not seeded, and the fourth phone pass found it — the same lie, one screen over.**
Reported as *"sometimes the Start button is blocked and says 请完成所有选项"*: a fresh run reached
Setup with `form.birthYear` still `""` while the wheel showed **2000**, so `canStart` refused and
the button named a missing field with **nothing on screen left to fill**. Every required field was
visibly answered and one of them was not answered at all.

**It read as a custom-cast-door bug and it belongs to neither door.** `form` is App-level state and
nothing clears it on the way back to the cover, so loading a save first — which fills `form` from
the slot — left a real birth year in place for every later trip through Setup. The reporter's own
A/B (fresh run blocked, same cast after a save load fine) is therefore the diagnosis: **the
difference between the two paths is not the door, it is whether anything had already written the
field.** The classic door was equally affected and nobody had happened to hit it.

**And the wheel could not emit the year it opened on at all.** `onScroll` reports only a row that
differs from `value`, and `value` was `form.birthYear || DEFAULT_YEAR` — so the one year no gesture
could supply was 2000, and a player who wanted it had to scroll away and come back. Seeding fixes
that as a side effect, because the displayed value becomes a value the form actually holds.

**The display fallback is DELETED rather than kept beside the seed.** With the field seeded a
`|| DEFAULT_YEAR` can only ever hide the seed failing, and it hid it for a release. An unseeded
wheel now renders with **no row highlighted**, which is visible and reportable; a highlighted year
the form does not hold is neither. Same rule as *a fallback that returns plausible data hides the
failure that produced it.*

**The guard is derived from the wheels that exist**, not written about Setup: every file in `src/`
mounting a `<YearWheel>` must write `DEFAULT_YEAR` somewhere that is not the import and not the
`value=` attribute, so a third wheel cannot ship unseeded — and mutating the **member editor**'s
seed reddens it naming `platforms/MemberEditor.jsx`, which is what says it is not a sample. A
second check requires the seeded year to be one `validPlayerBirthYear` accepts, since a
`DEFAULT_YEAR` moved outside the player's range would reproduce the bug through the fix.

**Its first version reported GREEN against the bug, by reading the comment that explains the
seed.** That is the third guard in this repo to pass against its own documentation — the file-input
scan and the release-notes probe were the others — so the scan strips comments before it looks.
**When a guard greps for a name, ask whether the prose beside it contains that name.**

**And seeding then exposed a latch in the wheel that is cleared on one path only — the same phone
pass, one commit later.** Reported as *"scrolling 1996 to the centre leaves the old year bold until
you tap it"*. `selfScroll` suppresses the scroll events the wheel's own parking scroll emits, and
it was cleared **only** by a 120ms timeout — which the effect's own cleanup cancels. So:

```
PARK v=1996 from=0 to=1700 ; PARKED top=1700        run 1 parks, arms the clear
PARK v=2000 from=1700 to=1836 ; PARKED top=1836     the seed lands, re-parks, re-arms
EARLY v= top=1836 want=1836 latch=true              cleanup cancelled the clear;
                                                    this run returns early, clearing nothing
SCROLL latch=true top=1700                          and every later scroll is discarded
```

The latch was then set **for the life of the component**, so the wheel moved and the bold row did
not follow it. Only a tap could change the value, because `onClick` calls `onChange` directly and
never passes the latch. **A latch whose release sits on one path is a latch that will be left set**
— the `beginRun` asymmetry again, and the remedy is the same: every exit clears it, unconditionally.

**Reproduced in a real browser before being fixed, and that mattered twice.** A scratchpad harness
bundles the real `YearWheel.jsx`, drives four state sequences with layout already settled, and reads
which row is `aria-selected` after a scroll. Unfixed: **Setup STUCK, the member editor fine**.
Fixed: all four land on the target.

**The member editor never had this bug**, which is what the harness was for rather than a guess: its
`yearDraft` is seeded in `useState`, so the wheel sees one parking run and the timeout clears it. It
is covered by the fix because the fix is in the shared component. **Sharing a component is not
sharing a defect — the trigger was the value changing right after mount, which only Setup does.**

**Two harness lessons, both already in this file and both re-earned.** The first three runs said the
bug did not exist: arms A-C depend on whether the very first programmatic `scrollTop` assignment
sticks before layout settles, which flips with how much else is on the page — **a repro that
sometimes passes is not a repro**, so arm D drives the transition with layout already settled. And
one "unfixed" run was against a file the patch had silently failed to unfix: `YearWheel.jsx` is
**CRLF** and the multi-line `from` was written with `\n`. Third occurrence. Every patch script here
now derives the newline from the file and aborts on a missed anchor.

**The guard is derived from the effect's own shape**, not pinned to today's three clears: every
`return` inside the parking effect must be matched by a clear, except the `if (!el)` guard that runs
before the latch can be set, and the latch may be set from exactly one place. A fourth early return
added without a clear fails it. **4 mutations, 4 RED.** The browser harness needs Chrome and is
deliberately **not** in the suite — `deploy.sh` gates on smoke, and a flaky browser test there would
block releases. What is in the suite is the invariant the harness established.

### …and it could only ever test one of the four providers — the third time, then the fourth

**Found running the step 7 sanity check against a DeepSeek key.** `playthrough.mjs` hardcoded
`selectedModel: "qwen"` and `aliyun: { mode: "free" }` into its `executeRound` call, so it could
exercise exactly one of the four providers in `MODEL_CONFIGS`. On a key for any of the other three it
died at round 0 with `free_all_exhausted` — which names the **player's credits**, not the harness —
one line after warning that the key was not an `sk-ws-` one. **Two true-sounding lines naming the
wrong cause**, which is worse than a bare failure.

**This is the third field of the same shape in this one file**, and the shape is now unmistakable:

| Field | Was pinned to | What that cost |
| --- | --- | --- |
| `identity` | `练习生` | 7 of 8 backgrounds never played live; a bug in one survived every run ever made |
| `pace` | `浪漫情感向` | three quarters of the coverage, the moment section 6 began sending the pace's authored rule |
| **provider** | **`qwen`** | **three of four providers have still never played a live round** |
| **world** | **`kpop_idol`** | **v1.4.1's three new worlds could not be played at all — the release gate was not reachable, not merely unmet** |

`--provider` now defaults to `MODEL_ID` from `.env.local`, so the harness follows the key that is
actually configured rather than assuming Aliyun; `resolveProvider` consults `MODEL_CONFIGS` instead
of carrying a second hand-maintained provider table; only Aliyun is handed a free-route mode, and
route pinning is skipped for everyone else. **The guards assert on the `executeRound` call, not on
the flag list** — adding `--provider` while leaving `selectedModel: "qwen"` in place would pass a
flag check, which is the trap the form-literal guard beside it already exists to avoid.

**Generalise it: every field of `executeRound` that selects a whole code path needs a flag, and the
guard belongs on the call rather than on the flag.** That was three instances, and the sentence that
used to end here said to assume there was a fourth and go looking rather than wait for it to cost a
release.

#### The fourth was the world, and it was found the way that sentence said to find it

**v1.4.1 step 8, before the live pass rather than after it.** `playthrough.mjs` hardcoded
`kpop_idol` in **two** places — `loadWorld("kpop_idol", LANG)` and the `worldId` on the roster the
`--cast` door builds — so the harness could not play one line of what the whole release adds:
three worlds, their identities, their places, their platforms, their `castLife`. The step's own
gate is *a live `playthrough.mjs` pass*, and that gate **was not reachable**. Unmet is a schedule
problem; unreachable is a different thing, and only reading the harness finds it.

**Both sites moved — and the second one is now DELETED rather than moved.** A roster carries no
world at all since the second phone pass, in the harness as in `src/`, because that copy is what
the app's save slots were reading and getting wrong. What the guard asserts is that the loaded
world reaches `resolveRoster`, which is the site that was hardcoded to begin with. The original
reasoning, kept because it is why the second site was found at all:

Changing only the `loadWorld` call would load `campus` and
hand `resolveRoster` a roster still claiming `kpop_idol` — `extractStoryText`'s two-copies failure
one file over, so the guard asserts both and mutation-verifies each.

**An identity is a position inside ONE world, and the four share exactly one id.** So
`--world campus --identity 练习生` names nothing: `getIdentity` returns undefined, section 6
renders an empty background and no work title, and every grader reports a healthy run against a
prompt missing the block the flag exists to select. The harness now **refuses the pair before the
first call** and names what that world declares — derived from `world.identities`, because a table
of which ids belong to which world is precisely the hand-maintained list this repo keeps losing.

**And the graders do not cover a new world, which is stated rather than discovered later.**
`IDENTITY_ROLE` is keyed on the eight kpop identity ids, so both ROLE CONTRACT graders
(`role-claimed-by-member`, `player-given-idol-life`) are silent for every identity in `campus`,
`office` or `chaebol` — `0 issues` in exactly the area step 7 changed most. The run records which
graders did not execute and prints them under the table. Deliberately **not** in `notes`, which
feeds the clean/dirty verdict: this is a coverage statement, not a defect, and colouring the row
would be the metric-that-fails-a-build that gets tuned away. **A grader that cannot run is not a
grader that passed**, and nothing else on screen tells the two apart.

### `playthrough.mjs` had been dead since step 3, and that is the second time

Its `fetch` stub served `/groups/` and nothing else. Step 3 added `/worlds/`, so every world fetch
fell through to a real `fetch` on a **relative** URL and the harness died with `Failed to parse URL
from /worlds/kpop_idol/zh.json` before its first round. **Steps 3, 4, 5 and 6 were therefore all
validated with zero live rounds** — every gate they claim to have met was met offline.

v1.3.5 did the same thing with `BASE_URL`, and the bootability check in Layer I exists because of
it. That check could not see this one: it bundles `mainAgent` + `groupLoader` and never
`worldLoader`, so it proved the harness *boots* while the harness could not *feed* it.

So the guard does not name the trees. It **scans `src/` for `${base()}<tree>/` and requires the
harness to serve every one it finds**, plus a second check that the scan itself found something —
a broken scan would otherwise pass the first vacuously. A future loader fetching `rosters/` fails
smoke until `SERVED_TREES` learns about it. Same reasoning as Layer C's loop over mirrored trees:
**the thing that keeps going wrong is a list that has to be updated by hand, so derive it.**

**The general rule: a harness that cannot fail is indistinguishable from a passing one.** When a
step's gate is "offline checks are green", ask what the live harness has actually run lately — and
if the answer is "nothing since before this area changed", that is a finding, not a formality.

**Step 4 — save migration** (`9d1c6cd`..`73b0995`). Three commits: the **player birth-year
field**, `saveMigrator.js` (`schema`/`worldId`/`groupId`/`roster`), and the `App.jsx` rewiring
through `resolveRoster` with `getNpcMembers` ceasing to derive. Smoke **630 → 671**, goldens
untouched.

**Its gate held:** a pinned v1.3.8 save migrates and resolves to the same member set
`getNpcMembers` derives today, in the same order, and builds the same prompt byte for byte.

**Step 4 found that member ids are not unique across the library.** `x` is a crossover roster
sharing seven ids — `irene`, `wendy`, `sana`, `mina`, `sullyoon`, `wonyoung`, `jisoo` — with the
groups those members debuted in. The plan's rule (scan for the group containing
`form.mainMember`) would therefore have silently recast seven of fifty possible saves. The scan
matches on the **whole chosen cast** instead, breaks a tie with the selected group, and warns
rather than defaulting when nothing fits.

All three plan-documented pre-existing bugs are now closed: v1.3.9 fixed `saveToStorage`
swallowing quota errors and affection pacing depending on the served model; step 4 fixed save
slots recording no group id.

**Step 5 — `habit` across the group library** (`6cdb550`, `26ca206`). Two commits: 175 habit
strings across 30 files plus the 30 root mirror copies, then the one conditional `Habit:` line.
Smoke **671 → 683**. A v1.3.9 hand-play bug found while the branch was green rode along in
`7fd109c` (a Kakao transcribed into the story — see the KKT note under Social Media System),
taking smoke to **695** and moving the goldens a second time.

**Step 6 — the custom-cast UI** (`919449a`..`d731db1`, fourteen commits). Smoke **695 → 949**. In
order: the prompt surviving an incomplete member, the palette + photo store, `cardGenerator`, the
member editor, the roster builder + second door, the on-device console, the three phone-test fixes,
docs, the birth-year correction (*"So the player is given the year back"*), the harness revival plus
`--cast` and the live gate, the ROLE CONTRACT with the six prompt-review fixes, and the save-slot
cap with per-language stage names and section 4's per-roster preamble.

Three deviations from `docs/V140_PLAN.md`, each deliberate and recorded there: **three storage keys,
not five** (custom worlds and world selection are v1.4.1, and this repo already carries two
constants nobody imports); **nine generated card fields, not seven** (`name` and `birthday` are
generated too, or the player still hand-fills two required fields; `mbti`/`role`/`name_kr`/`tags`
reach no prompt for a custom member); and **`world.setting` does not exist yet**, so the card prompt
falls back to `world.name` and will prefer `setting` once v1.4.1 adds it.

**`src/utils.js` and `src/utils/` now both exist**, because §10 specifies
`src/utils/imageStore.js`. Vite and esbuild both resolve `from "./utils"` to the file, and
`imageStore` names its own import `../utils.js` rather than relying on that. **Never add a
`src/utils/index.js`** — it would silently re-point every such import; smoke asserts none exists.

**Two `src/` bugs in step 6 were found by tests rather than by the build**, both worth remembering:
`rosterFromPicks` used `SLOTS` without importing it, and an undefined identifier is a *runtime*
error, so `npm run build` passed on code that threw the moment it ran. And an all-custom cast
returned `groupConfig: null` into a consumer that dereferences it unconditionally. A green build
says the module graph resolves, not that any of it executes.

**The goldens moved here — deliberately, and for the first time since step 1.** 19 insertions, 0
deletions, every one a `Habit:` line, one per member. `update-golden.mjs` was run once and the
diff was read before committing.

**Step 5's most useful finding is about the goldens themselves: they cover what the data happens
to contain, not the branch the data never exercises.** The `Habit:` line is conditional, so a
member without one renders nothing rather than `  Habit: ` with a trailing space. Mutating it to
unconditional leaves **all three goldens green**, because every library member has a habit and the
empty case therefore appears in no snapshot. Only the dedicated guard in Layer I fails. Step 6's
custom members are exactly that untested branch, so do not read a green golden as coverage of a
case the fixtures cannot contain.

Note what v1.3.9 does **not** include, deliberately. `MODEL_PRICES_PER_1M` is partial, and the
gaps are documented rather than filled — never back-derive a per-1M price from a per-round
estimate. The player's birth year is still derived from age and is wrong for ~half of players;
the fix needs a save field, so it waits for step 4.

### 105 live rounds across five configurations, and what they found — step 7

2026-09-27, route-served, one config per invocation (they share `test/.out/agent.mjs`, so two at once
race on it):

| config | rounds | graded | median completion |
| --- | --- | --- | --- |
| zh `财阀` / `高压舆论向` / 1+2 | 25 | 19 clean, 6 flagged | 1,710 |
| zh `练习生` / `慢热现实向` / 1+2 | 20 | 17 clean, 3 flagged | 1,086 |
| en `Staff` / `修罗海王向` / TWICE 1+2 | 20 | **20/20 clean** | 1,177 |
| ko `主线成员前女友` / `浪漫情感向` / 1+1 | 20 | **20/20 clean** | 1,572 |
| zh `韩娱艺人` / cross-group + custom | 20 | **20/20 clean** | — |

**The architecture held completely: 31 collapses, 0 ledger prefix breaks, 0 static-prompt drifts, and
`direct` parses on 105 of 105 rounds.** Cache 79.8–86.9%, consistent with Aliyun's measured ~83%. The
cross-group cast produced **0 outside-cast names and 0 real agencies**, and wrote its scene as
`首尔某娱乐公司练习室` — declining to name an agency at all, which is exactly what the composed lore is
for. The newly wired pace rule showed up in the numbers (see the pace note under *Reading it a second
time*), and the Korean particle fix and rewritten section 1 rule both came back clean.

**Five of the nine flags were the graders, again** — see *a live flag is a hypothesis about the grader
first* below, now at 9 of 13 in this project's history.

**What the graders could not see is where the findings were**, and that is the whole reason
`scripts/analyze-prose.mjs` exists. Good news first, since a tool that only reports trouble teaches
nothing: **repetition is not a problem** (0–3 reused sentences per run, round-to-round 4-gram overlap
0.2–4.9%, no two rounds opening alike), and **options are not either** (0 leaking a stat or route hint,
0 rounds whose four options say one thing, in all five configs).

The problems it did find:

1. **Rotation fails in every configuration.** **NOT fixed.** `[Rounds Absent]` was the attempt and a
   controlled A/B says it did not work — see *The rotation fix does not fix rotation* below. The line
   ships anyway, for a reason that is not rotation.
2. **A Kakao still reached the prose twice in 45 zh rounds** after the reorder, both times through an
   invented channel. Fixed — see the ownership rule under *A Kakao is delivered by the app*.
3. **`scene` as a 250-character paragraph, repeated verbatim for five rounds** (en only). Fixed.
4. **The summary at 3x its stated length** (zh only; en and ko land near 140 characters). Fixed.
5. **Output runs 1.4–2.1x the 800 tokens every cost figure in the app is derived from**, in every
   language, and grows with the round number. **Not fixed** — `docs/PROPOSALS.md` §2.
6. **Zero negative affection steps in 100 transitions**, and every stat saturating by round ~22. **Not
   fixed** — `docs/PROPOSALS.md` §1, where it is now the prediction that makes the experiment worth
   running.
7. **In English the Korean texture barely appears** — `unnie` twice in 20 rounds, against `欧尼`
   fifty-one times in 25 Chinese ones. **Not acted on**: this area was tuned from a native speaker's
   reports, so which forms an English reader wants is Yuhan's call, like the Korean stage names.

**64 live rounds across four configurations validated step 6** (same day, before the step 7 work): Chaebol classic **20/20 clean**; Chaebol + cross-group cast **17/20**; Staff in en
**12/12**; the ex-girlfriend identity in ko **12/12**. **0 static-prompt drifts and 0 ledger prefix
breaks across all 64 rounds**, 18 collapses. Cache 81.2–86.9%.

Of the three flags, **two were a grader bug of the new grader's own** and one was real:

- **`role-claimed-by-member` fired twice on the player's own correct lines.** `你的声音不高…"而我作为
  会长，有权决定…"` — she *is* the 会长. **The player speaks inside quotation marks too**, and the
  grader read every dialogue span as a member's. It now identifies the speaker from the attribution
  window and stays silent unless a member is named there without the player's `你` beside them.
- **One real `kkt-transcribed-in-story`**: a round delivered Jisoo's Kakao *and* wrote it into the
  prose, phone-screen buzz included — all three explicitly forbidden in section 7. One occurrence in
  64 rounds, on the longest prompt of the four. **Not acted on**: the rule is already unconditional
  and stated first, and tuning a prompt on n=1 is how the KKT rule got restructured twice already.

**That makes nine grader bugs out of thirteen live flags in this project's history**, which stopped
being a coincidence several flags ago and is the rule: **a live flag is a hypothesis about the grader
first and the model second.** The stored `storyText` is the evidence, and reading it takes a minute.

Step 7 added five more, all read before acting: `real-name-vocative` twice on `"裴珠泫，"她说，叫的是
自己的名字` — a span that is nothing but a name, with the attribution saying she is naming herself;
`narrated-honorific` twice on `你喊她的名字，不是Irene欧尼` — narration naming the form in order to
*reject* it; and, in the new prose analyzer, three "banned substitutes" that were all the ordinary noun
`姐姐` in narration (`护在身后的姐姐`). Each is fixed and unit-tested against the prose verbatim. The
analyzer also had two metric bugs of its own — `아:194` from counting a Korean syllable that occurs in
ordinary words, and a repetition count inflated by normalising names out of short sentences until
`Irene였다.` and `Seulgi였다.` were the same string. **A tool built to judge the model needs the same
scepticism as the model.**

The two real ones were both `name-ya-vocative` in zh, and one of those is arguably good writing: Wendy's
confession is *about* the form — `我对你…已经不是'林夏xi'了…是'林夏呀'` — with the token in quotes as the
thing being discussed. Left alone, beside the scolding case below: the 呀 rule came from a native
speaker's report.

**Every live flag before these had also been a grader bug, not a model bug** (3 of 3). Narration after a closing quote read as dialogue; a self-introduction read as a vocative; a line saying the Kakao window *stayed silent* read as a phantom message. Each is fixed and each fix is unit-tested against the real prose that triggered it. Read a new flag as a hypothesis, not a verdict — check the stored `storyText` before changing the prompt.

**Open, and deliberately not acted on: `real-name-vocative` on a member scolding another member.** One round in a `留学生` run flagged `real-name-vocative:seulgi` on `"姜涩琪，闭嘴。"` — Irene snapping Seulgi's full legal name at her, blushing, after Seulgi let slip that Irene had wanted to come. Full-name address as a rebuke is a real Korean register, and the rest of the round is exactly right (`林夏xi`, `欧尼` both correct). The grader's premise — *members address each other by stage name* — is right in general and has this exception.

It is **not** changed, for two reasons. It occurred once in 35 rounds, and narrowing the check to member-to-member address would blind the detector for the player-reported bug it was built for (a member addressing the *player*, or herself, by a real name). Tuning a grader on n=1 is how it stops working. Left as a judgement call, since it turns on Korean register rather than on code: the stored prose is in `test/.out/`.

**Dev key free-tier status (probed 2026-09-23):** 2 of 28 route models are genuinely out of free credits — `qwen3.8-max` and `glm-5.2`, both returning `AllocationQuota.FreeTierOnly`. The other 26 answer normally and the router skips the two correctly, so this affects only *pinned* harness runs: pinning an exhausted model leaves the walk with no fallback and ends the playthrough. Use `--models qwen3.7-plus` (or any healthy model) when a run must not be interrupted, and re-probe with `node test/smoke.mjs --live-free` rather than assuming.

**`qwen3.7-plus` joined them by 2026-09-25**, which is the point of the sentence above: the healthy
set shrinks and a pinned model is a bet on stale information. **Prefer `--route`** for a run that
only needs *a* model — it walks the real route, serves from the first that answers, and reports
`(route)` instead of a name. Pin a model only when the model itself is what is under test.

### v1.3.8 — GPT-6 Luna + bump coverage (2026-09-23)

`CLAUDE.md`'s title and Add-on Features headers are now rewritten by `npm run bump`, matched as exact anchors so the file's many *historical* version numbers are left alone. See **Version strings**. v1.3.7 shipped with both still reading v1.3.6, which is what prompted it.


`gpt4omini` now serves **`gpt-6-luna`** instead of `gpt-5.6-luna`. Same endpoint, same parameter shape, no client changes: only the model string, display name and cost strings moved.

**The provider id stays `gpt4omini`.** It is the value in `rv_sim_model_v11` and in every save slot, so renaming it would silently reset the model choice for existing players. Legacy, load-bearing, and not worth touching.

Published pricing (per 1M): **$0.01** cached input · **$0.10** input · **$0.50** output — about **4.5x cheaper per round** than the tier it replaces, and real figures rather than the "comparable tier" estimate the README used to carry. The GPT rows now say ~$0.00051/round and ~163 hrs per $1. Gemini is now the only provider still costed from an estimate.

Deep Thinking stays at `high` even though the new ladder offers `xhigh` and `max` — see the exception under **Effort levels**. Smoke now pins the request body's `model` for this provider, so a display-name bump that forgets the model string fails offline instead of on a player's key.

### v1.3.7 — the v1.3.6 fix, actually reaching the model (2026-09-19)

**v1.3.6 shipped inert and offline tests could not see it.** `parseGroupConfig` rebuilds members from a field whitelist that omitted `birthday`, so the whole cast arrived at the prompt as the `"2000-01-01"` fallback — one birth year for everyone. Layer I passed because it read `public/groups/*.json` directly; the live harness was the only thing that touched the real path, and it had been dead since v1.3.5 (`import.meta.env.BASE_URL` does not exist under Node).

Three process lessons, all now mechanised in Layer I:

1. **Assert on member data through `loadGroupConfig`, never by reading the JSON.** A fixture tests the formatter and not the feature.
2. **A guard is worth only as much as the path it exercises.** 16 Layer I checks passed against a completely broken app.
3. **A dead harness is invisible.** Layer I now boots the live-harness bundle offline, so `playthrough.mjs` cannot rot silently again.

Also fixed in the harness itself: `real-name-vocative` used a quote *character class*, which cannot distinguish an opening quote from a closing one and so read narration following dialogue as if it were inside it — one false positive in the first clean run. It now extracts properly paired spans. Flagged rounds store the full story, not a 400-char head that can truncate away the very match being judged.

### v1.3.6 — writing quality (2026-09-19)

Three player-reported bugs, all of which read as "the model writes badly" and none of which were the model's fault. Each is now guarded by smoke **Layer I** offline, and by live graders in `playthrough.mjs` that judge the prose itself.

| Symptom the player saw | What it actually was |
| --- | --- |
| Members swap "I" and "you"; Irene thanks the player by saying *her own* name | The pronoun rule explicitly exempted dialogue, and the player had no Korean address form in the prompt — the only ones present were the members' own |
| Both sides call each other *unnie* | `ageDiff` describes the **player**, but was printed inside the **member's** profile, so every profile stated the age relationship backwards |
| "You get a Kakao from Yeri" with nothing in the overlay | `filterKktByAffection` runs *after* generation; the model was never told the channel was locked |
| Edited stories ignored by the model | The next round's collapse replaced the edit with its original summary before the ledger was built — every third round |

Sections to read before touching this area: **Who is speaking, and what she calls whom**, **Collapse Logic** (`keepFull`), and the `[KKT Channels]` note under 3-Tier Prompt Structure.

### Earlier (2026-09-16)

That day shipped five releases. v1.3.2 was the feature release; everything after it was infrastructure, and two of them fixed bugs that only existed off GitHub Pages:

| Tag | What |
| --- | --- |
| `v1.3.2` | The whole model-layer cycle below — free route, error layer, `bad_response`, edit controls |
| `v1.3.3` | Vercel config so the mirrors build from source; Help Center link to the new Vercel URL |
| `v1.3.4` | Help Center link to the new Cloudflare URL; `deploy.sh` robustness; commit identity |
| `v1.3.5` | **Host-independent paths** — the mirrors showed only Red Velvet and 404'd the PWA icon |

Also that day, not tied to a release: branch workflow (`main`/`dev`/`hotfix/*`), `npm run bump`, `deploy.sh` preflight, and `dist/` untracked.

Evidence and reasoning for the model-layer decisions: **`docs/TEST_FINDINGS.md`**. Read it before touching the route, the retry policy or the cost strings — the *why* is not reconstructible from the diff.

### Landed in this cycle

**Model layer**
1. **Aliyun free-credit auto-route** — 28 models, per-key state, automatic switch on exhaustion (`aliyunRoute.js`, `callAliyunFreeRoute`). Bounded to 4 models / 120s per round (240s thinking) with a "trying another model" toast.
2. **Aliyun paid mode** — 9 selectable models with per-model cost strings, collapsible picker + cost box on the key page.
3. **Error layer** — `llmErrors.js` maps all four providers' failures to one of 15 `kind`s; retry policy is per kind; each shows one localized line via `t.errors[kind]`; the Help Center Errors tab lists them all. Smoke Layer E2 fails the build if a kind lacks a translation or a help entry in any of zh/en/ko.
4. **Per-model request params** from `docs/api_references/` plus live probing — thinking off by default, one effort level per family when on, correct cap field and size per model.
5. **`bad_response`** — empty, truncated (`finish_reason: length`) or degenerate (<40-char story) output is retried, then routed past, instead of being rendered. This is what stopped players seeing raw JSON.
6. **Timeout policy** — 90s (180s thinking) on the first attempt, 30s on later ones; a timeout walks the route, but two in a row abort and blame the connection.
7. **Free-credit recovery** — an exhausted route probes once an hour and clears itself if the account has been topped up; plus a manual reset on the key page and a localized notice explaining the options.

**Game layer**
8. **Edit controls** — ✎ on the last choice replays the round with new text; ✎ on the last story rewrites both the screen and `memory.history`, so the model follows the edit. Free in cache terms (the newest story has not been sent yet).
9. **Failed rounds no longer degrade memory** — `executeRound` collapses a clone and commits only on success.
10. **Save-corruption fix** — `loadSave` clears `preRoundSnapshotRef`. Previously, loading save B after playing game A left ↺ Retry restoring A's stats and memory into B.
11. **Error notices tagged** `error: true` and filtered out of story exports and save slots.

**Test layer**
12. **`test/playthrough.mjs`** (new) — plays real multi-round games and grades JSON validity, language lock, option format, stat bounds, CoT leakage, and the ledger-prefix cache invariant; reads `usage.cached_tokens` to measure the cache directly.
13. **Smoke suite 145 → 457 checks**, including per-model family contracts, the router's new policies, error-kind i18n parity, legacy/corrupt route state, and key-page layout guards for bugs that reached hand testing.

### Live test results (2026-09-16)

Roughly 600 real rounds against the Aliyun endpoint, across two passes.

* **28/28 free-route models accept our parameters.** Getting there needed one fix no document could have supplied: `qwen3.8-2.4t-a95b` rejects `enable_thinking:false` with an undocumented error. It was later removed from the route anyway (see below).
* **The cache invariant holds** — 0 ledger prefix breaks across 87 collapses in the 348-round sweep, 0 across 18 in a 30-round game, 0 in every run since. The append-only ledger behaves exactly as this file describes.
* **Language lock is solid** — zh/en/ko playthroughs clean; no model narrated in the wrong language while otherwise working.
* **Four models misbehaved in play**, none of them a parameter bug. Two were removed from the route (`qwen3.5-27b` answers literal `null`, 12/12 unusable; `qwen3.8-2.4t-a95b` never finished inside 90s, 0/12). Two are now handled at runtime (`glm-5.1` ran away to the output cap and showed raw JSON, 5/12; `qwen3.8-max` returned a sub-20-char story ~8% of rounds).
* **After the fixes**: `glm-5.1` 7/12 → **12/12 clean**, live route playthrough **8/8 clean**.
* **Measured Aliyun prompt-cache hit rate is ~83%**, flat across 0/1/2 sub-members and not converging upward over 30 rounds. Twelve of the route models (every `qwen3.5-*` and `qwen3.6-*`) report no `cached_tokens` field at all. **This does not contradict the 95.8% figure**, which comes from DeepSeek Official billing on a different platform with a finer-grained cache — see to-do 2.

**Released 2026-09-16.** `4936d70` (feature commit) + `35b1e9e` (deploy build), tagged **`v1.3.2`** on the deploy commit. `dev` was branched from that point and the old `dev-v12.0.0` frozen behind tag `archive/dev-v12.0.0`. Four further releases followed the same day — head is now `7415ab4`, tagged `v1.3.5`. All work from here goes to `dev` — see Branch & Deploy Workflow.

**Open questions (not blocking release)**

1. **The empty-route notice has never been rendered.** It only appears at 0/28 available, which needs a genuinely exhausted key. Everything else on the key page has now been hand-checked at 390px.
2. **Partly answered in v1.3.9 — the 95.8% figure is play-style dependent, and the README now says
   so.** A clean 40-round hand-played session on DeepSeek Official V4.1 Flash (2026-09-24, zh, Red
   Velvet, 1 main + 1 sub, no retries) billed **86.7%**: 240,000 of 276,862 input tokens served
   from cache. The usage panel agreed with the billing page to the token on every field, which is
   what validates the panel itself.

   That average was **still climbing at round 40** — the player watched it go from ~50% to 87%,
   which is the signature of a cumulative mean converging, since round 1 is structurally 0% and
   early rounds never fully wash out.

   **The ceiling for clean sequential play is ~92%, and that number is calculated, not measured.**
   From the token profile: the ~5,500-token static prompt hits every round, while the newest
   ledger entry (~500) and the dynamic tail (~150) always miss, so ~7,300 of ~7,950 input tokens
   can hit — 91.8%, before the extra misses each collapse adds. Mark it `(?)` wherever it appears;
   it follows from the profile's own round numbers and inherits their error. If it is right, 95.8%
   was never the steady state.

   What can exceed it is **regenerates**: ↺ Retry re-sends a byte-identical system prompt and
   ledger that were cached moments earlier, so it is a ~98% cache-hit call by construction. The
   likeliest reading is that the original 95.8% came from a long session with many retries, and
   that clean play and retry-heavy play are simply two different measurements. Both are now quoted
   in the README rather than one being presented as the steady state.

   **Still open:** this is n=1 for the clean-play figure, and the ~92% asymptote is calculated, not
   measured. A second long session — ideally one that also records how many rounds were
   regenerated — would settle it. The usage panel makes that cheap now. Aliyun's ~83% remains
   separate and non-comparable, as does the open `qwen3.6-flash` question (Aliyun reports no cached
   tokens for it at all); `docs/TEST_FINDINGS.md` has the detail.
3. **Verify `reasoning_effort:'none'` on OpenAI** and Gemini's behaviour with Deep Thinking off — both are doc-derived, never observed. Aliyun's side is now observed. GPT-6 Luna's model page lists `none` explicitly (v1.3.8), so the value is no longer inferred from a general parameter table — but *documented* is still not *observed*, and neither provider has ever been exercised live. `test/README.md` records the same gap.
4. **Token Plan decision** — leave `sk-sp-` unsupported, or add a proxy (see the Token Plan note in the Model Layer).

**Optional cleanup:** `probabilityEngine.js`, `achievements.js`, `relationshipEvents.js` and `stageConfig.js` still carry Chinese comments (`groupLoader.js` was converted in v1.3.5), against the English-only rule for code. The key-page guards in smoke Layer G are source-string checks and will need updating if that area is restyled — they are deliberate, each one encoding a bug that reached a hand test.

---

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
