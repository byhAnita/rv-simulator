# OpenAI Chat Completions API Reference (Text Generation)

> Source: https://developers.openai.com/api/reference/resources/chat  
> Focus: text generation only. Excludes tools, MCP, web search, file processing, and tool calls.

---

## Endpoint

**POST** `https://api.openai.com/v1/chat/completions`

Creates a model response for the given chat conversation. Returns a ChatCompletion object, or a streamed sequence of ChatCompletionChunk objects if `stream: true`.

---

## Request Body

### `model` (required)

`string`

Model ID used to generate the response, e.g. `gpt-6-astra`, `gpt-5.6-sol`, `o3`. See the model guide for available models.

---

### `messages` (required)

`array`

A list of messages comprising the conversation so far. Each message has a `role` and `content`.

| Role | Description |
|------|-------------|
| `system` | Developer‑provided instructions. With o1 and newer, use `developer` instead. |
| `developer` | Developer‑provided instructions (replaces `system` for newer models). |
| `user` | End‑user prompts or context. |
| `assistant` | Model replies (for multi‑turn context). |

**Message object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | ✅ | `system`, `developer`, `user`, or `assistant`. |
| `content` | string | ✅ | The text content of the message. |
| `name` | string | ❌ | Optional participant name. |

---

### `max_completion_tokens` (optional)

`integer`

An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens. Recommended over the deprecated `max_tokens` for reasoning models.

---

### `max_tokens` (optional, deprecated)

`integer`

The maximum number of tokens that can be generated in the chat completion. Deprecated in favor of `max_completion_tokens`. Not compatible with o‑series models.

---

### `temperature` (optional)

`number` — Range `0` to `2`. Default `1`.

Sampling temperature. Higher values (e.g., `0.8`) make output more random; lower values (e.g., `0.2`) make it more focused and deterministic. Recommend altering either `temperature` or `top_p`, not both.

---

### `top_p` (optional)

`number` — Range `0` to `1`. Default `1`.

Nucleus sampling. The model considers tokens with the top `top_p` probability mass. `0.1` means only the top 10% probability mass is considered. Recommend altering either `temperature` or `top_p`, not both.

---

### `stop` (optional)

`string | string[]`

Up to **4** sequences where the API will stop generating further tokens. The returned text will not contain the stop sequence.

---

### `seed` (optional, Beta)

`integer`

If specified, the system makes a best effort to sample deterministically. Repeated requests with the same `seed` and parameters should return the same result. Determinism is not guaranteed; refer to `system_fingerprint`.

---

### `stream` (optional)

`boolean` — Default `false`.

If `true`, the model response data is streamed using server‑sent events (SSE).

---

### `stream_options` (optional)

`object` — Only set when `stream: true`.

| Field | Type | Description |
|-------|------|-------------|
| `include_usage` | boolean | If set, an additional chunk is streamed before `data: [DONE]`, showing token usage for the entire request. All other chunks include a `usage` field with a `null` value. |
| `include_obfuscation` | boolean | When `true` (default), adds random characters to normalize payload sizes. Set to `false` to optimize bandwidth. |

---

### `n` (optional)

`integer` — Default `1`. Range `1`–`128`.

How many chat completion choices to generate for each input message. Charged based on generated tokens across all choices.

---

### `logprobs` (optional)

`boolean` — Default `false`.

Whether to return log probabilities of the output tokens. If `true`, returns the log probabilities of each output token returned in the `content` of `message`.

---

### `top_logprobs` (optional)

`integer` — Range `0`–`20`.

An integer specifying the maximum number of most likely tokens to return at each token position, each with an associated log probability. `logprobs` must be `true` if this parameter is used.

---

### `logit_bias` (optional)

`map[number]`

Modifies the likelihood of specified tokens appearing in the completion. Maps token IDs to bias values from `-100` to `100`.

---

### `frequency_penalty` (optional)

`number` — Range `-2.0` to `2.0`. Default `0`.

Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model’s likelihood to repeat the same line verbatim.

---

### `presence_penalty` (optional)

`number` — Range `-2.0` to `2.0`. Default `0`.

Positive values penalize new tokens based on whether they appear in the text so far, increasing the model’s likelihood to talk about new topics.

---

### `response_format` (optional)

`object` — Default `{"type": "text"}`.

| Type | Description |
|------|-------------|
| `{"type": "text"}` | Plain text reply. |
| `{"type": "json_object"}` | Valid JSON output (older mode). |
| `{"type": "json_schema", "json_schema": {...}}` | Strictly follows the supplied JSON Schema (Structured Outputs). |

---

### `reasoning_effort` (optional)

`string`

Constrains effort on reasoning for reasoning models. Supported values: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Not all models support every value.

---

### `verbosity` (optional)

`string` — Default `medium`.

Constrains the verbosity of the model’s response. Supported values: `low`, `medium`, `high`.

---

### `user` (optional, deprecated)

`string`

A stable identifier for end‑users. Being replaced by `safety_identifier` and `prompt_cache_key`.

---

### `safety_identifier` (optional)

`string` — Max length `64`.

A stable identifier used to help detect users that may be violating OpenAI’s usage policies. Recommended to hash username or email.

---

### `service_tier` (optional)

`string` — Default `auto`.

Specifies the processing type: `auto`, `default`, `flex`, `scale`, `priority`, `fast`.

---

### `store` (optional)

`boolean` — Default `false`.

Whether to store the output of this chat completion request for use in model distillation or evals products.

---

### `metadata` (optional)

`object`

