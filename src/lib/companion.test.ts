import assert from "node:assert/strict";
import test from "node:test";
import {
  fitCaptureSize,
  positionCompanionWindow,
  validateCompanionDraft,
  validateCompanionActivity,
  validateCompanionConversation,
  validateCompanionStatus,
} from "./companion";

test("validates compact text and screenshot requests", () => {
  assert.deepEqual(validateCompanionDraft({ text: "  فایل را بررسی کن  " }), {
    text: "فایل را بررسی کن",
  });
  assert.deepEqual(
    validateCompanionDraft({
      text: "",
      screenshot: {
        name: "screen.jpg",
        mediaType: "image/jpeg",
        base64: "YWJjZA==",
        width: 1280,
        height: 720,
      },
    }).screenshot?.name,
    "screen.jpg"
  );

  assert.deepEqual(
    validateCompanionDraft({
      text: "شروع کن",
      chatId: "chat-1",
      workspaceId: "workspace-1",
      model: {
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-5",
      },
      agentMode: "plan",
    }),
    {
      text: "شروع کن",
      chatId: "chat-1",
      workspaceId: "workspace-1",
      model: {
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-5",
      },
      agentMode: "plan",
    }
  );
});

test("rejects empty and malformed companion requests", () => {
  assert.throws(() => validateCompanionDraft({ text: "  " }));
  assert.throws(() =>
    validateCompanionDraft({
      text: "look",
      screenshot: {
        mediaType: "image/jpeg",
        base64: "not base64!",
        width: 10,
        height: 10,
      },
    })
  );
  assert.throws(() =>
    validateCompanionDraft({
      text: "look",
      workspaceId: "../outside",
    })
  );
  assert.throws(() =>
    validateCompanionDraft({
      text: "look",
      model: { providerId: "openrouter", modelId: "bad\nmodel" },
    })
  );
  assert.throws(() =>
    validateCompanionDraft({ text: "look", agentMode: "unsafe" })
  );
  assert.throws(() =>
    validateCompanionDraft({ text: "look", chatId: "../unsafe" })
  );
});

test("bounds compact conversation snapshots", () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    parts: [{ type: "text" as const, text: ` message ${index} ` }],
  }));
  const snapshot = validateCompanionConversation({
    chatId: "chat-1",
    workspaceId: "home",
    title: "  Quick chat  ",
    state: "running",
    messages,
  });

  assert.equal(snapshot.title, "Quick chat");
  assert.equal(snapshot.messages.length, 24);
  assert.equal(snapshot.messages[0]?.id, "message-6");
  assert.deepEqual(snapshot.messages.at(-1)?.parts, [
    { type: "text", text: "message 29" },
  ]);
});

test("keeps reasoning and tool activity separate from assistant text", () => {
  const snapshot = validateCompanionConversation({
    chatId: "chat-1",
    workspaceId: "home",
    title: "Structured response",
    state: "running",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Inspecting files", state: "completed" },
          {
            type: "tool",
            toolName: "read_file",
            state: "running",
            subject: "src/app.tsx",
          },
          { type: "text", text: "I found the issue." },
        ],
      },
    ],
  });

  assert.deepEqual(snapshot.messages[0]?.parts, [
    { type: "reasoning", text: "Inspecting files", state: "completed" },
    {
      type: "tool",
      toolName: "read_file",
      state: "running",
      subject: "src/app.tsx",
    },
    { type: "text", text: "I found the issue." },
  ]);
});

test("bounds and sanitizes running companion activities", () => {
  const snapshot = validateCompanionActivity({
    items: [
      {
        chatId: "chat-1",
        workspaceId: "home",
        title: "  Build the app  ",
        prompt: "  Run the tests  ",
      },
      { chatId: "../bad", workspaceId: "home", title: "bad", prompt: "bad" },
    ],
  });
  assert.deepEqual(snapshot.items, [
    {
      chatId: "chat-1",
      workspaceId: "home",
      title: "Build the app",
      prompt: "Run the tests",
    },
  ]);
});

test("sanitizes companion status updates", () => {
  assert.deepEqual(
    validateCompanionStatus({
      requestId: "request-1",
      state: "running",
      chatId: "chat-1",
      workspaceId: "home",
      message: "  started  ",
    }),
    {
      requestId: "request-1",
      state: "running",
      chatId: "chat-1",
      workspaceId: "home",
      message: "started",
    }
  );
});

test("fits screen capture dimensions without stretching", () => {
  assert.deepEqual(fitCaptureSize(3840, 2160), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(fitCaptureSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitCaptureSize(2560, 1440, 1000, 1000), {
    width: 1000,
    height: 563,
  });
});

test("positions the companion next to top and bottom trays", () => {
  assert.deepEqual(
    positionCompanionWindow(
      { x: 900, y: 0, width: 24, height: 24 },
      { x: 0, y: 0, width: 1200, height: 900 }
    ),
    { x: 702, y: 32 }
  );
  assert.deepEqual(
    positionCompanionWindow(
      { x: 1880, y: 1040, width: 24, height: 24 },
      { x: 0, y: 0, width: 1920, height: 1040 }
    ),
    { x: 1492, y: 432 }
  );
});
