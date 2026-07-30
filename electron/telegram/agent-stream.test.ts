import assert from "node:assert/strict";
import test from "node:test";
import type { ChatUIMessage } from "@/lib/chat/message";
import {
  readAgentResponse,
  replaceOrAppendAssistant,
} from "./service";

function sseResponse(chunks: unknown[]) {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const previousAssistant = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "tool-run_command",
      toolCallId: "call_hXQMWFm84ulWgxDor9I9F4sE",
      state: "approval-responded",
      input: { command: "ls" },
      approval: {
        id: "approval-1",
        approved: true,
      },
    },
  ],
} as ChatUIMessage;

const continuationChunks = [
  { type: "start" },
  { type: "start-step" },
  {
    type: "tool-output-available",
    toolCallId: "call_hXQMWFm84ulWgxDor9I9F4sE",
    output: { stdout: "ok", stderr: "", exitCode: 0 },
  },
  { type: "finish-step" },
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: "انجام شد." },
  { type: "text-end", id: "text-1" },
  { type: "finish" },
];

test("resumes the prior assistant message when applying approval continuations", async () => {
  const message = await readAgentResponse(
    sseResponse(continuationChunks),
    previousAssistant
  );
  assert.ok(message);
  assert.equal(message.id, "assistant-1");
  const toolPart = message.parts.find(
    (part) =>
      part.type === "tool-run_command" &&
      "toolCallId" in part &&
      part.toolCallId === "call_hXQMWFm84ulWgxDor9I9F4sE"
  ) as
    | {
        state: string;
        output?: { stdout?: string };
      }
    | undefined;
  assert.equal(toolPart?.state, "output-available");
  assert.equal(toolPart?.output?.stdout, "ok");
  assert.ok(
    message.parts.some(
      (part) => part.type === "text" && part.text.includes("انجام شد")
    )
  );
});

test("fails without the prior assistant message for the same tool-output stream", async () => {
  await assert.rejects(
    () => readAgentResponse(sseResponse(continuationChunks)),
    /No tool invocation found for tool call ID "call_hXQMWFm84ulWgxDor9I9F4sE"/
  );
});

test("replaceOrAppendAssistant updates the last assistant when resuming", () => {
  const messages = [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    },
    previousAssistant,
  ] as ChatUIMessage[];
  const next = {
    ...previousAssistant,
    parts: [
      ...previousAssistant.parts,
      { type: "text", text: "done" },
    ],
  } as ChatUIMessage;
  assert.deepEqual(replaceOrAppendAssistant(messages, next, true), [
    messages[0],
    next,
  ]);
  assert.deepEqual(replaceOrAppendAssistant(messages, next, false), [
    ...messages,
    next,
  ]);
});
