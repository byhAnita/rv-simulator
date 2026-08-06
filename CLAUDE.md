# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Idol Dating Sim v1.3.0** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390×844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

Active branches:
- `main` — stable production, served by GitHub Pages + Vercel
- `dev-v13.0.0` — next version development, never deploy from here

---

## Commands

```bash
npx vite                              # local dev — hot reload, always works
npm run build 2>&1 | tail -12         # validate build (no test suite)
npm run deploy                        # full deploy: build → patch index.html → push main → restore dev mode
DEPLOY_MSG="fix: desc" npm run deploy # deploy with custom commit message

```

Validate every change with `npm run build`. No lint config, no test suite.

---

## Architecture

### Regenerate Feature (added post-v1.2.0)

The current round can be regenerated without consuming a new round counter or corrupting memory. Implementation:

- **`preRoundSnapshotRef`** (`useRef`) in `App.jsx` — captures `{ stats, memory, kktUnlocked, kktMessages, triggeredAchievements, playerChoice }` before every `executeRound` call (both in `startNewGame` and `sendMessage`). `socialFeeds` is intentionally **not** snapshotted — `popPendingSocial()` already ran and correctly applied the previous round's social to UI state.
- **`regenerateRound()`** in `App.jsx` — restores all snapshotted state, removes the last assistant message, calls `resetPendingSocial()` (to clear the discarded round's pending social), then re-calls `executeRound` with the same `playerChoice`.
- **`resetPendingSocial()`** exported from `mainAgent.js` — clears module-level `pendingSocialFeeds` and `pendingNotifications`.
- **UI**: `⎘ Copy` and `↺ Retry` buttons appear bottom-right of the last assistant message only, hidden during loading. Copy strips the stats box and option lines, leaving pure story text.

### Core Architecture Principles

*   **1-Tier Unified History Ledger:** Memory uses a single `history[]` array — a chronological append-only ledger of `{round, type:'summary'|'full', text, choice?, summary?}` entries. Entries are never deleted mid-ledger; the token prefix stays byte-identical across consecutive rounds, enabling LLM KV cache hits.
*   **In-Place Collapse (Stepped Window):** When full-story entries reach `HISTORY_FULL_MAX` (N=3), all `type:'full'` entries are mutated to `type:'summary'` in-place (using the `summary` string already returned by the LLM each round). The new round is then appended as `type:'full'`. This causes one cache miss per N rounds; all other rounds are prefix cache hits on the history block.
*   **3-Tier Prompt Structure:** The prompt is split into three strictly ordered messages to separate immutable from dynamic content:
    1. **Static system prompt** — rules, lore, member profiles, JSON schema → 100% cache hit after R1
    2. **History ledger** (`buildHistoryLedger`) — append-only summaries + full stories → 2/3 rounds cache hit
    3. **Dynamic tail** (`buildDynamicTail`) — player stats, affections, stage changes, NPC state, KKT → always cache miss, kept small
*   **Dynamic fields isolated to tail:** Player stats, affections, stage changes, and NPC appearances live exclusively in the dynamic tail message and are never embedded in the history ledger, to avoid invalidating the prefix.
*   **Save schema:** `rv_sim_saves_v13`. `isLegacyMemory` detects `memory.history === undefined`. On legacy load, memory is wiped to `createEmptyMemory()` while stats and affections are preserved — no crash.

### Data Flow per Round (v1.3.0 — Cache-Optimized)

```
Player choice
  → executeRound(...)
  → collapseHistoryIfNeeded(memory)   // in-place: full→summary if full count >= N
  → buildHistoryLedger(memory)        // serializes history[] — CACHEABLE prefix
  → buildDynamicTail(memory, members) // stats, affections, KKT — always tail
  → buildSystemPrompt(...)            // static — 100% cache hit
  → callLLM([system, ledger, tail+choice])  // 90s timeout, 2x retry
  → parseLLMOutput()                  // 4-level fallback
  → validateAndFixOutput()
  → update stats / affections
  → detect stage changes / events / achievements
  → updateMemory: append historyEntry {type:'full', text, choice, summary}
  → store social feeds in pendingSocialFeeds (displayed NEXT round)
  → return { story, options, stats, ... }

```

> **Cache performance:** Every N rounds one collapse miss; all other rounds hit on everything above the dynamic tail. Static system prompt hits every round after R1.

### Key Modules

| Path | Role |
| --- | --- |
| `src/App.jsx` | All React state, page routing (Cover→KeyInput→Setup→Game), save/load logic |
| `src/agent/mainAgent.js` | `executeRound`, `buildSystemPrompt`, `parseLLMOutput`, `validateAndFixOutput` |
| `src/agent/memoryPool.js` | 1-tier history ledger: `createEmptyMemory`, `updateMemory`, `collapseHistoryIfNeeded`, `buildHistoryLedger`, `buildDynamicTail`, `isLegacyMemory` |
| `src/agent/probabilityEngine.js` | Sub-member appearance weights per round |
| `src/tools/llmTool.js` | Multi-model router: DeepSeek / Gemini / Qwen / GPT (format adapters per provider) |
| `src/rag/groupLoader.js` | `loadGroupIndex()`, `loadGroupConfig(id, lang)` → member profiles + group lore |
| `src/config/constants.js` | All numeric game constants (see below) |
| `src/config/modelConfigs.js` | 4 model configs (id, url, format, keyPrefix, color) |
| `src/config/stageConfig.js` | 7 relationship stages with score thresholds and display labels |
| `src/config/relationshipEvents.js` | Stage-transition special events |
| `src/config/achievements.js` | Achievement trigger conditions and display data |
| `src/i18n/` | `useTranslation(lang)` hook + `${var}` interpolation; zh/en/ko |
| `src/platforms/` | Social overlay React components: Bubble, Instagram, Weverse, KakaoTalk, Save |

### State Management

* **React hooks only** — no Redux/Zustand
* **`useRef` for mutable non-rendering data**: `statsRef` (live stats), `memoryRef` (memory pool), `inputRef`, `bottomRef`
* **Module-level globals** in `mainAgent.js`: `pendingSocialFeeds`, `pendingNotifications` (survive re-renders, reset on new game)
* **localStorage keys**: `STORAGE_KEYS.API_KEY`, `STORAGE_KEYS.SELECTED_MODEL`, `STORAGE_KEYS.SAVES` (`rv_sim_saves_v13`), `rv_sim_language`, `rv_sim_group`

---

## Key Constants (`src/config/constants.js`)

```js
HISTORY_FULL_MAX    = 3   // N: full-story entries before collapse trigger
HISTORY_PRUNE_BATCH = 15  // batch-prune this many oldest summaries when total summaries exceed threshold (round 50+)
KKT_MAX             = 10  // Q: KakaoTalk messages stored per member
KKT_THRESHOLD       = 30  // affection score required to unlock KKT per member
MAIN_INITIAL_AFFECTION       = 12
SUB_INITIAL_AFFECTION_MIN    = 5
SUB_INITIAL_AFFECTION_MAX    = 10
NPC_APPEARANCE_CHANCE        = 0.3   // base probability for NPC members to appear
NPC_COOLDOWN_ROUNDS          = 2

```

---

## 1-Tier Stepped Window Memory Architecture

### Memory Shape

```js
// createEmptyMemory() — src/agent/memoryPool.js
{
  playerStats:       null,   // {selfId, secrecy, mood, week, scene, chapter}
  affections:        {},     // {memberId: number}
  topMemberId:       null,
  history:           [],     // unified ledger — [{round, type, text, choice?, summary?}]
                             //   type:'summary' → text is ~100-char English sentence
                             //   type:'full'    → text is full story, choice is player pick,
                             //                    summary is the ~100-char collapse target
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
Round | Ledger sent to LLM          | Ledger cache status                   | History after round
------|------------------------------|---------------------------------------|---------------------
R0    | (empty)                      | —                                     | [F0]
R1    | F0                           | MISS (first appearance)               | [F0 F1]
R2    | F0 F1                        | F0 HIT                                | [F0 F1 F2]
R3    | collapse→[S0 S1 S2]          | ALL MISS — new shorter tokens at pos0 | [S0 S1 S2 F3]
R4    | S0 S1 S2 F3                  | ALL MISS — S0≠F0 at pos0              | [S0 S1 S2 F3 F4]
      |   ↑ wait, R3 ledger was      |                                       |
      |   [S0 S1 S2], cache miss.    |                                       |
      |   R4 ledger = [S0 S1 S2 F3]; |                                       |
      |   S0 S1 S2 now HIT (same as  |                                       |
      |   R3 prefix), F3 MISS        | S0 S1 S2 HIT · F3 MISS               |
R5    | S0 S1 S2 F3 F4               | S0 S1 S2 F3 HIT · F4 MISS            | [S0 S1 S2 F3 F4 F5]
R6    | collapse→[S0..S5]            | S0 S1 S2 HIT · S3 S4 S5 MISS *       | [S0..S5 F6]
      |                              |   (* S3 sits where F3 was — shorter)  |
R7    | S0..S5 F6                    | S0..S5 HIT · F6 MISS                  | [S0..S5 F6 F7]
R8    | S0..S5 F6 F7                 | S0..S5 F6 HIT                         | [S0..S5 F6 F7 F8]
R9    | collapse→[S0..S8]            | S0..S5 HIT · S6 S7 S8 MISS *         | [S0..S8 F9]
R10   | S0..S8 F9                    | S0..S8 HIT · F9 MISS                  | [S0..S8 F9 F10]
R11   | S0..S8 F9 F10                | S0..S8 F9 HIT                         | [S0..S8 F9 F10 F11]
R12   | collapse→[S0..S11]           | S0..S8 HIT · S9 S10 S11 MISS *       | [S0..S11 F12]
R13   | S0..S11 F12                  | S0..S11 HIT · F12 MISS                | [S0..S11 F12 F13]
R14   | S0..S11 F12 F13              | S0..S11 F12 HIT                       | [S0..S11 F12 F13 F14]
R15   | collapse→[S0..S14]           | S0..S11 HIT · S12 S13 S14 MISS *     | [S0..S14 F15]
```

**Pattern at each collapse:** the 3 newly-converted Ss occupy token positions previously held by 3 large Fs — so they always miss (S≈25 tokens, F≈500 tokens, positions diverge immediately). The already-summarised prefix (S0..S(k-3)) stays byte-identical → keeps hitting.

**Convergence:** the stable-hit S prefix grows by 3 entries every N rounds. By R30, ~24 Ss are permanently cached (~600 tokens). The 3 fresh-miss Ss add only ~75 tokens of miss per collapse — a shrinking fraction of the total ledger. Collapse rounds converge toward high cache efficiency over time.

### Collapse Logic (`collapseHistoryIfNeeded`)

Called at the **start** of each round, before building the prompt. Counts `history.filter(h => h.type === 'full').length`. If >= `HISTORY_FULL_MAX`:
- Mutate every `full` entry in-place: `type → 'summary'`, `text → h.summary` (drops the long story text)
- Do NOT remove or reorder entries — prefix must stay byte-identical for entries that existed in the previous round
- Batch prune: if total summary count exceeds `HISTORY_PRUNE_BATCH * 3`, drop the oldest `HISTORY_PRUNE_BATCH` summary entries (one-time miss penalty every ~45 rounds)

### Update Flow (`updateMemory`)

Called at the **end** of each round. Appends `historyEntry: { round, type:'full', text: story, choice: playerChoice, summary: parsed.summary }` to `history[]`. KKT messages normalized to `{sender, content}` shape before append. No FIFO truncation on `history` — ledger is append-only by design.

### 3-Tier Prompt Structure

```
Message 1 — system (STATIC, 100% cache hit after R1):
  buildSystemPrompt() → rules, lore, all member profiles, JSON schema

Message 2 — user (HISTORY LEDGER, append-only, ~2/3 cache hit):
  buildHistoryLedger(memory) →
    R1: <~100-char summary>
    R2: <~100-char summary>
    ...
    === Round 4 ===
    <350-450 word full story>
    Choice: B
    === Round 5 ===
    <350-450 word full story>
    Choice: A

Message 3 — user (DYNAMIC TAIL, always cache miss, kept small):
  buildDynamicTail(memory, members, roundMemberIds) →
    [Player Status] SelfId:38 Secrecy:97 Mood:82 Round:6 Scene:practice room
    [Affections] 🐰Irene:24(Acquaintance) | 🐻Seulgi:12(Stranger)
    [Stage Changes] irene: Stranger→Acquaintance
    [NPC Appearances] 🐥Joy(last: round 2)
    [KKT Messages — round-relevant members]
    🐰Irene: hey are you free tonight | you okay?
  + "Player choice: B\n\nGenerate the next round. Output ONLY valid JSON."
```

**KKT injection rule**: Only inject KKT history for `roundMemberIds`. Dynamic tail only — never in the ledger.

### Save Compatibility (`isLegacyMemory`)

`rv_sim_saves_v13` is the current standard. On `loadSave`, if `memory.history === undefined`, reset memory to `createEmptyMemory()` (wipe pool) — stats, form, and affections are still restored. Prevents old `summaries`/`fullStories` shape from crashing the engine.

---

## LLM System Prompt

Built in `mainAgent.js#buildSystemPrompt()`. Enforces:

1. **Language lock** — output language tied to player's UI language (`zh`/`en`/`ko`)
2. **JSON schema** — LLM must return valid JSON every round (no markdown fences)
3. **Member personality matrices** — injected from group RAG JSON
4. **Phase rules** — rounds 1-6 (stranger), 7-14 (familiar), 15-24 (pressure), 25+ (consequences)
5. **summary field** — always English, ~100 chars, stored on each `history` entry as the collapse target; mutated into `text` when that entry collapses from `full` → `summary`. Never shown to the player.

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
  "kktMessages": {
    "<memberId>": ["message text", ...]
  },
  "story": "250-350 words in player's UI language. Pure narrative, no stat bars, no options.",
  "summary": "One English sentence ~100 chars — who appeared and what emotionally shifted.",
  "options": ["A. ...", "B. ...", "C. ...", "D. Custom"]
}

