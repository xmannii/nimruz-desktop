import type { ModelId } from "@/lib/models";
import { ensureLegacyMigration } from "@/lib/storage/migrate-legacy";
import type { UIMessage } from "ai";

export type LocalChat = {
  id: string;
  title: string;
  model: ModelId;
  messages: UIMessage[];
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  titleIsCustom?: boolean;
};

export type LocalProject = {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};

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

export async function loadLocalProjects(): Promise<LocalProject[]> {
  await ensureLegacyMigration();
  return window.desktop.storage.loadProjects();
}

export async function saveLocalProject(project: LocalProject): Promise<void> {
  await window.desktop.storage.saveProject(project);
}

export async function deleteLocalProject(id: string): Promise<void> {
  await window.desktop.storage.deleteProject(id);
}
