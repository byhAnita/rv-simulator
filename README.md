# 🎮 嫂嫂模拟器 (Idol Dating Simulator) v1.3.1

> An immersive LLM-Agent-driven yuri dating simulator featuring K-pop girl groups.

![Version](https://img.shields.io/badge/version-1.3.1-e887b0)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA-blue)

---

## ✨ Features

- 🐉 **Free to start** — Qwen (Alibaba Cloud) is the default model, and new accounts get free credits on **each** of the three Qwen versions. Run one dry, switch to the next, keep playing.
- ⚡ **~10s per round** — Steady-state generation lands around 10 seconds with Deep Thinking off (the default), backed by a **~95.8% measured prompt-cache hit rate**.
- 🔄 **Regenerate & Copy** — Not happy with a round? Hit ↺ Retry for a fresh story on the same choice — stats, memory, KKT, and achievements all rewind cleanly. ⎘ Copy grabs the pure story text.
- 🧠 **Deep Thinking toggle** — Reasoning is OFF by default (fast, cheap, and it reads well). Flip it on in Settings when you want the model to deliberate.
- ⏳ **Time Speed control** — 🐌 Slow (linger in the moment) / 🕛 Normal / ⚡ Fast (skip ahead to the next date). Steers narrative pacing per round.
- 🌗 **Day / Night mode** — Full light and dark themes across every screen, including the social overlays and the PDF export.
- 🔠 **Text size** — One-tap A / A+ toggle for story, options, and chat overlays.
- 📖 **Export your full story** — Copy to clipboard, download `.txt`, or print / save as a styled PDF.
- 📚 **Built-in Help Center** — Guide, Issues, Error Codes, and Contact, in all three languages.
- 🤖 **LLM Agent Architecture** — Stepped-Window Memory Ledger + Member Probability Engine
- 👩‍👩‍👧‍👧 **Multi-Group Support** — Red Velvet, TWICE, aespa, NMIXX, IVE, ITZY, BLACKPINK, X, GNZ
- 🌐 **Multi-Language** — Chinese / English / Korean (UI + story generation)
- 📱 **4 Social Platforms** — Bubble, Instagram, Weverse, KakaoTalk (KKT)
- 🎭 **7+1 Player Identities** — Trainee, Staff, Artist, Fan, Student, Chaebol, Ex-Girlfriend, Custom
- 💾 **Save / Load System** — Cover-page quick load, save, delete
- 📲 **PWA Support** — Add to Home Screen (iOS + Android), fullscreen
- 🔑 **Multi-Model** — Qwen 3.8 Max / 3.7 Max / 3.7 Plus · DeepSeek V4 Flash · GPT-5.6 Luna · Gemini 3.5 Flash-Lite

---

## 🚀 Quick Start

1. Open 🎮 [https://byhanita.github.io/rv-simulator/](https://byhanita.github.io/rv-simulator/)
2. Enter your API Key. **Default: Qwen** — sign up at [platform.qianwenai.com](https://platform.qianwenai.com); new users get free credits, no top-up needed to start.
3. Select a girl group, choose your main member, and start your story.
4. Add to Home Screen (Share → Add to Home Screen) for a fullscreen app icon.

---

## 📖 How to Play

1. **Cover Page** — Select girl group → choose language → New Game or Load Save
2. **Key Input** — Paste your API Key → pick a model (and a Qwen version, if using Qwen)
3. **Character Creation** — Main member + Sub members + Identity + Name/Age + Pace
4. **Game** — Read story → choose A/B/C/D (or type a custom action) → repeat
5. **Social Media** — Check Bubble / Instagram / Weverse / KKT for member updates while the next round generates
6. **Settings (⚙️)** — Deep Thinking, Time Speed, Day/Night, Text Size, Export, Help, Switch Model
7. **Save** — Tap 💾 anytime

---

## ⚙️ Settings & Add-ons

| Control | Options | Effect |
| --- | --- | --- |
| 🧠 **Deep Thinking** | On / **Off (default)** | Off → faster, roughly half the cost, and story quality holds up. On → the model reasons before writing; richer output, ~2x cost, slower. |
| ⏳ **Time Speed** | 🐌 Slow / **🕛 Normal** / ⚡ Fast | Injected as a `[Pacing]` hint in the dynamic tail. Slow keeps the scene in place; Fast jumps ahead to the next event or date. |
| 🌗 **Day / Night** | Dark (default) / Light | Full theme swap. Persisted in `rv_sim_theme`. |
| 🔠 **Text Size** | A (1x) / A+ (1.25x) | Scales story, options, and social overlay text. |
| 📖 **Export** | Clipboard / `.txt` / PDF | Strips stat boxes and option lines — pure narrative, round by round. PDF respects your current theme. |
| 📚 **Help Center** | Guide / Issues / Errors / Contact | Reachable from the cover page, key page, and settings. |

---

## 💰 API Cost & Performance (v1.3.1)

**Reading time per round:** ~5 min (story ~2 min + socials ~2 min + choosing ~1 min). One full playthrough = 40 rounds ≈ **3h20min**.

**Steady-state token profile per round (Deep Thinking OFF):**

| Block | Tokens | Cache behavior |
| --- | --- | --- |
| Static system prompt (rules, lore, member profiles, schema) | ~5,500 | **100% hit** after R1 |
| History ledger (collapsed summaries + recent full stories) | ~2,300 | Append-only — hits except the newest entry |
| Dynamic tail (stats, affections, stage changes, KKT, pacing) | ~150 | Always miss, by design — kept tiny |
| **Total input** | **~8,000** | **~95.8% hit** (measured, steady state) |
| Output (story + social + options) | ~800 | — |

> 📊 The **~95.8% cache hit rate** and **~10s/round** generation time are measured from real player sessions on the v1.3.0+ stepped-window ledger, with reasoning off.

### Cost per model

| Model | Thinking | Cost / Round | Full Run (40r) | Gameplay / $1 |
| --- | --- | --- | --- | --- |
| **Qwen 3.7 Plus** 🐉 | ❌ Off *(Default)* | ~$0.0017 | ~$0.07 | ~49 hrs |
| Qwen 3.7 Plus | ✅ High | ~$0.0034 | ~$0.14 | ~25 hrs |
| **Qwen 3.7 Max** 🐉 | ❌ Off *(Default)* | ~$0.0061 | ~$0.24 | ~14 hrs |
| Qwen 3.7 Max | ✅ High | ~$0.0122 | ~$0.49 | ~7 hrs |
| **Qwen 3.8 Max** 🐉 | ❌ Off *(Default)* | ~$0.0085 | ~$0.34 | ~10 hrs |
| Qwen 3.8 Max | ✅ Medium | ~$0.0170 | ~$0.68 | ~5 hrs |
| **DeepSeek V4 Flash** 🐋 | ❌ Off *(Default)* | ~$0.0024 * | ~$0.10 * | ~35 hrs |
| DeepSeek V4 Flash | ✅ High | ~$0.0048 * | ~$0.19 * | ~17 hrs |
| **GPT-5.6 Luna** ⚡ | ❌ Off *(Default)* | ~$0.0023 | ~$0.09 | ~37 hrs |
| GPT-5.6 Luna | ✅ High | ~$0.0046 | ~$0.19 | ~18 hrs |
| **Gemini 3.5 Flash-Lite** 💎 | ❌ Off *(Default)* | ~$0.0029 | ~$0.12 | ~29 hrs |
| Gemini 3.5 Flash-Lite | ✅ High | ~$0.0058 | ~$0.23 | ~14 hrs |

> \* **DeepSeek repriced.** V4 Flash now bills **$0.022 / 1M cache-hit input · $0.66 / 1M cache-miss input · $1.98 / 1M output** off-peak, and **2x all three** during peak hours (01:00–04:00 and 06:00–10:00 UTC, Mon–Fri). Figures above are a 7-day blended average (~21% of hours are peak). This is a significant increase over its previous tier — DeepSeek went from the cheapest option to roughly mid-pack, which is part of why Qwen is now the default.
>
> ⚠️ Per-token prices for GPT-5.6 Luna and Gemini 3.5 Flash-Lite are estimates based on comparable tiers — verify on your provider's pricing page. DeepSeek and Qwen figures use published pricing.
>
> 💡 "Thinking ON" rows assume ~1,000–2,000 reasoning tokens billed at the output rate, which roughly doubles per-round cost. That is why reasoning ships **off by default**.

### 🐉 Why Qwen is the default

Alibaba Cloud grants new accounts a free token allowance **per model**, and the game exposes three Qwen versions:

| Version | Character | Free credits |
| --- | --- | --- |
| **Qwen 3.8 Max** | Flagship reasoning, highest story quality | ~1M tokens (~10–14 hrs) |
| **Qwen 3.7 Max** | Balanced quality and speed | ~1M tokens (~10–14 hrs) |
| **Qwen 3.7 Plus** | Most affordable, fastest | ~1M tokens (~10–14 hrs) |

That is roughly **30–40 hours of free gameplay** before you pay anything. When one version's credits run out, switch to another in Settings → Switch Model and keep going. Free credits are valid 90 days after sign-up.

---

## 🔄 Regenerate & Copy

After every round, two small buttons appear below the story:

- **↺ Retry** — Re-generates the story for the same player choice. Stats, memory ledger, KKT messages, achievements, and stage changes all rewind to exactly before the round ran, so the new generation starts clean. The previous version is replaced — no history page, no extra UI.
- **⎘ Copy** — Copies pure story text (no stats box, no option labels) to your clipboard.

---

## 🎉 What's New in v1.3.1

* 🐉 **Qwen is the new default** — three selectable versions (3.8 Max / 3.7 Max / 3.7 Plus), each with its own free-credit allowance for new users. `character-plus` was removed.
* 🧠 **Deep Thinking toggle, off by default** — cuts per-round cost roughly in half and generation time to ~10s with no meaningful drop in story quality. Every provider gets an explicit off-switch (DeepSeek `thinking:{type:'disabled'}`, Qwen `enable_thinking:'false'`), because some default to reasoning ON.
* ⏳ **Time Speed** — slow / normal / fast narrative pacing, injected into the dynamic tail so it never invalidates the cached prefix.
* 🌗 **Day / Night mode** and 🔠 **text-size toggle** across every screen.
* 📖 **Full-story export** — clipboard, `.txt`, or themed print-to-PDF.
* 📚 **Help Center overlay** — Guide / Issues / Error Codes / Contact, in zh · en · ko.
* 📈 **Measured results** — ~95.8% prompt-cache hit rate and ~10s/round in real player sessions.
* 💸 **DeepSeek V4 Flash repricing** documented (see cost table above).

## 🎉 What's New in v1.3.0

* 🧠 **Stepped Window Memory (Cache-Optimized)** — Replaced the sliding FIFO memory pool with an append-only history ledger. Instead of shifting past rounds forward every turn (which breaks the LLM's KV cache every single round), the engine keeps the context prefix byte-identical across consecutive rounds and collapses older stories in-place.
* 💎 **Gemini upgraded to 3.5 Flash-Lite** — lighter, more cost-efficient, thinking-budget capable.
* 🔗 **Unified API layer** — all models call through the same OpenAI-compatible format.

## 🎉 What's New in v1.2.0

* ⚡ **Lightning-Fast Generation** — wait times slashed from 2 minutes to under 30 seconds per round.
* 💰 **Massively Reduced API Costs** — token consumption per round is a fraction of earlier versions.
* 🧠 **Smarter Memory** — 2-Tier Memory Pool: long-term summaries + short-term full stories.

---

## 🎯 Tech Stack

- **Frontend** — React 18 + Vite, all inline styles (no CSS framework), mobile-first 390×844
- **LLM** — Qwen 3.8 Max / 3.7 Max / 3.7 Plus · DeepSeek V4 Flash · GPT-5.6 Luna · Gemini 3.5 Flash-Lite, through one unified OpenAI-compatible client
- **State** — React hooks only (no Redux/Zustand), `useRef` for non-rendering mutable data
- **i18n** — Custom translation engine (zh/en/ko) with `${var}` interpolation
- **PWA** — Web App Manifest + iOS/Android fullscreen

---

## 🏗️ Architecture

```
[Static System Prompt]  <- 100% cache hit after R1        (~5,500 tok)
       +
[History Ledger]        <- append-only; only newest misses (~2,300 tok)
  S1 S2 S3 ... F(k+1) ... Fn
       +
[Dynamic Tail]          <- stats, affections, KKT, pacing  (~150 tok)
       |
       v
LLM Agent (single API call, unified OpenAI-compat format, reasoning off by default)
       |
       v
JSON Output -> 4-level parse fallback -> Update UI
       |
       v
Social Media delayed display (check while the next round generates, ~10s)
```

### Why the cache hit rate matters

A naive sliding-window memory rewrites the prompt prefix every round, so **every** round is a full cache miss. The stepped-window ledger only ever *appends*, and when it collapses old stories it does so *in place* — the already-summarised prefix stays byte-identical. Result: ~95.8% of input tokens bill at the cache-hit rate (5–30x cheaper depending on provider) and time-to-first-token drops sharply.

---

## 📱 UI Layout

```
+------------------------------------------------------------+
|  Cover Page                                                |
|  +-------------------------------------------------------+ |
|  |                       [heart]                         | |
|  |                  Idol Dating Sim                      | |
|  |              LLM Text Adventure . v1.3.1              | |
|  |                                                       | |
|  |  [RV] [TWICE] [aespa] [NMIXX] [IVE] [ITZY] ...        | |
|  |              [ZH] [EN] [KO]   [day/night]             | |
|  |           [ New Game ]                                | |
|  |           [ Continue ]                                | |
|  |           [ API Key / Model ]                         | |
|  |             Help Center                               | |
|  +-------------------------------------------------------+ |
+------------------------------------------------------------+
|  Key Input Page                                            |
|  +-------------------------------------------------------+ |
|  |  API Key            [day/night] [Help]                | |
|  |  [Qwen] [DeepSeek] [GPT] [Gemini]                     | |
|  |  Qwen version: [3.8 Max] [3.7 Max] [3.7 Plus]         | |
|  |  [ sk-...                            ]  [Confirm]     | |
|  +-------------------------------------------------------+ |
+------------------------------------------------------------+
|  Setup Page                                                |
|  +-------------------------------------------------------+ |
|  |  Main Member: [Irene] [Wendy] [Yeri] ...              | |
|  |  Sub Members: [Seulgi] [Joy]                          | |
|  |  NPC: Seulgi, Joy                                     | |
|  |  Identity: [Trainee] [Staff] [Artist] [Fan] ...       | |
|  |  Info: [Name] [Age]     Pace: [Slow/Normal/Pressure]  | |
|  |  [ Back ]  [ Start with Irene ]                       | |
|  +-------------------------------------------------------+ |
+------------------------------------------------------------+
|  Game Screen                                               |
|  +-------------------------------------------------------+ |
|  | Irene        |  36 / 97 / 76 / R3  | INS WV KKT SAVE  | |
|  | [Flirting]   |  Wendy 15   Yeri 6                     | |
|  +-------------------------------------------------------+ |
|  | Irene updated bubble | Wendy updated bubble           | |
|  +-------------------------------------------------------+ |
|  | +====================+                                | |
|  | | Irene: 14/100      |                                | |
|  | | Self: 38  Sec: 97  |                                | |
|  | +====================+                                | |
|  | Story text (250-350 words)...        [Copy] [Retry]   | |
|  +-------------------------------------------------------+ |
|  | [A. Option 1] [B. Option 2] [C. Option 3] [D. Custom] | |
|  +-------------------------------------------------------+ |
|  | [Input_]  [Send]                                      | |
|  +-------------------------------------------------------+ |
+------------------------------------------------------------+
|  Settings Overlay                                          |
|  +-------------------------------------------------------+ |
|  | Settings          [day/night] [A+] [Help] [X]         | |
|  | Deep Thinking (Reasoning)              [ o---  ]      | |
|  |    OFF - faster responses, lower cost.                | |
|  | Time Speed                             [ -o--  ]      | |
|  |    Normal - default narrative pacing                  | |
|  | ----------------------------------------------------- | |
|  | [ Export Full Story ]                                 | |
|  | [ Switch Model / API Key ]                            | |
|  | [ Back to Cover Page ]                                | |
|  +-------------------------------------------------------+ |
+------------------------------------------------------------+
```

---

## 📁 Project Structure

```
├── public/
│   └── groups/            <- Girl group JSON configs (zh/en/ko) - 9 groups + _template
├── src/
│   ├── agent/             <- mainAgent.js, memoryPool.js, probabilityEngine.js
│   ├── config/            <- constants, model configs, stages, achievements, relationship events
│   ├── i18n/              <- Translation engine (zh/en/ko)
│   ├── platforms/         <- Bubble / Instagram / Weverse / Kakao / Save / Help overlays
│   ├── rag/               <- groupLoader.js + groupConfigTemplate.json
│   ├── tools/             <- llmTool.js (unified OpenAI-compatible client)
│   ├── App.jsx            <- all state, routing, themes, export, settings
│   └── utils.js           <- storage keys + helpers
├── index.html
├── deploy.sh
├── vite.config.js
└── package.json
```

---

## 🔧 Development

```bash
git clone https://github.com/byhAnita/rv-simulator.git
cd rv-simulator
npm install
npx vite                        # hot reload from src/
npm run build 2>&1 | tail -12   # validate build
npm run deploy                  # build + patch index.html + push main
```

---

### Full Architecture Diagram

```
+---------------------------------------------------------------------+
|          Idol Dating Sim  v1.3.1 - Architecture                     |
|        LLM Agent x Stepped Window Memory x Multi-Group              |
+---------------------------------------------------------------------+
|                                                                     |
|  Loader Layer                                                       |
|  |-- loadGroupIndex()       -> Cover page group buttons             |
|  |-- loadGroupConfig(id,ln) -> Trilingual JSON -> Background        |
|  +-- /groups/{id}/{zh,en,ko}.json                                   |
|                                                                     |
|  3-Tier Prompt (Static -> Ledger -> Dynamic Tail)                   |
|  +---------------------------------------------------------------+  |
|  | Tier 1 - Static System Prompt (100% cache hit after R1)        |  |
|  | |-- System instructions + Language rules                       |  |
|  | |-- Member profiles (personality / queer texture)              |  |
|  | |-- Identity backgrounds (7+1 types) + Pace rules              |  |
|  | |-- Social platform rules (Bubble/INS/Weverse/KKT)             |  |
|  | |-- NPC rules + Game rules + Prohibitions                      |  |
|  | +-- JSON Schema                                                |  |
|  |                                                                |  |
|  | Tier 2 - History Ledger (append-only, only newest misses)      |  |
|  | |-- Collapsed summaries S1 ... Sk (~100 chars each)            |  |
|  | +-- Recent full stories F(k+1) ... Fn (350-450 words each)     |  |
|  |                                                                |  |
|  | Tier 3 - Dynamic Tail (always cache miss, kept small)          |  |
|  | |-- Player stats + affections                                  |  |
|  | |-- Stage changes + NPC appearance state                       |  |
|  | |-- KKT messages (unlocked members)                            |  |
|  | +-- [Pacing] hint from the Time Speed setting                  |  |
|  +---------------------------------------------------------------+  |
|                  |  ~95.8% of input tokens bill at cache-hit rate   |
|                  v                                                  |
|  Member Probability Engine                                          |
|  Primary-member pick = Affection(40%) + Balance(30%)                |
|                        + Recency(20%) + Random(10%)                 |
|                                                                     |
|  4 Social Platform Simulation                                       |
|  |-- Bubble (Fan platform)   |-- Instagram (Photo social)           |
|  |-- Weverse (Community)     +-- KKT/KakaoTalk (Private, aff >= 30) |
|                                                                     |
|  Social Media Delayed Display (Optimized Waiting)                   |
|  +--------------------------------------------------------------+   |
|  | This round shows last round's social -> Player checks while   |   |
|  | waiting (~10s) -> New story generates in background           |   |
|  +--------------------------------------------------------------+   |
|                                                                     |
|  Settings: Reasoning . Time Speed . Theme . Font . Export           |
|  Save System | i18n (zh/en/ko) | 9 Groups                           |
+---------------------------------------------------------------------+
```

---

## 🔄 Round Flow

```
+-----------------------------------------------------------------+
|                    v1.3.1 Round Flow                            |
+-----------------------------------------------------------------+
|                                                                 |
|  Previous round ends (Player chose ABCD / custom)               |
|        |                                                        |
|  Step 0: preRoundSnapshotRef captures state (enables Retry)     |
|        |                                                        |
|  Step 1: collapseHistoryIfNeeded -> buildHistoryLedger +        |
|          buildDynamicTail (+ [Pacing] from Time Speed)          |
|        |                                                        |
|  Step 1.5: popPendingSocial() -> Display last round's social    |
|    |-- Notification bar + red dots -> Instant                   |
|    +-- Social UI -> View previous round content                 |
|        |                                                        |
|  Step 2: LLM Generation (single API call, ~10s reasoning off)   |
|    3 messages: [system][HISTORY][CURRENT STATE + choice]        |
|    Output JSON: {scene, statChanges, affectionChanges,          |
|      socialContent, kktMessages, story, summary, options}       |
|        |                                                        |
|  Step 3: Computation                                            |
|    |-- New stats = old + statChanges (clamped 0-100)            |
|    |-- New affections = old + affectionChanges (clamped)        |
|    |-- KKT filter (affection < 30 -> clear)                     |
|    |-- Stage change detection -> relationship events            |
|    |-- Achievement check                                        |
|    +-- pickPrimaryMember -> memberAppearances                   |
|        |                                                        |
|  Step 4: Store social to pendingSocialFeeds (for next round)    |
|        |                                                        |
|  Step 5: UI Refresh                                             |
|    |-- Top-left: Highest affection member + Stage               |
|    |-- Status bar: Player stats + Member affections             |
|    |-- Story area: Stats box + Story + Options + Copy/Retry     |
|    +-- KKT: Real-time this round                                |
|        |                                                        |
|  Step 6: Player reads + Chooses (or hits Retry -> back to 1)    |
|        |                                                        |
|  Step 7: updateMemory -> append {type:'full', text, choice,     |
|          summary} to the history ledger                         |
|        |                                                        |
|  ================== Next Round ==================               |
|                                                                 |
+-----------------------------------------------------------------+
```

---

## 📄 LLM JSON Output Schema

Single API call per round.

```js
{
  "scene": "Location description in the player's UI language",
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
    "<memberId>": ["message text"]
  },
  "story": "Story text in the player's UI language (250-350 words). Pure story, NO stat bars, NO options.",
  "summary": "One English sentence (~100 chars) - who appeared and what emotionally shifted this round.",
  "options": ["A. option text", "B. option text", "C. option text", "D. Custom"]
}
```

---

## 🧠 Stepped Window Memory

A single append-only `history[]` ledger. Each entry is either a collapsed `summary` (~100-char English sentence) or a `full` story (~350-450 words). The ledger never shifts — it only appends — so the token prefix stays byte-identical between consecutive rounds, enabling KV-cache hits.

```js
// createEmptyMemory() shape
{
  playerStats: null,        // {selfId, secrecy, mood, week, scene, chapter}
  affections: {},           // {memberId: number}
  topMemberId: null,
  history: [],              // [{round, type:'summary'|'full', text, choice?, summary?}]
  kktMessages: {},          // {memberId: [{sender, content}]} max Q=10 per member
  stageChanges: [],         // last 10
  memberAppearances: {},    // {memberId: [roundNums]} last 10
  npcAppearances: {},       // {memberId: lastRoundNum}
}
```

**Collapse rule** — when the `full` entry count reaches N=3, all `full` entries mutate in-place to `summary`, reusing the `summary` string the LLM already returned that round. One partial cache miss per N rounds; every other round hits.

**Batch prune** — once summaries exceed `HISTORY_PRUNE_BATCH * 3` (45), the oldest 15 are dropped in one hit: a single miss roughly every 45 rounds rather than a slow bleed.

**KKT injection** — dynamic tail only, never in the history ledger.

---

## 💾 Save / Load Compatibility

* `rv_sim_saves_v13` is the current schema.
* Any older save (`rv_sim_saves_v11`, `v12`) missing a `history` field is detected by `isLegacyMemory`, and memory is reset to `createEmptyMemory()` while stats, form, and affections are preserved. No crash.

---

## 📝 License

[MIT](LICENSE)
