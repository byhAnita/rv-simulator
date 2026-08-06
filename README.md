# 🎮 嫂嫂模拟器 (Idol Dating Simulator) v1.3.0

> An immersive LLM-Agent-driven yuri dating simulator featuring K-pop girl groups.

![Version](https://img.shields.io/badge/version-1.3.0-e887b0)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA-blue)

---

## ✨ Features

- 🔄 **Regenerate & Copy** — Not happy with how a round turned out? Hit ↺ Retry to get a completely new story for the same choice — stats, memory, and achievements all rewind cleanly. Copy the story text with one tap.
- ⚡ **Turbocharged Performance (v1.2.0)** — Lightning-fast round generation (<30s) and heavily optimized token context for massively reduced API costs.
- 🤖 **LLM Agent Architecture** — Memory Pool + Members Probability Engine
- 👩‍👩‍👧‍👧 **Multi-Group Support** — Red Velvet, TWICE, aespa, NMIXX, IVE, ITZY, BLACKPINK
- 🌐 **Multi-Language** — Chinese / English / Korean (UI + Story Generation)
- 📱 **4 Social Platforms** — Bubble, Instagram, Weverse, KakaoTalk (KKT)
- 🎭 **7+1 Player Identities** — Trainee, Staff, Artist, Fan, Student, Chaebol, Ex-Girlfriend, Custom
- 💾 **Save/Load System** — Cover page quick load, save, delete save
- 📲 **PWA Support** — Add to Home Screen (iOS + Android), fullscreen experience
- 🔑 **Multi-Model** — DeepSeek V4 Flash / Gemini 3.5 Flash-Lite / GPT-5.6 Luna / Qwen Plus Character

---

## 🚀 Quick Start

1. Open 🎮 [https://byhanita.github.io/rv-simulator/](https://byhanita.github.io/rv-simulator/)
2. Enter your API Key (top up and get one at [platform.deepseek.com](https://platform.deepseek.com))
3. Select a girl group → Choose your main member → Start your story!
4. Generate home screen icon by Share → Add to Home Screen.

---

## 📖 How to Play

1. **Cover Page**: Select girl group → Choose language → Start new game or load save
2. **Character Creation**: Main member + Sub members + Identity + Basic info
3. **Game**: Read story → Make choices (ABCD) → View social media → Repeat!
4. **Social Media**: Check Bubble/Instagram/Weverse/KKT for member updates
5. **Save**: Click 💾 anytime to save progress

---

## 💰 API Cost & Performance (v1.3.1)

**Reading time per round:** ~5 min (story ~2 min + socials ~2 min + choosing ~1 min). One full playthrough = 40 rounds ≈ **3h20min**.

**Token consumption per round (steady state, with v1.3.0 prefix caching):**

* Static system prompt: ~3,500 tokens → **100% cached** after R1
* History ledger: ~1,500 tokens (grows slowly) → **~2/3 rounds cached** (stepped window)
* Dynamic tail: ~150 tokens → always billed
* Output (story + social + options): ~800 tokens
* **Effective billed input/round: ~2,450 tokens** (accounting for cache hits)

> 💡 **v1.3.1 Note:** Reasoning / Extended Thinking (`reasoning_effort`) is **turned OFF by default** for all supported models. This slashes per-round costs by ~50% and speeds up generation time significantly without compromising story quality. You can re-enable reasoning in settings if deeper logical processing is desired.

| Model | Thinking | Cost / Round | Full Run (40r) | Gameplay / $1 |
| ------- | ------- | ------- | ------- | ------- |
| **Qwen Plus Character** | ❌ None | ~$0.0004 | ~$0.016 | ~208 hrs |
| **DeepSeek V4 Flash** | ❌ Off *(Default)* | ~$0.0015 * | ~$0.06 | ~56 hrs |
| DeepSeek V4 Flash | ✅ High | ~$0.003 * | ~$0.12 | ~28 hrs |
| **GPT-5.6 Luna** | ❌ Off *(Default)* | ~$0.0025 | ~$0.10 | ~34 hrs |
| GPT-5.6 Luna | ✅ High | ~$0.005 | ~$0.20 | ~17 hrs |
| **Gemini 3.5 Flash-Lite** | ❌ Off *(Default)* | ~$0.003 | ~$0.12 | ~28 hrs |
| Gemini 3.5 Flash-Lite | ✅ High | ~$0.0065 | ~$0.26 | ~13 hrs |

> 💡 Cache hit rounds (2 out of every 3) effectively reduce input cost by ~80–90%. Turning off reasoning tokens eliminates output overhead and cuts per-round cost roughly in half across all reasoning-capable models.
> 🐉 **Qwen Plus Character** is a roleplay-specialized model from Alibaba Cloud with extremely low per-token pricing (~50× cheaper than reasoning models). No thinking mode, but purpose-built for character consistency and expressive dialogue — ideal if you want to play many sessions on a tight budget.
> ⚠️ Pricing for DeepSeek V4 Flash and GPT-5.6 Luna are estimates based on similar model tiers — verify at your provider's pricing page. Gemini 3.5 Flash-Lite and Qwen Plus Character use published pricing.
> * DeepSeek peak = 2× cost during 9–12 & 14–18 Beijing Time. Cost shown is a daily average.


---

## 🔄 Regenerate & Copy

Not satisfied with how the story played out? After every round, two small buttons appear below the story:

- **↺ Retry** — Re-generates the story for the same player choice. Stats, memory pool, KKT messages, achievements, and stage changes all rewind to exactly before the round ran, so the new generation starts from a clean slate. The previous version is simply replaced — no history page, no extra UI.
- **⎘ Copy** — Copies the pure story text (no stats box, no option labels) to your clipboard. Useful for sharing screenshots or saving a favorite scene.

---

## 🎉 What’s New in v1.3.0

*   🧠 **Stepped Window Memory (Cache-Optimized):** Replaced the sliding FIFO memory pool with an append-only history ledger. Instead of shifting past rounds forward every turn (which breaks the LLM’s KV cache every single round), the engine now keeps the context prefix byte-identical across consecutive rounds and collapses older stories in-place. Result: roughly **2 out of every 3 rounds** get a deep cache hit on the history block — faster responses and meaningfully lower API costs.
*   💎 **Gemini upgraded to 3.5 Flash-Lite:** Switched from Gemini 3.6 Flash to Gemini 3.5 Flash-Lite — a lighter, more cost-efficient reasoning model with thinking budget support.
*   🤖 **Extended Thinking enabled on 3 models:** DeepSeek, GPT-5.6 Luna, and Gemini 3.5 Flash-Lite all run with high reasoning effort / extended thinking for noticeably richer story output.
*   🔗 **Unified API layer:** All 4 models now call through the same OpenAI-compatible format — simpler maintenance, consistent behavior.

## 🎉 What’s New in v1.2.0

*   ⚡ **Lightning-Fast Generation:** Wait times slashed from 2 minutes to **under 10 seconds** per round.
*   💰 **Massively Reduced API Costs:** Token consumption per round is a fraction of earlier versions.
*   🧠 **Smarter Memory:** Rewrote the context builder with a 2-Tier Memory Pool — long-term summaries + short-term full stories, nothing more.

---

## 🎯 Tech Stack

- **Frontend**: React 18 + Vite
- **LLM**: DeepSeek V4 Flash / Gemini 3.5 Flash-Lite / GPT-5.6 Luna / Qwen Plus Character
- **i18n**: Custom translation engine (zh/en/ko)
- **PWA**: Web App Manifest + iOS/Android fullscreen

---

## 🏗️ Architecture

```
[Static System Prompt]  ← 100% cache hit after R1
       +
[History Ledger]        ← append-only; 2/3 rounds cache hit
  S1 S2 S3 … F(k+1) … Fn
       +
[Dynamic Tail]          ← stats, affections, KKT; always small
       ↓
LLM Agent (single API call, unified OpenAI-compat format)
       ↓
JSON Output → Parse → Update UI
       ↓
Social Media delayed display (check while waiting ~30s)
```

---

## 📱 UI Layout


```

┌────────────────────────────────────────────────────────────┐
│  Cover Page                                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                       💗                              │ │
│  │                  Idol Dating Sim                      │ │
│  │              LLM Text Adventure · v1.2.0              │ │
│  │                                                       │ │
│  │  [💗RV] [🍭TWICE] [⚡aespa] [🐠NMIXX] [🌟IVE] ...   │ │
│  │              [中] [EN] [한]                           │ │
│  │           [✨ New Game]                               │ │
│  │           [💾 Continue]                               │ │
│  │           [🔑 API Key / Model]                        │ │
│  └───────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│  Setup Page                                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🌸 Main Member: [🐰Irene] [🐿️Wendy] [🐢Yeri] ...   │ │
│  │  🌿 Sub Members: [🐻Seulgi] [🐥Joy]                   │ │
│  │  🤝 NPC: 🐻Seulgi, 🐥Joy                              │ │
│  │  💼 Identity: [Trainee] [Staff] [Artist] [Fan] ...    │ │
│  │  📝 Info: [Name] [Age]                                │ │
│  │  [← Back]  [✨ Start with Irene]                      │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Game Screen                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🐰Irene      │  🌈36 🔒97 💫76 📅3  │ 💜📸🌿💬💾  │ │
│  │ [Flirting]   │ 🐿️15 🐢6                           | │

│  ├────────────────────────────────────────────────────────┤ │
│  │ 📱 Irene updated bubble │ Wendy updated bubble         │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ╔══════════════════════╗                               │ │
│  │ ║ 💗 🐰Irene: 14/100  ║                               │ │
│  │ ║ 🌈Self: 38 | 🔒Sec: 97║                               │ │
│  │ ╚══════════════════════╝                               │ │
│  │ Story text (250-350 words)...                          │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [A. Option 1] [B. Option 2] [C. Option 3] [D. Custom]  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [Input_] [↑]                                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

```

---

## 📁 Project Structure


```

├── public/
│   └── groups/            ← Girl group JSON configs (zh/en/ko)
├── src/
│   ├── agent/             ← Agent core (Main Agent, Memory Pool, Probability Engine)
│   ├── config/            ← Constants, LLM Model Config, Stage Config, Achievements, Relationship Events
│   ├── i18n/              ← Translation engine (zh/en/ko)
│   ├── platforms/         ← Social media & Save UI components
│   ├── rag/               ← loader (groupLoader.js)
│   └── tools/             ← LLM Tool
├── index.html
├── vite.config.js
└── package.json

```

---

## 🔧 Development

```bash
git clone [https://github.com/byhAnita/rv-simulator.git](https://github.com/byhAnita/rv-simulator.git)
cd rv-simulator
npm install
npx vite          # hot reload from src/
npm run build 2>&1 | tail -12 # clean build
npm run dev       # test on dev server

```

---

### Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│          Idol Dating Sim  v1.3.0 — Architecture                     │
│        LLM Agent × Stepped Window Memory × Multi-Group              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🚀 Loader Layer                                                    │
│  ├── loadGroupIndex() → Cover page group buttons                     │
│  ├── loadGroupConfig(id, lang) → Trilingual JSON → Background        │
│  └── /groups/{id}/{zh,en,ko}.json                                    │
│                                                                     │
│  🧠 3-Tier Prompt (Static → Ledger → Dynamic Tail)                 │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ Tier 1 — Static System Prompt (100% cache hit after R1)   │   │
│  │ ├── System instructions + Language rules                      │   │
│  │ ├── Member profiles (personality/queer texture)               │   │
│  │ ├── Identity backgrounds (7+1 types)                          │   │
│  │ ├── Social platform rules (Bubble/INS/Weverse/KKT)            │   │
│  │ ├── NPC rules + Game rules + Prohibitions                     │   │
│  │ └── JSON Schema                                               │   │
│  │                                                               │   │
│  │ Tier 2 — History Ledger (append-only, ~2/3 cache hit)     │   │
│  │ ├── Collapsed summaries S1 … Sk (~100 chars each)             │   │
│  │ └── Recent full stories F(k+1) … Fn (350-450 words each)     │   │
│  │                                                               │   │
│  │ Tier 3 — Dynamic Tail (always cache miss, kept small)     │   │
│  │ ├── Player stats (🌈🔒💫📅) + affections                    │   │
│  │ ├── Stage changes + NPC appearance state                      │   │
│  │ └── KKT messages (round-relevant members only)                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  🔄 Multi-NPC Probability Engine                                    │ 
│  Probability = Affection(40%) + Balance(30%) + Cooldown(20%) + Random│
│                                                                     │
│  📱 4 Social Platform Simulation                                     │
│  ├── Bubble (Fan platform)  ├── Instagram (Photo social)             │
│  ├── Weverse (Community)    └── KKT/KakaoTalk (Private, ≥30 aff)     │
│                                                                     │
│  🎵 Social Media Delayed Display (Optimized Waiting)                 │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ This round shows last round's social → Player checks while   │    │
│  │ waiting (~30s) → New story generates in background           │    │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  💾 Save System │ 🌐 i18n (zh/en/ko) │ 🎭 Multi-Group              │
└─────────────────────────────────────────────────────────────────────┘

```

---

## 🔄 Round Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    v1.3.0 Round Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Previous round ends (Player chose ABCD)                        │
│        ↓                                                        │
│  ═══════════════ Current Round ═══════════════                  │
│        ↓                                                        │
│  Step 1: collapseHistoryIfNeeded → buildHistoryLedger +         │
│          buildDynamicTail (3-tier prompt assembly)              │
│        ↓                                                        │
│  Step 1.5: 🔥 popPendingSocial() → Display last round's social │
│    ├── Notification bar + red dots → Instant                    │
│    └── Social UI → View previous round content                  │
│        ↓                                                        │
│  Step 2: LLM Generation (Single API call - HIGH SPEED)          │
│    Input: Build Context + Player choice → Output: JSON          │
│    {statChanges, affectionChanges, socialContent,               │
│     kktMessages, story, summary, options}                       │
│        ↓                                                        │
│  Step 3: Computation                                            │
│    ├── New stats = old + statChanges                            │
│    ├── New affections = old + affectionChanges                  │
│    ├── KKT filter (affection < 30 → clear)                      │
│    ├── Stage change detection                                   │
│    ├── Relationship events + Achievements                       │
│    └── Multi-NPC probability engine                             │
│        ↓                                                        │
│  Step 4: Store social to global variable (for next round)       │
│        ↓                                                        │
│  Step 5: UI Refresh                                             │
│    ├── Top-left: Highest affection member + Stage               │
│    ├── Status bar: Player 6 stats + Member affections           │
│    ├── Story area: Stats box + Story + Options                  │
│    └── KKT: Real-time this round                                │
│        ↓                                                        │
│  Step 6: Player reads + Chooses                                 │
│        ↓                                                        │
│  Step 7: updateMemory → append historyEntry {type:'full'} to   │
│          history ledger                                         │
│        ↓                                                        │
│  ═══════════════ Next Round ═══════════════                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

```

---

## 📄 LLM JSON Output Schema

Single API call

```js
{
  "scene": "Location description in ${lr.lang}",
  "statChanges": { "selfId": 0, "secrecy": 0, "mood": 0 },
  "affectionChanges": { "${mainId}": 0${subIds.map(id => `, "${id}": 0`).join("")} },
  "socialContent": {
    ${mainSocial}${subIds.length > 0 ? ",\n    " + subSocials : ""}
  },
  "kktMessages": {
    ${kktFields}
  },
  "story": "Story text in ${lr.lang} (250-350 words). Pure story, NO stat bars, NO options.",
  "summary": "One English sentence (~100 chars) summary of the round it just wrote, capturing who appeared and what emotionally shifted this round.",
  "options": ["A. option text", "B. option text", "C. option text", "D. Custom"]
}

```

---

## 🧠 Stepped Window Memory (v1.3.0)

A single append-only `history[]` ledger replaces the old 2-tier FIFO pool. Each entry is either a collapsed `summary` (~100-char English sentence) or a `full` story (~350-450 words). The ledger never shifts — it only ever appends — so the token prefix stays byte-identical between consecutive rounds, enabling LLM KV cache hits.

```js
// createEmptyMemory() shape
{
  playerStats: null,
  affections: {},
  history: [],       // [{round, type:'summary'|'full', text, choice?, summary?}]
  kktMessages: {},   // {memberId: [{sender, content}]} max Q=10 per member
  stageChanges: [],
  memberAppearances: {},
  npcAppearances: {},
}
```

**Collapse rule:** when `full` entry count reaches N=3, all `full` entries mutate in-place to `summary` (using the `summary` string the LLM already returned that round). One cache miss per N rounds; all other rounds hit.

**KKT injection:** only members selected by the probability engine for the current round. Injected in the dynamic tail, never in the history ledger.

---

## 💾 Save/load compatibility

* `rv_sim_saves_v13` is the current schema.
* Any older save (`rv_sim_saves_v11`, `v12`) missing a `history` field is detected by `isLegacyMemory` → memory wiped to `createEmptyMemory()`, stats and affections preserved. No crash.

---

## 📝 License

MIT License — Fan-made non-profit project. All idol content is fictional parallel-universe creation and does not represent real artists.

---