# Gemini API Reference — Text Generation

> Source: https://ai.google.dev/api/generate-content  
> Scope: text generation only. Excludes tools, function calling, code execution, file processing, and multimodal inputs.

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| `generateContent` | `POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent` |
| `streamGenerateContent` | `POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:streamGenerateContent` |

**Path parameter:** `model` (string, required) — format: `models/{model}`, e.g. `models/gemini-3.8-flash`.

---

## Request Body

### `contents[]` (required)

`array of Content`

The content of the current conversation with the model. For single-turn queries, this is a single instance. For multi-turn queries, it is a repeated field containing conversation history and the latest request.

**Content object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parts[]` | array of Part | Yes | Ordered parts that constitute a single message. |
| `role` | string | No | The producer of the content: `user` or `model`. |

**Part object (text only):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Inline text. |

---

### `systemInstruction` (optional)

`object (Content)`

Developer-set system instructions. Currently, text only.

**Example:**

```json
{
  "system_instruction": {
    "parts": [{ "text": "You are a cat. Your name is Neko." }]
  }
}
```

---

### `generationConfig` (optional)

`object`

Configuration options for model generation and outputs.

| Field | Type | Description |
|-------|------|-------------|
| `stopSequences[]` | string | Up to 5 character sequences that will stop output generation. The stop sequence is not included in the response. |
| `responseMimeType` | string | MIME type of the generated candidate text. Supported: `text/plain` (default), `application/json`, `text/x.enum`. |
| `responseSchema` | object | Output schema of the generated candidate text. Must be a subset of OpenAPI schema. Requires a compatible `responseMimeType` (e.g. `application/json`). |
| `candidateCount` | integer | Number of generated responses to return. Default: 1. Not supported for Gemini 1.0 family. |
| `maxOutputTokens` | integer | Maximum number of tokens to include in a response candidate. Default varies by model. |
| `temperature` | number | Controls randomness. Range: `[0.0, 2.0]`. Default varies by model. |
| `topP` | number | Maximum cumulative probability of tokens to consider when sampling. Default varies by model. |
| `topK` | integer | Maximum number of tokens to consider when sampling. Not allowed for models using only nucleus sampling. |
| `seed` | integer | Seed used in decoding. If not set, a random seed is used. |
| `presencePenalty` | number | Penalty applied if the token has already appeared in the response. Binary on/off (not count-dependent). |
| `frequencyPenalty` | number | Penalty multiplied by the number of times a token has appeared in the response. |
| `responseLogprobs` | boolean | If true, export logprobs results in the response. |
| `logprobs` | integer | Number of top logprobs to return at each decoding step. Range: `[0, 20]`. Requires `responseLogprobs: true`. |
| `thinkingConfig` | object | Config for thinking features. See below. |
| `mediaResolution` | enum | Media resolution for input media: `MEDIA_RESOLUTION_LOW` (64 tokens), `MEDIA_RESOLUTION_MEDIUM` (256 tokens), `MEDIA_RESOLUTION_HIGH` (zoomed reframing with 256 tokens). |
| `enableAffectiveDialog` | boolean | If enabled, the model detects emotions and adapts responses accordingly. |

**`thinkingConfig` object:**

| Field | Type | Description |
|-------|------|-------------|
| `includeThoughts` | boolean | Whether to include thoughts in the response. |
| `thinkingBudget` | integer | Number of thought tokens the model should generate. |
| `thinkingLevel` | enum | Controls maximum depth of reasoning. Values: `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`. Recommended for Gemini 3+ models. |

---

## Simple Example

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{"text": "Write a story about a magic backpack."}]
    }],
    "generationConfig": {
      "temperature": 1.0,
      "maxOutputTokens": 800,
      "topP": 0.8,
      "topK": 10
    }
  }'
```

---

## Response Body

### GenerateContentResponse

| Field | Type | Description |
|-------|------|-------------|
| `candidates[]` | array of Candidate | Candidate responses from the model. |
| `promptFeedback` | object | Feedback related to content filters. |
| `usageMetadata` | object | Metadata on the generation request's token usage. |
| `modelVersion` | string | The model version used to generate the response. |
| `responseId` | string | Unique identifier for each response. |

**Candidate object:**

| Field | Type | Description |
|-------|------|-------------|
| `content` | object (Content) | Generated content returned from the model. |
| `finishReason` | enum | Reason why the model stopped generating. |
| `safetyRatings[]` | array of SafetyRating | Ratings for the safety of a response candidate. |
| `tokenCount` | integer | Token count for this candidate. |
| `index` | integer | Index of the candidate in the list of response candidates. |

**finishReason possible values:** `STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`, `LANGUAGE`, `OTHER`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `MALFORMED_RESPONSE`.

**UsageMetadata object:**

| Field | Type | Description |
|-------|------|-------------|
| `promptTokenCount` | integer | Number of tokens in the prompt. |
| `cachedContentTokenCount` | integer | Number of tokens in the cached part of the prompt. |
| `candidatesTokenCount` | integer | Total tokens across all generated response candidates. |
| `thoughtsTokenCount` | integer | Number of tokens of thoughts for thinking models. |
| `totalTokenCount` | integer | Total token count (prompt + thoughts + response candidates). |

---

## Streaming

Use `streamGenerateContent` with `alt=sse` for server-sent events.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse&key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  --no-buffer \
  -d '{
    "contents": [{"parts": [{"text": "Write a story about a magic backpack."}]}]
  }'
```

Each SSE event contains a `GenerateContentResponse` chunk with incremental `candidates[].content.parts[].text`.

---

## Safety Settings

| Field | Type | Description |
|-------|------|-------------|
| `category` | enum | Harm category: `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`, `HARM_CATEGORY_DANGEROUS_CONTENT`, etc. |
| `threshold` | enum | Block threshold: `BLOCK_LOW_AND_ABOVE`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_ONLY_HIGH`, `BLOCK_NONE`, `OFF`. |

---

## Python Example (Google GenAI SDK)

```python
from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3.8-flash",
    contents="Write a story about a magic backpack.",
    config=types.GenerateContentConfig(
        temperature=1.0,
        max_output_tokens=800,
        top_p=0.8,
        top_k=10,
    ),
)
print(response.text)
```

---

## Key Notes

1. **`systemInstruction`** is currently text-only.
2. **`thinkingConfig`** allows control over reasoning depth for thinking models; `thinkingLevel` is recommended for Gemini 3+ models.
3. **`responseSchema`** requires a compatible `responseMimeType` (e.g. `application/json`).
4. **`candidateCount`** is not supported for Gemini 1.0 family models.
5. **`topK`** is not available for models that use only nucleus sampling.
6. **Streaming** requires the `streamGenerateContent` endpoint with `alt=sse` for server-sent events.