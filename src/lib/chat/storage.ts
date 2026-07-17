import type { ModelId } from "@/lib/models";
import { ensureLegacyMigration } from "@/lib/storage/migrate-legacy";
import type { LocalWorkspace, WorkspaceRoot } from "@/lib/workspace";
import type { UIMessage } from "ai";

export type LocalChat = {
  id: string;
  title: string;
  providerId: string;
  model: ModelId;
  messages: UIMessage[];
  workspaceId: string | null;
  createdAt: number;
  updatedAt: number;
  titleIsCustom?: boolean;
  pinned?: boolean;
  pinnedAt?: number | null;
};

/** @deprecated Use LocalWorkspace */
export type LocalProject = LocalWorkspace;

export type { LocalWorkspace, WorkspaceRoot };

export async function loadLocalChats(): Promise<LocalChat[]> {
  await ensureLegacyMigration();
  return window.desktop.storage.loadChats();
}

export async function saveLocalChats(chats: LocalChat[]): Promise<void> {
  if (chats.length === 0) return;
  await window.desktop.storage.saveChats(chats);
}

export async function deleteLocalChat(id: string): Promise<void> {
  await window.desktop.storage.deleteChat(id);
}

export async function deleteAllLocalChats(): Promise<void> {
  await window.desktop.storage.deleteAllChats();
}

export async function loadLocalWorkspaces(): Promise<LocalWorkspace[]> {
  await ensureLegacyMigration();
  return window.desktop.storage.loadWorkspaces();
}

export async function saveLocalWorkspace(
  workspace: LocalWorkspace
): Promise<void> {
  await window.desktop.storage.saveWorkspace(workspace);
}

export async function deleteLocalWorkspace(id: string): Promise<void> {
  await window.desktop.storage.deleteWorkspace(id);
}

/** @deprecated Use loadLocalWorkspaces */
export async function loadLocalProjects(): Promise<LocalWorkspace[]> {
  return loadLocalWorkspaces();
}

/** @deprecated Use saveLocalWorkspace */
export async function saveLocalProject(
  project: LocalWorkspace
): Promise<void> {
  return saveLocalWorkspace(project);
}

/** @deprecated Use deleteLocalWorkspace */
export async function deleteLocalProject(id: string): Promise<void> {
  return deleteLocalWorkspace(id);
}

export async function loadWorkspaceRoots(
  workspaceId: string
): Promise<WorkspaceRoot[]> {
  return window.desktop.storage.loadWorkspaceRoots(workspaceId);
}

export async function addLinkedWorkspaceRoot(
  workspaceId: string
): Promise<WorkspaceRoot | null> {
  return window.desktop.storage.addLinkedWorkspaceRoot(workspaceId);
}

export async function removeWorkspaceRoot(rootId: string): Promise<void> {
  return window.desktop.storage.removeWorkspaceRoot(rootId);
}
