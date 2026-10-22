# Model layer

Moved verbatim out of `CLAUDE.md` on 2026-10-21, when that file passed the
150k-character load limit. This is how the model layer behaves now; keep it current.
Section names cited elsewhere as *CLAUDE.md, X* now live here. Read the dates, not the tense.

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
