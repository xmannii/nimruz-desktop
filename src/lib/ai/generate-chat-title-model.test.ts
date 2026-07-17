import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuiltinCodexProvider,
  createCodexModelConfig,
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
