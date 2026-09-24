# 🎮 嫂嫂模拟器 (Idol Dating Simulator) v1.3.9

> An immersive LLM-Agent-driven yuri dating simulator featuring K-pop girl groups.

![Version](https://img.shields.io/badge/version-1.3.9-e887b0)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20PWA-blue)

---

## ✨ Features

- 🐉 **Free to start** — Aliyun (Alibaba Cloud) is the default provider. New accounts get ~1M free tokens on **each** of 28 JSON-capable models (Qwen, DeepSeek, GLM), and the game's **free-credit mode switches models for you** when one runs dry.
- ⚡ **~6-17s per round** — Median generation time with Deep Thinking off (the default) is **6.3s on DeepSeek Official V4.1 Flash** and **~16-17s on Aliyun's flash models** — it depends on the provider, not on the game. Backed by a prompt-cache hit rate of **~87% measured in clean sequential play, up to ~95.8% in long sessions with retries**, against a calculated steady-state ceiling of ~92%. See the note under the token table.
- 🔄 **Regenerate, Edit & Copy** — Not happy with a round? ↺ Retry rewrites it on the same choice, rewinding stats, memory, KKT and achievements cleanly. ✎ Edit lets you reword the generated story, or change your last choice and replay the round — the model reads your edit from then on. ⎘ Copy grabs the pure story text.
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
- 🔑 **Multi-Model** — Aliyun (28-model free route, or 9 paid picks across Qwen / DeepSeek / GLM) · DeepSeek V4.1 Flash · GPT-6 Luna · Gemini 3.5 Flash-Lite
- 🩺 **Readable errors** — failures show one short line in your language (credits used up, server busy, key invalid…) instead of raw API text

---

## 🚀 Quick Start

1. Open 🎮 [https://byhanita.github.io/rv-simulator/](https://byhanita.github.io/rv-simulator/)
2. Enter your API Key. **Default: Aliyun, free-credit mode** — sign up at [platform.qianwenai.com](https://platform.qianwenai.com); new users get free credits, no top-up needed to start. Turn **ON** "stop when free quota is used up" in the console so you are never billed by surprise.
3. Select a girl group, choose your main member, and start your story.
4. Add to Home Screen (Share → Add to Home Screen) for a fullscreen app icon.

---

## 📖 How to Play

1. **Cover Page** — Select girl group → choose language → New Game or Load Save
2. **Key Input** — Paste your API Key → pick a provider (for Aliyun: 🎁 Free credits or 💳 Paid + model)
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

## 💰 API Cost & Performance (v1.3.9)

**Reading time per round:** ~5 min (story ~2 min + socials ~2 min + choosing ~1 min). One full playthrough = 40 rounds ≈ **3h20min**.

**Steady-state token profile per round (Deep Thinking OFF):**

| Block | Tokens | Cache behavior |
| --- | --- | --- |
| Static system prompt (rules, lore, member profiles, schema) | ~5,500 | **100% hit** after R1 |
| History ledger (collapsed summaries + recent full stories) | ~2,300 | Append-only — hits except the newest entry |
| Dynamic tail (stats, affections, stage changes, KKT, pacing) | ~150 | Always miss, by design — kept tiny |
| **Total input** | **~8,000** | **~92% hit** (calculated steady state — see below) |
| Output (story + social + options) | ~800 | — |

> 📊 **Four cache numbers appear in this project, and they are not interchangeable.** All are for the v1.3.0+ stepped-window ledger with reasoning off.
>
> | Figure | Source | What it is |
> | --- | --- | --- |
> | **~92%** | calculated from the token profile above | The **estimated ceiling** for clean sequential play. Not a measurement. |
> | **86.7%** | DeepSeek Official billing — 40 rounds, hand-played, no retries (2026-09-24) | A real clean run, and still climbing at round 40. |
> | **~95.8%** | DeepSeek Official billing — hours of real play | Long sessions **with regenerates**, which is what lifts it past the ceiling above. |
> | **~83%** | Aliyun, across free-route models | A different provider with a coarser cache. Not comparable to the DeepSeek rows. |
>
> The ~92% falls straight out of the table: the ~5,500-token static prompt hits every round, while the newest ledger entry (~500) and the dynamic tail (~150) always miss — so roughly 7,300 of ~7,950 input tokens *can* hit, before the extra misses each collapse adds. **That is arithmetic, not a measurement.** The honest reading is that clean play converges toward it, not toward 95.8%.
>
> **86.7% sits below it** because a session average includes the beginning: round 1 is structurally 0%, and early rounds never fully wash out of a cumulative figure. Watched live, it climbed from ~50% to 87% across the 40 rounds.
>
> **~95.8% sits above it** because ↺ Retry re-sends a prompt that was cached moments earlier — a near-100% cache-hit call by construction. A session with many retries reads higher than one without. Both are real; they measure different play.
>
> Expect the low end if you never tap ↺, and expect any single figure to track your provider's cache rather than this game.
>
> ⏱️ **Generation time is the provider's, not the game's.** The same 40-round session measured a **6.3s median** round on DeepSeek Official V4.1 Flash, read straight from the in-game usage panel. Aliyun's flash models measured **~16–17s median** in the test harness on the same day. Deep Thinking roughly doubles either. Social media is displayed one round late precisely so there is something to read while the next round generates.

### Cost per model

#### 🐉 Aliyun — paid mode (thinking off)

Aliyun bills in CNY; USD columns convert at ￥7.1 = $1.

| Model | ￥ / Round | $ / Round | Full Run (40r) | Gameplay / ￥1 | Gameplay / $1 |
| --- | --- | --- | --- | --- | --- |
| **Qwen 3.8 Max** *(default)* | ~￥0.060 | ~$0.0085 | ~$0.34 | ~1.4 hrs | ~10 hrs |
| Qwen 3.8 Flash | ~￥0.0032 | ~$0.00045 | ~$0.018 | ~26 hrs | ~190 hrs |
| Qwen 3.7 Plus | ~￥0.012 | ~$0.0017 | ~$0.07 | ~7 hrs | ~49 hrs |
| Qwen 3.6 Flash † | ~￥0.0080 | ~$0.0011 | ~$0.045 | ~10 hrs | ~74 hrs |
| DeepSeek V4 Pro | ~￥0.031 | ~$0.0044 | ~$0.17 | ~2.7 hrs | ~19 hrs |
| DeepSeek V4 Pro 0813 * | ~￥0.025 | ~$0.0035 | ~$0.14 | ~3.3 hrs | ~24 hrs |
| DeepSeek V4.1 Flash * | ~￥0.0068 | ~$0.00096 | ~$0.038 | ~12 hrs | ~87 hrs |
| DeepSeek V4 Flash 0731 * | ~￥0.0083 | ~$0.0012 | ~$0.047 | ~10 hrs | ~71 hrs |
| GLM-5.2 | ~￥0.040 | ~$0.0057 | ~$0.23 | ~2.1 hrs | ~15 hrs |

> \* **Peak pricing on Aliyun DeepSeek.** Prices double outside off-peak hours (off-peak = 22:00–08:00 Beijing time), so figures are a daily blend with 14 of 24 hours at peak. Off-peak (per 1M tokens, cache-hit / miss / output): V4.1 Flash ￥0.1 / ￥1 / ￥4 · V4 Flash 0731 ￥0.15 / ￥1.5 / ￥4.5 · V4 Pro 0813 ￥0.45 / ￥4.5 / ￥13.5. Flat-rate: V4 Pro ￥1 / ￥12 / ￥24 · GLM-5.2 ￥2 / ￥8 / ￥28 · Qwen 3.8 Flash ￥0.1 / ￥0.8 / ￥2.7.
>
> † Aliyun lists no implicit cache-hit price for Qwen 3.6 Flash (input ￥1.2, output ￥7.2). The row assumes the usual 20%-of-input cache-hit rate (￥0.24); if implicit caching is not applied, expect roughly 3x the cost.
>
> 💡 Playing a lot? Aliyun's [Token Plan](https://www.qianwenai.com/benefits/tokenplan) subscription covers these models at a flat rate. ⚠️ Token Plan keys (`sk-sp-`) do **not** work in-game yet: the Token Plan endpoint blocks browser requests (CORS), so use a general `sk-ws-` key.

#### Other providers

| Model | Thinking | Cost / Round | Full Run (40r) | Gameplay / $1 |
| --- | --- | --- | --- | --- |
| **DeepSeek Official (V4.1 Flash)** 🐋 | ❌ Off *(Default)* | ~$0.00067 * | ~$0.027 * | ~120 hrs |
| DeepSeek Official (V4.1 Flash) | ✅ High | ~$0.0013 * | ~$0.054 * | ~60 hrs |
| **GPT-6 Luna** ⚡ | ❌ Off *(Default)* | ~$0.00051 | ~$0.020 | ~163 hrs |
| GPT-6 Luna | ✅ High | ~$0.0010 | ~$0.041 | ~82 hrs |
| **Gemini 3.5 Flash-Lite** 💎 | ❌ Off *(Default)* | ~$0.0029 | ~$0.12 | ~29 hrs |
| Gemini 3.5 Flash-Lite | ✅ High | ~$0.0058 | ~$0.23 | ~14 hrs |

> \* **DeepSeek repriced again.** The `deepseek-flash` model name now serves **DeepSeek-V4.1-Flash** at **$0.003 / 1M cache-hit input · $0.15 / 1M cache-miss input · $0.60 / 1M output** off-peak, and **2x all three** during peak hours (01:00–04:00 and 06:00–10:00 UTC, Mon–Fri). Figures are a 7-day blend (35 of 168 hours at peak). That is roughly 3.6x cheaper per round than the V4 Flash pricing it replaces. The legacy `deepseek-v4-flash` name still works but is served by V4.1 Flash.
>
> 💱 **DeepSeek bills in CNY, and its USD sheet does not convert at ￥7.1.** A measured 40-round off-peak session (2026-09-24) billed **￥0.20** for 240,000 cache-hit + 36,862 cache-miss input and 39,696 output — which reprices exactly at **￥0.02 / ￥1 / ￥4 per 1M**. Against the USD figures above, all three rates agree on **￥6.67 = \$1**, DeepSeek's own internal rate. Converting its USD sheet at this table's ￥7.1 therefore over-states the cost by ~6.7%, so the in-game usage panel prices this provider in CNY directly.
>
> ⚡ **GPT-6 Luna replaced GPT-5.6 Luna** (per 1M tokens: **$0.01** cache-hit input · **$0.10** cache-miss input · **$0.50** output). That is roughly **4.5x cheaper per round** than the tier it replaces, and the figures above are now published pricing rather than an estimate.
>
> ⚠️ Per-token prices for Gemini 3.5 Flash-Lite are still estimates based on comparable tiers — verify on your provider's pricing page. GPT, DeepSeek and Aliyun figures use published pricing.
>
> 📐 Cache *writes* bill at 1.25x the input rate on OpenAI, which this table's token profile does not model separately — treat the GPT rows as roughly 5–10% optimistic. Every other provider's rows have always carried the same simplification.
>
> 💡 "Thinking ON" rows assume ~1,000–2,000 reasoning tokens billed at the output rate, which roughly doubles per-round cost. That is why reasoning ships **off by default**.

### 🎁 Why Aliyun is the default — free-credit auto-route

Alibaba Cloud grants new accounts ~1M free tokens **per model**, valid 90 days after sign-up. In **🎁 Free credits** mode the game plays through 28 JSON-capable models in quality order, and when one model's credits run out it moves to the next automatically, with a small toast:

| Tier | Models |
| --- | --- |
| Flagship | qwen3.8-max · qwen3.8-max-0902 · deepseek-v4-pro · deepseek-v4-pro-0813 · glm-5.2 · glm-5.1 |
| Mid | qwen3.7-plus (+ 2026-05-26) · qwen3.6-plus (+ 2026-04-02) · qwen3.5-plus (+ 2026-04-20, 2026-02-15) · qwen3.5-397b-a17b · deepseek-v4.1-flash · deepseek-v4-flash |
| Flash | qwen3.8-flash · qwen3.7-flash (+ 2026-07-15) · qwen3.6-flash (+ 2026-04-16) · qwen3.5-flash (+ 2026-02-23) · qwen3.5-122b-a10b |
| Small | qwen3.6-35b-a3b · qwen3.6-27b · qwen3.5-35b-a3b |
| Last resort | glm-5.3 — flagship quality, but it always thinks, so ~2x the tokens and 3-5x slower |

One model's allowance lasts roughly 100 rounds (~8 hrs), so the full route is on the order of hundreds of hours. Story voice shifts a little when the route moves down a tier.

> ⚠️ **Turn ON "stop when free quota is used up"** in the Aliyun console. Aliyun only reports "free credits exhausted" when that switch is on (or the account is unverified). With it off, a verified account quietly starts pay-as-you-go billing, and the game cannot detect the change.

---

## 🔄 Regenerate, Edit & Copy

After every round, three small buttons appear below the story:

- **↺ Retry** — Re-generates the story for the same player choice. Stats, memory ledger, KKT messages, achievements, and stage changes all rewind to exactly before the round ran, so the new generation starts clean. The previous version is replaced — no history page, no extra UI.
- **✎ Edit** — Rewrite the story yourself when a round is *almost* right. Your text replaces the round both on screen and in the model's memory, so later rounds follow what you wrote. Edit as often as you like; only the latest version is kept.
- **⎘ Copy** — Copies pure story text (no stats box, no option labels) to your clipboard.

A ✎ also sits beside your last choice. Tapping it lets you reword what you did and replay the round — useful when a typo or a half-finished custom action sent the story somewhere you did not mean.

> Both edit buttons appear only on the newest round, and only after you have played a round in this session — right after loading a save there is nothing to edit yet. Editing the newest story is free in cache terms, because the model has not read it yet. ↺ Retry after an edit discards the edit, since it regenerates from before the round.

---

## 🎉 What's New in v1.3.9

Four fixes you can see, and one number you could not see before.

* 📊 **You can finally see what a round costs** — Settings now shows this session's token usage, cache-hit rate, median generation time and an estimated cost. Every provider has always sent these figures back and the game threw them away, so the one person paying for the rounds had no way to check. Where a provider does not report something, it says so rather than showing you a zero: "not reported" and "0%" look the same on screen and mean opposite things.
* 💗 **Affection moves at the game's pace, not the model's** — a single round could previously jump a member's affection by 30 points and skip three relationship stages, firing their scenes in a burst. Changes are now capped at 8 per round. Since free mode rotates through 28 different models, this is also what stops the story speeding up or slowing down for no reason you could see.
* 💾 **A save that fails now tells you** — if your browser's storage was full, the save appeared in your slot list and was never written. You found out when you came back for it. The game now checks, keeps the list honest, and tells you what to delete.
* 💔 **Your ex stays the same person** — on the Ex-Girlfriend route, the reason you broke up and the keepsake you kept were re-rolled *every single round*, so the game quietly contradicted its own backstory. They are now fixed for the life of a save. This was also costing you money: it broke the prompt cache, and fixing it measured **60.5% → 87.2%** cache hits on the same model and settings. Existing saves settle on one version from the next time you load them.

* 🗣️ **Korean address forms stay in dialogue, where they belong** — narration was writing `Irene欧尼正站在窗边`. Honorifics are something characters *say to each other*; in narration a member is just her name. `"Irene欧尼，今天练到这么晚吗？"` is still exactly right.
* 🇨🇳 **`呀` used the way Korean actually uses it** — Chinese output was producing `小饼呀，你来了，吃饭了吗`, which is grammatical but reads oddly, because Korean 야 is a vocative suffix on a name while Chinese 呀 is a sentence-final particle. Transliterating the sound imported the wrong grammar. It is now kept for the use both languages share — `呀！你胆子真大了` — and closeness is carried by the plain name. English and Korean are unchanged.
* ✏️ **English stopped writing `Alex--ya`** — a stray double hyphen that had been in every English prompt since the address protocol shipped in v1.3.6.

> 🔎 On the panel's cost estimate: it covers the models whose providers publish per-token prices, and plainly says so when a model has none rather than quietly leaving it out of the total. Your provider's own billing page is still the authority — the panel was checked against a real DeepSeek bill and matched it to the token.

## 🎉 What's New in v1.3.8

* ⚡ **GPT-6 Luna replaces GPT-5.6 Luna** — same button, newer model, and **about 4.5x cheaper per round**: a full 40-round playthrough now costs roughly **$0.02** instead of **$0.09**, or about **163 hours of play per $1**. Nothing to change in your settings; if you had GPT selected, you are already on it.

## 🎉 What's New in v1.3.7

* 🎂 **The honorific fix from v1.3.6 now actually works** — v1.3.6 rewrote how members address you, but the birthdays it needs were being dropped before they reached the model, so every member looked the same age and nothing changed in play. Members now use your real age difference. If v1.3.6 seemed to make no difference, this is why.
* 🇰🇷 **Korean address forms stay Korean** — 欧尼 / unnie rather than 姐 or "big sister", and nim / xi kept as they sound, so a line reads like "Irene欧尼，前辈nim，这么晚还没回去？" instead of being translated into something that feels like a domestic drama. The setting is Seoul; the words should sound like it.

## 🎉 What's New in v1.3.6

A writing-quality release. Three bugs that all looked like "the model is sloppy" turned out to be things the prompt was telling it wrong, or never telling it at all.

* 🗣️ **Members stop mixing up who is who** — "I" and "you" inside dialogue now have a stated meaning, so a member no longer answers as you, and no longer thanks you by saying her *own* name.
* 👥 **Unnie finally points the right way** — the game knew your age and every member's birthday, but the line describing the gap was written backwards in every profile, so members could call you unnie while you were calling them unnie. Seniority now follows birth year, it never points both ways at once, and how formal she actually sounds comes from the age gap, how close you are, and her own personality together — a same-age member is relaxed with you early, while a much older one stays warm but careful for a while. Staff and Chaebol players are addressed by their work title.
* 💬 **No more phantom Kakao messages** — a member below the affection threshold could be described as texting you when no message ever arrived, because the lock was applied after the story was written. The model is now told which chats are open before it writes.
* ✏️ **Your story edits actually reach the model** — an edited story was being replaced by its original summary on roughly every third round, so the model kept writing from the version you had rewritten. Edits now always get through.

## 🎉 What's New in v1.3.5

* 🐛 **All groups load on every mirror again** — on the Vercel and Cloudflare mirrors the cover page showed only Red Velvet, because the group data was being requested from a path that only exists on the GitHub Pages site. All nine groups are back everywhere. The GitHub Pages site was never affected.
* 📱 **Install-to-home-screen fixed on the mirrors** — the app icon and standalone launch now work from whichever mirror you installed from.

## 🎉 What's New in v1.3.4

A maintenance release — no gameplay changes.

* 🔗 **Both Help Center play-links now current** — the mirrors are [idol-dating-sim.vercel.app](https://idol-dating-sim.vercel.app/) and [idol-dating-sim.pages.dev](https://idol-dating-sim.pages.dev/). Both older addresses are gone, so update any bookmark.

## 🎉 What's New in v1.3.3

A maintenance release — no gameplay changes.

* 🔗 **Help Center play-link updated** — the Vercel mirror moved to [idol-dating-sim.vercel.app](https://idol-dating-sim.vercel.app/). The old link no longer works, so update any bookmark.
* 🏗️ **Build and release tooling** — the hosted mirrors now build from source instead of re-serving a committed bundle, so a fix reaches every mirror in one step. Internal only; nothing changes in the game itself.

## 🎉 What's New in v1.3.2

* 🎁 **Aliyun free-credit auto-route** — 28 models, each with its own new-user allowance; the game switches model when one runs out, and tells you when it does.
* 💳 **Aliyun paid mode** — a 9-model list (Qwen / DeepSeek / GLM) with a per-model cost guide.
* 🩺 **Readable, localized errors** — every provider's errors are classified (key invalid, credits used up, rate limited, server busy, content blocked…) and shown as one short line in zh / en / ko. The Help Center Errors tab lists them all.
* ⚙️ **Per-model request parameters** set from each provider's official API reference (`docs/api_references/`): thinking is explicitly off by default everywhere, and turning Deep Thinking on picks the right effort level per model automatically. `glm-5.3` is exempt because it cannot stop thinking, so it runs richer, slower and at roughly 2x the tokens — which is why it sits last in the free route.
* 🐋 **DeepSeek Official → V4.1 Flash** (`deepseek-flash`), repriced; costs updated above. The provider button is now labelled for the model rather than the platform.
* ✎ **Edit what you just played** — reword the generated story, or change your last choice and replay the round. Only the latest version is kept.
* 🔁 **Broken rounds are retried, not shown** — a truncated or near-empty answer is re-requested automatically, and in free mode the game moves to another model, so raw JSON and placeholder stories no longer reach the screen.
* ⏱️ **Bounded waiting** — a round tries at most 4 models and ~2 minutes before giving up, with a toast while it walks. Deep Thinking gets double the time limit, because thinking rounds genuinely take longer.
* ♻️ **Free route can be reset** — topped up your Aliyun account? The game notices automatically, and there is a manual reset on the key page.
* 🧹 **Key page decluttered** — provider and mode buttons are single-line, and the paid model list is a collapsible picker instead of nine always-open rows.
* 💾 **Save-loading bug fixed** — loading a save straight after playing another game could make ↺ Retry restore the *other* game's stats and memory. Error messages also no longer end up inside saves or story exports.
* 🗑️ Qwen 3.7 Max removed (no JSON mode). `qwen3.8-2.4t-a95b` and `qwen3.5-27b` dropped from the free route after live testing — neither could finish a playable round. The provider id stays `qwen`, so existing saves and settings load unchanged.

## 🎉 What's New in v1.3.1

* 🐉 **Qwen is the new default** — three selectable versions (3.8 Max / 3.7 Max / 3.7 Plus), each with its own free-credit allowance for new users. `character-plus` was removed.
* 🧠 **Deep Thinking toggle, off by default** — roughly halves both per-round cost and generation time with no meaningful drop in story quality. Every provider gets an explicit off-switch (DeepSeek `thinking:{type:'disabled'}`, Qwen `enable_thinking:'false'`), because some default to reasoning ON.
* ⏳ **Time Speed** — slow / normal / fast narrative pacing, injected into the dynamic tail so it never invalidates the cached prefix.
* 🌗 **Day / Night mode** and 🔠 **text-size toggle** across every screen.
* 📖 **Full-story export** — clipboard, `.txt`, or themed print-to-PDF.
* 📚 **Help Center overlay** — Guide / Issues / Error Codes / Contact, in zh · en · ko.
* 📈 **Measured results** — ~87% prompt-cache hit rate in clean sequential play (~95.8% in long sessions with retries), and a 6.3s median round on DeepSeek Official, in real player sessions.
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
- **LLM** — Aliyun (Qwen / DeepSeek / GLM, free-credit auto-route or paid) · DeepSeek Official V4.1 Flash · GPT-6 Luna · Gemini 3.5 Flash-Lite, through one unified OpenAI-compatible client with a shared error classifier
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
Social Media delayed display (check while the next round generates)
```

### Why the cache hit rate matters

A naive sliding-window memory rewrites the prompt prefix every round, so **every** round is a full cache miss. The stepped-window ledger only ever *appends*, and when it collapses old stories it does so *in place* — the already-summarised prefix stays byte-identical. Result: most input tokens bill at the cache-hit rate — 5–30x cheaper depending on provider — and time-to-first-token drops sharply. Measured at ~87% in clean play and ~95.8% in long sessions with retries; see the performance section for why those differ.

---

## 📱 UI Layout

```
+------------------------------------------------------------+
|  Cover Page                                                |
|  +-------------------------------------------------------+ |
|  |                       [heart]                         | |
|  |                  Idol Dating Sim                      | |
|  |              LLM Text Adventure . v1.3.9              | |
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
|  |  [Aliyun] [DeepSeek V4.1] [GPT] [Gemini]              | |
|  |  Aliyun: [🎁 Free credits · auto] [💳 Paid]           | |
|  |    Paid -> model list + cost guide for the pick       | |
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
|          Idol Dating Sim  v1.3.9 - Architecture                     |
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
|                  |  ~87% of input tokens bill at cache-hit rate     |
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
|  | waiting (~6-17s) -> New story generates in background        |   |
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
|                    v1.3.9 Round Flow                            |
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
|  Step 2: LLM Generation (single API call, 6-17s reasoning off) |
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
