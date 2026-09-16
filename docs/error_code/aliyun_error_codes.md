## Documentation Index
> Fetch the complete documentation index at: https://platform.qianwenai.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# error message

API Error Code Reference

This article describes the error messages that may occur when using the Qianwen AI platform services and their solutions.

## 400 - Invalid Parameter

### parameter.enable\_thinking must be set to false for non-streaming calls/parameter.enable\_thinking only support stream call

**Reason:** The thinking mode model was invoked using a non-streaming output method.

**Solution:** Set the `enable_thinking` parameter to `false`, or use the [streaming output](/developer-guides/run-and-scale/streaming) method to invoke the thinking mode model.

### The thinking\_budget parameter must be a positive integer and not greater than xxx

**Reason:** The `thinking_budget` parameter is not within the range of possible values.

**Solution:** Please refer to the maximum thought chain length of the models in the model list and specify a value greater than 0 and not exceeding that length.

### This model only supports stream mode, please enable the stream parameter to access the model.

**Reason:** The model only supports streaming output (/developer-guides/run-and-scale/streaming), but streaming output was not enabled when it was called.

**Solution:** Please use the [streaming output](/developer-guides/run-and-scale/streaming) method to call the model.

### This model does not support enable\_search.

**Reason:** The current model does not support web search (/developer-guides/tool-calling/web-search), but the `enable_search` parameter is specified as `true`.

**Solution:** Please use a model that supports online search capabilities.

The currently set language is not supported!

**Reason:** The `source_lang` or `target_lang` passed in when using the Qwen-MT model is in the wrong format or is not in the [Supported Languages](/developer-guides/text-generation/qwen-mt).

**Solution:** Please enter the correct English name or language encoding.

### The incremental\_output parameter must be "true" when enable\_thinking is true

**Reason:** The model only supports incremental streaming output when thinking mode is enabled, and the `incremental_output` parameter is not set to `true`.

**Solution:** Set the `incremental_output` parameter to `true` before calling the API; the API will then return the incremental content.

### The incremental\_output parameter of this model cannot be set to False.

**Reason:** The model only supports incremental streaming output, and the `incremental_output` parameter is not set to `true`.

**Solution:** Set the `incremental_output` parameter to `true` before calling the API; the API will then return the incremental content.

### Range of input length should be \[1, xxx]（InternalError.Algo.InvalidParameter）

**Reason:** The length of the input content exceeds the model's maximum limit when calling the model.

**Solution**:

- If calling via code, please ensure the number of Tokens in the messages array is within the maximum input Token range of the model;
- When using a conversation client (such as Chatbox) or workbench for continuous conversations, each request carries a history record, which can easily exceed the model's limits. Once the limits are exceeded, please start a new conversation.

### Range of max\_tokens should be \[1, xxx]

**Reason:** The `max_tokens` parameter is not set within the range of [1, maximum number of tokens output by the model].

**Solution**: Please refer to "Maximum Output Tokens" in the model list documentation for the `max_tokens` upper limit.

### Temperature should be in \[0.0, 2.0)/'temperature' must be Float

**Reason:** The temperature parameter setting is not within the range of [0.0, 2.0).

**Solution:** Set the temperature parameter to a number greater than or equal to 0 and less than 2.

### Range of top\_p should be (0.0, 1.0]/'top\_p' must be Float

**Reason:** The top_p parameter is not set within the range of (0.0, 1.0).

**Solution:** Set the `top_p` parameter to a number greater than 0 and less than or equal to 1.

### Parameter top\_k be greater than or equal to 0

**Reason:** The `top_k` parameter is set to a number less than 0.

**Solution:** Set the `top_k` parameter to a number greater than or equal to 0.

### Repetition\_penalty should be greater than 0.0

**Reason:** The `repetition_penalty` parameter is set to a number less than or equal to 0.

**Solution:** Set the `repetition_penalty` parameter to a number greater than 0.

### Presence\_penalty should be in \[-2.0, 2.0]

**Reason:** The `presence_penalty` parameter is not in the range `[-2.0, 2.0]`.

**Solution:** Set the `presence_penalty` parameter to the range `[-2.0, 2.0]`.

### Range of n should be \[1, 4]

**Reason:** The n parameter is not set within the range of [1, 4].

**Solution:** Set the n parameter within the range of [1, 4].

### Range of seed should be \[0, 9223372036854775807]

**Reason:** The `seed` parameter was not set within the range of [0, 9223372036854775807] when using the DashScope protocol.

**Solution:** Set the `seed` parameter within the range of [0, 9223372036854775807].

### Request method 'GET' is not supported.

**Reason:** The current interface does not support the `GET` request method.

**Solution:** Please refer to the API documentation and resubmit the request using a supported request method (such as `POST`).

### messages with role "tool" must be a response to a preceding message with "tool\_calls"

**Reason:** The Assistant Message was not added to the messages array when the tool was invoked.

**Solution:** Please add the Assistant Message from the model's first response to the messages array before adding the Tool Message.

### An assistant message with "tool\_calls" must be followed by tool messages responding to each "tool\_call\_id"

**Reason:** When an assistant message contains `tool_calls`, it must be followed by a tool role message to respond to each `tool_call_id`. This is commonly seen when the message sequence format is incorrect when using a tool call, such as appending a user message directly after an assistant message containing `tool_calls`.

**Solution:** After the assistant message with `tool_calls` and before sending the next user message, insert the corresponding tool role message (each message containing the matching `tool_call_id` and the execution result of that tool). Each `tool_call_id` in the assistant message must have one and only one corresponding tool message.

### Required body invalid, please check the request body format.

**Reason:** The request body format does not meet the interface requirements.

**Solution:** Please check the request body to ensure it is a standard JSON string. Common issues include extra commas, unclosed parentheses, and unclosed quotation marks.

Example of an error (the `text` field is missing a closing quote, resulting in a non-valid JSON request body):

