# Aliyun Chat Completions API Reference (Text Generation)

> Source: https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions  
> Scope: text generation only. Tool calls, web search, and multimodal inputs removed.

---

## Endpoints

| Region | `base_url` |
|--------|-----------|
| China (Beijing) | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` |
| Singapore | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` |
| US (Virginia) | `https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1` |
| Germany (Frankfurt) | `https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1` |
| Japan (Tokyo) | `https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1` |
| Hong Kong (China) | `https://{WorkspaceId}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1` |

Replace `{WorkspaceId}` with your actual workspace ID. HTTP request path: `POST /chat/completions`.

---

## Authentication

Set your API key as an environment variable (e.g., `DASHSCOPE_API_KEY`). With the OpenAI SDK, pass it as `api_key`. The header is `Authorization: Bearer $DASHSCOPE_API_KEY`.

---

## Request Body

### `model` (required)

`string`

Supported models (your list):

**Flagship:** `qwen3.8-max`, `qwen3.8-max-0902`, `glm-5.3`, `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `qwen3.8-2.4t-a95b`, `glm-5.2`, `glm-5.1`

**Mid:** `qwen3.7-plus`, `qwen3.7-plus-2026-05-26`, `qwen3.6-plus`, `qwen3.6-plus-2026-04-02`, `qwen3.5-plus`, `qwen3.5-plus-2026-04-20`, `qwen3.5-plus-2026-02-15`, `qwen3.5-397b-a17b`, `deepseek-v4.1-flash`, `deepseek-v4-flash`

**Flash:** `qwen3.8-flash`, `qwen3.7-flash`, `qwen3.7-flash-2026-07-15`, `qwen3.6-flash`, `qwen3.6-flash-2026-04-16`, `qwen3.5-flash`, `qwen3.5-flash-2026-02-23`, `qwen3.5-122b-a10b`

**Small:** `qwen3.6-35b-a3b`, `qwen3.6-27b`, `qwen3.5-35b-a3b`, `qwen3.5-27b`, `deepseek-v4-flash-0731`

> Third-party models (DeepSeek, GLM) are available only in China (Beijing) and must be activated in the Model Studio console before use.

---

### `messages` (required)

`array`

Conversation context in order. Each element is one of:

| Role | Required fields | Description |
|------|----------------|-------------|
| `system` | `content`, `role` | Defines role, tone, constraints. |
| `user` | `content`, `role` | Question, instruction, or context. |
| `assistant` | `content`, `role` | Model's reply (for multi-turn context). |

**`content`** is a plain string for all roles.

---

### `stream` (optional)

`boolean` — Default `false`.

Set `true` for SSE streaming output. Recommended for long outputs to avoid timeouts (non-streaming timeout is ~300s).

---

### `stream_options` (optional)

`object` — Takes effect only when `stream: true`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `include_usage` | boolean | `false` | Include token usage in the last chunk. |

---

### `temperature` (optional)

`float` — Range `[0, 2)`. Default varies by model (see below).

Controls output diversity. Higher = more creative, lower = more deterministic. Recommend setting only `temperature` **or** `top_p`, not both.

| Model group | Default temperature |
|-------------|-------------------|
| `qwen3.8-max` (thinking), `qwen3.8-flash` (thinking) | 0.6 (text input: 1.0) |
| `qwen3.8` / `qwen3.7` / `qwen3.6` / `qwen3.5` (non-thinking) | 0.7 |
| `qwen3.7-plus` (thinking), `qwen3.6-plus` (thinking), `qwen3.5-plus` (thinking) | 0.6 |
| `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4.1-flash` (non-thinking) | 1.0 |
| `deepseek-v4-pro` (thinking), `deepseek-v4.1-flash` (thinking) | 0.6 |
| `glm-5.3`, `glm-5.2`, `glm-5.1` | 1.0 / 1.0 / 0.6 |

---

### `top_p` (optional)

`float` — Range `(0, 1.0]`.

Nucleus sampling threshold. Higher = more diverse, lower = more deterministic.

---

### `top_k` (optional)

`integer` — Number of candidate tokens to sample from.

- If `null` or > 100, only `top_p` is used.
- **Not a standard OpenAI parameter.** With the Python SDK, pass via `extra_body={"top_k": ...}`.
- DeepSeek, Kimi, and MiniMax series do **not** support `top_k`.

Default: QwQ series = 40; most other models = 20.

---

### `repetition_penalty` (optional)

`float` — Penalty for repeated sequences. `1.0` = no penalty.

- **Not a standard OpenAI parameter.** Pass via `extra_body={"repetition_penalty": ...}`.
- Default: Qwen3.8 = 1.0; most others = 1.05; GLM = 1.0.

---

### `presence_penalty` (optional)

`float` — Range `[-2.0, 2.0]`. Positive reduces repetition; negative increases it.

Default varies by model. For example, `qwen3.8-max` / `qwen3.7-plus` (thinking mode) = 1.5; most others = 0.0. DeepSeek `deepseek-r1` series = 1.0; GLM has no default value.

---

### `response_format` (optional)

`object` — Default `{"type": "text"}`.

| Type | Description |
|------|-------------|
| `{"type": "text"}` | Plain text reply |
| `{"type": "json_object"}` | Standard JSON string |
| `{"type": "json_schema", "json_schema": {...}}` | Strict JSON conforming to a schema |

> For `json_object`: you must instruct the model to output JSON in the prompt (e.g., "Please output in JSON format"), otherwise an error occurs.

---

### `max_completion_tokens` (optional)

`integer` — Maximum output length including chain-of-thought and answer.

Recommended for thinking models. Supported by: DeepSeek V4 series (`deepseek-v3`, `deepseek-r1`, `deepseek-v3.1`, `deepseek-v3.2`, `deepseek-v4-pro`, `deepseek-v4-flash`), Qwen Max (Qwen3.7-Max+), Qwen Plus (Qwen3.5-Plus+), Qwen Flash (Qwen3.5-Flash+), GLM (glm-5+).

---

### `enable_thinking` (optional)

`boolean` — **Not a standard OpenAI parameter.** Pass via `extra_body={"enable_thinking": true}` (Python SDK) or as a top-level parameter (Node.js SDK / HTTP).

Enables thinking mode for hybrid models. When enabled, reasoning content is returned in `reasoning_content`.

| Model group | Default | Notes |
|-------------|---------|-------|
| `qwen3.8-max` / `qwen3.8-flash` | `true` | Hybrid; can be disabled |
| `qwen3.7-plus` / `qwen3.6-plus` / `qwen3.5-plus` | `true` | Hybrid; can be disabled |
| `qwen3.7-flash` / `qwen3.6-flash` / `qwen3.5-flash` | `true` | Hybrid; can be disabled |
| `glm-5.3` | `true` | **Cannot be disabled.** Passing `false` causes an error. |
| `glm-5.2` / `glm-5.1` | `true` (adaptive) | Can be disabled |
| `deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4.1-flash` | `true` | Default thinking mode enabled |

> For GLM-5.3: `thinking.type` must be `"enabled"`; `"disabled"` is rejected.

---

### `thinking_budget` (optional)

`integer` — Maximum tokens for the thinking process.

- **Not a standard OpenAI parameter.** Pass via `extra_body={"thinking_budget": ...}`.
- Supported by Qwen3.8, Qwen3.7, Qwen3.6, Qwen3.5 series (except when `reasoning_effort` is set simultaneously).
- For `qwen3.8-max` / `qwen3.8-flash`: cannot be set together with `reasoning_effort` — doing so returns an error.

---

### `reasoning_effort` (optional)

`string` — Controls inference intensity.

- **Not a standard OpenAI parameter.** Pass via `extra_body={"reasoning_effort": "high"}`.

| Model group | Valid values | Default |
|-------------|-------------|---------|
| `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `deepseek-v4-flash` (non-0731) | `high`, `max` | `high` |
| `deepseek-v4-flash-0731` | `low`, `high`, `max` | `high` |
| `glm-5.3` | `low`, `high`, `max` | `max` |
| `glm-5.2` / `glm-5.1` | `high`, `max` | `high` |
| `qwen3.8-max`, `qwen3.8-flash` | `low`, `medium`, `xhigh` | `xhigh` |

