import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { generateText } from "ai";
import type {
  ModelConfig,
  ProviderConfig,
  ProviderKind,
} from "@/lib/models/catalog";
import { createLanguageModel } from "../agent/model";
import {
  createProviderModelsRequest,
  extractProviderModelItems,
  providerModelId,
  supportsProviderChat,
} from "./adapter";

function provider(kind: ProviderKind, baseUrl: string): ProviderConfig {
  return {
    id: `test-${kind}`,
    name: kind,
    kind,
    baseUrl,
    enabled: true,
    includeUsage: true,
    isBuiltin: false,
    authRequired: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function model(providerId: string): ModelConfig {
  return {
    id: "test-model-row",
    providerId,
    modelId: "test-model",
    name: "Test",
    fullName: "Test",
    description: "",
    contextLength: 0,
    maxOutput: 0,
    inputPricePerM: 0,
    outputPricePerM: 0,
    supportsImages: false,
    supportsTools: true,
    supportsReasoningEffort: false,
    enabled: true,
    isDefault: false,
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
  };
}

test("uses each provider's native model-list authentication and shape", () => {
  const anthropic = provider("anthropic", "https://api.anthropic.com/v1");
  assert.deepEqual(createProviderModelsRequest(anthropic, "anthropic-key"), {
    url: "https://api.anthropic.com/v1/models",
    headers: {
      "x-api-key": "anthropic-key",
      "anthropic-version": "2023-06-01",
    },
  });

  const google = provider(
    "google",
    "https://generativelanguage.googleapis.com/v1beta"
  );
  assert.deepEqual(createProviderModelsRequest(google, "google-key"), {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: { "x-goog-api-key": "google-key" },
  });
  const items = extractProviderModelItems(google, {
    models: [
      {
        name: "models/gemini-test",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/embed-test",
        supportedGenerationMethods: ["embedContent"],
      },
    ],
  });
  assert.equal(providerModelId(google, items[0]), "gemini-test");
  assert.equal(supportsProviderChat(google, items[0]), true);
  assert.equal(supportsProviderChat(google, items[1]), false);
});

test("native AI SDK adapters send real provider-specific HTTP requests", async () => {
  const requests: Array<{
    url: string;
    headers: http.IncomingHttpHeaders;
    body: Record<string, unknown>;
  }> = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({
        url: request.url ?? "",
        headers: request.headers,
        body,
      });
      response.setHeader("Content-Type", "application/json");
      if (request.url?.includes(":generateContent")) {
        response.end(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "GOOGLE_OK" }],
                },
                finishReason: "STOP",
                index: 0,
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 1,
              totalTokenCount: 2,
            },
          })
        );
      } else if (request.url === "/v1/messages") {
        response.end(
          JSON.stringify({
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "test-model",
            content: [{ type: "text", text: "ANTHROPIC_OK" }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          })
        );
      } else {
        response.end(
          JSON.stringify({
            id: "chat_test",
            object: "chat.completion",
            created: 1,
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OPENAI_OK" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          })
        );
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const root = `http://127.0.0.1:${address.port}`;
    const cases = [
      { kind: "openai" as const, baseUrl: `${root}/v1`, text: "OPENAI_OK" },
      {
        kind: "anthropic" as const,
        baseUrl: `${root}/v1`,
        text: "ANTHROPIC_OK",
      },
      { kind: "google" as const, baseUrl: `${root}/v1beta`, text: "GOOGLE_OK" },
    ];
    for (const entry of cases) {
      const configured = provider(entry.kind, entry.baseUrl);
      const result = await generateText({
        model: createLanguageModel({
          provider: configured,
          model: model(configured.id),
          apiKey: "provider-test-key",
        }),
        prompt: "Reply with the adapter name.",
      });
      assert.equal(result.text, entry.text);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }

  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, "/v1/chat/completions");
  assert.equal(requests[0].headers.authorization, "Bearer provider-test-key");
  assert.equal(requests[1].url, "/v1/messages");
  assert.equal(requests[1].headers["x-api-key"], "provider-test-key");
  assert.equal(requests[1].headers["anthropic-version"], "2023-06-01");
  assert.match(requests[2].url, /^\/v1beta\/models\/test-model:generateContent/);
  assert.equal(requests[2].headers["x-goog-api-key"], "provider-test-key");
});
