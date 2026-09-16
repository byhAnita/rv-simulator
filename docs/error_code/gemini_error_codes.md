This page provides a reference for backend error codes returned by the `GenerateContent` API, describes the gRPC error response format, and provides troubleshooting steps.

## HTTP error codes

The following table lists common backend error codes, explanations for their causes, and recommended solutions:

|---|---|---|---|---|
| **HTTP Code** | **Status** | **Description** | **Example** | **Solution** |
| 400 | INVALID_ARGUMENT | The request body is malformed. | There is a typo, or a missing required field in your request. | Check the [API reference](https://ai.google.dev/api) for request format, examples, and supported versions. Using features from a newer API version with an older endpoint can cause errors. |
| 400 | FAILED_PRECONDITION | Gemini API free tier is not available in your country. Please enable billing on your project in Google AI Studio. | You are making a request in a region where the free tier is not supported, and you have not enabled billing on your project in Google AI Studio. | To use the Gemini API, you will need to setup a paid plan using [Google AI Studio](https://aistudio.google.com/apikey). |
| 403 | PERMISSION_DENIED | Your API key doesn't have the required permissions. | You are using the wrong API key; you are trying to use a tuned model without going through [proper authentication](https://ai.google.dev/gemini-api/docs/model-tuning). | Check that your API key is set and has the right access. And make sure to go through proper authentication to use tuned models. |
| 404 | NOT_FOUND | The requested resource wasn't found. | An image, audio, or video file referenced in your request was not found. | Check if all parameters in your request are valid for your API version. |
| 429 | RESOURCE_EXHAUSTED | You've exceeded one of the API's rate limits (RPM, TPM, RPD, spend, etc.). | You are sending too many requests, using too many tokens, or exceeding spend-based limits for your account's billing history and tier. | Verify that you're within the model's [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). Wait and retry after a short period. Reduce the rate or size of your requests. [Request a rate limit increase](https://ai.google.dev/gemini-api/docs/rate-limits#request-rate-limit-increase) if needed. |
| 499 | CANCELLED | The operation was cancelled, typically by the caller. | The client closed the connection before the API could finish responding. | Check if your client or network infrastructure is prematurely closing the connection (e.g., due to a client-side timeout). |
| 500 | INTERNAL | An unexpected error occurred on Google's side. | Your input context is too long. | Check the [Gemini API status page](https://aistudio.google.com/status) for any ongoing incidents. Reduce your input context or temporarily switch to another model (e.g. from Gemini 2.5 Pro to Gemini 2.5 Flash) and see if it works. Or wait a bit and retry your request. If the issue persists after retrying, please report it using the **Send feedback** button in Google AI Studio. |
| 503 | UNAVAILABLE | The service may be temporarily overloaded or down. | The service is temporarily running out of capacity. | Check the [Gemini API status page](https://aistudio.google.com/status) for any ongoing incidents. Temporarily switch to another model (e.g. from Gemini 2.5 Pro to Gemini 2.5 Flash) and see if it works. Or wait a bit and retry your request. If the issue persists after retrying, please report it using the **Send feedback** button in Google AI Studio. |
| 504 | DEADLINE_EXCEEDED | The service is unable to finish processing within the deadline. | Your prompt (or context) is too large to be processed in time. | Set a larger 'timeout' in your client request to avoid this error. |

## Error response format

When a `GenerateContent` request fails, the API sets the HTTP status code (such as `400 Bad Request`, `403 Forbidden`, or `429 Too Many Requests`) and returns a JSON response body containing gRPC status details:

    {
      "error": {
        "code": 400,
        "message": "API key not valid. Please pass a valid API key.",
        "status": "INVALID_ARGUMENT",
        "details": [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            "reason": "API_KEY_INVALID",
            "domain": "googleapis.com",
            "metadata": {
              "service": "generativelanguage.googleapis.com"
            }
          },
          {
            "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
            "locale": "en-US",
            "message": "API key not valid. Please pass a valid API key."
          }
        ]
      }
    }

| Field | Type | Description |
|---|---|---|
| `code` | integer | The HTTP status code. |
| `message` | string | A human-readable description of the error. |
| `status` | string | The gRPC status code in `SCREAMING_CASE`. |
| `details` | array | Additional error context, such as `ErrorInfo` or `LocalizedMessage`. |

## What's next

- [API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): Resolve common issues and error scenarios.
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): Learn about request limits and quota handling.