```

### JSON Parsing Pipeline (4-level fallback)

1. Direct `JSON.parse` on LLM response
2. Strip markdown fences + retry `JSON.parse`
3. Regex field extraction (storyMatch regex handles `summary` between `story` and `options`)
4. Return safe defaults — never crash the round

`validateAndFixOutput()` post-parse repairs: unescape `\n`, `\"`, `\/`, `\\` in story field; fill missing `summary` with `""`.

---

## Multi-NPC Probability Engine

`src/agent/probabilityEngine.js` — computes appearance weight for each sub/NPC member per round:

```
weight = affection(40%) + balance(30%) + recency(20%) + random(10%)

```

* **balance**: members who haven't appeared recently get boosted
* **recency**: inverse of rounds-since-last-appearance
* `NPC_COOLDOWN_ROUNDS` enforces minimum gap between NPC appearances
* Output: `roundMemberIds` array passed to `buildMemoryContext` and `executeRound`

---

## Social Media System

4 platforms generated by LLM per round, displayed in the **next** round (delayed display hides LLM latency — player checks social while waiting):

| Platform | Content | Unlock |
| --- | --- | --- |
| Bubble | Text messages array | Always |
| Instagram | `{imageDesc, caption}` | Always |
| Weverse | Post text string | Always |
| KakaoTalk (KKT) | Private messages | affection ≥ `KKT_THRESHOLD` (30) |