Set of up to **16** key‑value pairs (keys ≤ 64 chars, values ≤ 512 chars) attached to the object.

---

### `modalities` (optional)

`array` — Default `["text"]`.

Output types: `["text"]` for text only. Audio output requires `["text", "audio"]` and is only supported by specific models.

---

### `prompt_cache_key` (optional)

`string`

Used to cache responses for similar requests to optimize cache hit rates. Replaces the `user` field.

---

### `prompt_cache_options` (optional)

`object`

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"implicit"` \| `"explicit"` | Controls implicit cache breakpoint. Default `implicit`. |
| `ttl` | `"30m"` | Minimum cache lifetime. Default `30m`. |

---

### `prompt_cache_retention` (optional, deprecated)

`"in_memory"` \| `"24h"`

The retention policy for the prompt cache. Use `prompt_cache_options.ttl` instead.

---

### `moderation` (optional)

`object`

Configuration for running moderation on input and output.

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Moderation model, e.g. `omni-moderation-latest`. |
| `policy.input.mode` | `"score"` \| `"block"` | Moderation policy for input. |
| `policy.output.mode` | `"score"` \| `"block"` | Moderation policy for output. |

---

## Response

### ChatCompletion Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the completion. |
| `choices` | array | List of completion choices. |
| `created` | number | Unix timestamp (seconds) of creation. |
| `model` | string | Model used. |
| `object` | `"chat.completion"` | Object type. |
| `system_fingerprint` | string | Backend configuration fingerprint. |
| `usage` | object | Token usage statistics. |

**Choice object:**

| Field | Type | Description |
|-------|------|-------------|
| `finish_reason` | string | `stop`, `length`, `content_filter`, `tool_calls`, `function_call`. |
| `index` | number | Index of the choice. |
| `message` | object | The generated message. |
| `logprobs` | object \| null | Log probability information. |

**Usage object:**

| Field | Type | Description |
|-------|------|-------------|
| `completion_tokens` | number | Tokens in the generated completion. |
| `prompt_tokens` | number | Tokens in the prompt. |
| `total_tokens` | number | Total tokens used. |
| `completion_tokens_details` | object | `reasoning_tokens`, `text_tokens`, etc. |
| `prompt_tokens_details` | object | `cached_tokens`, `text_tokens`, etc. |

---

## Simple Example (curl)

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-6-astra",
    "messages": [
      {"role": "developer", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 1,
    "top_p": 1,
    "max_completion_tokens": 500
  }'
```

---

## Model in use: `gpt-6-luna`

> Source: OpenAI model page, captured 2026-09-23. This is the model the game's
> `gpt4omini` provider serves — the provider id is legacy, the model string is current.

Positioned as the most efficient model for focused, high-volume tasks. Knowledge cutoff 2026-05-18.

| | |
| --- | --- |
| Model string | `gpt-6-luna` |
| Context window | 1,050,000 tokens |
| Max output | 128,000 tokens |
| `reasoning_effort` | `none`, `low`, `medium` (default), `high`, `xhigh`, `max` |
| Modalities | text + image in, text out |
| Endpoints | `v1/responses`, `v1/chat/completions`, `v1/batch` |

### Pricing (per 1M text tokens)

| | |
| --- | --- |
| Input | $0.10 |
| Cached input | $0.01 — 10% of the uncached rate |
| Cache writes | $0.125 — 1.25x the uncached rate |
| Output | $0.50 |

Batch and Flex bill at 50% of standard; Fast mode at 2x. Regional processing adds 10%.

**Prompts over 272K input tokens** bill at 2x input and cache rates and 1.5x output **for the whole request**. The game's prompt is ~8K, so this is far out of reach — but it is a cliff rather than a slope, so anything that grows the static prompt by two orders of magnitude would cross it silently.

### Two constraints that do not bite us, recorded so nobody re-derives them

1. **Chat Completions supports function calling only with `reasoning_effort: "none"`.** The game calls `v1/chat/completions` and uses no function calling, so there is no conflict — but this is why a future tool-calling feature could not simply be switched on alongside Deep Thinking.
2. **EU data residency is Standard-processing only.** Not applicable while the key is the player's own.

### Effort level: the game sends `high`, not `xhigh`

`CLAUDE.md`'s rule is "one level below the family's maximum", which on this six-rung ladder would mean `xhigh`. That rule was written for two- and three-rung ladders where one-below-max was a moderate setting; here it is near-maximal. The game asks for ~800 tokens of prose, not deep reasoning, and the published cost table assumes ~1–2K reasoning tokens — which `high` matches and `xhigh` would not. Raising it would invalidate every "Thinking ON" figure in the README and raise players' bills for a quality gain nobody has measured. Deliberate exception, decided 2026-09-23.

---

## Key Notes

1. **`max_tokens` is deprecated** — use `max_completion_tokens` instead, especially for reasoning models.
2. **Structured Outputs** — use `response_format: {"type": "json_schema", ...}` for strict JSON; `json_object` requires an explicit instruction to output JSON.
3. **`temperature` and `top_p`** — adjust one, not both.
4. **Streaming** — set `stream: true` and optionally `stream_options.include_usage: true` to receive token usage in the final chunk.
5. **Reasoning models** — use `reasoning_effort` to control reasoning intensity; `verbosity` controls response length.
6. **`seed` is Beta** — determinism is not guaranteed; monitor `system_fingerprint` for backend changes.
7. **Excluded features** — tools, tool calls, web search, file inputs, and audio/image modalities are outside the scope of this text‑generation reference.