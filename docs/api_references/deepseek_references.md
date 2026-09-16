# DeepSeek Chat Completions API Reference (Text Generation)

> Source: https://api-docs.deepseek.com/api/create-chat-completion  
> Scope: text generation only. Tool calls, tool messages, image input, and deprecated parameters removed.

---

## Overview

**POST** `https://api.deepseek.com/chat/completions`

Creates a model response for the given chat conversation.

> **Base configuration**: When using the OpenAI SDK, set `base_url` to `https://api.deepseek.com`.

---

## Request Body

**Content-Type:** `application/json`

### `messages` (required)

`object[]`

A list of messages comprising the conversation so far. Minimum length: **1**.

#### System Message

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | The contents of the system message. |
| `role` | string | Yes | Fixed value: `system`. |
| `name` | string | No | Optional name for the participant. |

#### User Message

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | The contents of the user message. |
| `role` | string | Yes | Fixed value: `user`. |
| `name` | string | No | Optional name for the participant. |

#### Assistant Message

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string \| null | Yes | The contents of the assistant message. |
| `role` | string | Yes | Fixed value: `assistant`. |
| `name` | string | No | Optional name for the participant. |
| `prefix` | bool | No | **Beta**: If `true`, the model is forced to start its response with the `content` of this message. Requires `base_url="https://api.deepseek.com/beta"`. |
| `reasoning_content` | string \| null | No | **Beta**: Used for reasoning content in thinking mode. |

---

### `model` (required)

`string`

ID of the model to use.

| Possible Value | Description |
|----------------|-------------|
| `deepseek-flash` | Fast model. |
| `deepseek-v4-pro` | High-performance model. |

---

### `thinking` (optional)

`object | null`

Controls the switch between thinking and non-thinking mode.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `enabled` | `enabled` uses thinking mode. `disabled` uses the non-thinking model. |

---

### `reasoning_effort` (optional)

`string`

Controls the thinking mode toggle and the thinking effort.

| Possible Value | Description |
|----------------|-------------|
| `none` | Disables thinking mode. |
| `low` | Enables thinking mode with low effort. |
| `high` | Enables thinking mode with high effort (default). |
| `max` | Enables thinking mode with maximum effort. |

> Compatibility: `minimal` is mapped to `low`. `medium` / `xhigh` are mapped to `high`.

---

### `max_tokens` (optional)

`integer | null`

Maximum number of tokens that can be generated. Range: **1 to 384K (393216)**.

| Mode | Default |
|------|---------|
| Non-thinking mode | 8K |
| Thinking mode | 64K |
| Thinking mode (`reasoning_effort=max`) | 128K |

> Input tokens + generated tokens are limited by the model's context length.

---

### `response_format` (optional)

`object | null`

Specifies the format the model must output.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `text` | Possible values: `text`, `json_object`. |

> **Important**: When using `{ "type": "json_object" }`, you must instruct the model to produce JSON via a system or user message. Otherwise, the model may generate whitespace until reaching the token limit.

---

### `stop` (optional)

`string | string[] | null`

Up to **16** sequences where the API will stop generating further tokens.

---

### `stream` (optional)

`boolean | null`

If set, partial message deltas are sent as data-only server-sent events (SSE). The stream is terminated by `data: [DONE]`.

---

### `stream_options` (optional)

`object | null`

Options for streaming response. Must be set together with `stream: true`.

| Field | Type | Description |
|-------|------|-------------|
| `include_usage` | boolean | If `true`, all chunks include a `usage` field (`null` except the last chunk). The last chunk before `data: [DONE]` carries token usage for the entire request. |

---

### `temperature` (optional)

`number | null`

| Attribute | Value |
|-----------|-------|
| Range | 0 to 2 |
| Default | 1 |

Higher values (e.g. `0.8`) make output more random; lower values (e.g. `0.2`) make it more focused. Has no effect in thinking mode.

> Adjust either `temperature` or `top_p`, not both.

---

### `top_p` (optional)

`number | null`

| Attribute | Value |
|-----------|-------|
| Range | (0, 1] |
| Default | 1 |

