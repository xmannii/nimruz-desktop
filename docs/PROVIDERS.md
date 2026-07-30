# Model provider adapters

Nimruz supports five execution paths:

| Type | Transport | Authentication |
| --- | --- | --- |
| OpenRouter | OpenRouter AI SDK | Bearer key plus app attribution |
| OpenAI | OpenAI AI SDK, Chat Completions | Bearer key |
| Anthropic | Anthropic AI SDK, Messages API | `x-api-key` |
| Google Gemini | Google AI SDK, Generative Language API | `x-goog-api-key` |
| OpenAI-compatible | Generic AI SDK adapter | Optional Bearer key |

Chat, agent tools, streaming, and model usage all go through the selected
provider's real AI SDK adapter. OpenAI-compatible remains available for local
servers such as LM Studio and Ollama; choosing it for Anthropic or Gemini is not
equivalent to their native protocols.

## Adding a provider

Open **Settings → Models → Providers**, choose a cloud or local preset, and
select the matching API type. The presets fill the official base URLs. After
the connection succeeds, open **Settings → Models → Add model** to discover
and enable its models:

- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com/v1`
- Google Gemini: `https://generativelanguage.googleapis.com/v1beta`

API keys remain encrypted by the operating-system credential backend. They are
not written to provider rows, logs, or renderer storage.

**Test connection** and **Discover models** use provider-native authentication.
Gemini discovery also omits entries that do not advertise
`generateContent`. Anthropic and Gemini chat-title requests use their native
response shapes instead of silently falling back to OpenAI's schema.

## Verification

The adapter integration tests run actual local HTTP servers, call all three
native AI SDKs, and assert the received URL, headers, request body, response
parsing, and generated text:

```bash
pnpm exec tsx --test electron/providers/adapter.test.ts \
  src/lib/ai/generate-chat-title-model.test.ts \
  src/lib/models/sanitize.test.ts
```

These tests do not mock the adapter result. They exercise real network requests
without requiring contributor-owned paid API keys.
