import assert from "node:assert/strict";
import test from "node:test";
import type { LocalChat } from "@/lib/chat/storage";
import {
  modelsKeyboard,
  recentChatsKeyboard,
} from "./menus";

test("builds recent-chat and model inline keyboards with stable indexes", () => {
  const chats = [
    {
      id: "chat-a",
      title: "اول",
      updatedAt: 2,
    },
    {
      id: "chat-b",
      title: "دوم",
      updatedAt: 1,
    },
  ] as LocalChat[];

  assert.deepEqual(recentChatsKeyboard(chats, "chat-a"), {
    inline_keyboard: [
      [{ text: "✅ اول", callback_data: "tc:0" }],
      [{ text: "💬 دوم", callback_data: "tc:1" }],
    ],
  });

  assert.deepEqual(
    modelsKeyboard(
      [
        {
          providerName: "OpenRouter",
          model: {
            providerId: "openrouter",
            modelId: "model-a",
            fullName: "Model A",
            name: "A",
          },
        },
        {
          providerName: "Codex",
          model: {
            providerId: "codex",
            modelId: "gpt",
            fullName: "GPT",
            name: "GPT",
          },
        },
      ] as never,
      { providerId: "codex", modelId: "gpt" }
    ),
    {
      inline_keyboard: [
        [{ text: "🧠 OpenRouter · Model A", callback_data: "tm:0" }],
        [{ text: "✅ Codex · GPT", callback_data: "tm:1" }],
      ],
    }
  );
});
