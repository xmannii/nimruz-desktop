import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { LegacyImportResult } from "@/lib/desktop-api";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import { CredentialService } from "./credentials";
import { AppDatabase } from "./storage/database";
import { registerWindowControlHandlers } from "./window-controls";
import {
  validateChatsPayload,
  validateLegacySnapshot,
  validateProjectPayload,
} from "./storage/validation";

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? "";
  if (
    !url.startsWith("http://127.0.0.1:") &&
    !url.startsWith("http://localhost:")
  ) {
    throw new Error("Untrusted IPC sender.");
  }
}

export function registerIpcHandlers(options: {
  database: AppDatabase;
  credentials: CredentialService;
  sessionToken: string;
  getMainWindow: () => import("electron").BrowserWindow | null;
}) {
  const { database, credentials, sessionToken, getMainWindow } = options;

  function handle<TArgs extends unknown[], TResult>(
    channel: string,
    callback: (...args: TArgs) => TResult | Promise<TResult>
  ) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertTrustedSender(event);
      return callback(...(args as TArgs));
    });
  }

  handle("auth:get-session-token", () => sessionToken);

  handle("credentials:status", () => credentials.getStatus());
  handle("credentials:set-openrouter", (key: string) =>
    credentials.setOpenRouterKey(key)
  );
  handle("credentials:clear-openrouter", () =>
    credentials.clearOpenRouterKey()
  );
  handle("credentials:test-openrouter", (key?: string) =>
    credentials.testOpenRouterKey(key)
  );

  handle("storage:load-chats", () => database.loadChats());
  handle("storage:save-chats", (value: unknown) =>
    database.saveChats(validateChatsPayload(value))
  );
  handle("storage:delete-chat", (id: string) => database.deleteChat(id));

  handle("storage:load-projects", () => database.loadProjects());
  handle("storage:save-project", (value: unknown) =>
    database.saveProject(validateProjectPayload(value))
  );
  handle("storage:delete-project", (id: string) =>
    database.deleteProject(id)
  );

  handle(
    "storage:load-personalization",
    (): PersonalizationSettings => database.loadPersonalization()
  );
  handle("storage:save-personalization", (value: unknown) =>
    database.savePersonalization(value)
  );
  handle("storage:load-memories", (): MemoryEntry[] =>
    database.loadMemories()
  );
  handle("storage:save-memories", (value: unknown) =>
    database.saveMemories(value)
  );
  handle(
    "storage:import-legacy",
    (value: unknown): LegacyImportResult =>
      database.importLegacyData(validateLegacySnapshot(value))
  );

  registerWindowControlHandlers(getMainWindow);
}
