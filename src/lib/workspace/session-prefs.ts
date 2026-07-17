import { HOME_WORKSPACE_ID } from "./types";

export const ACTIVE_WORKSPACE_KEY = "nimruz-active-workspace-id";

export function readStoredActiveWorkspaceId(
  validWorkspaceIds?: Iterable<string>
): string {
  if (typeof window === "undefined") return HOME_WORKSPACE_ID;

  let storedId: string | null = null;
  try {
    storedId = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return HOME_WORKSPACE_ID;
  }
  if (!storedId) return HOME_WORKSPACE_ID;

  if (validWorkspaceIds) {
    const isValid = Array.from(validWorkspaceIds).includes(storedId);
    if (!isValid) return HOME_WORKSPACE_ID;
  }

  return storedId;
}

export async function loadStoredActiveWorkspaceId(
  validWorkspaceIds?: Iterable<string>
): Promise<string> {
  const validIds = validWorkspaceIds
    ? new Set(validWorkspaceIds)
    : undefined;
  try {
    const storedId = await window.desktop.storage.loadActiveWorkspaceId();
    if (storedId && (!validIds || validIds.has(storedId))) {
      return storedId;
    }
  } catch {
    // Fall back to the legacy renderer preference.
  }

  const legacyId = readStoredActiveWorkspaceId(validIds);
  void window.desktop.storage
    .saveActiveWorkspaceId(legacyId)
    .catch(() => undefined);
  return legacyId;
}

export function writeStoredActiveWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  const workspaceId = id ?? HOME_WORKSPACE_ID;
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    // SQLite remains the durable source of truth.
  }
  void window.desktop.storage
    .saveActiveWorkspaceId(workspaceId)
    .catch((error) => {
      console.error("Failed to save active workspace:", error);
    });
}
