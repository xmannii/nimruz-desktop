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
  readonly #listeners = new Set<(event: WorkspaceEvent) => void>();

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  onEvent(listener: (event: WorkspaceEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event: WorkspaceEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Observers must never interrupt the agent operation that emitted the event.
      }
    }

    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    try {
      window.webContents.send(WORKSPACE_EVENT_CHANNEL, event);
    } catch {
      // Renderer might be tearing down; ignore delivery failures.
    }
  }
}
