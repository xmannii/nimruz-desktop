import type { BrowserWindow } from "electron";
import type { WorkspaceEvent } from "@/lib/workspace";

export type { WorkspaceEvent } from "@/lib/workspace";

/** IPC channel used to deliver workspace events to the renderer. */
export const WORKSPACE_EVENT_CHANNEL = "workspace:event";

/**
 * Sends workspace events to the renderer through the main window's webContents.
 * Safe to call before/after the window exists; missing windows are ignored.
 */
export class WorkspaceEventBus {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  emit(event: WorkspaceEvent): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    try {
      window.webContents.send(WORKSPACE_EVENT_CHANNEL, event);
    } catch {
      // Renderer might be tearing down; ignore delivery failures.
    }
  }
}
