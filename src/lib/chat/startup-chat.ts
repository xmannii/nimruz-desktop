import type { LocalChat } from "@/lib/chat/storage";
import { HOME_WORKSPACE_ID } from "../workspace/types";

export function findMostRecentChatInWorkspace(
  chats: LocalChat[],
  workspaceId: string
): LocalChat | undefined {
  return chats
    .filter((chat) => chat.workspaceId === workspaceId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export function resolveInitialActiveChat(
  storedChats: LocalChat[],
  options: {
    initialChatId?: string;
    activeWorkspaceId: string;
    createDraft: (workspaceId: string, id?: string) => LocalChat;
  }
): { chats: LocalChat[]; activeChatId: string | null } {
  const { initialChatId, activeWorkspaceId, createDraft } = options;

  const requestedChat = initialChatId
    ? storedChats.find((chat) => chat.id === initialChatId)
    : undefined;

  if (requestedChat) {
    return {
      chats: storedChats,
      activeChatId: requestedChat.id,
    };
  }

  if (activeWorkspaceId !== HOME_WORKSPACE_ID) {
    const existingChat = findMostRecentChatInWorkspace(
      storedChats,
      activeWorkspaceId
    );

    if (existingChat) {
      return {
        chats: storedChats,
        activeChatId: existingChat.id,
      };
    }

    const draftChat = createDraft(
      activeWorkspaceId,
      initialChatId && /^[\w-]{1,128}$/.test(initialChatId)
        ? initialChatId
        : undefined
    );

    return {
      chats: [draftChat, ...storedChats],
      activeChatId: draftChat.id,
    };
  }

  const draftChat = createDraft(
    HOME_WORKSPACE_ID,
    initialChatId && /^[\w-]{1,128}$/.test(initialChatId)
      ? initialChatId
      : undefined
  );

  return {
    chats: [draftChat, ...storedChats],
    activeChatId: draftChat.id,
  };
}
