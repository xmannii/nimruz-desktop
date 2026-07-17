import assert from "node:assert/strict";
import test from "node:test";
import type { LocalChat } from "./storage";
import { HOME_WORKSPACE_ID } from "../workspace/types";
import {
  findMostRecentChatInWorkspace,
  resolveInitialActiveChat,
} from "./startup-chat";

function chat(
  id: string,
  workspaceId: string,
  updatedAt: number
): LocalChat {
  return {
    id,
    title: id,
    providerId: "openai",
    model: "gpt-4o-mini",
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    workspaceId,
    createdAt: updatedAt,
    updatedAt,
  };
}

test("findMostRecentChatInWorkspace returns the newest chat in the workspace", () => {
  const chats = [
    chat("a", "project-1", 100),
    chat("b", "project-1", 300),
    chat("c", "project-2", 400),
  ];

  assert.equal(findMostRecentChatInWorkspace(chats, "project-1")?.id, "b");
});

test("resolveInitialActiveChat restores a deep-linked chat when present", () => {
  const stored = [chat("saved", HOME_WORKSPACE_ID, 100)];
  const createDraft = (workspaceId: string, id = "draft") =>
    ({
      id,
      title: "گفتگوی جدید",
      providerId: "openai",
      model: "gpt-4o-mini",
      messages: [],
      workspaceId,
      createdAt: 0,
      updatedAt: 0,
    }) satisfies LocalChat;

  const result = resolveInitialActiveChat(stored, {
    initialChatId: "saved",
    activeWorkspaceId: "project-1",
    createDraft,
  });

  assert.equal(result.activeChatId, "saved");
  assert.deepEqual(result.chats, stored);
});

test("resolveInitialActiveChat opens the most recent chat in the last active workspace", () => {
  const stored = [
    chat("home", HOME_WORKSPACE_ID, 500),
    chat("older", "project-1", 100),
    chat("newer", "project-1", 200),
  ];
  const createDraft = (workspaceId: string, id = "draft") =>
    ({
      id,
      title: "گفتگوی جدید",
      providerId: "openai",
      model: "gpt-4o-mini",
      messages: [],
      workspaceId,
      createdAt: 0,
      updatedAt: 0,
    }) satisfies LocalChat;

  const result = resolveInitialActiveChat(stored, {
    activeWorkspaceId: "project-1",
    createDraft,
  });

  assert.equal(result.activeChatId, "newer");
  assert.deepEqual(result.chats, stored);
});

test("resolveInitialActiveChat creates a draft in the last active workspace when it has no chats", () => {
  const stored = [chat("home", HOME_WORKSPACE_ID, 100)];
  const createDraft = (workspaceId: string, id = "draft") =>
    ({
      id,
      title: "گفتگوی جدید",
      providerId: "openai",
      model: "gpt-4o-mini",
      messages: [],
      workspaceId,
      createdAt: 0,
      updatedAt: 0,
    }) satisfies LocalChat;

  const result = resolveInitialActiveChat(stored, {
    activeWorkspaceId: "project-1",
    createDraft,
  });

  assert.equal(result.activeChatId, "draft");
  assert.equal(result.chats[0]?.workspaceId, "project-1");
  assert.equal(result.chats.length, 2);
});

test("resolveInitialActiveChat creates a home draft when the last active workspace is home", () => {
  const stored = [chat("project", "project-1", 100)];
  const createDraft = (workspaceId: string, id = "draft") =>
    ({
      id,
      title: "گفتگوی جدید",
      providerId: "openai",
      model: "gpt-4o-mini",
      messages: [],
      workspaceId,
      createdAt: 0,
      updatedAt: 0,
    }) satisfies LocalChat;

  const result = resolveInitialActiveChat(stored, {
    activeWorkspaceId: HOME_WORKSPACE_ID,
    createDraft,
  });

  assert.equal(result.activeChatId, "draft");
  assert.equal(result.chats[0]?.workspaceId, HOME_WORKSPACE_ID);
});