Nucleus sampling. `0.1` means only the top 10% probability mass is considered.

> **Thinking mode**: Values below `0.95` are raised to `0.95`.  
> **Non-thinking mode**: Fixed at `1.0`; passed values are ignored.

---

### `logprobs` (optional)

`boolean | null`

If `true`, returns log probabilities of each output token in the `content` of `message`.

---

### `top_logprobs` (optional)

`integer | null`

| Attribute | Value |
|-----------|-------|
| Range | 0 to 20 |

Number of most likely tokens to return at each token position, each with an associated log probability. Requires `logprobs: true`.

---

### `user_id` (optional)

Custom user identifier.

| Attribute | Value |
|-----------|-------|
| Allowed characters | `[a-zA-Z0-9\-_]` |
| Maximum length | 512 |

**Purpose**:
- Distinguish user identities for content safety review.
- KVCache isolation for privacy management.
- Scheduling isolation for users on your business side.

> Do not include user privacy information in `user_id`.

---

## Responses

### 200 (No Streaming)

Returns a chat completion object.

```json
{
  "id": "string",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "string"
      },
      "logprobs": null
    }
  ],
  "created": 1234567890,
  "model": "deepseek-v4-pro",
  "system_fingerprint": "fp_xxxxx",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 0,
    "prompt_tokens": 0,
    "total_tokens": 0
  }
}
```

#### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the chat completion. |
| `choices` | object[] | Yes | List of chat completion choices. |
| `created` | integer | Yes | Unix timestamp (seconds) of creation. |
| `model` | string | Yes | Model used for the chat completion. |
| `system_fingerprint` | string | Yes | Backend configuration fingerprint. |
| `object` | string | Yes | Always `chat.completion`. |
| `usage` | object | No | Usage statistics. |

#### `choices` Array Items

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `finish_reason` | string | Yes | Reason the model stopped generating. |
| `index` | integer | Yes | Index of the choice. |
| `message` | object | Yes | Model-generated message. |
| `logprobs` | object \| null | Yes | Log probability information. |

**`finish_reason` possible values:**

| Value | Description |
|-------|-------------|
| `stop` | Natural stop point or provided stop sequence. |
| `length` | Maximum token limit reached. |
| `content_filter` | Content omitted due to content filters. |
| `insufficient_system_resource` | Request interrupted due to insufficient inference resources. |
| `aborted` | Generation interrupted. |

#### `usage` Object

| Field | Type | Description |
|-------|------|-------------|
| `completion_tokens` | integer | Tokens in the generated completion. |
| `prompt_tokens` | integer | Tokens in the prompt. Equals `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`. |
| `prompt_cache_hit_tokens` | integer | Prompt tokens that hit the context cache. |
| `prompt_cache_miss_tokens` | integer | Prompt tokens that missed the context cache. |
| `total_tokens` | integer | Total tokens used (prompt + completion). |
| `completion_tokens_details.reasoning_tokens` | integer | Tokens generated for reasoning. |

---

### 200 (Streaming)

Returns an SSE stream. Each data chunk is a Chat Completion Chunk object. Terminated by `data: [DONE]`.

```text
data: {"id":"...","choices":[{"delta":{"content":"Hello","role":"assistant"},"finish_reason":null,"index":0}],"object":"chat.completion.chunk","usage":null}

data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop","index":0}],"object":"chat.completion.chunk","usage":{"completion_tokens":9,"prompt_tokens":17,"total_tokens":26}}

data: [DONE]
```

**Chunk Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the chat completion. |
| `choices` | object[] | Incremental content. `delta` contains newly generated content. |
| `created` | integer | Unix timestamp (seconds) of creation. |
| `model` | string | Model used for the chat completion. |
| `object` | string | Always `chat.completion.chunk`. |
| `system_fingerprint` | string | Backend configuration fingerprint. |
| `usage` | object \| null | The last chunk carries token usage for the entire request. |

---

## Related Links

- [First API Call](https://api-docs.deepseek.com/quick_start/rate_limit)
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit)