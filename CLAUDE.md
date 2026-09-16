# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Idol Dating Sim v1.3.2** — LLM-Agent-driven K-pop idol yuri dating simulator. Single-page React/Vite PWA, mobile-first (390x844px), all inline styles (no CSS framework). Multi-group support via JSON RAG configs.

Active branches:
- `main` — stable production, served by GitHub Pages + Vercel
- `dev` — default working branch, never deploy from here

See **Branch & Deploy Workflow** for the release, hotfix and merge-back rules.

Measured production numbers (real player sessions, reasoning off): **~95.8% prompt-cache hit rate**, **~10s generation time per round**.

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
npm run bump 1.3.3                    # rewrite all 13 version strings (note the `--` for --dry)
npm run deploy                        # full deploy: preflight -> build -> patch index.html -> push main
DEPLOY_MSG="fix: desc" npm run deploy # deploy with custom commit message
```

`npm run deploy` refuses to run unless it is on `main`, the staged paths are clean, `main` is level with `origin/main`, **and the smoke suite passes** — see Branch & Deploy Workflow.

Validate every change with `npm run build` **and** `node test/smoke.mjs`. No lint config.

`test/smoke.mjs` reads `API_KEY` (or the older `YURIAGENT_API_KEY`) and `MODEL_ID` from the git-ignored `.env.local`. `MODEL_ID` accepts either a provider id or a model string (`aliyun`/`qwen`/`qwen3.8-max` all resolve to the `qwen` provider). Never print the key, and never move it into a tracked file — Layer C fails the run if a key reaches `src/`, `dist/`, or git history.

**The two live tests answer different questions.** `smoke.mjs --live-free` sends a tiny request to each free-route model and asks *does this model accept our parameters* — cheap, fast, and the thing to re-run after any params change. `playthrough.mjs` plays real games through `executeRound` and asks *can this model actually run the game* — valid JSON every round, the player's language, four `A.`–`D.` options, stats in 0–100, prose with no options or stats box baked in, no chain-of-thought leak, and a history ledger whose prefix stays byte-identical outside collapses (the cache claim). Each model runs in its own child process so router state and `mainAgent`'s module-level social buffer cannot interleave. `--models sample` (the default) covers one model per family; reports land in `test/.out/playthrough-*.json`.

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

### Regenerate & Edit Features

The current round can be regenerated or edited without consuming a new round counter or corrupting memory:

- **`preRoundSnapshotRef`** (`useRef`) in `App.jsx` — captures `{ stats, memory, kktUnlocked, kktMessages, triggeredAchievements, playerChoice }` before every `executeRound` call (both in `startNewGame` and `sendMessage`). `socialFeeds` is intentionally **not** snapshotted — `popPendingSocial()` already ran and correctly applied the previous round's social to UI state. **`loadSave` nulls it** — see Save Compatibility.
- **`regenerateRound(overrideChoice)`** in `App.jsx` — restores all snapshotted state, removes the last assistant message, calls `resetPendingSocial()` (clearing the discarded round's pending social), then re-calls `executeRound`. With no argument it reuses the snapshot's `playerChoice` (the ↺ Retry path); with one it substitutes the edited choice and updates the snapshot so a later ↺ keeps it.
- **`resetPendingSocial()`** exported from `mainAgent.js` — clears module-level `pendingSocialFeeds` and `pendingNotifications`.
- **Edit last choice (✎ on the newest user bubble)** — replaces the choice and re-runs the round through `regenerateRound(edited)`. Same sanitisation and 300-char cap as `sendMessage`. Round 1 has no user message (it comes from `startNewGame`), so no button appears there.
- **Edit last story (✎ beside ⎘ and ↺)** — edits the prose only, keeping the stats box, and writes to **two** places: `messages[last].content` and `memoryRef.current.history.at(-1).text`. Both are required; without the second the player's screen and the model's context silently diverge. Capped at 4,000 chars so a paste cannot bloat every later round's prompt.
  - **This is free in cache terms.** A story generated in round N first enters the prompt at round N+1, and the button only ever appears on the newest story — so the edited text has never been sent and nothing cached is invalidated.
  - The original English `summary` is **kept**. It is the collapse target, and blanking it would make `collapseHistoryIfNeeded` fall back to `text.substring(0,150)` — a truncated slice in the player's language, which is worse than a slightly stale gist.
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
| `src/agent/memoryPool.js` | 1-tier history ledger: `createEmptyMemory`, `updateMemory`, `collapseHistoryIfNeeded`, `buildHistoryLedger`, `buildDynamicTail`, `isLegacyMemory`, `getTopMember` |
| `src/agent/probabilityEngine.js` | `calculateProbability`, `pickPrimaryMember` — picks which target member drives this round |
| `src/tools/llmTool.js` | Unified OpenAI-compatible client + per-provider reasoning flags, 90s timeout, per-kind retry, Aliyun free-credit router |
| `src/tools/llmErrors.js` | `LLMError`, `parseErrorBody`, `classifyError` — maps every provider's HTTP errors to one `kind` |
| `src/tools/aliyunRoute.js` | Free-route state per API key: `getFreeCandidates`, `markModel`, `recordServedModel`, `getFreeRouteStatus`, `resolvePaidModel` |
| `src/rag/groupLoader.js` | `loadGroupIndex()`, `loadGroupConfig(id, lang)`, `getNpcMembers()` |
| `src/config/constants.js` | Numeric game constants (see below) |
| `src/config/modelConfigs.js` | 4 providers; Aliyun `ALIYUN_FREE_ROUTE`, `ALIYUN_PAID_MODELS`, `getAliyunModelParams` |
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
| `rv_sim_aliyun_mode` | `STORAGE_KEYS.ALIYUN_MODE` | `"free"` / `"paid"` |
| `rv_sim_aliyun_paid_model` | `STORAGE_KEYS.ALIYUN_PAID_MODEL` | Paid-mode model id |
| `rv_sim_aliyun_route` | `STORAGE_KEYS.ALIYUN_ROUTE` | Free-route state `{keyHash, exhausted, unavailable, lastModel}` |
| `rv_sim_qwen_submodel` | inline literal | **Legacy, read-only** — seeds `ALIYUN_PAID_MODEL` once for players upgrading from the 3-sub-model UI |
| `rv_sim_theme` | inline literal | `"dark"` / `"light"` |
| `rv_sim_timespeed` | inline literal | `"slow"` / `"default"` / `"fast"` |
| `rv_sim_fontscale` | inline literal | `1` / `1.25` |
| `rv_sim_language` | inline literal | `zh` / `en` / `ko` |
| `rv_sim_group` | inline literal | Selected group id |

Note the inconsistency: only nine keys live in `STORAGE_KEYS`; the rest are inline string literals in `App.jsx`. Prefer moving new keys into `STORAGE_KEYS`.

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
| `qwen` | Aliyun | free route / paid picker (see below) | ✅ **default** | Alibaba Cloud Bailian: Qwen, DeepSeek and GLM behind one `sk-ws-` key. The code id stays `qwen` so saves and `rv_sim_model_v11` keep working — only the UI label changed |
| `deepseek` | DeepSeek V4.1 Flash | `deepseek-flash` | | DeepSeek's own platform. The button is named for the model, not the platform, so the player can see what they will run; the platform name lives in the card description. The legacy `deepseek-v4-flash` name is retired upstream and served by V4.1 anyway |
| `gpt4omini` | GPT-5.6 Luna | `gpt-5.6-luna` | | key `gpt4omini` is legacy, the model string is current |
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
| `gpt4omini` | `reasoning_effort:'none'` (the reference lists `none` as a value, so OFF is explicit) | `reasoning_effort:'high'`, `max_completion_tokens: 32768` |

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
| `gpt4omini` | 8192 | 32768 — at 8192 reasoning tokens could consume the whole budget and return empty content |
| `gemini` | 8192 | 65535 |

A round only needs ~800 output tokens; these are ceilings, not reservations. Aliyun honors **both** cap names — verified live 2026-08-26: a cap of 16 truncates with `finish_reason:'length'` under either — so the per-model split is about matching the documented field, not about one being rejected. `test/smoke.mjs --live` asserts the cap is genuinely honored, not merely accepted, since an ignored unknown field would still return HTTP 200.

---

## Add-on Features (v1.3.2)

| Feature | State | Persisted as | Wiring |
| --- | --- | --- | --- |
| Deep Thinking | `reasoningEnabled` | `rv_sim_reasoning_v13` | -> `executeRound` -> `callLLM` per-provider flags |
| Time Speed | `timeSpeed` (`slow`/`default`/`fast`) | `rv_sim_timespeed` | -> `executeRound` -> appended to the **dynamic tail** as a `[Pacing]` line, never the ledger |
| Day/Night | `theme` (`dark`/`light`) | `rv_sim_theme` | `THEMES[theme]` -> `th` token object, threaded into every overlay as a `theme` prop |
| Text size | `fontScale` (`1`/`1.25`) | `rv_sim_fontscale` | `Math.round(base * fontScale)` on story/option text; passed to Bubble and Kakao overlays |
| Export | `exportClipboard` / `exportTxt` / `exportPdf` | — | Shares `extractStoryText()`; PDF renders themed HTML into a hidden iframe and calls `print()` |
| Help Center | `showHelp` | — | `HelpOverlay.jsx`, 4 tabs x 3 languages; the Errors tab reads `t.errors` so it always matches the in-game notices |

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

Called at the **start** of each round, before building the prompt, **on a clone of the caller's memory**. It mutates in place, so running it on the live object meant a failed LLM call left the full stories permanently collapsed — the player's next attempt sent a degraded ledger. `executeRound` now clones first and only hands the clone back on success.

Counts `history.filter(h => h.type === 'full').length`. If `>= HISTORY_FULL_MAX`:
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

**`preRoundSnapshotRef` must be cleared on every game boundary.** It holds the pre-round state that ↺ Retry and the ✎ edit controls restore, and it is set only by `startNewGame` and `sendMessage`. `loadSave` must null it: otherwise a player who plays game A and then loads save B sees ↺ on B's last message, and tapping it restores **game A's** stats and memory into B. This also gives the intended gating for free — after loading a save there is no ↺ and no ✎ until one round has been played in this session, so the edit features can never touch a history entry they did not create.

**Model settings are not part of a save.** Save slots hold no provider or model field, so model-layer changes cannot break them — keep it that way. Legacy *settings* are handled at read time instead: `rv_sim_model_v11 = "qwen"` still resolves (the id never changed), `rv_sim_qwen_submodel` seeds the paid pick through `resolvePaidModel` (unknown or removed ids -> `qwen3.8-max`), `rv_sim_aliyun_mode` accepts only `"paid"` and otherwise means `"free"`, and `aliyunRoute.js` treats any malformed `rv_sim_aliyun_route` as empty. `test/smoke.mjs` Layer G guards all four.

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

The recency window's reference round comes from the tail of `memory.history`. It previously read `memory.storyRounds` — a v11 field removed in v13 — which pinned `lastRound` to `0`, degenerated the filter to `r >= -3` (every recorded appearance counted as recent), and left both the recency penalty and the "absent 4+ rounds" floor effectively dead. Fixed in v1.3.1; `test/smoke.mjs` Layer D guards it with pinned `Math.random`, and that guard is verified to fail against the old implementation.

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
  -> Enter API key + choose provider (Aliyun: Free credits auto-route | Paid model list + cost guide)
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
npm run bump 1.4.0                                # rewrites all 13 version strings
# hand-write the "## What's New in v1.4.0" section in README.md
npm run build && node test/smoke.mjs
git commit -am "chore: bump to v1.4.0" && git push origin dev

git checkout main && git pull
git merge dev --no-ff -m "release: v1.4.0"
npm run deploy                                    # red line: pushes to production
git tag v1.4.0 && git push origin v1.4.0
git checkout dev && git merge main && git push origin dev
```

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
git checkout dev && git merge main && git push origin dev
```

Deleting the merged `hotfix/*` branch afterwards is your call — the merge commit and the tag both record it, so nothing is lost, but branch deletion is a red-line action and is never done automatically.

**Always add a regression check to `test/smoke.mjs` as part of the fix**, and verify it fails against the unfixed code. This is already the convention in this repo — the Layer G key-page guards each encode a bug that reached a hand test. It also does double duty on the merge-back: if `dev` has rewritten the same area, the merge will conflict, and the guard is what proves the fix survived however you resolve it. Resolve in favour of `dev`'s structure, keep the fix's behaviour, and let the check confirm it.

**Hotfixes bump the version too.** The cover screen's version string is how a player tells you what they are running, so a build in the wild should never be ambiguous. A hotfix bumps the patch digit and adds a line to the current README "What's New" section rather than opening a new one.

### Version strings

Thirteen strings across five files must agree, and `npm run bump <x.y.z>` rewrites all of them:

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

**The README "What's New in v…" heading is deliberately not bumped.** It is a changelog entry, not a version string — a release *adds* a new section and leaves the old ones alone. `bump` skips every line containing `What's New in` for exactly this reason; rewriting it would silently relabel the previous release's notes.

Two things keep this honest: the bump script realigns the ASCII sketch lines so a width change (`1.3.9` -> `1.3.10`) cannot break the art, and **smoke Layer C asserts all 13 agree with `package.json`**, so a partial bump fails the suite — and therefore fails `deploy.sh` preflight.

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

5. `rm -rf dist assets`
6. `BASE_URL="./" npm run build` — relative-path Vite build
7. Copy `dist/assets/*.js` + `*.css` into root `assets/`
8. Patch `index.html` to reference the hashed filenames
9. `git add index.html assets/ src/ README.md CLAUDE.md` -> commit -> `git push origin main`
10. Restore `index.html` to dev mode (not committed), via the `EXIT` trap
11. Print the tag and merge-back commands

**The staging list is not everything.** `deploy.sh` does not stage `test/`, `docs/`, `package.json` — or `deploy.sh` itself. In the release flow this never bites, because the merge from `dev` brings them. It does bite if you edit them on `main` and expect deploy to pick them up — commit those yourself first. Preflight check 2 only covers the paths the script *does* stage, so it will not catch these.

---

## Project Status (2026-09-16)

**v1.3.2 is released and live.** Working branch is now `dev`. Everything below shipped in it — validated offline (`npm run build` + **371 checks** in `node test/smoke.mjs`), exercised against the live Aliyun API (**381 checks** with `--live-free`), and hand-tested by the author on device.

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
13. **Smoke suite 145 → 371 checks**, including per-model family contracts, the router's new policies, error-kind i18n parity, legacy/corrupt route state, and key-page layout guards for bugs that reached hand testing.

### Live test results (2026-09-16)

Roughly 600 real rounds against the Aliyun endpoint, across two passes.

* **28/28 free-route models accept our parameters.** Getting there needed one fix no document could have supplied: `qwen3.8-2.4t-a95b` rejects `enable_thinking:false` with an undocumented error. It was later removed from the route anyway (see below).
* **The cache invariant holds** — 0 ledger prefix breaks across 87 collapses in the 348-round sweep, 0 across 18 in a 30-round game, 0 in every run since. The append-only ledger behaves exactly as this file describes.
* **Language lock is solid** — zh/en/ko playthroughs clean; no model narrated in the wrong language while otherwise working.
* **Four models misbehaved in play**, none of them a parameter bug. Two were removed from the route (`qwen3.5-27b` answers literal `null`, 12/12 unusable; `qwen3.8-2.4t-a95b` never finished inside 90s, 0/12). Two are now handled at runtime (`glm-5.1` ran away to the output cap and showed raw JSON, 5/12; `qwen3.8-max` returned a sub-20-char story ~8% of rounds).
* **After the fixes**: `glm-5.1` 7/12 → **12/12 clean**, live route playthrough **8/8 clean**.
* **Measured Aliyun prompt-cache hit rate is ~83%**, flat across 0/1/2 sub-members and not converging upward over 30 rounds. Twelve of the route models (every `qwen3.5-*` and `qwen3.6-*`) report no `cached_tokens` field at all. **This does not contradict the 95.8% figure**, which comes from DeepSeek Official billing on a different platform with a finer-grained cache — see to-do 2.

**Released 2026-09-16.** `4936d70` (feature commit) + `35b1e9e` (deploy build) are on `origin/main`, tagged **`v1.3.2`** on the deploy commit. `dev` was branched from that point and the old `dev-v12.0.0` frozen behind tag `archive/dev-v12.0.0`. All work from here goes to `dev` — see Branch & Deploy Workflow.

**Open questions (not blocking release)**

1. **The empty-route notice has never been rendered.** It only appears at 0/28 available, which needs a genuinely exhausted key. Everything else on the key page has now been hand-checked at 390px.
2. **Re-check the 95.8% cache figure against DeepSeek Official billing** after a long hand-played session. That figure comes from DeepSeek's platform; the ~83% measured here is Aliyun-specific and the two are not comparable, so pricing stays as published until then. `docs/TEST_FINDINGS.md` records the size of the gap if it does need revising, and the open `qwen3.6-flash` question (Aliyun reports no cached tokens for it at all).
3. **Verify `reasoning_effort:'none'` on OpenAI** and Gemini's behaviour with Deep Thinking off — both are doc-derived, never observed. Aliyun's side is now observed.
4. **Token Plan decision** — leave `sk-sp-` unsupported, or add a proxy (see the Token Plan note in the Model Layer).

**Optional cleanup:** `probabilityEngine.js`, `achievements.js`, `relationshipEvents.js`, `stageConfig.js` and `groupLoader.js` still carry Chinese comments, against the English-only rule for code. The key-page guards in smoke Layer G are source-string checks and will need updating if that area is restyled — they are deliberate, each one encoding a bug that reached a hand test.

---

## Known Inconsistencies (fix before they bite)

1. **`src/App.jsx` duplicates the i18n cover strings.** The cover text exists in both `src/i18n/*.js` and a hardcoded fallback object in `App.jsx` (~line 712), which is why the version lives in 13 places instead of 10. `npm run bump` keeps them in step and smoke Layer C fails if they drift, so this is contained rather than dangerous — but collapsing the fallback into one source would delete six of the thirteen. See **Version strings** under Branch & Deploy Workflow.

   **`App.jsx` duplicates the i18n cover strings.** The cover text exists in both `src/i18n/*.js` and a hardcoded fallback object in `App.jsx`, so a bump edited in only one place leaves the two disagreeing depending on which path renders. Worth collapsing into one source before the next release.

### Cost strings must track README

`MODEL_CONFIGS[*].gameplay` (rendered through `t.guide.billing`) and each `ALIYUN_PAID_MODELS[*].gameplay` (rendered in the paid-mode cost box) are hand-derived from the README cost table — **when provider pricing changes, update both**. zh quotes hours per ￥1, en per \$1, ko per ₩1,000.

Derivation: README token profile (7,664 cache-hit + 336 cache-miss input, 800 output per round, 12 rounds/hour). CNY-priced Aliyun models convert at ￥7.1 = \$1; ₩1,000 = \$0.72. Peak-priced models are blended: Aliyun DeepSeek is 2x for 14 of 24 hours daily (08:00–22:00 Beijing), DeepSeek Official is 2x for 35 of 168 weekly hours.
