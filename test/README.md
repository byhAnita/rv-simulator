# Smoke test

Guards the per-provider output-token-cap fix (`6814eff`) and the corrected
in-app cost strings. Not part of the app: lives outside `src/`, so Vite never
bundles it, and it is not referenced by any application module.

```bash
node test/smoke.mjs          # offline only — no network, no credits spent
node test/smoke.mjs --live   # also hits the real provider (spends credits)
```

## Credentials

The live layer reads `.env.local` in the repo root:

```
YURIAGENT_API_KEY="sk-..."
MODEL_ID="deepseek-v4-flash"
```

`MODEL_ID` accepts either the provider id (`deepseek`, `qwen`, `gemini`,
`gpt4omini`) or the model string (`deepseek-v4-flash`, `gpt-6-luna`, `qwen-3.8-max`, …).

**Why this can never reach players:**

- the var is **unprefixed** — Vite only inlines `VITE_*` names into the client
  bundle, so an unprefixed name is invisible to the browser build
- the runner reads `process.env` / the file directly, never `import.meta.env`
- `src/` contains no reference to `YURIAGENT_API_KEY` or `process.env`
- `.gitignore` covers `.env.*` and `*.local`

Layer C asserts all four of those every run, plus scans the built `dist/` for
the literal key. Revoke the key at the provider when you are done with it.

## Layers

| Layer | Network | What it covers |
| --- | --- | --- |
| **A** | none | Request-body contract: 4 providers × reasoning on/off. Asserts the cap value **and the field name** (`max_completion_tokens` for Qwen, `max_tokens` for the rest), the reasoning flags, deepseek's `thinking` object, Qwen sub-model resolution, and the cost strings from fix #4. Includes an explicit regression guard against the pre-fix behaviour. |
| **B** | live | One real round per reasoning mode: HTTP success, non-empty content, valid JSON, schema fields present (`story`, `summary`, 4 `options`, numeric `statChanges`), and no chain-of-thought leakage into the story. Prints latency. Then probes with a cap of 16 to prove the output cap is **honored**, not merely accepted — an ignored unknown field would still return HTTP 200. |
| **C** | none | Secret hygiene (see above). |
| **D** | none | Probability-engine recency window with `Math.random` pinned to 0.5, so the arithmetic is exact: a long-absent member must score 0.60 and a saturated one 0.40. Also guards that the dead NPC constants stay removed and that no active `console.log` returns to `llmTool.js`. |

Layer A stubs `globalThis.fetch` and inspects the body `callLLM` builds, so it
verifies the fix without spending anything. Because `src/` uses extensionless
imports that plain Node ESM cannot resolve, the runner bundles
`src/tools/llmTool.js` with esbuild (already a Vite dependency) into
`test/.out/` first. That directory is git-ignored.

## Verified live

| Provider | Reasoning off | Reasoning on | Cap honored |
| --- | --- | --- | --- |
| `qwen` (qwen3.8-max) | 6.2 s | 16.4 s | ✅ `max_completion_tokens` |
| `deepseek` (v4-flash) | 4.4 s | 7.1 s | ✅ `max_tokens` |

Latencies are for a minimal one-round prompt with no history, so real
steady-state play is slower.

Qwen accepts **both** `max_tokens` and `max_completion_tokens` — a cap of 16
truncates with `finish_reason:'length'` under either. The split in `llmTool.js`
tracks the field OpenAI-compatible APIs are standardising on; it is not required
by Qwen.

Not yet exercised live: `gemini`, `gpt4omini`. Layer A covers their request
bodies offline. To add one, put its key in `.env.local`, set `MODEL_ID`
accordingly, and re-run with `--live`.

## Validating a regression guard

Layer D's `storyRounds` guard was checked by reverting the fix and confirming it
fails (delta 0.020 vs the required 0.05), then restoring. A guard that has never
been seen to fail is not a guard — do the same for any new one.
