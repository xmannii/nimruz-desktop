import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  createBuiltinCodexProvider,
  createCodexModelConfig,
  type ModelConfig,
  type ProviderConfig,
  type ProviderKind,
} from "@/lib/models/catalog";
import { generateChatTitleWithModel } from "./generate-chat-title-model";

test("uses a local title for Codex instead of an OpenAI-compatible request", async () => {
  const title = await generateChatTitleWithModel(
    {
      provider: createBuiltinCodexProvider(1),
      model: createCodexModelConfig(
        {
          id: "server-id",
          model: "gpt-5-codex",
          displayName: "GPT-5 Codex",
          description: "",
          isDefault: true,
          inputModalities: ["text"],
          supportedReasoningEfforts: ["medium"],
        },
        { now: 1 }
      ),
      apiKey: null,
    },
    "  A title for this Codex conversation  "
  );

  assert.equal(title, "A title for this Codex conversation");
});

function nativeProvider(
  kind: ProviderKind,
  baseUrl: string
): ProviderConfig {
  return {
    id: `title-${kind}`,
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

function nativeModel(providerId: string): ModelConfig {
  return {
    id: "title-model",
    providerId,
    modelId: "title-model",
    name: "Title model",
    fullName: "Title model",
    description: "",
    contextLength: 0,
    maxOutput: 0,
    inputPricePerM: 0,
    outputPricePerM: 0,
    supportsImages: false,
    supportsTools: false,
    supportsReasoningEffort: false,
    enabled: true,
    isDefault: false,
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
  };
}

test("generates titles through Anthropic and Google native REST shapes", async () => {
  const seen: Array<{
    url: string;
    headers: http.IncomingHttpHeaders;
  }> = [];
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      seen.push({ url: request.url ?? "", headers: request.headers });
      response.setHeader("Content-Type", "application/json");
      response.end(
        request.url?.includes(":generateContent")
          ? JSON.stringify({
              candidates: [
                { content: { parts: [{ text: "Google native title" }] } },
              ],
            })
          : JSON.stringify({
              content: [{ type: "text", text: "Anthropic native title" }],
            })
      );
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const root = `http://127.0.0.1:${address.port}`;
    for (const item of [
      {
        kind: "anthropic" as const,
        baseUrl: `${root}/v1`,
        expected: "Anthropic native title",
      },
      {
        kind: "google" as const,
        baseUrl: `${root}/v1beta`,
        expected: "Google native title",
      },
    ]) {
      const provider = nativeProvider(item.kind, item.baseUrl);
      assert.equal(
        await generateChatTitleWithModel(
          {
            provider,
            model: nativeModel(provider.id),
            apiKey: "native-title-key",
          },
          "Please test this title adapter"
        ),
        item.expected
      );
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  assert.equal(seen[0].headers["x-api-key"], "native-title-key");
  assert.equal(seen[1].headers["x-goog-api-key"], "native-title-key");
});