json
{"model":"qwen-image-edit","input":{"messages":[{"role":"user","content":[{"image":"https://example.com/img.png"},{"text":"Please change the image background to blue}]}]}}
```

Correct example:

json
{"model":"qwen-image-edit","input":{"messages":[{"role":"user","content":[{"image":"https://example.com/img.png"},{"text":"Please change the image background to blue"}]}]}}
```

Before submitting a request, you can use JSON validation tools such as jsonlint.com to check the request body syntax, or you can use a large model to help fix the request body format.

### input content must be a string.

**Reason:** The plain text model does not support setting the content in messages to a non-string type.

**Solution:** Do not set the content to an array type such as `[{"type": "text","text": "Who are you?"}]`.

### The content field is a required field.

**Reason:** The `content` parameter was not specified when making the request, such as `{"role": "user"}`.

**Solution:** Please specify the `content` parameter. For example, `{"role": "user","content": "Who are you"}`.

### current user api does not support http call.

**Reason:** The current model does not support non-streaming output.

**Solution:** Please use [streaming output](/developer-guides/run-and-scale/streaming).

### Either "prompt" or "messages" must exist and cannot both be none

**Reason:** When calling the large model, neither the `messages` parameter nor the `prompt` parameter (which is soon to be deprecated) was specified. If an error occurs after specifying the `messages` parameter, it may be due to an incorrect format. For example, when using DashScope-HTTP, `messages` should be placed in the `input` object, not listed alongside the `model` parameter.

**Solution:** Please specify the `messages` parameter. If you have already specified it but still encounter an error, please refer to the API documentation ([Qianwen](/developer-guides/getting-started/text-generation-models)) to check if its location is correct.

### 'messages' must contain the word 'json' in some form, to use 'response\_format' of type 'json\_object'.

**Reason:** When using [Structured Output](/developer-guides/text-generation/structured-output), the prompt does not include the keyword `json`.

**Solution:** Add `json` (case-insensitive) to the prompt, such as: "Please output in json format".

### Json mode response is not supported when enable\_thinking is true

**Reason:** Using [structured output](/developer-guides/text-generation/structured-output) enabled the model's thinking mode.

**Solution:** When using structured output, set `enable_thinking` to `false` to disable thinking mode. See also the FAQ [How to structure the output of the thinking mode model?](/resources/faq-text-generation)

### Tool names are not allowed to be \[search]

**Reason:** The tool name cannot be set to `search`.

**Solution:** Set the tool name to a value other than `search`.

### Unknown format of response\_format, response\_format should be a dict, includes 'type' and an optional key 'json\_schema'. The response\_format type from user is xxx.

**Reason:** The specified `response_format` parameter does not conform to the rules.

**Solution:** To use the [Structured Output](/developer-guides/text-generation/structured-output) feature, set the `response_format` parameter to `{"type": "json_object"}`.

### The value of the enable\_thinking parameter is restricted to True.

**Reason:** Some models (such as `qwen3-235b-a22b-thinking-2507`) cannot have the `enable_thinking` parameter set to `false`.

**Solution**:

- If using a third-party tool (such as Cherry Studio), please turn on the "Think" switch in the input box.
- If calling via code, please set `enable_thinking` to `true`.

### 'audio' output only support with stream=true

**Reason:** The Qwen-Omni model was not used in streaming mode, while the model only supports streaming mode.

**Solution:** Set the `stream` parameter to `true` to enable streaming output.

### tool\_choice is one of the strings that should be \["none", "auto"]

**Cause**: The `tool_choice` parameter specified when initiating the Function Calling is incorrect.

**Solution:** Please specify "auto" (allow the large model to choose the tool automatically) or "none" (force the tool not to be used).

### Model not exist.

**Reason:** The `model` parameter is missing or incorrectly formatted.

**Solution**:

- **Check model name format**: Confirm that the `model` parameter is case-sensitive and that there are no extra spaces.
- **Use the correct model name:** Please check the input `model` against the model name in the model list to ensure it is correct. Do not mix open-source community model names with Qianwen AI platform model IDs. For example, you should use `qwen3-235b-a22b-instruct-2507` instead of `Qwen/Qwen3-235B-A22B-Instruct-2507`.

### The product is not activated, please confirm that you have activated products and try again after activation.

**Cause:** The model service being called is not enabled (not activated). When calling through the OpenAI compatible interface, if the target model is not available in the model marketplace, the gateway will return this error with the error code `invalid_parameter_error`.

**Solution**:

- **Activate Model Service**: Please go to the [Model Marketplace](https://www.qianwenai.com/models) and confirm that the model you want to call (such as `kimi-k3`) is activated before calling it.
- **Activate Qianwen AI Platform Service**: If you have not yet activated the Qianwen AI Platform Service, please activate it before using it.

### The result\_format parameter must be "message" when enable\_thinking is true

**Reason:** The `result_format` parameter was not set to `"message"` when calling the thinking mode model.

**Solution:** Set the `result_format` parameter to `"message"`.

### The audio is empty

**Cause:** The input audio duration is too short, resulting in insufficient sampling points.

**Solution:** Please increase the duration of the audio.

### File parsing in progress, please try again later.

**Reason:** The file was not fully parsed when using the Qwen-Long model.

**Solution:** Please wait for the file parsing to complete before trying again.

### The "stop" parameter must be of type "str", "list\[str]", "list\[int]", or "list\[list\[int]]", and all elements within the list must be of the same type.

**Reason:** The `stop` parameter does not conform to the format `str`, `list[str]`, `list[int],` or `list[list[int]]`.

**Solution:** Refer to the API documentation (/developer-guides/getting-started/text-generation-models) and set the `stop` parameter to the correct format.

### Value error, batch size is invalid, it should not be larger than xxx.

**Reason:** The number of texts exceeded the model's limit when the Embedding model was called.

**Solution:** Refer to the **batch size** information for the model in the [Embedding](/developer-guides/embeddings/embedding) document to control the amount of incoming text.

### Invalid file \[id:file-fe-].

**Reason:** The provided file-id is invalid. For example, the file-id was entered incorrectly, or a file-id that does not belong to the current Qianwen AI platform account was used.

**Solution**: Verify the validity of the file-id using [OpenAI Compatibility-File](/api-reference/platform-api/file), or re-upload [OpenAI Compatibility-File](/api-reference/platform-api/file) to obtain a new file_id before making the call.

### \[] is too short

**Reason:** The input messages array is empty.

**Solution:** Please add a message before making the request.

### The tool call is not supported.

**Reason:** The model being used does not support passing the `tools` parameter.

**Solution:** Please switch to the Qwen or DeepSeek model, which supports Function Calling.

### Repetitive tool calls detected in the conversation history. The same tool call with identical name and arguments has been repeated across multiple consecutive rounds. Please modify your request or adjust the tool call arguments to avoid infinite loops.

**Cause:** Duplicate tool calls were detected in the dialogue history: tool calls with identical names and parameters occurred repeatedly in multiple consecutive rounds, indicating the model may be stuck in a loop. The corresponding HTTP status code for this error is 400, and the error code is `InternalError.Algo.InvalidParameter`.

**Solution**:

- After each round of tool calls, the execution result of the tool is appended to the `messages` array in the form of a Tool Message before the next round of requests is initiated. This allows the model to proceed accordingly rather than repeatedly initiating the same calls.
- Check if the tool returns results correctly; if the tool continues to return the same or invalid results, it is recommended to add a limit on the number of tool calls or termination logic on the application side to avoid infinite loops.
- Optimize prompts when necessary, clarify the conditions for task completion, and avoid the model repeatedly initiating the same tool call.

### The provided messages input is invalid. The error info is \[Unexpected item type in content] / Input should be a valid string / Input should be a valid dictionary or instance of ... (input.messages.x.content...)

**Cause:** The `content` field of a message in the `messages` array contains an unsupported element type. When `content` is an array, each element must be a string or a compliant object (such as `{"type": "text", "text": "..."}`, `{"type": "image_url", ...}`, etc.). This error is triggered if the array contains numbers, booleans, nested arrays, or objects whose `type` value is unsupported. The corresponding HTTP status code is 400, and the error code is `InternalError.Algo.InvalidParameter`.

**Common Scenarios**: When using a plain text model (such as the Qwen-Max text series, including `qwen3-max`), if the `messages` (especially multi-turn dialogue history) contain multimodal `content` elements such as images (`image_url`), this error will also be triggered because the plain text model does not support modal inputs such as images (in some access tools/agents, this error may be translated as "model service provider returned empty content" or similar prompts).

**Solution**:

- **Plain Text Model:** Please set `content` to a string; do not pass in an array or other types. If your business requires multimodal input such as images, please use a multimodal model (such as Qwen-VL, Qwen3-VL series). If you need to continue using the plain text model, please remove multimodal elements such as images (`image_url`) from `messages` and the conversation history before calling it.
- **Multimodal Model**: Each element in the `content` array must be a valid object. `type` only supports modal types supported by the `text`, `image_url`, `video_url`, and `video` models. Do not include numbers, booleans, nested arrays, or elements that are missing `type` or have invalid `type` values.

### Required parameter(xxx) missing or invalid, please check the request parameters.

**Reason:** The API call parameters are invalid.

**Solution:** Please check the request parameters to ensure that all required parameters are provided and in the correct format.

### input must contain file\_urls

**Cause**: The request parameter `file_urls` was not assigned a value when using Paraformer speech recognition to recognize audio files.

**Solution:** Include the `file_urls` parameter in the request and assign it a value.

### The provided URL does not appear to be valid. Ensure it is correctly formatted.

**Reason:** When using visual understanding, full-modal, or audio understanding models, the URL or local path of the incoming data is invalid or does not meet the requirements.

**Solution**:

- **Pass-in URL**: Must begin with `http://`, `https://`, or `data:`. If it begins with `data:`, `"base64"` must be included before the Base64 encoded data.
- **Pass in a local path**: It must start with `file://`.
- **Pass in a temporary URL**: When calling via HTTP, ensure that the parameter `X-DashScope-OssResourceResolve: enable` is added to the request header.
- Call via SDK: Only DashScope SDK calls are supported. Do not use OpenAI SDK.

### Input should be a valid dictionary or instance of GPT3Message

**Reason:** The format of the messages field does not meet the requirements, such as mismatched parentheses or missing key-value pairs.

**Solution:** Please check if the JSON structure of the `messages` field is correct.

### Value error, contents is neither str nor list of str.: input.contents

**Reason:** When using the Embedding model, the input is neither a string nor an array of strings.

**Solution:** Please change the input format to a string or a list of strings.

### File \[id:file-fe-xxx] format is not supported.

**Reason:** The Qwen-Long model is limited to processing plain text files (TXT, DOCX, PDF, EPUB, MOBI, MD) and does not support images or scanned documents.

**Solution:** For text extraction, analysis, and summarization of image content, the Qianwen VL model can be used.

### File \[id:file-fe-] cannot be found.

**Reason:** This only occurs in the Qwen-Long model's dialogue scenario, specifically when the OpenAI file compatibility interface is called to delete related files within a very short time after a dialogue request is initiated.

**Solution:** Please wait for the model to complete the dialogue before deleting the relevant files.

Too many files were provided.

**Reason:** The number of file-ids provided has exceeded the limit.

**Solution:** Ensure that the number of file-ids is less than 100.

### File \[id:file-fe-] exceeds size limit.

**Reason:** The file size exceeds the limit.

**Solution:** Ensure the file size is less than 150 MB.

### File \[id:file-fe-] exceeds page limits (15000 pages).

**Reason:** The number of pages in the file has exceeded the limit.

**Solution:** Ensure the document has fewer than 15,000 pages.

### File \[id:file-fe-] content blank.

**Reason:** The file content is empty.

**Solution:** Ensure the file content is not empty.

### Total message token length exceed model limit (10000000 tokens).

**Reason:** The total length of the input exceeds 10,000,000 tokens.

**Solution:** Ensure the message length meets the requirements.

### The video modality input does not meet the requirements because: the range of sequence images should be (4, 512)./(4,80).

**Reason:** When using the Qianwen VL model to input videos as an image list, the number of images does not meet the requirements.

**Solution:** Qwen3-VL and Qwen2.5-VL series models require 4-512 images; other models require 4-80 images. See [Image and Video Understanding](/developer-guides/multimodal/vision) for details.

### Exceeded limit on max bytes per data-uri item : 10485760'. / Multimodal file size is too large

**Reason:** The local image or video passed to the multimodal model (Qwen-VL, QVQ, Qwen-Omni) exceeds the size limit.

**Solution**:

- **Local files:** Base64 encoded files must not exceed 10 MB.
- **File URL**: Image files must not exceed 10 MB; for video files, Qwen3-VL, qwen-vl-max: not exceeding 2 GB;
- qwen-vl-plus series: No more than 1GB;
- Other models should not exceed 150MB.

For information on compressed file size, please refer to [How to compress images or videos to the required size?](/resources/faq-images-videos).

### Input should be 'Cherry', 'Serena', 'Ethan' or 'Chelsie': parameters.audio.voice

**Cause**: The `voice` parameter was incorrectly specified when using Qwen-Omni or Qwen-TTS.

**Solution:** Please specify one of 'Cherry', 'Serena', 'Ethan', or 'Chelsie'.

### The image length and width do not meet the model restrictions.

**Reason:** The image dimensions (length and width) of the input image to the Qianwen VL model do not meet the model's requirements.

**Solution**: The image size must meet the following requirements: both width and height must be no less than 10 pixels, and the aspect ratio should not exceed 200:1 or 1:200.

### Failed to decode the image during the data inspection.

**Reason:** Image decoding failed.

**Solution:** Please check if the image is corrupted and if the image format meets the requirements.

### The file format is illegal and cannot be opened. / The audio format is illegal and cannot be opened. / The media format is not supported or incorrect for the data inspection.

**Reason:** The file format is unsupported or the file cannot be opened.

**Solution:** Please check if the file is corrupted, if the file extension and actual format match, and if the file format is supported.

### The input messages do not contain elements with the role of user.

**reason**:

- No User Message was passed to the model when it was invoked;
- When calling the Qianwen AI Platform workflow application via API, the parameters passed in the start node must be passed through the `biz_params` parameter (instead of `user_prompt_params`).

**Solution:** Ensure that you pass the User Message to the model, or pass the custom parameters correctly.

### Failed to download multimodal content. / Download the media resource timed out during the data inspection process. / Unable to download the media resource during the data inspection process.

**Reason:** The server is unable to download the media file pointed to by the public URL, which may be caused by the following reasons.

- **Connectivity Issue**: The internal network address of [Aliyun Object Storage Service](https://www.aliyun.com/product/oss) was used.
- **Network latency**: Timeout caused by remote access.
- **Service Unstable**: The source storage service is slow to respond or unreachable.
- **Security Policy Interception**: When the server downloads a public URL, the User-Agent it carries contains the `DashScopeUserBot` identifier. The security policy of the third-party server may block this identifier, causing the download to fail.

**Solution**:

**Switching Storage Services:** We recommend using a low-latency storage service. We recommend using [Alibaba Cloud Object Storage Service](https://www.aliyun.com/product/oss) to generate a public IP address (please do not use an internal IP address).
- **Adjust Transmission Method** If passing a public URL fails, please refer to [Passing a Local File (Base64 Encoded or File Path)](/resources/faq-images-videos) to switch to the recommended transmission method:

| **File Type** | **File Specification** | **DashScope SDK (Python, Java)** | **OpenAI Compatible / DashScope HTTP** |
| -------- | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Image | Larger than 7MB, Less than 10MB | Pass in local path | Only public URLs are supported. It is recommended to use [Alibaba Cloud Object Storage Service](https://www.aliyun.com/product/oss) |
| Image | Less than 7MB | Pass in local path | Base64 encoded |
| Video | Larger than 100 MB | Public URLs only, Alibaba Cloud Object Storage Service (https://www.aliyun.com/product/oss) is recommended | Public URLs only, Alibaba Cloud Object Storage Service (https://www.aliyun.com/product/oss) is recommended |
| Video | Larger than 7MB, less than 100MB | Pass in local path | Only public URLs are supported. It is recommended to use [Alibaba Cloud Object Storage Service](https://www.aliyun.com/product/oss) |
| Video | Less than 7MB | Pass in local path | Base64 encoded |
| Audio | Larger than 10 MB | Public URLs only, Alibaba Cloud Object Storage Service (https://www.aliyun.com/product/oss) is recommended. | Public URLs only, Alibaba Cloud Object Storage Service (https://www.aliyun.com/product/oss) is recommended.
| Audio | Greater than 7MB, less than 10MB | Pass in local path | Only public URLs are supported. It is recommended to use [Alibaba Cloud Object Storage Service](https://www.aliyun.com/product/oss) |
| Audio | Less than 7MB | Pass in local path | Base64 encoded |

Base64 encoding increases data size; the original file size should be less than 7 MB.
Using Base64 or local paths can avoid server-side download timeouts and improve stability.

- Allow `DashScopeUserBot` requests. If the images are hosted on a server you control, allow requests with `DashScopeUserBot` in the User-Agent in your security policy. Alternatively, you can use the method of passing in a local file (Base64 encoded or file path) (/resources/faq-images-videos) to avoid the server downloading public URLs.

### Failed to find the requested media resource during the data inspection process.

**Reason:** The passed resource URL is invalid or inaccessible.

**Solution**:

- Confirm that the URL format is correct and accessible.
- Confirm that the resource files have not been deleted or moved.
- Confirm that the URL has not expired (if using an OSS-signed URL, the expiration date must be checked).

### url error, please check url!

**Reason 1: Model Name and API Endpoint Mismatch:** For example, using a multimodal interface when calling a plain text model, or using a plain text interface when calling a multimodal model. **Solution:** When using multimodal models such as qwen3.7-plus, qwen3-vl-plus, qwen3.8-max, and qwen3.8-flash through DashScope, you need to use the `MultiModalConversation.call()` or `multimodal-generation` endpoint. Refer to [Image and Video Understanding](/developer-guides/multimodal/vision) for details. When switching from a plain text model (e.g., qwen3.7-max) to a multimodal model (e.g., qwen3.8-max), you need to change the calling method from `Generation.call()` to `MultiModalConversation.call()`; otherwise, a URL error will be returned.
  If using the spring-ai-alibaba framework, please confirm whether the multimodal parameter [withMultiModel](https://github.com/spring-ai-alibaba/examples/blob/c66ffdec789defe4adf86b34bac0084df3b71e92/spring-ai-alibaba-multi-model-example/dashscope-multi-model/src/main/java/com/alibaba/cloud/ai/example/multi/controller/MultiModelController.java#L82).
- When using **pure text models** such as qwen3-max, qwen-plus, and deepseek-v3.2 through DashScope, you need to use the Generation.call() or text-generation endpoint. For details, please refer to [Overview of Text Generation Models](/developer-guides/getting-started/text-generation-models).
- When using the CosyVoice **voice cloning** API through DashScope: This API includes `model` and `target_model` parameters: `model` must be set to `voice-enrollment`, and `target_model` must be set to the specific CosyVoice model. For details, please refer to [CosyVoice Voice Cloning/Design API](/api-reference/speech-synthesis/voice-cloning/overview).
- **Reason 2: Outdated DashScope SDK Version:** When calling the image/video generation model, the older SDK version cannot recognize the correct server address; **Solution:** [Upgrade SDK Version](/api-reference/preparation/install-sdk)

### Don't have authorization to access the media resource during the data inspection process.

**Reason:** The URL of the signed file in OSS passed in when calling the model has expired.

**Solution:** Ensure that the file is accessed within the validity period of the file URL.

### The item of content should be a message of a certain modal.

**Reason:** When using the DashScope SDK to call a multimodal model, the key of each element in the `content` array must be one of the following values: `image`, `video`, `audio`, or `text`.

**Solution:** Please use the correct `content` parameter.

### Invalid video file.

**Reason:** The submitted video file is invalid.

**Solution:** Please check if the video file is corrupted or if the format is correct.

### The video modality input does not meet the requirements because: The video file is too long.

**Reason:** The video duration of the input Qwen VL model or Qwen-Omni model exceeds the limit.

**Solution**:

- The Qwen2.5-VL model should support video lengths between 2 seconds and 10 minutes.
- Other Qwen VL or Qwen-Omni models support video lengths between 2 and 40 seconds.

### Field required: xxx

**Reason:** Missing input parameters.

**Solution:** Please supplement the parameters according to the error message `xxx`.

### The request is missing required parameters or in a wrong format, please check the parameters that you send.

**Reason:** Missing input parameters or incorrect input parameter format.

**Solution:** Please check that the request parameters are complete and correctly formatted.

### Missing training files.

**Reason:** Incorrect parameters, missing parameters, or parameter format issues, etc.

The style is invalid.

**Reason:** The style is not within the enumeration range.

**Solution:** Please check if the value of the `style` parameter is correct.

### The style\_level is invalid.

**Reason:** The style_level is not within the enumeration range.

**Solution:** See [EMO Video Generation](/api-reference/video-generation/emo-video/create-task) for details.

### parameters.video\_ratio must be 9:16 or 3:4.

**Reason:** The input parameter for `video_ratio` can only be 9:16 or 3:4.

**Solution:** Please modify the `video_ratio` parameter to "9:16" or "3:4".

The xxx parm is invalid!

**Reason:** Input parameters are out of range.

**Solution**: See [Video Style Redrawing](/developer-guides/video-generation/video-editing) for details.

### Input JSON error.

**Reason:** Error in JSON input.

**Solution:** Please check if the JSON format of the request is correct.

### Image read error.

**Reason:** Image reading failed.

**Solution:** Please check if the image file is corrupted or if the format is correct.

### the parameters must conform to the specification: xxx.

**Reason:** The input parameter value is out of range.

**Solution:** Please check and correct the parameter values ​​according to the error message `xxx`.

### The size of person image and coarse\_image are not the same.

**Reason:** The resolution of coarse_image is inconsistent with that of person_image.

**Solution:** Ensure that `coarse_image` and `person_image` have the same resolution.

### The request is missing required parameters or the parameters are out of the specified range, please check the parameters that you send.

**Reason:** The necessary interface call parameters are missing or the parameters are out of bounds.

**Solution:** Please check and correct the request parameters.

### Image format error

**Reason:** Incorrect image format.

**Solution:** The URL must be an image URL or a Base64 string.

### No messages found in input

**Reason:** The request parameters must include the "messages" field.

**Solution:** See [Qianwen - Image Editing](/api-reference/image-generation/qwen-image-editing) for details.

### Invalid image format or corrupted file

**Reason:** The input image format is incorrect or the file is corrupted.

**Solution:** Please check if the file can be opened and downloaded normally, and ensure that the file is complete and meets the format requirements.

Image download failed.

**Reason:** The image cannot be downloaded.

**Solution:** Please check if the file can be downloaded normally.

### messages length only supports 1

**Reason:** The length of the messages array is only supported to be 1.

**Solution:** Only one dialogue message can be passed in at a time. See [Qianwen - Image Editing](/api-reference/image-generation/qwen-image-editing) for details.

### content length only supports 2

**Reason:** The length of the content array is only supported to be 2.

**Solution:** Only one set of text and image can be passed in. See [Qianwen - Image Editing](/api-reference/image-generation/qwen-image-editing) for details.

### lack of image or text

**Reason:** The request parameters are missing the image or text field.

**Solution:** See [Qianwen - Image Editing](/api-reference/image-generation/qwen-image-editing) for details.

### num\_images\_per\_prompt must be 1.

**Reason:** The request parameters are invalid. The parameter `n` (number of images to generate) can only be set to 1.

**Solution:** Please set the value of parameter `n` to 1.

### Input files format not supported.

**Reason:** The audio and image formats do not meet the requirements.

**Solution:** Audio supports mp3, wav, and aac formats; image supports jpg, jpeg, png, bmp, and webp formats. See [LivePortrait Video Generation](/api-reference/video-generation/liveportrait-video/create-task) for details.

### Failed to download input files.

**Reason:** Input file download failed.

**Solution:** Please check if the file URL is accessible and if the network connection is stable.

### OSS download error.

**Reason:** Input image download failed.

**Solution:** Please check if the OSS link for the image is correct and accessible.

### The image content does not comply with green network verification.

**Reason:** The image content is non-compliant.

**Solution:** Please replace the image with one that complies with content security guidelines.

### Video reading error.

**Reason:** Failed to read video.

**Solution:** Please check if the video file is corrupted or in an unsupported format.

### the size of input image is too small or too large.

**Reason:** The input image size is too small or too large.

**Solution:** Please adjust the image size to meet API requirements.

### The request parameter is invalid, please check the request parameter.

**Cause**: This error is a common error across multiple scenarios: it may be due to non-compliant `clothes_type` input parameter (AI try-on - image segmentation) or non-compliant frame input parameter.

**Solution**: See [AI Try-On - Image Segmentation](/api-reference/image-generation/aitryon-parsing) for details; if it is a problem with the image aspect ratio, you can choose "1:1" or "3:4".

### The type or value of {parameter} is out of definition.

**Reason:** The parameter type or value does not meet the requirements.

**Solution**: See [LivePortrait Video Generation](/api-reference/video-generation/liveportrait-video/create-task) for details.

### request timeout after 23 seconds.

**Cause:** No data was sent to the service for more than 23 seconds. This error message was generated when using [Real-time Speech Synthesis (Sambert)](/api-reference/speech-synthesis/sambert/websocket), [Real-time Speech Recognition/Translation (Gummy)](/developer-guides/speech/realtime-multimodal-speech), [Speech Recognition (Paraformer)](/api-reference/speech-recognition/paraformer-realtime/websocket-api), and [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk).

**Solution:** Please check why no data has been sent to the server for an extended period. If no message is sent to the server for an extended period (more than 23 seconds), please terminate the task promptly.

### Please ensure input text is valid.

**Cause:** If you are using [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk), this error is usually caused by the failure to send the text to be synthesized. Possible causes include: missing parameters (the `text` parameter was not assigned a value) or code errors (causing the assignment of the `text` parameter to fail).

**Solution:** Please check your code to ensure that the `text` parameter is correctly assigned and sent.

### Missing required parameter 'payload.model'! Please follow the protocol!

**Cause**: If you are using [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk), this error is usually due to the `model` parameter not being specified when sending the [run-task command](/api-reference/speech-synthesis/cosyvoice/websocket-api).

**Solution:** Please specify the `model` parameter.

### \[tts:]Engine return error code: 418

**Cause**: The request parameter `voice` (timbre) for [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk) is incorrect, or the `model` (model) version does not match the `voice` (timbre) version.

**Solution**:

1. **Check** the `voice` parameter assignment:

- If you are using the default tone, please check the "voice parameters" in the [Python SDK](/api-reference/speech-synthesis/cosyvoice/python-sdk).
- If you are using a voice replica, please confirm that the voice replica status is "OK" through the [CosyVoice Voice Replica/Design API](/developer-guides/speech/voice-design) interface, and ensure that the account to which the voice replica belongs is consistent with the account that calls it.

2. **Version matching check:** The v2 model can only use v2 timbres, and the v1 model can only use v1 timbres. The two cannot be used interchangeably.

### Request voice is invalid!

**Cause**: If you are using [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk), this error is usually because the voice is not set.

**Solution:** Please check if the `voice` parameter has been assigned a value. If you are using the WebSocket API (/api-reference/speech-synthesis/cosyvoice/websocket-api), please refer to the API documentation and configure the parameters in the correct JSON format.

### ref\_images\_url and obj\_or\_bg must be the same length.

**Cause**: When using the multi-image reference function of [Video Generation 2.1](/developer-guides/video-editing), the array lengths of `ref_images_url` and `obj_or_bg` are inconsistent.

**Solution:** Ensure that the array lengths of `ref_images_url` and `obj_or_bg` are consistent.

### Check input data style.

**Reason:** The input parameters do not meet the input parameter requirements.

**Solution:** Please check and correct the input parameters.

### An error during model pre-process.

**Reason:** The content field was passed in with an incorrect format.

**Solution**:

- If calling via code, do not set the content to an array type such as `[{"type": "text", "text": "Who are you?"}]`.
- If using [Cline](/developer-guides/clients-and-developer-tools/cline), please click `MODEL CONFIGURATION` in the settings interface and check **Enable R1 messages format**.

### The image size is not supported for the data inspection.

**reason**:

- The image dimensions (length and width) of the input Qianwen VL model do not meet the model's requirements.
- Output image size exceeds the limit (10MB).

**Solution**:

- The image size must meet the following requirements: the width and height of the image must both be no less than 10 pixels.
- The aspect ratio should not exceed 200:1 or 1:200.

Adjust the parameters of the generated image.

### Required parameter(data\_sources) missing or invalid, please check the request parameters.

**Cause**: This error was returned when calling the SubmitIndexJob interface because the required parameter `SourceType` was not specified when calling the CreateIndex interface.

**Solution:** When creating a knowledge base based on a given document, this parameter must be `DATA_CENTER_FILE`; when creating a knowledge base based on a given category, this parameter must be `DATA_CENTER_CATEGORY`. See the CreateIndex documentation for details.

### Wrong Content-Type of multimodal url

**Cause**: The `Content-Type` field in the URL request response header is incorrect.

The Qianwen VL model supports the following Content Types: image/bmp, image/bmp, image/icns, image/x-icon, image/jpeg, image/jp2, image/png, image/sgi, image/tiff, and image/webp. For details, please refer to [Images Supported by the Qianwen VL Model](/resources/faq-images-videos).

**Solution**:

View the `Content-Type` field

1. Open your browser (such as Chrome or Firefox).
2. Open the developer tools (usually by pressing F12 or right-clicking and selecting "Inspect").
3. Switch to the Network tab.
4. Enter the image's URL into the address bar and visit it.
5. Locate the corresponding request, view the Headers section, and look for the Content-Type field in the Response Headers section.

### Field required: image\_url

**Reason:** Missing input parameter `image_url`.

**Solution:** Please refer to [Emoji Video Generation](/api-reference/video-generation/emoji-video/create-task) and pass in the `image_url` parameter.

### Field required: driven\_id

**Reason:** Missing input parameter `driven_id`.

**Solution:** Please refer to [Emoji Video Generation](/api-reference/video-generation/emoji-video/create-task) and pass in the `driven_id` parameter.

### Invalid ext_bbox

**Reason:** The input parameter `ext_bbox` is invalid.

**Solution:** Please refer to [Emoji Video Generation](/api-reference/video-generation/emoji-video/create-task) and pass in the correct `ext_bbox`.

### Driven not exist: driven\_id

**Reason:** The input `driven_id` does not exist.

**Solution:** Please refer to [Emoji Video Generation](/api-reference/video-generation/emoji-video/create-task) and pass in the correct `driven_id`.

### Text request limit violated, expected 1.

**Cause**: When calling the CosyVoice speech synthesis [WebSocket API](/api-reference/speech-synthesis/cosyvoice/websocket-api), the `enable_ssml` was set to `true` and the continue-task command was sent multiple times.

**Solution:** Setting `enable_ssml` to `true` allows only one continue-task instruction to be sent.

### SSML text is not supported at the moment!

**Cause:** When using the CosyVoice speech synthesis function, the current model or timbre does not support SSML, or the SSML function is not enabled correctly.

**Solution:** Please check the [Limitations and Constraints] section (/developer-guides/speech/realtime-streaming) for troubleshooting.

### At least one of 'lyrics' or 'prompt' must be provided.

**Reason:** The `lyrics` or `prompt` parameter was not provided in the request when using the Fun-Music model.

**Solution:** Please provide at least one of the `lyrics` or `prompt` parameters in the request.

### Lyrics content is illegal and cannot be used for music generation.

**Reason:** The lyrics content detection failed when using the Fun-Music model, possibly due to the inclusion of infringing content.

**Solution:** Please modify the lyrics to ensure they do not contain any infringing or illegal content, and then try again.

## 400-invalid\_request\_error-invalid\_value

### -1 is lesser than the minimum of 0 - 'seed'/'seed' must be Integer

**Reason:** When using the OpenAI compatible protocol, the `seed` parameter is not set within the range of [0, 2^31-1].

**Solution:** Set the `seed` parameter to the range [0, 2^31-1].

## 400-invalid\_request\_error

### you must provide a model parameter.

**Reason:** The `model` parameter was not provided in the request.

**Solution:** Please add the `model` parameter to the request.

## 400-InvalidParameter.NotSupportEnableThinking

### The model xxx does not support enable\_thinking.

**Reason:** The current model does not support setting the parameter `enable_thinking`.

**Solution:** Remove the `enable_thinking` parameter from the request, or use a model that supports thinking modes.

## 400 Invalid Value

### The requested voice 'xxx' is not supported.

**Reason:** When performing Qwen-TTS real-time speech synthesis, the selected timbre is generated through the Qwen-TTS voice replication function, but the two use different models.

**Solution:** Please check if the request parameter `target_model` for voice retrieval and the request parameter `model` for speech synthesis are consistent.

## 400-Arrearage

### Access denied, please make sure your account is in good standing.

**Reason:** The Qianwen AI platform account to which the API Key belongs has outstanding fees, resulting in access being denied.

**Solution:** Go to [Bill Overview](https://platform.qianwenai.com/home/billing/overview) to check if you have any outstanding charges.

- No outstanding fees: Please confirm whether this API Key belongs to the current account. If the account has no outstanding fees, there may be an issue with the account. Please contact customer service for further investigation.
- Outstanding balance: Please top up promptly. After topping up, there may be a delay in the system balance being displayed; please wait and try again later.

### API provider returned a billing error — your API key has run out of credits or has an insufficient balance. Check your provider's billing dashboard and top up or switch to a different API key.

**Cause:** When calling the Qianwen AI platform through third-party clients such as OpenClaw, if the underlying account is in arrears or has insufficient balance, the client will aggregate the billing errors returned by the server into this English message. The corresponding error code on the underlying Qianwen AI platform server is Arrearage (i.e., the above **Access denied, please make sure your account is in good standing.**), which is not a billing problem on the client itself.

**Solution**: Go to [Bill](https://platform.qianwenai.com/home/billing/overview) to check if your account is in arrears: If you are in arrears, please recharge in time (there may be a delay in the system balance after recharging, please try again later); if you are not in arrears, please confirm whether the API Key used for the call belongs to the current account.

### isv.OUT_OF_SERVICE

**Reason:** The Qianwen AI platform account balance is insufficient, resulting in service suspension. The underlying reason is the same as the Arrearage (`Access denied, please make sure your account is in good standing.`) mentioned in this section: unpaid account fees.

**Solution:** Go to [Billing](https://platform.qianwenai.com/home/billing/overview) to top up your Qianwen AI platform account. Service will be automatically restored once the balance is sufficient.

## 400-Contain.Forbidden.Label.Error

### contain forbidden create order label

**Reason:** The Qianwen AI platform account has a "prohibited from placing orders" tag, and this order request was blocked and cannot be placed.

**Solution:** Please contact customer service to confirm the reason for adding the label and apply for its removal. After removal, place a new order.

## 400-DataInspectionFailed/data\_inspection\_failed

### Input or output data may contain inappropriate content. / Input data may contain inappropriate content. / Output data may contain inappropriate content.

**Reason:** The input or output contained suspected sensitive content and was blocked by the Green Network.

**Solution:** Please modify your input and try again.

### Input xxx data may contain inappropriate content.

**Cause:** The input data (such as prompts or images) may contain sensitive content. **Solution:** Please check for content compliance, modify your input, and try again.

### Qwen rejected the input image before model inference; no actual ad/porn/OCR result was produced.

**Reason:** The input image was blocked by the pre-processing content security check (Green Network) before entering the model's inference process, as it was deemed to contain potentially sensitive or illegal content. The model did not perform any inference on the image and therefore did not return any recognition, OCR, or analysis results. This is a pre-processing security compliance check for multimodal input images, and it belongs to the same content security mechanism as the aforementioned blocking of input content by the Green Network.

**Solution:** Please change or modify the input image and try again; if the image content is confirmed to be compliant but the system continues to block, you can submit a support ticket for further verification.

## 400-APIConnectionError

This indicates a network error on the client side; the server did not actually return an HTTP status code.

### Connection error.

**Cause:** Local network issues, usually caused by a proxy being enabled.

**Solution:** Please disable or restart the agent.

### The operation was canceled. / Connection reset

**Reason:** The timeout set on the client is too short or there are network fluctuations, which may cause the request to be canceled (e.g., `The operation was canceled`) or the connection to be reset (e.g., `Connection reset`).

**Solution**:

- Appropriately relax the client timeout configuration (e.g., adjust it to more than 50 seconds).
- Use the `curl` command to test network connectivity to rule out local network problems.

## 400-InvalidFile.DownloadFailed

### The audio file cannot be downloaded.

**Reason:** The audio file was downloaded but failed to be downloaded when using [Paraformer](/api-reference/speech-recognition/paraformer-realtime/websocket-api) for recognition.

**Solution:** Please check if the URL of the audio file to be identified is accessible via the public internet.

## 400-InvalidFile.AudioLengthError

### Audio length must be between 1s and 300s.

**Reason:** The audio length does not meet the requirements.

**Solution:** Ensure the audio duration is within the range of [1, 300] seconds.

### Audio length must be between 1s and 180s.

**Reason:** The audio length does not meet the requirements.

**Solution:** Ensure the audio duration is within the range of [1, 180] seconds.

## 400 InvalidFile.NoHuman

### The input image has no human body. Please upload other image with single person.

**Reason:** The input image does not contain any people or no faces were detected.

**Solution:** Please upload a solo photo.

## 400-InvalidFile.BodyProportion

### The proportion of the detected person in the picture is too large or too small, please upload other image.

**Reason:** The proportion of people in the uploaded image does not meet the requirements.

**Solution:** Please upload an image that meets the requirements for the proportion of people in the image.

## 400 InvalidFile.FacePose

### The pose of the detected face is invalid, please upload other image with whole face and expected orientation.

**Reason:** The facial posture of the person in the uploaded image does not meet the requirements (the face must be visible and the head must not be seriously misaligned).

**Solution:** Please upload an image that meets the requirements.

### The pose of the detected face is invalid, please upload other image with the expected orientation.

**Reason:** The facial posture of the person in the uploaded image does not meet the requirements (the face should not be seriously off-center).

**Solution:** Ensure that the faces in the image are not tilted.

### The pose of the detected face is invalid, please upload other image with the expected orientation.

**Reason:** The facial posture of the person in the uploaded image does not meet the requirements (the face should not be seriously off-center).

**Solution:** Ensure that the faces in the image are not tilted.

## 400 InvalidFile.Resolution

### The image resolution is invalid, please make sure that the largest length of image is smaller than 7000, and the smallest length of image is larger than 400.

**Reason:** The uploaded image size does not meet the requirements.

**Solution:** The resolution of uploaded images must not exceed 7000*7000 and must not be lower than 400*400.

### The image resolution is invalid, please make sure that the largest length of image is smaller than 4096, and the smallest length of image is larger than 224.

**Reason:** The uploaded image size does not meet the requirements.

**Solution:** Upload images with a resolution where the longest side is less than 4096 pixels and the shortest side is greater than 224 pixels.

### The image resolution is invalid, please make sure that the largest length of image is smaller than xxx, and the smallest length of image is larger than yyy.

**Reason:** The uploaded image size does not meet the requirements.

**Solution:** The resolution of uploaded images must not exceed xxx*xxx and must not be lower than yyy*yyy.

### The image resolution is invalid, please make sure that the aspect ratio is smaller than xxx, and largest length of image is smaller than yyy.

**Reason:** The uploaded image size does not meet the requirements.

**Solution:** The aspect ratio of the uploaded image must be less than xxx, and the resolution must not be higher than yyy\*yyy.

### Invalid video resolution. The height or width of video must be xxx \~ yyy.

**Reason:** The video resolution does not meet the requirements.

**Solution:** The video side length must be between xxx and yyy.

## 400-InvalidFile.FPS

### Invalid video FPS. The video FPS must be 15 \~ 60.

**Reason:** The video frame rate does not meet the requirements.

**Solution:** The video frame rate needs to be between 15-60fps.

## 400 InvalidFile.Value

### The value of the image is invalid, please upload other clearer image.

**Reason:** The uploaded image is too dark and does not meet the requirements.

**Solution:** Ensure that the faces in the image are clear.

## 400 InvalidFile.FrontBody

### The pose of the detected person is invalid, please upload other image with the front view.

**Reason:** The person in the uploaded image is not facing away from the camera, which does not meet the requirements.

**Solution:** Ensure that the person in the picture is facing the camera.

## 400 InvalidFile.FullFace

### The pose of the detected face is invalid, please upload other image with whole face.

**Reason:** The facial posture of the person in the uploaded image does not meet the requirements (the face must be visible).

**Solution:** Ensure that the face in the image is complete and unobstructed.

## 400-InvalidFile.FaceNotMatch

### There are no matched face in the video with the provided reference image.

**Reason:** The face matching between the reference image and the video failed.

**Solution**: See [VideoRetalk video generation](/api-reference/video-generation/video-retalk/create-task) for details.

## 400 InvalidFile.Content

### The first frame of input video has no human body. Please choose another clip.

**Reason:** The first frame of the video needs to contain someone.

**Solution:** Please select a video clip that contains a human body.

### The human is too small in the first frame of input video. Please choose another clip.

**Reason:** The person in the first frame of the video is too small.

**Solution:** Please select a video where the first frame contains a larger proportion of people.

### The human is not clear in the first frame of input video. Please choose another clip.

**Reason:** The person in the first frame of the video is not clear.

**Solution:** Please select a video where the first frame of the person is clear.

### The input image has no human body or multi human bodies. Please upload other image with single person.

**Reason:** The input image contains either no people or multiple people.

**Solution:** Please upload a solo photo.

### The input image has no human body or has unclear human body. Please upload other image.

**Reason:** The human body in the input image is incomplete or missing.

**Solution:** Please upload a clear image containing a complete human body.

### The input image has multi human bodies. Please upload other image with single person.

**Reason:** The input image contains multiple people.

**Solution:** Please upload a solo photo.

## 400 InvalidFile.FullBody

### The human is not fullbody in the first frame of input video. Please choose another clip.

**Reason:** The person in the first frame of the video is incomplete.

**Solution:** The character's entire body needs to be shown.

### The pose of the detected person is invalid, please upload other image with whole body, or change the ratio parameter to 1:1.

**Reason:** The pose of the person in the uploaded image does not meet the requirements.

**Solution:** Please upload images that meet the requirements. Headshots must show the entire head, and half-body photos must show the entire body from the hips up. Alternatively, adjust the image aspect ratio to 1:1.

## 400 InvalidFile.BodyPose

### The pose of the detected person is invalid, please upload other image with whole body and expected orientation.

**Reason:** The individual's movements do not meet the requirements.

**Solution:** Please upload a photo that meets the requirements: shoulders and ankles must be visible, the subject must not be facing away from the camera, must not be seated, and the subject's orientation must not be significantly off.

## 400 InvalidFile.Size

### Invalid file size. The video file size must be less than 200MB, and the audio file size must be less than 15MB.

**Reason:** The file size does not meet the requirements.

**Solution:** Video files must be less than 200MB, and audio files must be less than 15MB.

### Invalid file size, The image file size must be smaller than 5MB.

**Reason:** The file size does not meet the requirements.

**Solution:** Image files must be less than 5MB.

### Invalid file size. The video/audio/image file size must be less than xxxMB.

**Reason:** The file size does not meet the requirements.

**Solution:** Video/audio/image files must be smaller than the specified number of MB.

## 400 InvalidFile.Duration

### Invalid file duration. The file duration must be xxx s \~ yyy s.

**Reason:** The file duration does not meet the requirements.

**Solution:** The duration of video/audio files needs to be between xxx and yyy seconds.

## 400 InvalidFile.ImageSize

### The size of image is beyond limit.

**Reason:** The image size exceeds the limit.

**Solution:** The image aspect ratio must be no greater than 2, and the longest side must be no greater than 4096.

## 400-InvalidFile.AspectRatio

### Invalid file ratio. The file aspect ratio (height/width) must be between 3:1 and 1:3.

**Reason:** The file aspect ratio does not meet the requirements.

**Solution:** The aspect ratio of the video file needs to be between 3:1 and 1:3.

### Invalid file ratio. The file aspect ratio (height/width) must be between 2.0 and 0.5.

**Reason:** The file aspect ratio does not meet the requirements.

**Solution:** The aspect ratio of the image file must be between 2.0 and 0.5.

## 400 InvalidFile.Openerror

### Invalid file, cannot open file as video/audio/image.

**Reason:** The file cannot be opened.

**Solution:** Please check if the file is corrupted or if the format is correct.

## 400-InvalidFile.Template.Content

### Invalid template content.

**Reason:** The action template lacks permissions, or the template content does not meet the requirements.

**Solution:** Please check the template permissions and content.

## 400 InvalidFile.Format

### Invalid file format, the request file format is one of the following types: MP4, AVI, MOV, MP3, WAV, AAC, JPEG, JPG, PNG, BMP, and WEBP.

**Reason:** The file format does not meet the requirements.

**Solution:** Use compatible file formats: Videos support mp4, avi, and mov; audio supports mp3, wav, and aac; images support jpg, jpeg, png, bmp, and webp.

## 400 InvalidFile.MultiHuman

### The input image has multi human bodies. Please upload other image with single person.

**Reason:** The input image contains multiple people.

**Solution:** Please upload a solo photo.

## 400 InvalidPerson

### The input image has no human body or multi human bodies. Please upload other image with single person.

**Reason:** The input image contains either no people or multiple people.

**Solution:** Please upload a solo photo.

## 400-InvalidParameter.DataInspection

### Unable to download the media resource during the data inspection process.

**Reason:** Download of image or audio file timed out.

**Solution:** If the call is initiated from overseas, network instability across borders may cause download timeouts. Please store the file in a domestic [OSS](https://help.aliyun.com/product/31815.html) before initiating the model call. Alternatively, you can use [Temporary Storage](/api-reference/platform-api/file/upload-file) to upload the file.

## 400-FlowNotPublished

### Flow has not published yet, please publish flow and try again.

**Reason:** The process has not been released.

**Solution:** Please publish the process and try again.

## 400 InvalidImage.ImageSize

### The size of image is beyond limit.

**Reason:** The image size exceeds the limit.

**Solution:** The image aspect ratio must be no greater than 2, and the longest side must be no greater than 4096.

## 400-InvalidImage.NoHumanFace

No human face detected.

**Reason:** No face detected (only asynchronous query interface for tasks was generated).

**Solution:** Please upload an image containing a clear human face.

## 400 InvalidImageResolution

### The input image resolution is too large or small.

**Reason:** The input image resolution is too high or too low.

**Solution:** The image resolution should be no less than 256×256 pixels and no more than 5760×3240 pixels.

## 400 InvalidImageFormat

### The input image is in invalid format.

**Reason:** The image format does not meet the requirements.

**Solution:** Use images in JPEG, PNG, JPG, BMP, or WEBP formats.

## 400 InvalidURL

### Invalid URL provided in your request.

**Reason:** Invalid URL.

**Solution:** Use a valid URL.

### Required URL is missing or invalid, please check the request URL.

**Reason:** The entered URL is invalid or missing.

**Solution:** Please provide the correct URL.

### The request URL is invalid, make sure the url is correct and is an image.

**Reason:** The entered URL is invalid.

**Solution:** Ensure the URL is correct and points to an image file.

### The input audio is longer than xxs.

**Reason:** The input audio file exceeds the maximum duration of xx seconds.

**Solution:** Please trim the audio file to within xx seconds.

### File size is larger than 15MB.

**Reason:** The input audio file exceeds the maximum limit of 15MB.

**Solution:** Please compress the audio file to less than 15MB.

### File type is not supported. Allowed types are: .wav, .mp3.

**Reason:** The input audio format is not compliant.

**Solution:** Currently, only WAV and MP3 formats are supported.

### The request URL is invalid, please check the request URL is available and the request image format is one of the following types: JPEG, JPG, PNG, BMP, and WEBP.

**Reason:** The image is inaccessible or the file format for download is not supported.

**Solution:** Ensure the URL is accessible and the image format is JPEG, JPG, PNG, BMP, or WEBP.

## 400-InvalidImage.FileFormat

### Invalid image type. Please ensure the uploaded file is a valid image.

**Reason:** The image file format is not supported.

**Solution:** Use images in JPG, JPEG, PNG, BMP, or WEBP formats.

## 400-InvalidURL.ConnectionRefused

### Connection to xxx refused, please provide available URL.

**Reason:** Download rejected.

**Solution:** Please provide an available URL.

## 400 InvalidURL.Timeout

### Download xxx timeout, please check network connection.

**Reason:** Download timed out.

**Solution:** Please check your network connection.

## 400-BadRequestException

### Invalid part type.

**Reason:** Only in the Qwen-Long model's dialogue scenarios, users uploaded file types that the Qwen-Long model does not currently support.

**Solution:** Please upload file types supported by Qwen-Long.

## 400-BadRequest.EmptyInput

### Required input parameter missing from request.

**Reason:** The `input` parameter was not added when making the request.

**Solution:** Please add the `input` parameter to the request.

## 400-BadRequest.EmptyParameters

### Required parameter "parameters" missing from request.

**Reason:** The `parameters` parameter was not added when making the request.

**Solution:** Please add the `parameters` parameter to the request.

## 400-BadRequest.EmptyModel

### Required parameter "model" missing from request.

**Reason:** The `model` parameter was not provided in the request.

**Solution:** Please add the `model` parameter to the request.

## 400-BadRequest.IllegalInput

### The input parameter requires json format.

**Reason:** The input parameter format does not conform to the API's required JSON format.

**Solution:** Please check the input parameter format and ensure it is standard JSON.

## 400-BadRequest.InputDownloadFailed

### Failed to download the input file: xxx.

**Reason:** The download of the input file failed, possibly due to download timeout, download failure, or the file exceeding the limit.

**Solution:** Please troubleshoot based on the detailed error message `xxx`.

### Failed to download the input file.

**Reason:** When using Qwen-TTS audio cloning, the server failed to download the audio to be cloned.

**Solution:** Please check if the audio file can be downloaded normally. If it can be downloaded, please check if the audio file size exceeds the limit (more than 10MB).

## 400-BadRequest.UnsupportedFileFormat

### File format unsupported.

**Reason:** The uploaded audio format did not meet the model requirements when performing [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview).

**Solution:** The audio format must be WAV (16-bit), MP3, or M4A. Note that the format cannot be determined solely by the file extension; for example, a file with the `.mp3` extension may be in another format (such as Opus). It is recommended to use tools (such as ffprobe, mediainfo) or commands (such as the `file` command on Linux/macOS) to confirm the actual encoding format of the audio file to ensure it meets the requirements.

### Input file format is not supported.

**Reason:** The input file format is not supported.

**Solution:** Please use a supported file format.

## 400-BadRequest.TooLarge

### Payload Too Large.

**Reason:** The file size exceeds the limit.

**Solution**:

- When the "purpose" parameter is set to "file-extract", the document cannot exceed 150MB and the image cannot exceed 20MB.
- When the "purpose" parameter is "batch", the file cannot exceed 500MB. Please split and upload the file in batches (/api-reference/platform-api/file/upload-file).

## 400-BadRequest.ResourceNotExist

### The Required resource does not exist.

**reason**:

When making an update, query, or delete API call for [CosyVoice sound cloning](/api-reference/speech-synthesis/voice-cloning/overview), the corresponding timbre does not exist.
- When using [Paraformer](/api-reference/speech-recognition/paraformer-realtime/websocket-api) or [Gummy](/developer-guides/speech/realtime-multimodal-speech), the hot word resource for updating, querying, or deleting API calls does not exist.

## 400-Throttling.AllocationQuota

Your current quota is xxx

**Reason:** The number of CosyVoice voice cloning (/api-reference/speech-synthesis/voice-cloning/overview) voice samples has reached its limit.

**Solution**: [Delete](/api-reference/speech-synthesis/voice-cloning/delete-voice) part of the tone.

### Free allocated quota exceeded.

**Reason:** The number of keywords used when using custom keywords (Paraformer) or custom keywords (Gummy) has exceeded the limit (10 per account by default, shared by Paraformer and Gummy).

**Solution:** Delete some of the trending keywords.

### Maximum voice storage limit exceeded, please delete existing voices.

**Reason:** When using Qwen-TTS sound cloning, the maximum number of available sounds for the main account was exceeded.

**Solution:** Please [delete](/api-reference/speech-synthesis/voice-design/delete-voice) a portion of the sound.

## 400 InvalidGarment

### Missing clothing image.Please input at least one top garment or bottom garment image.

**Reason:** Clothing images are missing.

**Solution:** Please provide at least one image of either the top (top) or bottom (bottom).

## 400 InvalidSchema

### Database schema is invalid for text2sql.

**Reason:** No database schema information was entered.

**Solution:** Please enter the database schema information.

## 400 InvalidSchemaFormat

### Database schema format is invalid for text2sql.

**Cause:** The input data table information is in an abnormal format.

**Solution:** Please check and correct the format of the data table information.

## 400 - Audio.AudioShortError

### Valid audio is too short!

**Reason:** The valid duration of the audio used for [CosyVoice sound cloning](/api-reference/speech-synthesis/voice-cloning/overview) is too short.

**Solution:** The audio duration should ideally be kept between 10 and 15 seconds. Ensure the recording is fluent and includes at least one continuous segment of speech longer than 5 seconds.

## 400 - Audio.AudioSilentError

### Silent audio error.

**Cause**: The audio file for [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview) is either muted or too short.

**Solution:** The audio duration used for sound replication should be kept between 10 and 15 seconds, and should include at least one continuous voice segment longer than 5 seconds.

## 400 InvalidInputLength

### The image resolution is invalid, please make sure that the largest length of image is smaller than 4096, and the smallest length of image is larger than 150. and the size of image ranges from 5KB to 5MB.

**Reason:** The image size or file size does not meet the requirements.

**Solution:** Please refer to [Input Image Requirements](/resources/faq-images-videos).

## 400-FaqRuleBlocked

### Input or output data is blocked by faq rule.

**Reason:** The FAQ rule intervention module was hit.

## 400 ClientDisconnect

### Client disconnected before task finished!

**Cause:** The client actively disconnected before the task ended. This error message was generated when using speech synthesis or recognition services.

**Solution:** Please check your code and ensure that the connection to the server is not disconnected before the task is completed.

## 400-ServiceUnavailableError

### Role must be user or assistant and Content length must be greater than 0.

**Reason:** The input content length is 0 or the `role` is incorrect.

**Solution:** Please check that the length of the input content is greater than 0, and ensure that the parameter format (such as `role`) conforms to the requirements of the API documentation.

## 400-IPInfringementSuspect

### Input data is suspected of being involved in IP infringement.

**Reason:** The input data (such as prompts or images) is suspected of infringing on intellectual property rights.

**Solution:** Content compliance check. Please check your input to ensure it does not contain content that could infringe on copyrights.

## 400 - Unsupported Operation

### The operation is unsupported on the referee object.

**Reason:** The associated object does not support this operation.

**Solution:** Please check if the target object and operation type match.

### The fine-tune job can not be deleted because it is succeeded, failed or canceled.

**Reason:** The fine-tuning task cannot be deleted because its status is "successful", "failed", or "cancelled".

**Solution:** Only tasks in a specific state can be deleted. Do not delete tasks that have already been terminated.

## 400-CustomRoleBlocked

### Input or output data may contain inappropriate content with custom rule.

**Reason:** The request or response content did not pass the custom policy.

**Solution:** Please check the content or adjust the custom strategy.

## 400 - Audio.PreprocessError

### Audio preprocess error.

**Cause**: When using Qwen-TTS to replicate audio, the preprocessing of the audio to be replicated is abnormal. Possible reasons include: the content of the `text` parameter differs too much from the audio text, the effective human voice is too short, or there is no sound.

**Solution:** Please adjust the content of the `text` parameter. If the adjustment is ineffective, please refer to the recording operation guide and re-record the audio.

### No segments meet minimum duration requirement

**Reason:** When using Qwen-TTS for audio cloning, the effective vocals in the audio to be cloned are too short.

**Solution:** Please refer to the recording operation guide to re-record the audio.

## 400-BadRequest.VoiceNotFound

Voice '%s' not found.

**Cause**: When using Qwen-TTS sound cloning, the sound has already been deleted or does not exist when calling the delete sound interface.

**Solution:** Please check if the passed `voice` parameter is correct.

## 400 - Audio.DecoderError

### Decoder audio file failed.

**Cause:** The audio file to be copied failed to decode when using Qwen-TTS audio cloning. / CosyVoice audio file decoding failed.

**Solution:** Please check if the audio file is corrupted and ensure that the audio meets the audio file format requirements (such as Qwen-TTS) or is WAV (16bit), MP3, or M4A (such as CosyVoice).

## 400 - Audio.AudioRateError

### File sample rate unsupported.

**Reason:** When using Qwen-TTS or CosyVoice audio cloning, the sampling rate of the audio to be cloned does not meet the requirements.

**Solution:** The sampling rate must be greater than or equal to 24000 Hz.

## 400-Audio.DurationLimitError

### Audio duration exceeds maximum allowed limit.

**Reason:** The audio to be copied was too long when using Qwen-TTS audio cloning.

**Solution:** Audio must not exceed 60 seconds.

## 401-InvalidApiKey/invalid\_api\_key

### Invalid API-key provided. / Incorrect API key provided.

**Reason:** The API Key was entered incorrectly.

**Solution**: Common error causes and correction methods are as follows:

- **Incorrect environment variable read**, **incorrect syntax**: `api_key=os.getenv("sk-xxx") `, the system will try to read the environment variable named `sk-xxx` instead of treating `sk-xxx` as the key.
- **Correct way to write it**: **If environment variables have been configured**: please write it as `api_key=os.getenv("DASHSCOPE_API_KEY")`;
  Ensure that the `DASHSCOPE_API_KEY` environment variable has been set before running the program.
- **If environment variables are not configured**: Please write `api_key = "sk-xxx"`.
  This method is for easy debugging; please do not use it in a production environment.

**Incorrect Entry**: The API Key for the Qianwen AI Platform starts with `sk-ws-` (Keys created earlier start with `sk-`). Please ensure that you have not mistakenly entered a key from another model provider and that the copied key does not contain extra spaces or line breaks.

**Tool compatibility issues:** Third-party tools are not properly compatible (e.g., the latest version of the [Dify](/developer-guides/clients-and-developer-tools/dify) plugin is unstable and causes errors; try installing an older version of the Qianwen plugin; when calling the model, the older version of [Cline](/developer-guides/clients-and-developer-tools/cline) selected Alibaba Qwen as the API Provider; OpenAI compatibility should be selected instead).

If none of the above applies, the API Key may have been deleted. Please obtain it again and initiate the call.

## 401-NOT AUTHORIZED

### Access denied: Either you are not authorized to access this workspace, or the workspace does not exist. Please:\nVerify the workspace configuration.\nCheck your API endpoint settings. Ensure you are targeting the correct environment.

**reason**:

- The WorkspaceId value is invalid, or the current account is not a member of this workspace.
- Or the requested access address (service access point) is incorrect.

**Solution**:

- Please confirm that the WorkspaceId value is correct and that the account is already a member of the workspace before calling the interface.
Please confirm that the access address is correct.

## 401-invalid access token or token expired

### invalid access token or token expired.

**Possible cause:** The Token Plan used an incorrect Base URL (such as the access address for pay-as-you-go or other plans).

**Solution:** Please use the Token Plan's dedicated Base URL:

- Anthropic compatible endpoint: `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`
- OpenAI compatible endpoint: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

## 403-AccessDenied/access\_denied

### Current user api does not support asynchronous calls.

**Reason:** The API does not support asynchronous calls.

**Solution:** Please remove `X-DashScope-Async` from the request header, or set its value to `disable`.

### current user api does not support synchronous calls.

**Reason:** The API does not support synchronous calls.

**Solution:** Please set `X-DashScope-Async: enable` in the request header.

### Invalid according to Policy: Policy expired.

**Reason:** The file upload certificate had expired when the temporary public URL was obtained.

**Solution:** Please re-call the file upload credential interface to generate a new credential.

Access denied.

**Reason:** You do not have permission to access this model. This may be because the model requires permission, the free quota for the model has been exhausted and paid use is not supported (e.g., `deepseek-r1-distill-llama-70b`), or the model has been taken offline.

**Solution:** If the model has been deprecated, please check its deprecation status in [Model Deprecation Mechanism Description](/changelog/model-deprecation) and use the alternative model recommended in that document.

**Using a generic API Key to invoke the Token Plan's proprietary model**

**Reason:** Token Plan-specific models (such as `qwen3.8-max-preview`) can only be accessed by Token Plan subscribers using their dedicated API Key (starting with `sk-sp-`) and the Token Plan-specific Base URL. Using a generic API Key (starting with `sk-`) to access these models will return a 403 `access_denied` error.

**Solution:** Please go to the workbench and obtain your Token Plan-specific API Key and Base URL in the API Key section of **My Subscriptions**. Ensure both are updated. For detailed configuration instructions, please refer to [Quick Start](/token-plan/team/token-plan-team-quickstart). If the API Key and Base URL do not match (e.g., a specific API Key paired with a generic Base URL), a 401 authentication error will be returned. Please refer to this document for details on **401-InvalidApiKey/invalid_api_key**.

**Solution:** Please go to the [Model Marketplace](https://www.qianwenai.com/models) and click **Apply Now** below the corresponding model card to initiate a test application. Alternatively, use other models, such as the Wenshengtu model from Qianwen or Wanxiang, instead of Flux.

## 403-AccessDenied.Unpurchased

### Access to model denied. Please make sure you are eligible for using the model.

**Reason:** The Qianwen AI platform service has not been activated.

**Solution:** Please follow the steps below to register and activate your Qianwen AI platform service.

1. **Register an Account**: Your Qianwen AI Platform account is the same as your Alibaba Cloud account. If you do not have an Alibaba Cloud account, please visit the [Qianwen AI Platform](https://platform.qianwenai.com/) to register. See [Account and Access](/resources/faq-account) for details.
2. **Service Activation:** Upon first login to the Qianwen AI Platform, reading and agreeing to the "Qianwen AI Platform Service Agreement" and "Privacy Policy" will automatically activate your service. If the service agreement does not pop up, it means you have already activated your service.

If the workbench prompts you to authenticate, please click the prompt bar to complete the authentication.

## 403-Model.AccessDenied

### Model access denied.

**Reason:** The user lacks permission to access the corresponding standard or custom model.

**Solution**:

- **Calling Standard Models**: When using the API-KEY of a sub-business space to call a standard model (e.g., `qwen-plus`), the sub-business space must have the necessary permissions to call that model. See [Model Call Authorization](/developer-guides/administration/workspace) for details.
- **Calling Custom Models**: After a custom model is successfully deployed, it can only be called using the API-KEY of its business space, and no model call authorization is required.

## 403 App.AccessDenied

### App access denied.

**Reason:** Insufficient permission to access the application or model.

**Solution**:

- Carefully confirm that access authorization has been granted to the business space and sub-accounts being accessed.
- Carefully check whether the application has been released.
- Carefully verify that the entered APP ID and API KEY are correct.
- If you encounter a Claude Code error, please use the API Key of the default business space.
- If the above suggestions are correct, it is recommended to refresh the data, republish, and then call it again, or try to recreate the agent.

## 403-Workspace.AccessDenied

### Workspace access denied.

**Reason:** The application or model does not have permission to access the business space.

**Solution**:

- If you are calling an application in a sub-workspace, please refer to [Workspace](/developer-guides/administration/workspace).
- If you are calling a model in a sub-workspace, please refer to [Calling Models in Sub-Workspaces](/developer-guides/administration/workspace).
- Alternatively, you can use the API key of the main account, which has permissions for all business spaces.

## 403 - Endpoint.AccessDenied

### Workspace endpoint access denied.

**Cause:** The error may have occurred when calling a model that is no longer operational (e.g., a historical snapshot version like `qwen-max-2025-01-25`). Once the model is offline, the corresponding endpoint no longer provides service and will return this error.

**Solution**:

- Confirm whether the model being called has been taken offline.
- If the model is no longer online, please use its recommended alternative model to re-invoke it.

## 403-AllocationQuota.FreeTierOnly

### The free tier of the model has been exhausted. If you wish to continue access the model on a paid basis, please disable the "use free tier only" mode in the management console.

**Reason 1:** New, unverified users initiate requests after exhausting their free quota.

**Solution:** Complete authentication and top up your account before making the call.

**Reason 2:** The user has enabled [Free Quota is stopped when it is used up](/resources/free-quota), and made a request after the free quota was exhausted.

The free quota displayed on the workbench is updated every minute (you need to manually refresh the page).

**Solution**:

- If you wish to continue using the paid service, you can turn off the [Stop when free quota is used up](/resources/free-quota) switch at any time without waiting for the free quota to run out; once turned off, you can continue using the service on a pay-as-you-go basis.

## 404-ModelNotFound/model\_not\_found

### The provided model xxx is not supported by the Batch API.

**Reason:** The current model does not support batch calls, or there may be a spelling error in the model name.

**Solution:** Please refer to [OpenAI Compatibility - Batch (File Input)](/developer-guides/text-generation/batch) to confirm the models that support Batch calls and their correct names.

### Model can not be found. / The model xxx does not exist. / The model xxx does not exist or you do not have access to it.

**Reason:** The model you are trying to access does not exist, or you have not yet activated the Qianwen AI Platform service.

**Solution**:

Please check the model name you entered (the value of the parameter `model`) against the model name in the model list to see if it is correct.
- Please go to the model market to activate the model service.
- If you are calling the model using a **dedicated deployment endpoint**, you should also check the following two points if a ModelNotFound error occurs:
  1. **Confirm the use of the deployment name:** The `model` parameter of the dedicated deployment endpoint should be the deployment name (model code), not the model name. The deployment name can be viewed on the **Model Deployment** page in the workbench, in a format similar to `qwen3.5-flash-2026-02-23-9439a8e1eafa`. Using the model name to call the dedicated deployment endpoint, or using the deployment name on the standard API endpoint, will return `model_not_found`.
  2. **Distinguish between invocation methods:** General invocation uses the standard API endpoint and model name, while dedicated deployment invocation uses the dedicated deployment endpoint URL and deployment name. These two methods cannot be mixed. The API keys for general invocation and dedicated deployment invocation may also differ; mixing them will result in an `invalid_api_key` authentication error.

## 404 - model not supported

### Unsupported model xxx for OpenAI compatibility mode.

**Reason:** The current model does not support access in an OpenAI-compatible manner.

**Solution:** Please use the native DashScope method for invocation.

## 404 - WorkSpaceNotFound

### WorkSpace can not be found.

**Reason:** The business space does not exist.

## 404 NotFound

Not found!

**reason**:

The resource you are trying to query/operate on does not exist.
- When using custom hot words, the passed hot word ID is invalid or the corresponding hot word does not exist.

**Solution**:

- Please check if the resource ID you are querying/operating on is incorrect.
- Check if the hot word ID is correct and refer to the API documentation to call it in the correct way.

### Request path not found.

**Reason:** The service address being accessed does not exist when using the Fun-Music model.

**Solution:** Please check if the interface path is correct and if there are any abnormal characters.

## 409-Conflict

### Model instance xxx already exists, please specify a suffix.

**Reason:** A deployment instance with the same name already exists.

**Solution:** Specify a different file extension for the deployed model.

## 429-Throttling

### Requests throttling triggered.

**Reason:** API call triggered rate limiting.

**Solution:** Please reduce the frequency of calls or try again later.

### Too many fine-tune job in running, please retry later. / Only 20 fine-tune job in running or succeeded allowed per user.

**Reason:** The creation of the resource triggered platform restrictions.

**Solution:** Unused models can be deleted. To increase concurrency or retain more models, please contact your business manager to apply for a credit limit increase.

### Too many requests in route. Please try again later.

**Reason:** Too many requests triggered rate limiting.

**Solution:** Please try again later.

### All models are temporarily rate-limited. Please try again in a few minutes.

**Cause:** When multiple models are called through a client (such as Claude Code), if all available models trigger the 429 rate limiting error, the client will aggregate and return this message. The corresponding server-side error code on the Qianwen AI platform is Throttling.RateQuota or Throttling.AllocationQuota.

**Solution**:

- Please try again in a few minutes. The rate limit will be lifted automatically.
- Reduce the number of concurrent requests to avoid sending too many requests in a short period of time.
- For higher call frequency, please refer to [rate-limiting](/developer-guides/administration/rate-limits) to apply for a credit limit increase.

## 429-Throttling.RateQuota/LimitRequests/limit\_requests/ResourceExhausted/Too many requests

### You have exceeded your request limit./Requests rate limit exceeded, please try again later. /You exceeded your current requests list.

**Reason:** Rate limiting was triggered by call frequency (RPS/RPM).

**Solution:** Please refer to [Rate Limiting](/developer-guides/administration/rate-limits) to control the call frequency.

<Note>
  If a 429 error is returned on a single call, check if the request header `X-DashScope-Async: enable` is set. Some models do not support asynchronous calls; setting this header will result in a 429 error even on a single request. Please remove the `X-DashScope-Async` header or set its value to `disable`, and then retry using a synchronous call. For details, please see the entry "**Current user API does not support asynchronous calls.**" under "**403-AccessDenied/access_denied**" in this document.
</Note>

## 429-Throttling.BurstRate/limit\_burst\_rate

### Request rate increased too quickly. To ensure system stability, please adjust your client logic to scale requests more smoothly over time.

**Reason:** When the rate limiting condition is not met, the call frequency increases sharply, triggering the system stability protection mechanism.

**Solution:** We recommend optimizing the client-side call logic and adopting a smooth request strategy (such as uniform scheduling, exponential backoff, or request queue buffering) to distribute requests evenly within the time window and avoid instantaneous peaks.

## 429-Throttling.AllocationQuota/insufficient\_quota

### Allocated quota exceeded, please increase your quota limit./ You exceeded your current quota, please check your plan and billing details.

**Reason:** Rate limiting is triggered by the number of tokens consumed per second or per minute (TPS/TPM).

**Solution:** Go to the [Rate Limiting](/developer-guides/administration/rate-limits) documentation to view the model rate limiting conditions and adjust the calling strategy.

You can refer to the [Rate Limiting FAQ](/developer-guides/administration/rate-limits) to avoid triggering rate limiting.

### Too many requests. Batch requests are being throttled due to system capacity limits. Please try again later.

**Reason:** Too many batch requests triggered rate limiting.

**Solution:** Your request cannot be processed at this time. Please try again later.

### Free allocated quota exceeded.

**Reason:** The free quota has expired or been exhausted, and the model does not currently support pay-as-you-go billing.

**Solution**: Replace with another model. For example, if the Qwen Audio model quota is exhausted, you can use the [non-real-time (Qwen-Omni)](/api-reference/real-time-multimodal/realtime-python-sdk) model.

### Maximum voice-clone voice limit exceeded.

**Reason:** When using Qwen-TTS sound cloning, the maximum number of available sounds for the main account was exceeded.

**Solution:** Please [delete](/api-reference/speech-synthesis/voice-design/delete-voice) a portion of the sound.

## 429-Throttling.Concurrency

### Too many concurrent requests.

**Reason:** The current number of concurrent requests exceeds the platform's dynamically allocated limit.

**Solution:** Simply wait a moment and try again. The platform dynamically adjusts the concurrency limit based on overall resource load, and this restriction may be triggered during peak hours. To increase your TPM limit, please refer to [Rate Limiting](/developer-guides/administration/rate-limits) to apply for a temporary rate limit increase.

## 429 - Commodity Not Purchased

### Commodity has not purchased yet.

**Reason:** Business space not subscribed.

**Solution:** Please subscribe to the business space service first.

## 429 - Prepaid Bill Overdue

### The prepaid bill is overdue.

**Reason:** The prepaid bill for the business space has expired.

## 429 - Postpaid Bill Overdue

### The postpaid bill is overdue.

**Reason:** The model's inference for the product has expired.

## 430-Audio.DecoderError

### Decoder audio file failed.

**Reason:** The audio file decoding for [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview) failed.

**Solution:** It is recommended to use tools (such as ffprobe, mediainfo) or commands (such as the file command on Linux/macOS) to confirm the actual encoding format of the audio file to ensure it meets the requirements.

## 430-Audio.FileSizeExceed

### File too large

**Reason:** The audio file size for [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview) exceeds the limit.

**Solution:** Audio files used for sound replication must be less than 10MB.

## 430-Audio.AudioRateError

### File sample rate unsupported

**Reason:** The audio file sampling rate of [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview) is not supported.

**Solution:** Set the sampling rate to 16kHz or higher.

## 430-Audio.AudioSilentError

### Silent file unsupported.

**Cause**: The audio file for [CosyVoice audio cloning](/api-reference/speech-synthesis/voice-cloning/overview) is either muted or too short.

**Solution:** The audio duration should be kept between 10 and 15 seconds, and should include at least one continuous speech segment longer than 5 seconds.

## 500-InternalError/internal\_error

### An internal error has occurred, please try again later or contact service support.

**Cause:** Internal error.

**Solution**:

- If you are using the [(Qwen-Omni) model](/api-reference/real-time-multimodal/realtime-python-sdk), you need to use the streaming output method.
- If you are using [CosyVoice Voice Cloning](/api-reference/speech-synthesis/voice-cloning/overview), the possible reason is that the audio file is not up to standard, for example, the sound itself has problems, there is noise, or the sound level fluctuates. Please refer to the [Recording Operation Guide](/api-reference/speech-synthesis/voice-cloning/overview) to record and try again.
- The recording file URL cannot be accessed. Please follow the instructions in [CosyVoice Sound Replication/Design API](/developer-guides/speech/voice-design) and try again.
- The recording file is too long. Try to choose a recording of 10 to 15 seconds. When recording, please ensure that the reading is fluent and includes at least one continuous speech segment longer than 5 seconds.

Internal server error!

**Cause:** Internal algorithm error.

**Solution:** Please try again later.

### audio preprocess server error

Using [CosyVoice voice cloning](/api-reference/speech-synthesis/voice-cloning/overview):

- **Cause:** The audio file is not up to standard, for example, the sound itself has problems, there is noise, or the sound level fluctuates. **Solution:** Please refer to the [Recording Operation Guide](/api-reference/speech-synthesis/voice-cloning/overview) and try recording again.
- **Cause:** The recording file URL cannot be accessed. **Solution:** Please follow the instructions in [CosyVoice Sound Replication/Design API](/developer-guides/speech/voice-design) and try again.
**Cause:** The recording file is too long. **Solution:** Choose a recording length of 10-15 seconds if possible. Ensure your reading is fluent and includes at least one continuous audio segment longer than 5 seconds.

## 500-InternalError.FileUpload

### OSS upload error.

**Reason:** File upload failed.

**Solution:** Please check your OSS configuration and network.

## 500-InternalError.Upload

### Failed to upload result.

**Reason:** The generated result failed to upload.

**Solution:** Please check your storage configuration or try again later.

## 500-InternalError.Algo

### Inference internal error.

**Reason:** Service error.

**Solution:** Please try again first to rule out occasional cases.

### Expecting ',' delimiter: line x column xxx (char xxx)

**Reason:** The JSON data generated by the model is invalid, preventing the tool from being invoked correctly.

**Solution:** We recommend trying again after replacing the model with the latest one or optimizing the suggestion words.

### Missing Content-Length of multimodal url.

**Cause**: The `Content-Length` field is missing from the response header information of the URL request.

**Solution:** If the problem persists, try using different image links.

View the `Content-Length` field

1. Open your browser (such as Chrome or Firefox).
2. Open the developer tools (usually by pressing F12 or right-clicking and selecting "Inspect").
3. Switch to the Network tab.
4. Enter the image's URL into the address bar and visit it.
5. Locate the corresponding request, examine the Headers section, and find the Content-Length field in the Response Headers section.

### No backend server available

**Reason:** The Qianwen AI platform backend service is temporarily unavailable, which may be due to service updates, capacity expansion, resource scheduling, or temporary failures.

**Solution**:

1. Go to the [Billing] page in the workbench (https://platform.qianwenai.com/home/billing/overview) to confirm that your account has no outstanding fees. If you do have outstanding fees, please recharge promptly. The recharge will take effect in a few minutes.
2. Use curl or ping to test the connectivity of your local network to `dashscope.aliyuncs.com` to rule out network or firewall blocking.
3. Log in to the workbench and check if the status of the called services is normal.
4. After confirming that the account and network are working properly, wait a few minutes and call the API again.

### An error occurred in model serving, error message is: \[Request rejected by inference engine!]

**Cause:** An error occurred on the underlying server of the model service.

**Solution:** Please try again later.

### An internal error has occurred during algorithm execution.

**Cause:** An error occurred during algorithm runtime.

**Solution:** Please try again later.

### Inference error: Inference error.

**Reason:** The reasoning was flawed.

**Solution:** Please check if the input image file is corrupted or check the quality of the image of the person (it must contain a complete and clear face).

### Role must be in \[user, assistant]

**Reason:** When using the Qwen-MT model, the messages array contains messages from non-user roles.

**Solution:** Ensure that the messages array contains only one element, and that element must be a user message.

### Embedding\_pipeline\_Error: xxx

**Cause:** Image or video preprocessing error.

**Solution:** Please confirm that the uploaded images or videos and request code meet the requirements before trying again.

### Receive batching backend response failed!

**Cause:** Internal service error.

**Solution:** Please try again later.

### \[music]Receive batching backend response failed!

**Reason:** The service exceeded its concurrency limit when using the Fun-Music model.

**Solution:** Please reduce the number of concurrent requests and try again.

### Other kinds of server error.

**Cause**: An unknown anomaly occurred within the system when using the Fun-Music model.

**Solution:** We recommend providing the request ID to our technical staff for troubleshooting.

### An internal error has occurred during execution, please try again later or contact service support. / algorithm process error. / inference error. / An internal error occurs during computation, please try this model later.

**Cause:** Internal algorithm error.

**Solution:** Please try again later.

### list index out of range

**Reason:** The last element of the messages array must be a User Message.

**Solution:** Please adjust the order of the `messages` array to ensure that the last element is `{"role": "user", ...}`.

## 500 - Internal Error.Timeout

### An internal timeout error has occurred during execution, please try again later or contact service support.

**Reason:** The asynchronous task timed out because it did not return a result within 3 hours after submission.

**Solution:** Please check the task execution status or contact technical support.

## 500 System Error

### A system error has occurred, please try again later.

**Cause:** System error.

**Solution:** Please try again later. If you are using the Qianwen AI platform application, please refer to the sample code or documentation to check for errors in your code. If you are still unable to determine the problem, please join the DING group provided at the bottom of the [Spring AI Alibaba Official Website](https://java2ai.com/?spm=4347728f.638c0b20.0.0.23f87982NTcSMy) to contact the developers for assistance.

## 500 ModelServiceFailed

### Failed to request model service.

**Reason:** The model service call failed.

**Solution:** Please try again later.

## 500 RequestTimeOut

### Request timed out, please try again later. / Response timeout! / I/O error on POST request for "[https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions](https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions)": timeout

**reason**:

- A request timed out when calling a large model. The timeout period is 300 seconds.
- When using speech recognition (Paraformer), there is a prolonged period without sending audio to the server or a prolonged period of silent audio.
- When calling the image generation or editing model, the processing time exceeds the limit due to the large image size or high processing complexity.

**Solution**:

- Make a request via streaming output. For details, please refer to [Streaming Output](/developer-guides/run-and-scale/streaming).
- Set the request parameter `heartbeat` to `true` or end the recognition task promptly.
- When calling an image model, try reducing the image resolution, simplifying editing requirements, or try again later.

When the Qianwen model is invoked, the generated content will be returned in the response body, and timeout errors will no longer be reported. For details, please refer to [Text Generation](/developer-guides/getting-started/text-generation-models).

## 500 - ResponseTimeout

### Response stream timeout

**Reason:** The internal execution timed out when using the Fun-Music model.

**Solution:** It is recommended to retry the call.

## 500-InvokePluginFailed

### Failed to invoke plugin.

**Reason:** Plugin call failed.

**Solution:** Please check the plugin configuration and availability.

## 500 - AppProcessFailed

### Failed to proceed application request.

**Reason:** Application process failed.

**Solution:** Please check the application configuration and process nodes.

## 500-RewriteFailed

### Failed to rewrite content for prompt.

**Reason:** The call to the large model that rewrites the prompt failed.

**Solution:** Please try again later.

## 500-RetrivalFailed

### Failed to retrieve data from documents.

**Reason:** Document retrieval failed.

**Solution:** Please check your document indexing and retrieval configuration.

## 500/503 - Service Unavailable

### Too many requests. Your requests are being throttled due to system capacity limits. Please try again later.

**Reason:** Network resources are currently saturated and your request cannot be processed at this time.

**Solution:** Please try again later.

## 503 - Model Unavailable

### Model is unavailable, please try again later.

**Reason:** The model is temporarily unavailable.

**Solution:** Please try again later.

## SDK Error

### error.AuthenticationError: No api key provided. You can set by dashscope.api\_key = your\_api\_key in code, or you can set it via environment variable DASHSCOPE\_API\_KEY= your\_api\_key.

**Reason:** No API Key was provided when using the DashScope SDK.

**Solution:** For detailed instructions on configuring the API Key, please refer to [Configuring API Key to Environment Variables](/api-reference/preparation/export-api-key-env).

### openai.OpenAIError: The api\_key client option must be set either by passing api\_key to the client or by setting the OPENAI\_API\_KEY environment variable

**Reason:** The API Key was not passed when using the OpenAI SDK.

**Solution**:

- **Passing the API Key via Environment Variable (Recommended)** Set `DASHSCOPE_API_KEY` as an environment variable (see [Configuring API Key to Environment Variables](/api-reference/preparation/export-api-key-env)). When initializing `client`, read it via `os.getenv`: `client = OpenAI(api_key=os.getenv("DASHSCOPE_API_KEY"),...)`
- **Passing API Key in Plain Text (Testing Only)** Directly pass the API Key to the `api_key` parameter: `client = OpenAI(api_key="sk-...", ...)` **Note**: This method has security risks and should not be used in production environments.

### Bad Request for url: xxx

**Cause:** When using the Python requests library, adding the `response.raise_for_status()` statement causes the server to not return specific error content when an error occurs.

**Solution:** Please use `print(response.json())` to view the information returned by the server.

### Cannot resolve symbol 'ttsv2'

**Cause**: If you are using [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk), the reason for this problem is that the DashScope SDK version is too low.

**Solution:** Please install the latest version of DashScope SDK (/api-reference/preparation/install-sdk).

## NetworkError

### NoApiKeyException: Can not find api-key.

**Reason:** The environment variable configuration is not effective.

**Solution:** You can try restarting the client or IDE. For more information, please refer to [FAQ](/api-reference/preparation/export-api-key-env).

### ConnectException: Failed to connect to dashscope.aliyuncs.com

**Reason:** The local network environment is abnormal.

**Solution:** Please check your local network. Issues such as certificate problems preventing access to HTTPS or incorrect firewall settings may be causing the problem. We recommend testing with a different network environment or server.

### InputRequiredException: Parameter invalid: text is null

**Cause**: The text to be synthesized was not sent when using [Real-time Speech Synthesis (Qwen-Audio-TTS/CosyVoice)](/api-reference/speech-synthesis/cosyvoice/python-sdk).

**Solution:** Assign a value to the `text` parameter when calling the speech synthesis interface.

### MultiModalConversation.call() missing 1 required positional argument: 'messages'

**Reason:** The current version of the DashScope SDK is too low.

**Solution:** Please install the latest version of DashScope SDK (/api-reference/preparation/install-sdk).

## mismatched_model

### The model 'xxx' for this request does not match the rest of the batch. Each batch must contain requests for a single model.

**Reason:** In a single batch task, all requests must use the same model.

**Solution**: Please check your input file according to [OpenAI Compatible - Batch (File Input)](/developer-guides/text-generation/batch).

## duplicate\_custom\_id

### The custom\_id 'xxx' for this request is a duplicate of another request. The custom\_id parameter must be unique for each request in a batch.

**Reason:** In a single batch task, the ID of each request must be unique.

**Solution:** Please check your input file according to [OpenAI Compatible - Batch (File Input)](/developer-guides/text-generation/batch) to ensure that all request IDs are unique.

### Upload file capacity exceed limit. / Upload file number exceed limit.

**Reason:** File upload failed. The storage space under your Qianwen AI platform account is full or nearly full.

**Solution:** Unnecessary files can be deleted via the [OpenAI Compatibility - File](/api-reference/platform-api/file) interface to free up space. The current storage space supports a maximum of 10,000 files, with a total size not exceeding 100 GB.

## WebSocket Error

### Invalid payload data

**Cause:** The JSON format sent to the server using the WebSocket API for speech recognition/translation (Gummy) was incorrect.

**Solution**:

1. When sending the `run-task` command, check if the `payload` contains ""input": {}". If not, please add it.
2. Confirm that the complete `finish-task` command was sent and that its format was followed. Do not send custom content (such as `{ "input": { "end_of_stream": true } }`).

### The decoded text message was too big for the output buffer and the endpoint does not support partial messages

**Cause**: When using streaming speech recognition (Paraformer) or speech recognition/translation (Gummy), the service returns too much data of recognition results.

**Solution:** Please send the audio to be recognized in segments. It is recommended that each segment of audio be approximately 100 milliseconds long and the data size be kept between 1KB and 16KB.

### TimeoutError: websocket connection could not established within 5s. Please check your network connection, firewall settings, or server status.

**Reason:** If you are using speech synthesis (CosyVoice), a websocket connection cannot be established within 5 seconds.

**Solution:** Please check your local network and firewall settings, or try a different network environment or server.

### unsupported audio format:xxx

**Reason:** The audio format uploaded during CosyVoice sound replication did not meet the model requirements.

**Solution:** The audio format must be WAV (16-bit), MP3, or M4A. Please note that you cannot determine the format solely by the file extension. It is recommended to use tools (such as ffprobe, mediainfo) or commands (such as the file command in Linux/macOS) to confirm the actual encoding format of the audio file.

### Internal unknown error

**Reason:** The audio file format for CosyVoice sound replication may not be compatible.

**Solution:** The audio format must be WAV (16-bit), MP3, or M4A. It is recommended to use tools (such as ffprobe or mediainfo) or commands to confirm the actual encoding format of the audio file.

### Invalid backend response received (missing status name)

**Cause**: The request parameters were misspelled when using the RESTful API to recognize audio files using speech recognition (Paraformer).

**Solution:** Please refer to the API documentation to check your code.

### NO_INPUT_AUDIO_ERROR

**Reason:** No valid voice was detected.

**Solution:** If you are using Paraformer real-time speech recognition, please troubleshoot using the following methods:

1. Check if there is audio input.
2. Check if the audio format is correct (supports pcm, wav, mp3, opus, speex, aac, amr, etc.).

### SUCCESS\_WITH\_NO\_VALID\_FRAGMENT

**Reason:** If you are using Paraformer speech recognition to recognize audio files, the recognition result query interface call is successful, but the VAD module does not detect valid speech.

**Solution:** Please check if the recording file contains valid audio. If it contains only invalid audio (e.g., pure silence), then it is normal that there is no recognition result.

### ASR\_RESPONSE\_HAVE\_NO\_WORDS

**Reason:** If you use Paraformer to recognize audio files, the recognition result query interface call is successful, but the final recognition result is empty.

**Solution:** Please check if the recording file contains valid speech, or if the valid speech consists entirely of interjections and the `disfluency_removal_enabled` parameter is enabled, causing the interjections to be filtered out.

### FILE_DOWNLOAD_FAILED

**Reason:** If you are using Paraformer to recognize audio files, the file download will fail.

**Solution:** Please check if the audio file path is correct and if it can be accessed and downloaded from the external network.

### FILE\_CHECK\_FAILED

**Reason:** If you are using Paraformer to recognize audio files, the file format is incorrect.

**Solution:** Please check if the recording file is in single-track/dual-track WAV or MP3 format.

### FILE_TOO_LARGE

**Reason:** If you are using Paraformer to recognize audio files, the file to be recognized is too large.

**Solution:** Please check if the recording file size exceeds 2GB. If it does, you need to segment the recording file.

### FILE_NORMALIZE_FAILED

**Reason:** If you are using Paraformer speech recognition to recognize audio files, the normalization of the file to be recognized has failed.

**Solution:** Please check if the audio file is corrupted and if it can be played normally.

### FILE_PARSE_FAILED

**Reason:** If you are using Paraformer speech recognition to parse audio files, the file parsing failed.

**Solution:** Please check if the audio file is corrupted and if it can be played normally.

### MKV_PARSE_FAILED

**Reason:** If you are using Paraformer speech recognition to analyze audio files, MKV parsing will fail.

**Solution:** Please check if the audio file is corrupted and if it can be played normally.

### FILE\_TRANS\_TASK\_EXPIRED

**Reason:** If you are using Paraformer speech recognition (audio file recognition), the audio file recognition task has expired.

**Solution:** The TaskId does not exist or has expired. Please resubmit the task.

### REQUEST\_INVALID\_FILE\_URL\_VALUE

**Reason:** If you are using Paraformer speech recognition (SCR) to recognize audio files, the file_link parameter request is invalid.

**Solution:** Please confirm that the `file_url` parameter format is correct.

### CONTENT\_LENGTH\_CHECK\_FAILED

**Reason:** If you are using Paraformer to recognize audio files, the `content-length` check failed.

**Solution:** Please check whether the `content-length` in the HTTP response matches the actual file size when downloading the audio file to be recognized.

### FILE_404_NOT_FOUND

**Reason:** If you are using Paraformer to recognize audio files, the file you need to download does not exist.

**Solution:** Please check if the file URL is correct.

### FILE_403_FORBIDDEN

**Reason:** If you are using Paraformer to recognize audio files, you do not have permission to download the audio file to be recognized.

**Solution:** Please check file access permissions.

### FILE_SERVER_ERROR

**Reason:** If you are using Paraformer to recognize audio files, the service where the requested file is located is unavailable.

**Solution:** Please try again later or check the file server status.

### AUDIO\_DURATION\_TOO\_LONG

**Reason:** If you are using Paraformer speech recognition to recognize audio files, the requested file is longer than 12 hours.

**Solution:** It is recommended to segment the audio and submit the recognition task in multiple parts. Tools such as FFmpeg can be used for segmentation.

### DECODE_ERROR

**Reason:** If you are using Paraformer speech recognition to recognize audio files, the audio file information detection failed.

**Solution:** Please confirm that the file in the download link is in a supported audio format.

### CLIENT\_ERROR-\[qwen-tts:]Engine return error code: 411

**Reason:** When performing Qwen-TTS real-time speech synthesis, the model selected was `qwen-tts-vc-realtime-2025-08-20`, but the timbre was the default. This model only supports replicated timbres.

**Solution:** Please use the timbre generated by sound replication instead of the default timbre.

### NO_VALID_AUDIO_ERROR

**Reason:** The audio to be recognized is invalid when using speech recognition (Paraformer) or speech recognition/translation (Gummy).

**Solution:** Please check if the audio format, sampling rate, etc., meet the requirements.

### InvalidParameter: task can not be null

**Cause:** When using the CosyVoice speech synthesis WebSocket API, the payload of the run-task or finish-task command is missing an input field, or the continue-task command is missing an input.text field.

**Solution**:

1. Check the run-task directive: Ensure that the payload contains `"input": {}` (an empty object), and the input field cannot be omitted.
2. Check the continue-task directive: Ensure that payload.input contains a text field and that text is not an empty string.
3. Check the finish-task directive: Ensure that the payload contains `"input": {}`.

### close code 1007 Model not found

**Cause:** When calling a real-time model (such as Qwen3-Omni-Flash-Realtime) via the WebSocket protocol, the model name in the request was incorrect, or the model service was not yet available. The server closed the connection with close code 1007, with the reason being "Model not found."

**Solution**:

Please check the model names in the [Model List](/developer-guides/speech/s2s-models) to ensure that the value of the parameter `model` is correct. Real-time model names include suffixes such as `-realtime`, which cannot be omitted or changed.
Please go to the [Model Marketplace](https://www.qianwenai.com/models) to check if the model service is activated; if not, please activate it first and then try again.

## 200-BailianGateway.Workspace.NotAuthorised

The workbench displayed the error message "Some functions are restricted."

**reason**:

1. The access URL contains special characters or non-standard formats, causing the business space authorization verification to fail.
2. RAM sub-accounts do not have permission to operate business spaces.

**Solution**:

1. Please revisit the workbench homepage and navigate to the target page.
2. A Qianwen AI platform account or a RAM account with administrator privileges is required to grant the corresponding business space permissions to this sub-account.