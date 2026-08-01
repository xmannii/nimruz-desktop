import assert from "node:assert/strict";
import test from "node:test";
import type { ChatUIMessage } from "@/lib/chat/message";
import {
  agentProgressFromMessage,
  formatTelegramAgentProgress,
  progressSignature,
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

test("agentProgressFromMessage maps tool states and subjects", () => {
  const message = {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-read_file",
        toolCallId: "t1",
        state: "output-available",
        input: { path: "src/app.ts" },
      },
      {
        type: "tool-run_command",
        toolCallId: "t2",
        state: "input-available",
        input: { command: "pnpm test" },
      },
    ],
  } as ChatUIMessage;

  const progress = agentProgressFromMessage(message);
  assert.equal(progress.phase, "tools");
  assert.deepEqual(progress.steps, [
    { toolName: "read_file", state: "done", subject: "src/app.ts" },
    { toolName: "run_command", state: "running", subject: "pnpm test" },
  ]);

  const text = formatTelegramAgentProgress(progress);
  assert.doesNotMatch(text, /در حال انجام/);
  assert.match(text, /✓ خواندن فایل · src\/app\.ts/);
  assert.match(text, /→ اجرای دستور · pnpm test/);
});

test("formatTelegramAgentProgress is empty while only thinking", () => {
  assert.equal(
    formatTelegramAgentProgress({ steps: [], phase: "starting" }),
    ""
  );
});

test("agentProgressFromMessage reports approval and writing phases", () => {
  const approval = agentProgressFromMessage({
    id: "a2",
    role: "assistant",
    parts: [
      {
        type: "tool-write_file",
        toolCallId: "t3",
        state: "approval-requested",
        input: { path: "README.md" },
        approval: { id: "appr-1" },
      },
    ],
  } as unknown as ChatUIMessage);
  assert.equal(approval.phase, "waiting_approval");
  assert.match(
    formatTelegramAgentProgress(approval),
    /⏸ منتظر تأیید · نوشتن فایل · README\.md/
  );

  const writing = agentProgressFromMessage({
    id: "a3",
    role: "assistant",
    parts: [
      {
        type: "tool-read_file",
        toolCallId: "t4",
        state: "output-available",
        input: { path: "a.ts" },
      },
      { type: "text", text: "خلاصه فایل" },
    ],
  } as ChatUIMessage);
  assert.equal(writing.phase, "writing");
  assert.match(formatTelegramAgentProgress(writing), /در حال نوشتن پاسخ…/);
});

test("progress signature ignores pure text growth", () => {
  const base = {
    id: "a4",
    role: "assistant",
    parts: [
      {
        type: "tool-read_file",
        toolCallId: "t5",
        state: "output-available",
        input: { path: "x.ts" },
      },
      { type: "text", text: "a" },
    ],
  } as ChatUIMessage;
  const grown = {
    ...base,
    parts: [
      base.parts[0],
      { type: "text", text: "a longer answer" },
    ],
  } as ChatUIMessage;
  assert.equal(
    progressSignature(agentProgressFromMessage(base)),
    progressSignature(agentProgressFromMessage(grown))
  );
});

test("readAgentResponse reports intermediate progress snapshots", async () => {
  const progressChunks = [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "call_progress_1",
      toolName: "read_file",
      input: { path: "src/main.ts" },
    },
    {
      type: "tool-output-available",
      toolCallId: "call_progress_1",
      output: { content: "ok" },
    },
    { type: "finish-step" },
    { type: "text-start", id: "text-p" },
    { type: "text-delta", id: "text-p", delta: "تمام." },
    { type: "text-end", id: "text-p" },
    { type: "finish" },
  ];

  const snapshots: string[] = [];
  const message = await readAgentResponse(sseResponse(progressChunks), undefined, {
    onProgress: (next) => {
      snapshots.push(progressSignature(agentProgressFromMessage(next)));
    },
  });
  assert.ok(message);
  assert.ok(snapshots.length >= 2);
  assert.ok(
    snapshots.some((signature) => signature.includes("read_file") && signature.includes("running"))
  );
  assert.ok(
    snapshots.some((signature) => signature.includes("writing") || signature.includes("done"))
  );
});
