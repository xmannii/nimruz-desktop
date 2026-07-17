import { HOME_WORKSPACE_ID } from "./types";

export const ACTIVE_WORKSPACE_KEY = "nimruz-active-workspace-id";

export function readStoredActiveWorkspaceId(
  validWorkspaceIds?: Iterable<string>
): string {
  if (typeof window === "undefined") return HOME_WORKSPACE_ID;

  const storedId = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  if (!storedId) return HOME_WORKSPACE_ID;

  if (validWorkspaceIds) {
    const isValid = Array.from(validWorkspaceIds).includes(storedId);
    if (!isValid) return HOME_WORKSPACE_ID;
  }

  return storedId;
}

export function writeStoredActiveWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id ?? HOME_WORKSPACE_ID);
}