Mapping notes:
- DeepSeek V4: `low`/`medium` → `high`; `xhigh` → `max`.
- GLM-5.3: only `max` is supported (always thinking).
- Qwen3.8: `max`/`high` → `xhigh`; `minimal` → `low`; `none` → `enable_thinking=False`.

---

### `stop` (optional)

`string | array` — Up to 16 stop sequences. Can be strings or `token_id`s (do not mix types in one array).

---

### `seed` (optional)

`integer` — Random seed for reproducibility. Range `[0, 2^31−1]`. Default: `1234` for most models.

---

### `logprobs` / `top_logprobs` (optional)

- `logprobs`: `boolean`, default `false`. Return log probabilities of output tokens.
- `top_logprobs`: `integer`, range `[0, 5]`. Number of most likely tokens per position. Requires `logprobs: true`.

> Reasoning content (`reasoning_content`) does **not** return log probabilities.

---

### `preserve_thinking` (optional)

`boolean` — Default varies by model.

| Model | Default |
|-------|---------|
| `qwen3.8-max` / `qwen3.8-flash` | `true` |
| `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`, `qwen3.7-flash`, `qwen3.6-flash` | `false` |

When enabled, historical `reasoning_content` is included in the input token count and billed.

> **Important for qwen3.8-max / qwen3.8-flash:** You must send back all historical `reasoning_content` in the `reasoning_content` field. **Do NOT concatenate it into the `content` field.** Doing so may degrade performance.

---

## Simple Code Example (Python)

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

completion = client.chat.completions.create(
    model="qwen3.8-max",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Who are you?"},
    ],
    extra_body={"enable_thinking": True, "reasoning_effort": "high"},
)
print(completion.model_dump_json())
```

---

## Key Notes

1. **Third-party models** (DeepSeek, GLM) are available only in China (Beijing) and require activation in the Model Studio console.
2. **`enable_thinking`, `thinking_budget`, `reasoning_effort`, `top_k`, `repetition_penalty`** are **not** standard OpenAI parameters. With the Python SDK, pass them via `extra_body`. With HTTP / Node.js SDK, place them at the top level of the request body.
3. **GLM-5.3 always thinks** — `thinking.type: "disabled"` is rejected.
4. **`reasoning_effort` and `thinking_budget` cannot be set together** for `qwen3.8-max` / `qwen3.8-flash`.
5. **JSON Output** (`response_format: {"type": "json_object"}`) requires an explicit instruction in the prompt to output JSON.
6. **Streaming** is recommended for long outputs to avoid the ~300s non-streaming timeout.