# 🎮 嫂嫂模拟器 (Idol Dating Simulator) v11.1

> An immersive LLM-Agent-driven yuri dating simulator featuring K-pop girl groups.

![Version](https://img.shields.io/badge/version-11.1-e887b0)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA-blue)

---

## ✨ Features

- 🤖 **LLM Agent Architecture** — Memory Pool + Multi-NPC Probability Engine
- 👩‍👩‍👧‍👧 **Multi-Group Support** — Red Velvet, TWICE, aespa, NMIXX, IVE, ITZY, BLACKPINK
- 🌐 **Multi-Language** — Chinese / English / Korean (UI + Story Generation)
- 📱 **4 Social Platforms** — Bubble, Instagram, Weverse, KakaoTalk (KKT)
- 🎭 **7+1 Player Identities** — Trainee, Staff, Artist, Fan, Student, Chaebol, Ex-Girlfriend, Custom
- 💾 **Save/Load System** — Cover page quick load, overwrite save, delete save
- 📲 **PWA Support** — Add to Home Screen (iOS + Android), fullscreen experience
- 🔑 **Multi-Model** — DeepSeek V3 / Gemini 2.5 Flash / Claude 3.5 Haiku / GPT-4o Mini

---

## 🚀 Quick Start

1. Open [https://byhanita.github.io/rv-simulator/](https://byhanita.github.io/rv-simulator/)
2. Enter your API Key (get one at [platform.deepseek.com](https://platform.deepseek.com))
3. Select a girl group → Choose your main member → Start your story!

---

## 📖 How to Play

1. **Cover Page**: Select girl group → Choose language → Start new game or load save
2. **Character Creation**: Main member + Sub members + Identity + Basic info
3. **Game**: Read story → Make choices (ABCD) → View social media → Repeat!
4. **Social Media**: Check Bubble/Instagram/Weverse/KKT for member updates
5. **Save**: Click 💾 anytime to save progress

---

## 💰 API Cost

| Model | Cost per Round | Free Tier |
|-------|---------------|-----------|
| DeepSeek V3 | ~$0.001 | Signup credits |
| Gemini 2.5 Flash | Free | 1500 req/day |
| Claude 3.5 Haiku | ~$0.003 | — |
| GPT-4o Mini | ~$0.002 | — |

> 💡 **~1 USD = ~1,500 rounds** — enough to play from strangers to marriage!

---

## 🎯 Tech Stack

- **Frontend**: React 18 + Vite
- **LLM**: DeepSeek V3 / Gemini 2.5 Flash / Claude 3.5 Haiku / GPT-4o Mini
- **i18n**: Custom translation engine (zh/en/ko)
- **RAG**: Dynamic group config loading from JSON
- **PWA**: Web App Manifest + iOS/Android fullscreen

---

## 🔧 Development

```bash
git clone https://github.com/byhAnita/rv-simulator.git
cd rv-simulator-v11
npm install
npx vite
```

---

## 📁 Project Structure

```
rv-simulator-v11/
├── public/
│   └── groups/           ← Girl group JSON configs (zh/en/ko)
├── src/
│   ├── agent/            ← Agent core (Main Agent, Memory Pool, Probability Engine)
│   ├── config/           ← Constants, Stage Config, Achievements, Relationship Events
│   ├── i18n/             ← Translation engine (zh/en/ko)
│   ├── platforms/        ← Social media UI components
│   ├── rag/              ← RAG loader (groupLoader.js)
│   └── tools/            ← LLM Tool
├── index.html
├── vite.config.js
└── package.json
```

---

## 🏗️ Architecture

```

Context = Background (RAG) + Memory Pool (5 rounds)
↓
LLM Agent (single API call)
↓
JSON Output → Parse → Update UI
↓
Social Media delayed display (check while waiting)

```

### Full Architecture Diagram

```

┌─────────────────────────────────────────────────────────────────────┐
│          Idol Dating Sim  v11.1 — Final Architecture                │
│        LLM Agent × RAG × Memory Pool × Multi-Group                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🚀 RAG Layer                                                       │
│  ├── loadGroupIndex() → Cover page group buttons                     │
│  ├── loadGroupConfig(id, lang) → Trilingual JSON → Background        │
│  └── /groups/{id}/{zh,en,ko}.json                                    │
│                                                                      │
│  🧠 Context = Background + Memory Pool                              │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ Background (Static, RAG-loaded)                               │   │
│  │ ├── System instructions + Language rules                      │   │
│  │ ├── Member profiles (personality/queer texture)               │   │
│  │ ├── Identity backgrounds (7+1 types)                          │   │
│  │ ├── Social platform rules (Bubble/INS/Weverse/KKT)            │   │
│  │ ├── NPC rules + Game rules + Prohibitions                     │   │
│  │ └── JSON Schema                                               │   │
│  │                                                               │   │
│  │ Memory Pool (5 rounds, refreshed)                             │   │
│  │ ├── Player stats (🌈🔒👁📊💫📅)                             │   │
│  │ ├── Member affections (main + sub)                            │   │
│  │ ├── Recent 5 rounds story + choices                           │   │
│  │ ├── Social media history                                      │   │
│  │ ├── KKT private messages                                      │   │
│  │ └── NPC appearance frequency                                  │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  🔄 Multi-NPC Probability Engine                                    │ 
│  Probability = Affection(40%) + Balance(30%) + Cooldown(20%) + Random│
│                                                                      │
│  📱 4 Social Platform Simulation                                     │
│  ├── Bubble (Fan platform)  ├── Instagram (Photo social)             │
│  ├── Weverse (Community)    └── KKT/KakaoTalk (Private, ≥30 aff)     │
│                                                                      │
│  🎵 Social Media Delayed Display (Optimized Waiting)                │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ This round shows last round's social → Player checks while   │    │
│  │ waiting → New story generates in background                  │    │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  💾 Save System │ 🌐 i18n (zh/en/ko) │ 🎭 Multi-Group              │
└─────────────────────────────────────────────────────────────────────┘

```

---

## 🔄 Round Flow

```

┌─────────────────────────────────────────────────────────────────┐
│                    v11.1 Round Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Previous round ends (Player chose ABCD)                        │
│       ↓                                                         │
│  ═══════════════ Current Round ═══════════════                  │
│       ↓                                                         │
│  Step 1: Parse Context (Background + Memory Pool)               │
│       ↓                                                         │
│  Step 1.5: 🔥 popPendingSocial() → Display last round's social │
│    ├── Notification bar + red dots → Instant                    │
│    └── Social UI → View previous round content                  │
│       ↓                                                         │
│  Step 2: LLM Generation (Single API call)                       │
│    Input: Context + Player choice → Output: JSON                │
│    {statChanges, affectionChanges, socialContent,               │
│     kktMessages, story, options}                                │
│       ↓                                                         │
│  Step 3: Computation                                            │
│    ├── New stats = old + statChanges                            │
│    ├── New affections = old + affectionChanges                  │
│    ├── KKT filter (affection < 30 → clear)                      │
│    ├── Stage change detection                                   │
│    ├── Relationship events + Achievements                       │
│    └── Multi-NPC probability engine                             │
│       ↓                                                         │
│  Step 4: Store social to global variable (for next round)       │
│       ↓                                                         │
│  Step 5: UI Refresh                                             │
│    ├── Top-left: Highest affection member + Stage               │
│    ├── Status bar: Player 6 stats + Member affections           │
│    ├── Story area: Stats box + Story + Options                  │
│    └── KKT: Real-time this round                                │
│       ↓                                                         │
│  Step 6: Player reads + Chooses                                 │
│       ↓                                                         │
│  Step 7: Memory Update (keep 5 rounds)                          │
│       ↓                                                         │
│  ═══════════════ Next Round ═══════════════                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

```

---

## 📱 UI Layout

```

┌────────────────────────────────────────────────────────────┐
│  Cover Page                                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                        💗                             │ │
│  │                    Idol Dating                        │ │
│  │          AI Text Adventure · v11.1 RAG                │ │
│  │                                                       │ │
│  │  [💗RV] [🍭TWICE] [⚡aespa] [🐠NMIXX] [🌟IVE] ...   │ │
│  │              [中] [EN] [한]                            │ │
│  │         [✨ New Game]                                 │ │
│  │         [💾 Continue]                                 │ │
│  │         [🔑 API Key / Model]                          │ │
│  └───────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│  Setup Page                                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🌸 Main Member: [🐰Irene] [🐿️Wendy] [🐢Yeri] ...   │ │
│  │  🌿 Sub Members: [🐻Seulgi] [🐥Joy]                  │ │
│  │  🤝 NPC: 🐻Seulgi, 🐥Joy                             │ │
│  │  💼 Identity: [Trainee] [Staff] [Artist] [Fan] ...    │ │
│  │  📝 Info: [Name] [Age]                                │ │
│  │  [← Back]  [✨ Start with Irene]                      │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Game Screen                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🐰Irene [Flirting]│ 🌈36 🔒97 👁29 📊55 💫76 📅3    │ │
│  │                    │ 🐿️15 🐢6      │ 💜📸🌿💬 💾   │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 📱 Irene updated bubble │ Wendy updated bubble        │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ╔══════════════════════╗                               │ │
│  │ ║ 💗 🐰Irene: 14/100  ║                               │ │
│  │ ║ 🌈Self: 38 | 🔒Sec: 97║                             │ │
│  │ ╚══════════════════════╝                               │ │
│  │ Story text (300-500 words)...                          │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [A. Option 1] [B. Option 2] [C. Option 3] [D. Custom]  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ [Input_] [↑]                                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

```

---

## 📝 License

MIT License — Fan-made non-profit project. All idol content is fictional parallel-universe creation and does not represent real artists.

---

<p align="center">Made with 💗 by <a href="https://github.com/byhAnita">byhAnita</a></p>