Social content stored in module-level `pendingSocialFeeds`. `popPendingSocial()` is called at the start of each round to display the previous round's content.

---

## Relationship Stages (7)

Defined in `src/config/stageConfig.js`:

| Stage | Score Range |
| --- | --- |
| Stranger | 0–15 |
| Acquaintance | 16–30 |
| Friend | 31–50 |
| Close Friend | 51–65 |
| Crush | 66–80 |
| Lovers | 81–90 |
| Trial | 91–100 |

Stage transitions trigger special events in `relationshipEvents.js`.

---

## Page Flow

```
Cover Page
  → Select group (required) + language → New Game or Load Save
      ↓
Key Input Page
  → Enter API key + choose model
      ↓
Setup Page
  → Main member + Sub members + Identity (7+1 types) + Pace + Name/Age
      ↓
Game Page (loop)
  → Read story → Choose A/B/C/D or Custom → Next round

```

"New Game" button is disabled (dimmed + toast) until a group is selected.

---

## Round Flow

```
Previous round ends (player chose ABCD/custom)
  ↓
Step 1: Build context — Background + buildMemoryContext()
  ↓
Step 1.5: popPendingSocial() → show last round's social feeds
  ├── Notification bar + red dots (instant)
  └── Social overlays available while LLM generates (Now < 30s)
  ↓
Step 2: LLM call — buildSystemPrompt() → callLLM() → parseLLMOutput()
  ↓
Step 3: Compute
  ├── new stats = old + statChanges (clamped)
  ├── new affections = old + affectionChanges (clamped 0-100)
  ├── KKT filter: affection < KKT_THRESHOLD → clear messages
  ├── stage change detection → relationshipEvents
  ├── achievement check
  └── probabilityEngine → roundMemberIds for next round
  ↓
Step 4: Store social → pendingSocialFeeds
  ↓
Step 5: UI refresh — top bar / stats / story / options / KKT
  ↓
Step 6: Player reads + chooses
  ↓
Step 7: updateMemory — push summary (Tier 1) + storyRound (Tier 2)
  ↓
Next round

```

---

## Group JSON Structure

`public/groups/{id}/{lang}.json` — no code changes needed to add a new group.

```
public/groups/
  index.json              ← [{id, name, emoji, members:[...]}]
  red_velvet/
    zh.json               ← full group config in Chinese
    en.json
    ko.json
  _template/              ← copy this to add a new group

```

Key fields in group JSON: `group.name`, `group.lore`, `members[]` (each with `id`, `name`, `emoji`, `color`, `accent`, `personality`, `queerTexture`, `speechStyle`).

---

## Branch & Deploy Workflow

### index.html rule

Always stays in **dev mode** (`<script type="module" src="/src/main.jsx">`). `deploy.sh` patches to production mode, commits + pushes, then restores dev mode. Never manually edit `index.html`.

If stuck in production mode (pointing to `./assets/index-*.js`), restore the dev `<script>` tag before deploying.

### Hotfix on stable (bug in production, no v13 release)

```bash
git checkout main
# fix in src/
git add src/
git add README.md
git add CLAUDE.md
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
4. Patch `index.html` to reference hashed filenames
5. `git add index.html assets/ src/` → commit → `git push origin main`
6. Restore `index.html` to dev mode (not committed)

---