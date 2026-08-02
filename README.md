# 🎮 嫂嫂模拟器 (Idol Dating Simulator) v1.2.0

> An immersive LLM-Agent-driven yuri dating simulator featuring K-pop girl groups.

![Version](https://img.shields.io/badge/version-1.2.0-e887b0)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA-blue)

---

## ✨ Features

- ⚡ **Turbocharged Performance (v1.2.0)** — Lightning-fast round generation (<30s) and heavily optimized token context for massively reduced API costs.
- 🤖 **LLM Agent Architecture** — Memory Pool + Members Probability Engine
- 👩‍👩‍👧‍👧 **Multi-Group Support** — Red Velvet, TWICE, aespa, NMIXX, IVE, ITZY, BLACKPINK
- 🌐 **Multi-Language** — Chinese / English / Korean (UI + Story Generation)
- 📱 **4 Social Platforms** — Bubble, Instagram, Weverse, KakaoTalk (KKT)
- 🎭 **7+1 Player Identities** — Trainee, Staff, Artist, Fan, Student, Chaebol, Ex-Girlfriend, Custom
- 💾 **Save/Load System** — Cover page quick load, save, delete save
- 📲 **PWA Support** — Add to Home Screen (iOS + Android), fullscreen experience
- 🔑 **Multi-Model** — DeepSeek V4 Flash / Gemini 3.6 Flash / GPT-5.6 Luna / Claude 4.5 Haiku

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

## 💰 API Cost & Performance (v1.2.0 Update 🎉)

> **Major Update:** Wait times have been slashed from 2 minutes to **<30 seconds** per round! Through advanced prompt optimization and context caching, token consumption is now a fraction of previous versions.
> 
> Estimated at ~2,000 input + ~450 output tokens/round. ~30-45 sec/round, 40 rounds = one full playthrough.

| Model | Cost / Round | Gameplay / $1 | Full Run Cost |
|-------|-------------|--------------|--------------|
| DeepSeek V4 Flash | ~$0.0005 * | ~65 hrs | ~$0.02 |
| GPT-5.6 Luna | ~$0.001 | ~33 hrs | ~$0.04 |
| Claude Haiku 4.5 | ~$0.005 | ~6.6 hrs | ~$0.20 |
| Gemini 3.6 Flash | ~$0.007 | ~4.7 hrs | ~$0.28 |

> \* DeepSeek adopts peak/off-peak pricing (peak = 2× during 9–12 & 14–18 Beijing Time). Cost shown is a daily average.
>
> 💡 **DeepSeek remains incredibly cost-effective** — $1 gets you ~2,000 rounds (~50 complete playthroughs). All estimates assume cache-miss pricing; real costs with prompt caching are even lower!

---

## 🎉 What's New in v1.2.0

Version 1.2.0 is a massive optimization update focused entirely on **player experience, speed, and API cost reduction**.

*   ⚡ **Lightning-Fast Generation:** We’ve slashed the wait time between rounds from over 2 minutes down to **under 30 seconds**. The story keeps flowing without breaking your immersion.
*   💰 **Massively Reduced API Costs:** By heavily optimizing how the game talks to the AI, token consumption per round is now a fraction of what it used to be. $1 on DeepSeek now yields roughly ~2,000 rounds (~50 complete playthroughs).
*   🧠 **Smarter, Lighter Memory:** Characters still remember your past interactions, but the game no longer drags unnecessary baggage into every round. 
*   **Under the Hood:** We rewrote the prompt context builder and introduced a **2-Tier Memory Pool**. Instead of feeding the AI huge walls of past text, the engine now seamlessly separates long-term narrative summaries from immediate short-term scene details, injecting exactly what is needed and nothing more.

---

## 🎯 Tech Stack

- **Frontend**: React 18 + Vite
- **LLM**: DeepSeek V4 Flash / Gemini 3.6 Flash / GPT-5.6 Luna / Claude 4.5 Haiku
- **i18n**: Custom translation engine (zh/en/ko)
- **PWA**: Web App Manifest + iOS/Android fullscreen

---

## 🏗️ Architecture


```

Context = Background + 2-Tier Memory Pool (Long + Short)
↓
LLM Agent (Optimized Context Payload — single API call)
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
│          Idol Dating Sim  v1.2.0 — Architecture                     │
│        LLM Agent × 2-Tier Memory Pool × Multi-Group                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🚀 Loader Layer                                                    │
│  ├── loadGroupIndex() → Cover page group buttons                     │
│  ├── loadGroupConfig(id, lang) → Trilingual JSON → Background        │
│  └── /groups/{id}/{zh,en,ko}.json                                    │
│                                                                     │
│  🧠 Context = Background + 2-Tier Memory Pool (Long + Short)        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ Background (Static, loaded)                               │   │
│  │ ├── System instructions + Language rules                      │   │
│  │ ├── Member profiles (personality/queer texture)               │   │
│  │ ├── Identity backgrounds (7+1 types)                          │   │
│  │ ├── Social platform rules (Bubble/INS/Weverse/KKT)            │   │
│  │ ├── NPC rules + Game rules + Prohibitions                     │   │
│  │ └── JSON Schema                                               │   │
│  │                                                               │   │
│  │ Memory Pool (recent M rounds summary + N rounds full)         │   │
│  │ ├── Player stats (🌈🔒💫📅)                                 │   │
│  │ ├── Member affections (main + sub)                            │   │
│  │ ├── Recent M rounds summary                                   │   │
│  │ ├── Recent N rounds full story                                │   │
│  │ ├── Recent Q rounds KKT messages per member                   │   │
│  │ └── NPC appearance frequency                                  │   │
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
│                    v1.2.0 Round Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Previous round ends (Player chose ABCD)                        │
│        ↓                                                        │
│  ═══════════════ Current Round ═══════════════                  │
│        ↓                                                        │
│  Step 1: Parse Context (Background + 2-Tier Memory Pool)        │
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
│  Step 7: Memory Update (recent M rounds summary + N rounds full)│
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

## 🧠 2-Tier Memory Pool

```
| Tier | Content | Length | Purpose |
|---|---|---|---|
| Tier 1 (Long) | Last M round summaries | ~100 chars each | Long-term narrative continuity |
| Tier 2 (Short) | Last N round full stories | Full text | Immediate context + detail |

```

Memory shape (`createEmptyMemory`)

```js
{
  playerStats: null,
  affections: {},
  topMemberId: null,
  summaries: [],        // [{round, memberId, summary}]  max M, FIFO
  fullStories: [],      // [{round, story, playerChoice}] max N, FIFO
  kktMessages: {},      // {memberId: [{sender, content}]} max Q per member
  stageChanges: [],
  memberAppearances: {},
  npcAppearances: {},
  // socialPosts REMOVED — social content is ephemeral, displayed next round and discarded
}

```

* Stored per round as `{ round, memberId, summary }` — `memberId` = main member of that scene
* Never displayed to the player; only used to build next-round prompt context

---

## 🚀 Prompt Injection (`buildMemoryContext`)

```
[Long Memory — up to M=15 summaries]
R3(irene): Late-night practice, she fixed your collar, tension rose.
R4(wendy): Group meal, Wendy kept refilling your drink.
...

[Recent Stories — last N=3 rounds]
=== Round 15 ===
<full story text>
Choice: B

=== Round 16 ===
...

```

KKT injection rule

* KKT history is stored per member ID in `kktMessages`, max Q=10 messages each
* At prompt build time, inject **only the KKT entries for members selected by the probability engine for this round** (i.e. members who will appear in the story)
* Members with affection < 30 still cannot unlock KKT (existing rule unchanged)

---

## 💾 Save/load compatibility

* `rv_sim_saves_v12` supersedes previous shapes.
* `rv_sim_saves_v11` shape changes: `storyRounds` → `summaries` + `fullStories`, `socialPosts` removed.
* Old saves are **intentionally broken** by this change to prevent token bloat.
* Migration guard: on save load, if `memory.summaries === undefined`, reset memory to `createEmptyMemory()` and log a warning — do not crash.

---

## 📝 License

MIT License — Fan-made non-profit project. All idol content is fictional parallel-universe creation and does not represent real artists.

```

---