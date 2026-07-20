import assert from "node:assert/strict";
import test from "node:test";
import type { ChatTransport, UIMessageChunk } from "ai";
import { DEFAULT_AGENT_MODE } from "@/lib/chat/agent-mode";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from "@/lib/models";
import { createChatRuntime } from "./use-chat-runtimes";

function makeChat(): LocalChat {
  return {
    id: "chat-runtime-test",
    title: "گفتگوی جدید",
    providerId: DEFAULT_PROVIDER_ID,
    model: DEFAULT_MODEL,
    messages: [],
    workspaceId: null,
    agentMode: DEFAULT_AGENT_MODE,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("a chat runtime keeps the request and persistence alive without a view", async () => {
  let streamController: ReadableStreamDefaultController<UIMessageChunk>;
  const transport: ChatTransport<ChatUIMessage> = {
    sendMessages: async () =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          streamController = controller;
        },
      }),
    reconnectToStream: async () => null,
  };
  const messageSnapshots: ChatUIMessage[][] = [];
  const statuses: string[] = [];

  const runtime = createChatRuntime(makeChat(), {
    transport,
    onMessagesChange: (_id, messages) => {
      messageSnapshots.push(structuredClone(messages));
    },
    onStatusChange: (_id, status) => {
      statuses.push(status);
    },
  });

  const request = runtime.chat.sendMessage({
    parts: [{ type: "text", text: "hello" }],
  });

  // The app submits pre-built parts, so the user message is observable in the
  // history/sidebar synchronously, before transport setup can yield.
  assert.equal(runtime.chat.status, "submitted");
  assert.equal(runtime.chat.messages[0]?.role, "user");
  assert.equal(runtime.chat.messages[0]?.parts[0]?.type, "text");
  assert.ok(statuses.includes("submitted"));
  assert.ok(messageSnapshots.some((messages) => messages.length === 1));

  // Closing the stream after the hypothetical view has unmounted still
  // completes and persists through the runtime-owned callbacks.
  streamController!.close();
  await request;

  assert.equal(runtime.chat.status, "ready");
  assert.equal(statuses.at(-1), "ready");
  assert.deepEqual(messageSnapshots.at(-1), runtime.chat.messages);
  runtime.dispose();
});
