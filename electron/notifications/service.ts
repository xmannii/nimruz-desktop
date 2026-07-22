import type { AppDatabase } from "../storage/database";
import type { WorkspaceEvent } from "@/lib/workspace";
import type { ShenavaStatus } from "@/lib/speech/shenava";

export const NOTIFICATION_OPEN_CHAT_CHANNEL = "notifications:open-chat";
export const NOTIFICATION_PLAY_SOUND_CHANNEL = "notifications:play-sound";

type WindowHandle = {
  isDestroyed: () => boolean;
  isFocused: () => boolean;
  show: () => void;
  focus: () => void;
  webContents: {
    send: (channel: string, payload?: unknown) => void;
  };
};

export type NativeNotificationPayload = {
  title: string;
  body: string;
  silent: boolean;
};

type NotificationServiceOptions = {
  database: AppDatabase;
  getWindow: () => WindowHandle | null;
  nativeNotificationsSupported: () => boolean;
  presentNativeNotification: (
    payload: NativeNotificationPayload,
    onClick: () => void
  ) => void;
};

export class DesktopNotificationService {
  readonly #database: AppDatabase;
  readonly #getWindow: () => WindowHandle | null;
  readonly #nativeNotificationsSupported: () => boolean;
  readonly #presentNativeNotification: NotificationServiceOptions["presentNativeNotification"];
  readonly #lastRunStatus = new Map<string, string>();
  readonly #modelPhases = new Map<string, string>();

  constructor(options: NotificationServiceOptions) {
    this.#database = options.database;
    this.#getWindow = options.getWindow;
    this.#nativeNotificationsSupported = options.nativeNotificationsSupported;
    this.#presentNativeNotification = options.presentNativeNotification;
  }

  handleWorkspaceEvent(event: WorkspaceEvent) {
    if (event.type !== "run-changed") return;
    const run = this.#database.getAgentRun(event.runId);
    if (!run) return;

    const previousStatus = this.#lastRunStatus.get(run.id);
    this.#lastRunStatus.set(run.id, run.status);
    if (previousStatus === run.status) return;
    if (
      run.status !== "completed" &&
      run.status !== "failed" &&
      run.status !== "awaiting_approval"
    ) {
      return;
    }

    const settings = this.#database.loadNotificationSettings();
    const chat = this.#database
      .loadChats()
      .find((candidate) => candidate.id === run.chatId);
    const body = chat?.title?.trim() || "پاسخ ایجنت آماده است.";

    if (run.status === "completed") {
      if (settings.completionSound) this.#playCompletionSound();
      if (settings.agentCompleted) {
        this.#showNative(
          "کار ایجنت تمام شد",
          body,
          run.chatId,
          run.workspaceId
        );
      }
      return;
    }

    if (run.status === "failed" && settings.agentFailed) {
      this.#showNative(
        "اجرای ایجنت ناموفق بود",
        run.error?.trim() || body,
        run.chatId,
        run.workspaceId
      );
      return;
    }

    if (run.status === "awaiting_approval" && settings.approvalRequired) {
      this.#showNative(
        "تأیید شما لازم است",
        body,
        run.chatId,
        run.workspaceId
      );
    }
  }

  handleShenavaStatus(status: ShenavaStatus) {
    for (const [modelKey, modelStatus] of Object.entries(status.models)) {
      const previousPhase = this.#modelPhases.get(modelKey);
      this.#modelPhases.set(modelKey, modelStatus.phase);
      if (
        previousPhase === "downloading" &&
        modelStatus.phase === "ready" &&
        this.#database.loadNotificationSettings().modelDownloads
      ) {
        this.#showNative(
          "دانلود مدل گفتار تمام شد",
          "مدل شنوا آماده استفاده است."
        );
      }
    }
  }

  #playCompletionSound() {
    const window = this.#getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(NOTIFICATION_PLAY_SOUND_CHANNEL);
  }

  #showNative(
    title: string,
    body: string,
    chatId?: string,
    workspaceId?: string | null
  ) {
    const settings = this.#database.loadNotificationSettings();
    if (
      !settings.desktopNotificationsEnabled ||
      !this.#nativeNotificationsSupported()
    ) {
      return;
    }

    const window = this.#getWindow();
    if (window && !window.isDestroyed() && window.isFocused()) return;

    this.#presentNativeNotification(
      { title, body, silent: true },
      () => {
        const currentWindow = this.#getWindow();
        if (!currentWindow || currentWindow.isDestroyed()) return;
        currentWindow.show();
        currentWindow.focus();
        if (chatId) {
          currentWindow.webContents.send(NOTIFICATION_OPEN_CHAT_CHANNEL, {
            chatId,
            workspaceId: workspaceId ?? null,
          });
        }
      }
    );
  }
}
