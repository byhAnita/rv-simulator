# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Idol Dating Sim v1.2.0** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390×844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

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

### 🔄 Architecture Changes: v1.1.0 to v1.2.0

v1.2.0 completely overhauled the LLM payload to solve token bloat and latency. When interacting with the context builder or memory state, adhere to these new paradigms:

*   **2-Tier Memory Pool:** The monolithic `storyRounds` array is gone. Memory is now strictly separated into `summaries` (Tier-1: last `M` rounds, ~100-char English strings) and `fullStories` (Tier-2: last `N` rounds, full localized text). This drastically cuts input tokens while maintaining long-term continuity.
*   **Dynamic KKT Context Injection:** KakaoTalk histories are no longer unconditionally dumped into the system prompt. `buildMemoryContext` now checks the `roundMemberIds` (provided by the probability engine) and only injects KKT history for members *actively appearing* in the current round.
*   **Ephemeral Social Media:** Social media posts (`bubble`, `instagram`, `weverse`) were permanently removed from the memory pool. They are now stored entirely in a module-level variable (`pendingSocialFeeds`), displayed once in the following round, and then discarded. Do not re-add them to the LLM context.
*   **Save System Migration:** The save schema was bumped to `rv_sim_saves_v12`. Because the memory shape fundamentally changed, `isLegacyMemory` is used during `loadSave()`. If an old save is loaded and `memory.summaries` is undefined, the engine intentionally wipes the memory pool via `createEmptyMemory()` to prevent a token-bloat crash, while preserving the player's stats and relationship scores.

### Data Flow per Round (Optimized for v1.2.0)

> **v1.2.0 Performance Note:** The token payload and context-building logic were heavily optimized in this release. Prompt caching support ensures wait times sit securely at <30s, and API token usage has dropped significantly. Do not re-introduce legacy token-heavy fields into the core `buildSystemPrompt()`.

```
Player choice
  → executeRound(choice, roundNum, form, members, apiKey, model, language, memory)
  → buildSystemPrompt()           // Now highly optimized: background + trimmed context + JSON schema
  → callLLM()                     // single API call, 90s timeout, 2x retry on empty
  → parseLLMOutput()              // 4-level fallback (JSON.parse → regex → field-by-field → default)
  → validateAndFixOutput()        // regex repairs on malformed fields
  → update stats / affections / memory
  → detect stage changes / relationship events / achievements
  → store social feeds in pendingSocialFeeds  (displayed NEXT round)
  → return { story, options, stats, ... }

```

### Key Modules

| Path | Role |
| --- | --- |
| `src/App.jsx` | All React state, page routing (Cover→KeyInput→Setup→Game), save/load logic |
| `src/agent/mainAgent.js` | `executeRound`, `buildSystemPrompt`, `parseLLMOutput`, `validateAndFixOutput` |
| `src/agent/memoryPool.js` | Two-tier memory: `createEmptyMemory`, `updateMemory`, `buildMemoryContext`, `isLegacyMemory` |
| `src/agent/probabilityEngine.js` | Sub-member appearance weights per round |
| `src/tools/llmTool.js` | Multi-model router: DeepSeek / Gemini / Claude / GPT (format adapters per provider) |
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
* **localStorage keys**: `STORAGE_KEYS.API_KEY`, `STORAGE_KEYS.SELECTED_MODEL`, `STORAGE_KEYS.SAVES` (`rv_sim_saves_v12`), `rv_sim_language`, `rv_sim_group`

---

## Key Constants (`src/config/constants.js`)

```js
MEMORY_SUMMARY_MAX = 10   // M: Tier-1 long-term summary slots (FIFO)
MEMORY_STORY_MAX   = 3    // N: Tier-2 recent full-story slots (FIFO)
KKT_MAX            = 10   // Q: KakaoTalk messages stored per member
KKT_THRESHOLD      = 30   // affection score required to unlock KKT per member
MAIN_INITIAL_AFFECTION       = 12
SUB_INITIAL_AFFECTION_MIN    = 5
SUB_INITIAL_AFFECTION_MAX    = 10
NPC_APPEARANCE_CHANCE        = 0.3   // base probability for NPC members to appear
NPC_COOLDOWN_ROUNDS          = 2

```

---

## 2-Tier Memory Architecture

### Memory Shape

```js
// createEmptyMemory() — src/agent/memoryPool.js
{
  playerStats:       null,          // {selfId, secrecy, mood, week, scene, chapter}
  affections:        {},            // {memberId: number}
  topMemberId:       null,
  summaries:         [],            // Tier 1 — [{round, memberId, summary}] max M, FIFO
  fullStories:       [],            // Tier 2 — [{round, story, playerChoice}] max N, FIFO
  kktMessages:       {},            // {memberId: [{sender, content}]} max Q per member
  stageChanges:      [],            // [{memberId, from, to}] last 10
  memberAppearances: {},            // {memberId: [roundNums]} last 10
  npcAppearances:    {},            // {memberId: lastRoundNum}
}

```

### Update Flow (`updateMemory`)

Called at end of each round. Accepts `updates` object with any subset of fields. FIFO truncation applied on `summaries` (slice to -M) and `fullStories` (slice to -N). KKT messages normalized to `{sender, content}` shape before append.

### Prompt Injection (`buildMemoryContext`)

Injected into system prompt as plain text block:

```
[Player Status] SelfId:38 Secrecy:97 Mood:82 Round:5 Scene:practice room

[Affections] 🐰Irene:24(Stranger) | 🐻Seulgi:12(Stranger)

[Long Memory — 4 summaries]
R2(🐰Irene): Late-night practice, she fixed your collar, tension rose.
R3(🐻Seulgi): Group meal, Seulgi kept refilling your drink.

[Recent Stories — last 3 rounds]
=== Round 3 ===
<full story text>
Choice: B

[KKT Messages — round-relevant members]
🐰Irene: hey are you free tonight | you okay?

[Stage Changes] irene: Stranger→Acquaintance

[NPC Appearances] 🐥Joy(last: round 2)

```

**KKT injection rule**: Only inject KKT history for member IDs selected by the probability engine for the current round (`roundMemberIds`). Avoids poisoning context with off-screen members and maintains the new low-token footprint.

### Save Compatibility (`isLegacyMemory`)

`rv_sim_saves_v12` is the current standard. Old saves (pre-v1.2.0) have bloated `storyRounds` instead of `summaries`/`fullStories`. On `loadSave`, if `memory.summaries === undefined`, reset memory to `createEmptyMemory()` and log warning — do not crash. Stats, form, and affections are still restored from the save.

---

## LLM System Prompt

Built in `mainAgent.js#buildSystemPrompt()`. Enforces:

1. **Language lock** — output language tied to player's UI language (`zh`/`en`/`ko`)
2. **JSON schema** — LLM must return valid JSON every round (no markdown fences)
3. **Member personality matrices** — injected from group RAG JSON
4. **Phase rules** — rounds 1-6 (stranger), 7-14 (familiar), 15-24 (pressure), 25+ (consequences)
5. **summary field** — always English, ~100 chars, used only for Tier-1 memory, never shown to player

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
git commit -m "fix: description"
npm run deploy
git tag v1.2.x && git push origin v1.2.x
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