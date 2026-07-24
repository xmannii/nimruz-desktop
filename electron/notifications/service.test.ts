import assert from "node:assert/strict";
import test from "node:test";
import type { AppDatabase } from "../storage/database";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from "@/lib/settings/notifications";
import type { AgentRun } from "@/lib/workspace";
import { DesktopNotificationService } from "./service";

function createFixture(options?: {
  focused?: boolean;
  settings?: Partial<NotificationSettings>;
}) {
  let run: AgentRun = {
    id: "run-1",
    workspaceId: "workspace-1",
    chatId: "chat-1",
    status: "running",
    model: "model-1",
    providerId: "provider-1",
    error: null,
    stepCount: 0,
    startedAt: 1,
    updatedAt: 1,
    finishedAt: null,
  };
  const settings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...options?.settings,
  };
  const events: string[] = [];
  const native: Array<{ title: string; click: () => void }> = [];
  const database = {
    getAgentRun: () => run,
    loadNotificationSettings: () => settings,
    loadChats: () => [
      {
        id: "chat-1",
        title: "Review authentication",
      },
    ],
  } as unknown as AppDatabase;
  const window = {
    isDestroyed: () => false,
    isFocused: () => options?.focused ?? false,
    show: () => events.push("show"),
    focus: () => events.push("focus"),
    webContents: {
      send: (channel: string) => events.push(channel),
    },
  };
  const service = new DesktopNotificationService({
    database,
    getWindow: () => window,
    nativeNotificationsSupported: () => true,
    presentNativeNotification: (payload, click) => {
      native.push({ title: payload.title, click });
    },
  });

  return {
    service,
    native,
    events,
    setStatus(status: AgentRun["status"], error: string | null = null) {
      run = { ...run, status, error, updatedAt: run.updatedAt + 1 };
    },
  };
}

test("notifies once when a background agent run completes and opens its chat", () => {
  const fixture = createFixture();
  fixture.service.handleWorkspaceEvent({
    type: "run-changed",
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "running",
  });
  fixture.setStatus("completed");
  const completedEvent = {
    type: "run-changed" as const,
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "completed",
  };
  fixture.service.handleWorkspaceEvent(completedEvent);
  fixture.service.handleWorkspaceEvent(completedEvent);

  assert.equal(fixture.native.length, 1);
  assert.equal(fixture.native[0]?.title, "کار ایجنت تمام شد");
  fixture.native[0]?.click();
  assert.deepEqual(fixture.events, [
    "show",
    "focus",
    "notifications:open-chat",
  ]);
});

test("completion sound is independent from native notification visibility", () => {
  const fixture = createFixture({
    focused: true,
    settings: { completionSound: true },
  });
  fixture.setStatus("completed");
  fixture.service.handleWorkspaceEvent({
    type: "run-changed",
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "completed",
  });

  assert.equal(fixture.native.length, 0);
  assert.deepEqual(fixture.events, ["notifications:play-sound"]);
});

test("respects master and per-category notification settings", () => {
  const disabled = createFixture({
    settings: { desktopNotificationsEnabled: false },
  });
  disabled.setStatus("failed", "Network unavailable");
  disabled.service.handleWorkspaceEvent({
    type: "run-changed",
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "failed",
  });
  assert.equal(disabled.native.length, 0);

  const mutedCategory = createFixture({ settings: { agentFailed: false } });
  mutedCategory.setStatus("failed", "Network unavailable");
  mutedCategory.service.handleWorkspaceEvent({
    type: "run-changed",
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "failed",
  });
  assert.equal(mutedCategory.native.length, 0);
});

test("notifies for approval requests and completed Shenava downloads", () => {
  const fixture = createFixture();
  fixture.setStatus("awaiting_approval");
  fixture.service.handleWorkspaceEvent({
    type: "run-changed",
    workspaceId: "workspace-1",
    runId: "run-1",
    status: "awaiting_approval",
  });
  assert.equal(fixture.native[0]?.title, "تأیید شما لازم است");

  const status = (phase: "downloading" | "ready") =>
    ({
      activeModelKey: "rizeh",
      models: {
        rizeh: {
          modelKey: "rizeh",
          phase,
          installed: phase === "ready",
          downloadedBytes: phase === "ready" ? 1 : 0,
          totalBytes: 1,
          installedBytes: phase === "ready" ? 1 : 0,
          revision: "test",
          error: null,
        },
        koochik: {
          modelKey: "koochik",
          phase: "not-installed" as const,
          installed: false,
          downloadedBytes: 0,
          totalBytes: 1,
          installedBytes: 0,
          revision: "test",
          error: null,
        },
      },
    }) as const;

  fixture.service.handleShenavaStatus(status("downloading"));
  fixture.service.handleShenavaStatus(status("ready"));
  assert.equal(fixture.native[1]?.title, "دانلود مدل گفتار تمام شد");
});
