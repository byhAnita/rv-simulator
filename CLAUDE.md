# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Idol Dating Sim v1.3.1** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390x844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

Active branches:
- `main` — stable production, served by GitHub Pages + Vercel
- `dev-v13.0.0` — next version development, never deploy from here

Measured production numbers (real player sessions, reasoning off): **~95.8% prompt-cache hit rate**, **~10s generation time per round**.

---

## Commands

```bash
npx vite                              # local dev - hot reload, always works
npm run build 2>&1 | tail -12         # validate build (no test suite)
npm run deploy                        # full deploy: build -> patch index.html -> push main -> restore dev mode
DEPLOY_MSG="fix: desc" npm run deploy # deploy with custom commit message
```

Validate every change with `npm run build`. No lint config, no test suite.

---

## Architecture

### Core Architecture Principles

*   **1-Tier Unified History Ledger:** Memory uses a single `history[]` array — a chronological append-only ledger of `{round, type:'summary'|'full', text, choice?, summary?}` entries. Entries are never deleted mid-ledger; the token prefix stays byte-identical across consecutive rounds, enabling LLM KV cache hits.
*   **In-Place Collapse (Stepped Window):** When full-story entries reach `HISTORY_FULL_MAX` (N=3), all `type:'full'` entries are mutated to `type:'summary'` in-place (using the `summary` string already returned by the LLM each round). The new round is then appended as `type:'full'`. This causes one partial cache miss per N rounds; all other rounds are prefix cache hits on the history block.
*   **3-Tier Prompt Structure:** The prompt is split into three strictly ordered messages to separate immutable from dynamic content:
    1. **Static system prompt** — rules, lore, member profiles, JSON schema (~5,500 tok) -> 100% cache hit after R1
    2. **History ledger** (`buildHistoryLedger`) — append-only summaries + full stories (~2,300 tok) -> hits except the newest entry
    3. **Dynamic tail** (`buildDynamicTail`) — player stats, affections, stage changes, NPC state, KKT, pacing hint (~150 tok) -> always cache miss, kept small
*   **Dynamic fields isolated to tail:** Player stats, affections, stage changes, NPC appearances, and the Time Speed `[Pacing]` hint live exclusively in the dynamic tail message and are never embedded in the history ledger, to avoid invalidating the prefix.
*   **Save schema:** `rv_sim_saves_v13`. `isLegacyMemory` detects `memory.history === undefined`. On legacy load, memory is wiped to `createEmptyMemory()` while stats and affections are preserved — no crash.

### Regenerate Feature

The current round can be regenerated without consuming a new round counter or corrupting memory:

