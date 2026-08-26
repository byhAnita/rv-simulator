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
`gpt4omini`) or the model string (`deepseek-v4-flash`, `qwen-3.8-max`, …).

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
| **B** | live | One real round per reasoning mode: HTTP success, non-empty content, valid JSON, schema fields present (`story`, `summary`, 4 `options`, numeric `statChanges`), and no chain-of-thought leakage into the story. Prints latency. |
| **C** | none | Secret hygiene (see above). |

Layer A stubs `globalThis.fetch` and inspects the body `callLLM` builds, so it
verifies the fix without spending anything. Because `src/` uses extensionless
imports that plain Node ESM cannot resolve, the runner bundles
`src/tools/llmTool.js` with esbuild (already a Vite dependency) into
`test/.out/` first. That directory is git-ignored.

## Coverage gap

Layer B has only ever run against **DeepSeek**. The Qwen `max_completion_tokens`
field name is verified at the request-body level in Layer A, but has **not** been
confirmed against Qwen's live API — and Qwen is the default provider. Put a Qwen
key in `.env.local` with `MODEL_ID="qwen-3.8-max"` and re-run `--live` before
relying on it.