- **`preRoundSnapshotRef`** (`useRef`) in `App.jsx` — captures `{ stats, memory, kktUnlocked, kktMessages, triggeredAchievements, playerChoice }` before every `executeRound` call (both in `startNewGame` and `sendMessage`). `socialFeeds` is intentionally **not** snapshotted — `popPendingSocial()` already ran and correctly applied the previous round's social to UI state.
- **`regenerateRound()`** in `App.jsx` — restores all snapshotted state, removes the last assistant message, calls `resetPendingSocial()` (clearing the discarded round's pending social), then re-calls `executeRound` with the same `playerChoice`.
- **`resetPendingSocial()`** exported from `mainAgent.js` — clears module-level `pendingSocialFeeds` and `pendingNotifications`.
- **UI**: `⎘ Copy` and `↺ Retry` appear bottom-right of the last assistant message only, hidden during loading. Copy strips the stats box and option lines, leaving pure story text.

### Data Flow per Round (cache-optimized)

```
Player choice
  -> executeRound({..., reasoningEnabled, qwenSubModel, timeSpeed})
  -> collapseHistoryIfNeeded(memory)   // in-place: full->summary if full count >= N
  -> buildHistoryLedger(memory)        // serializes history[] - CACHEABLE prefix
  -> buildDynamicTail(memory, members) // stats, affections, KKT - always tail
  -> buildSystemPrompt(...)            // static - 100% cache hit
  -> callLLM([system, ledger, tail + pacing + choice], ..., reasoningEnabled, qwenSubModel)
     // 90s timeout, 2x retry
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
| `src/agent/memoryPool.js` | 1-tier history ledger: `createEmptyMemory`, `updateMemory`, `collapseHistoryIfNeeded`, `buildHistoryLedger`, `buildDynamicTail`, `isLegacyMemory`, `getTopMember` |
| `src/agent/probabilityEngine.js` | `calculateProbability`, `pickPrimaryMember` — picks which target member drives this round |
| `src/tools/llmTool.js` | Unified OpenAI-compatible client + per-provider reasoning flags, 90s timeout, 2x retry |
| `src/rag/groupLoader.js` | `loadGroupIndex()`, `loadGroupConfig(id, lang)`, `getNpcMembers()` |
| `src/config/constants.js` | Numeric game constants (see below) |
| `src/config/modelConfigs.js` | 4 providers; `qwen` carries 3 sub-models |
| `src/config/stageConfig.js` | 7 relationship stages with score thresholds and display labels |
| `src/config/relationshipEvents.js` | Stage-transition special events |
| `src/config/achievements.js` | 5 ending achievements + trigger conditions |
| `src/i18n/` | `useTranslation(lang)` hook + `${var}` interpolation; zh/en/ko |
| `src/platforms/` | Overlay components: Bubble, Instagram, Weverse, Kakao, Save, Help, MemberSelector |
| `src/utils.js` | `STORAGE_KEYS`, `loadFromStorage`, `saveToStorage` |

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
| `rv_sim_form_v11` | `STORAGE_KEYS.FORM` | Character setup form |
| `rv_sim_social_v11` | `STORAGE_KEYS.SOCIAL_FEEDS` | Social feed cache |
| `rv_sim_model_v11` | `STORAGE_KEYS.SELECTED_MODEL` | Provider id |
| `rv_sim_reasoning_v13` | `STORAGE_KEYS.REASONING` | Deep Thinking on/off |
| `rv_sim_qwen_submodel` | inline literal | Selected Qwen sub-model id |
| `rv_sim_theme` | inline literal | `"dark"` / `"light"` |
| `rv_sim_timespeed` | inline literal | `"slow"` / `"default"` / `"fast"` |
| `rv_sim_fontscale` | inline literal | `1` / `1.25` |
| `rv_sim_language` | inline literal | `zh` / `en` / `ko` |
| `rv_sim_group` | inline literal | Selected group id |

Note the inconsistency: only six keys live in `STORAGE_KEYS`; the rest are inline string literals in `App.jsx`. Prefer moving new keys into `STORAGE_KEYS`.

---

## Key Constants (`src/config/constants.js`)

```js
GAME_YEAR           = 2026 // used to derive player birth year from age
HISTORY_FULL_MAX    = 3    // N: full-story entries before collapse trigger
HISTORY_PRUNE_BATCH = 15   // batch-prune this many oldest summaries when total summaries > N*3
KKT_MAX             = 10   // Q: KakaoTalk messages stored per member
KKT_THRESHOLD       = 30   // affection score required to unlock KKT per member
MAIN_INITIAL_AFFECTION       = 12
SUB_INITIAL_AFFECTION_MIN    = 5
SUB_INITIAL_AFFECTION_MAX    = 10
NPC_APPEARANCE_CHANCE        = 0.3  // DEAD - not imported anywhere
NPC_COOLDOWN_ROUNDS          = 2    // DEAD - not imported anywhere
```

`NPC_APPEARANCE_CHANCE` and `NPC_COOLDOWN_ROUNDS` are **not referenced by any module**. NPC appearance is governed entirely by prompt rules in `buildSystemPrompt` plus the `[NPC Appearances]` block in the dynamic tail. Either wire them up or delete them — do not document them as live behavior.

---

## Model Layer

### Providers (`src/config/modelConfigs.js`)

| id | Display | Model string | Default? | Notes |
| --- | --- | --- | --- | --- |
| `qwen` | Qwen | `qwen3.8-max` (+ sub-models) | ✅ **default** | Alibaba Cloud; free credits per sub-model for new users |
| `deepseek` | DeepSeek V4 Flash | `deepseek-v4-flash` | | Repriced upward — see README cost table |
| `gpt4omini` | GPT-5.6 Luna | `gpt-5.6-luna` | | key `gpt4omini` is legacy, the model string is current |
| `gemini` | Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | | OpenAI-compat endpoint |

All four use `format: "openai"` and go through the same `fetch` in `llmTool.js`. `character-plus` was removed.

**Qwen sub-models** — `MODEL_CONFIGS.qwen.subModels[]` holds `qwen3.8-max`, `qwen3.7-max`, `qwen3.7-plus`. `App.jsx` keeps `selectedQwenSubModel` (persisted to `rv_sim_qwen_submodel`) and passes it into `executeRound` as `qwenSubModel`, which `callLLMOnce` resolves: `resolvedModel = (modelId === "qwen" && qwenSubModel) ? qwenSubModel : cfg.model`. Each sub-model has its own free-credit allowance, so "run one dry, switch versions" is an intended gameplay path.

### Reasoning / Deep Thinking (`llmTool.js`)

`reasoningEnabled` defaults to **false** and is threaded App -> `executeRound` -> `callLLM` -> `callLLMOnce`. Providers differ in their default, so each branch sets the OFF state explicitly rather than relying on omission:

| Provider | OFF | ON |
| --- | --- | --- |
| `deepseek` | `thinking: {type:'disabled'}` (V4 Flash defaults to AUTO — must disable) | `thinking:{type:'enabled'}`, `reasoning_effort:'high'`, `max_tokens: 65536` |
| `qwen` | `enable_thinking:'false'`, `preserve_thinking:'false'` (Qwen 3.x defaults ON) | same flags `'true'` + `reasoning_effort` — `'medium'` for `qwen3.8-max`, `'high'` for others |
| `gemini` | field omitted (off by default) | `reasoning_effort:'high'`, `max_tokens: 65535` |
| `gpt4omini` | field omitted (off by default) | `reasoning_effort:'high'` |

The response reader uses `choice.message.content` **only** — never falls back to `reasoning_content`, so chain-of-thought can never leak into the story.

**Known dead config:** `llmTool.js` sets `max_tokens: cfg.maxOutputTokens || 8192`, but no entry in `MODEL_CONFIGS` defines `maxOutputTokens`. Every model therefore gets 8192 unless a reasoning branch overrides it. `MODEL_CONFIGS.qwen.max_completion_tokens: 65535` is likewise never read. Fix the field name or drop them.

---

## Add-on Features (v1.3.1)

| Feature | State | Persisted as | Wiring |
| --- | --- | --- | --- |
| Deep Thinking | `reasoningEnabled` | `rv_sim_reasoning_v13` | -> `executeRound` -> `callLLM` per-provider flags |
| Time Speed | `timeSpeed` (`slow`/`default`/`fast`) | `rv_sim_timespeed` | -> `executeRound` -> appended to the **dynamic tail** as a `[Pacing]` line, never the ledger |
| Day/Night | `theme` (`dark`/`light`) | `rv_sim_theme` | `THEMES[theme]` -> `th` token object, threaded into every overlay as a `theme` prop |
| Text size | `fontScale` (`1`/`1.25`) | `rv_sim_fontscale` | `Math.round(base * fontScale)` on story/option text; passed to Bubble and Kakao overlays |
| Export | `exportClipboard` / `exportTxt` / `exportPdf` | — | Shares `extractStoryText()`; PDF renders themed HTML into a hidden iframe and calls `print()` |
| Help Center | `showHelp` | — | `HelpOverlay.jsx`, 4 tabs x 3 languages |

**Time Speed placement matters.** The pacing hint is concatenated onto the `[CURRENT STATE]` message, *after* the cached system prompt and ledger. Toggling it mid-run therefore costs nothing in cache terms. Never move it into `buildSystemPrompt` or `buildHistoryLedger`.

**Export text extraction.** `extractStoryText()` filters `messages` for visible assistant turns, splits on `\n\n`, and drops any paragraph starting with `╔` (stats box) or matching `/^[A-D]\.\s/` (option line). If the stats-box glyph or option prefix format ever changes, this filter breaks silently.

---

## 1-Tier Stepped Window Memory Architecture

### Memory Shape

```js
// createEmptyMemory() - src/agent/memoryPool.js
{
  playerStats:       null,   // {selfId, secrecy, mood, week, scene, chapter}
  affections:        {},     // {memberId: number}
  topMemberId:       null,
  history:           [],     // unified ledger - [{round, type, text, choice?, summary?}]
                             //   type:'summary' -> text is ~100-char English sentence
                             //   type:'full'    -> text is full story, choice is player pick,
                             //                     summary is the ~100-char collapse target
  kktMessages:       {},     // {memberId: [{sender, content}]} max Q per member
  stageChanges:      [],     // [{memberId, from, to}] last 10
  memberAppearances: {},     // {memberId: [roundNums]} last 10
  npcAppearances:    {},     // {memberId: lastRoundNum}
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

Called at the **start** of each round, before building the prompt. Counts `history.filter(h => h.type === 'full').length`. If `>= HISTORY_FULL_MAX`:
- Rebuild every `full` entry as `{round, type:'summary', text: h.summary || h.text.substring(0,150)}` — the long story text is dropped
- Do NOT remove or reorder entries — the prefix must stay byte-identical for entries that existed in the previous round
- Batch prune: if total summary count exceeds `HISTORY_PRUNE_BATCH * 3` (45), drop the oldest `HISTORY_PRUNE_BATCH` (15) summary entries — one miss penalty every ~45 rounds

### Update Flow (`updateMemory`)

Called at the **end** of each round. Appends `historyEntry: { round, type:'full', text: story, choice: playerChoice, summary: parsed.summary }` to `history[]`. KKT messages normalized to `{sender, content}` before append and capped at `KKT_MAX` per member. `stageChanges` and `memberAppearances` capped at last 10. No FIFO truncation on `history` — the ledger is append-only by design.

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
  "[CURRENT STATE]\n" + buildDynamicTail(memory, members, roundMemberIds) ->
    [Player Status] SelfId:38 Secrecy:97 Mood:82 Round:6 Scene:practice room
    [Affections] Irene:24(Acquaintance) | Seulgi:12(Stranger)
    [Stage Changes] irene: Stranger->Acquaintance
    [NPC Appearances] Joy(last: round 2)
    [KKT Messages - round-relevant members]
    Irene: hey are you free tonight | you okay?
  + optional "[Pacing] slow|fast ..." line from Time Speed
  + "Player choice: B\n\nGenerate the next round. Output ONLY valid JSON."
```

**KKT injection rule**: only inject KKT history for `roundMemberIds`, and only in the dynamic tail — never in the ledger.

### Save Compatibility (`isLegacyMemory`)

`rv_sim_saves_v13` is the current standard. On `loadSave`, if `memory.history === undefined`, memory is reset to `createEmptyMemory()` (pool wiped) while stats, form, and affections are still restored. Prevents the old `summaries`/`fullStories` (v12) and `storyRounds` (v11) shapes from crashing the engine.

---

## LLM System Prompt

Built in `mainAgent.js#buildSystemPrompt()`. Enforces:

1. **Language lock** — output language tied to the player's UI language (`zh`/`en`/`ko`)
2. **JSON schema** — valid JSON every round, no markdown fences
3. **Member personality matrices** — injected from group RAG JSON
4. **Identity + Pace blocks** — one of the 7+1 identities and one of the pace settings, selected at build time
5. **Phase rules** — rounds 1-6 (stranger), 7-14 (familiar), 15-24 (pressure), 25+ (consequences)
6. **Unknown-character rule** — only members in MEMBER PROFILES may appear by name; other roles are unnamed archetypes (manager, assistant, executive, fan)
7. **summary field** — always English, ~100 chars, stored on each `history` entry as the collapse target and mutated into `text` when that entry collapses `full` -> `summary`. Never shown to the player.

### LLM Output JSON Schema

```js
{
  "scene": "Location in player's UI language",
  "statChanges": { "selfId": 0, "secrecy": 0, "mood": 0 },
  "affectionChanges": { "<mainId>": 0, "<subId>": 0 },
  "socialContent": {
    "<memberId>": {
      "bubble": ["msg1", "msg2"],
      "instagram": { "imageDesc": "...", "caption": "..." },
      "weverse": "post text"
    }
  },
  "kktMessages": { "<memberId>": ["message text"] },
  "story": "250-350 words in player's UI language. Pure narrative, no stat bars, no options.",
  "summary": "One English sentence ~100 chars - who appeared and what emotionally shifted.",
  "options": ["A. ...", "B. ...", "C. ...", "D. Custom"]
}
```

### JSON Parsing Pipeline (4-level fallback)

1. Direct `JSON.parse` on the LLM response
2. Strip markdown fences, retry `JSON.parse`
3. Regex field extraction (the story regex handles `summary` sitting between `story` and `options`)
4. Return safe defaults — never crash the round

`validateAndFixOutput()` post-parse repairs: unescape `\n`, `\"`, `\/`, `\\` in the story field; fill a missing `summary` with `""`.

---

## Member Probability Engine

`src/agent/probabilityEngine.js`:

```
weight = affection(40%) + balance(30%) + recency(20%) + random(10%)
```

* `calculateProbability(memberId, allTargetIds, affections, memory)` — a member absent for 4+ rounds floors at 0.3; otherwise the weight caps at 0.7
* `pickPrimaryMember(...)` — weighted draw over `allTargetIds`, returning the single member who drives this round; the result feeds `memberAppearances`

**Scope correction:** the engine does **not** select which members appear in the prompt. In `executeRound`, `roundMemberIds = allTargetIds` (main + all subs), so KKT injection covers every target member. The engine's only live output is `primaryId`.

**Known bug:** `calculateProbability` reads `memory.storyRounds`, a v11 field that no longer exists. `lastRound` is therefore always `0`, `recentCount` collapses to `appearances.filter(r => r >= -3).length` (i.e. all recorded appearances), and the "absent 4+ rounds" floor almost never triggers. Fix by deriving `lastRound` from `memory.history` instead.

---

## Social Media System

4 platforms generated by the LLM per round, displayed in the **next** round (delayed display hides LLM latency — the player checks social while waiting ~10s):

| Platform | Content | Unlock |
| --- | --- | --- |
| Bubble | Text messages array | Always |
| Instagram | `{imageDesc, caption}` | Always |
| Weverse | Post text string | Always |
| KakaoTalk (KKT) | Private messages | affection >= `KKT_THRESHOLD` (30) |

Social content is stored in module-level `pendingSocialFeeds`. `popPendingSocial()` runs at the start of each round to display the previous round's content; `resetPendingSocial()` discards it during a Retry.

---

## Relationship Stages (7)

Defined in `src/config/stageConfig.js`:

| Stage | Score Range |
| --- | --- |
| Stranger | 0-15 |
| Acquaintance | 16-30 |
| Friend | 31-50 |
| Close Friend | 51-65 |
| Crush | 66-80 |
| Lovers | 81-90 |
| Trial | 91-100 |

Stage transitions trigger special events in `relationshipEvents.js`. `executeRound` also surfaces `proposal_ready`, `breakup_warning`, and `pressure_warning` as `specialEvent`.

## Achievements (5 endings)

`src/config/achievements.js`: `he_hidden_love`, `se_public_love`, `be_exposed_separation`, `oe_unspoken_waiting`, `be_you_left`.

---

## Page Flow

```
Cover Page
  -> Select group (required) + language + theme -> New Game or Load Save
      |
Key Input Page
  -> Enter API key + choose model (+ Qwen sub-model)
      |
Setup Page
  -> Main member + Sub members + Identity (7+1) + Pace + Name/Age
      |
Game Page (loop)
  -> Read story -> Choose A/B/C/D or Custom -> Next round
     (settings overlay: reasoning, time speed, theme, font, export, help)
```

"New Game" is disabled (dimmed + toast) until a group is selected.

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

Group JSON size directly drives the static-prompt token count (Red Velvet ~8KB, TWICE ~14KB), so a 9-member group has a noticeably larger cached prefix than a 4-member one.

---

## Branch & Deploy Workflow

### index.html rule

Always stays in **dev mode** (`<script type="module" src="/src/main.jsx">`). `deploy.sh` patches to production mode, commits + pushes, then restores dev mode. Never manually edit `index.html`.

If stuck in production mode (pointing at `./assets/index-*.js`), restore the dev `<script>` tag before deploying.

### Hotfix on stable

```bash
git checkout main
# fix in src/
git add src/ README.md CLAUDE.md
git commit -m "fix: description"
npm run deploy
git tag v1.3.x && git push origin v1.3.x
# sync to dev:
git checkout dev-v13.0.0
git cherry-pick <commit-hash>
git push origin dev-v13.0.0
```

### Release v13.0.0

```bash
git checkout main
git merge dev-v13.0.0 --no-ff -m "release: v13.0.0"
git tag v13.0.0
npm run deploy
git push origin v13.0.0
```

### What `npm run deploy` does

1. `rm -rf dist assets`
2. `BASE_URL="./" npm run build` — relative-path Vite build
3. Copy `dist/assets/*.js` + `*.css` into root `assets/`
4. Patch `index.html` to reference the hashed filenames
5. `git add index.html assets/ src/ README.md CLAUDE.md` -> commit -> `git push origin main`
6. Restore `index.html` to dev mode (not committed)

---

## Known Inconsistencies (fix before they bite)

1. **`maxOutputTokens` never defined** — `llmTool.js` reads `cfg.maxOutputTokens`, no model config sets it; everything silently gets `8192`. `MODEL_CONFIGS.qwen.max_completion_tokens` is also never read.
2. **`probabilityEngine` reads `memory.storyRounds`** — a removed v11 field, so the recency term is inert (see Member Probability Engine above).
3. **`NPC_APPEARANCE_CHANCE` / `NPC_COOLDOWN_ROUNDS` unused** — NPC behavior is prompt-driven only.
4. **In-app cost strings are stale** — `MODEL_CONFIGS[*].gameplay` still quotes the pre-repricing hours-per-$1 figures (e.g. DeepSeek "$1 ≈ 56 hrs"). The README cost table is the corrected source; update `modelConfigs.js` to match on the next deploy.
5. **`package.json` version is `1.0.0`** while the app displays `v1.3.1` — the displayed version lives in `App.jsx` cover strings and `src/i18n/*.js`, so a version bump means editing four places.
