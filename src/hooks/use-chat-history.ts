"use client";

import {
  deleteAllLocalChats,
  deleteLocalChat,
  loadLocalChats,
  saveLocalChats,
  type LocalChat,
} from "@/lib/chat/storage";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER_ID,
  type ModelId,
} from "@/lib/models";
import type { ProviderModelRef } from "@/lib/models/catalog";
import { HOME_WORKSPACE_ID } from "@/lib/workspace";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SAVE_DELAY = 250;

function createEmptyChat(
  model: ModelId = DEFAULT_MODEL,
  id: string = nanoid(),
  workspaceId: string | null = HOME_WORKSPACE_ID,
  providerId: string = DEFAULT_PROVIDER_ID
): LocalChat {
  const now = Date.now();

  return {
    id,
    title: "گفتگوی جدید",
    providerId,
    model,
    messages: [],
    workspaceId,
    createdAt: now,
    updatedAt: now,
  };
}

function getChatTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const textPart = firstUserMessage?.parts.find(
    (part): part is Extract<(typeof firstUserMessage.parts)[number], { type: "text" }> =>
      part.type === "text"
  );
  const title = textPart?.text.trim().replace(/\s+/g, " ");

  if (!title) return "گفتگوی جدید";
  return title.length > 42 ? `${title.slice(0, 42)}…` : title;
}

function areMessagesEqual(left: UIMessage[], right: UIMessage[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeChat(chat: LocalChat): LocalChat {
  const legacy = chat as LocalChat & { projectId?: string | null };
  return {
    ...chat,
    providerId: chat.providerId || DEFAULT_PROVIDER_ID,
    model: typeof chat.model === "string" && chat.model ? chat.model : DEFAULT_MODEL,
    messages: Array.isArray(chat.messages) ? chat.messages : [],
    workspaceId:
      typeof chat.workspaceId === "string"
        ? chat.workspaceId
        : typeof legacy.projectId === "string"
          ? legacy.projectId
          : HOME_WORKSPACE_ID,
    titleIsCustom: Boolean(chat.titleIsCustom),
    pinned: Boolean(chat.pinned),
    pinnedAt:
      chat.pinnedAt == null || !Number.isFinite(chat.pinnedAt)
        ? null
        : Number(chat.pinnedAt),
  };
}

function sortChats(chats: LocalChat[]): LocalChat[] {
  return [...chats].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    if (left.pinned && right.pinned) {
      return (
        (right.pinnedAt ?? right.updatedAt) - (left.pinnedAt ?? left.updatedAt)
      );
    }

    return right.updatedAt - left.updatedAt;
  });
}

export type ChatUpdate = {
  messages: UIMessage[];
  model: ModelId;
  providerId?: string;
};

export function useChatHistory(
  initialChatId?: string,
  defaultModelRef?: ProviderModelRef | null
) {
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const chatsRef = useRef(chats);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const loadedChats = (await loadLocalChats()).map(normalizeChat);
        const storedChats = loadedChats.filter(
          (chat) => chat.messages.length > 0
        );
        const emptyStoredChats = loadedChats.filter(
          (chat) => chat.messages.length === 0
        );

        if (emptyStoredChats.length > 0) {
          await Promise.all(
            emptyStoredChats.map((chat) => deleteLocalChat(chat.id))
          );
        }

        const requestedChat = initialChatId
          ? storedChats.find((chat) => chat.id === initialChatId)
          : undefined;
        const draftChat = requestedChat
          ? undefined
          : createEmptyChat(
              DEFAULT_MODEL,
              initialChatId && /^[\w-]{1,128}$/.test(initialChatId)
                ? initialChatId
                : nanoid(),
              HOME_WORKSPACE_ID,
              DEFAULT_PROVIDER_ID
            );
        const initialChats = draftChat
          ? [draftChat, ...storedChats]
          : storedChats;
        const initialActiveId = requestedChat?.id ?? draftChat?.id ?? null;

        if (!cancelled) {
          setChats(initialChats);
          setActiveChatId(initialActiveId);
          setIsHydrated(true);
        }
      } catch (error) {
        console.error("Failed to load local chats:", error);

        if (!cancelled) {
          const fallbackChat = createEmptyChat(
            DEFAULT_MODEL,
            initialChatId && /^[\w-]{1,128}$/.test(initialChatId)
              ? initialChatId
              : nanoid(),
            HOME_WORKSPACE_ID,
            DEFAULT_PROVIDER_ID
          );
          setChats([fallbackChat]);
          setActiveChatId(fallbackChat.id);
          setIsHydrated(true);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [initialChatId]);

  useEffect(() => {
    if (!isHydrated) return;

    const storedChats = chats.filter((chat) => chat.messages.length > 0);
    if (storedChats.length === 0) return;

    const timeout = window.setTimeout(() => {
      void saveLocalChats(storedChats).catch((error) => {
        console.error("Failed to save local chats:", error);
      });
    }, SAVE_DELAY);

    return () => window.clearTimeout(timeout);
  }, [chats, isHydrated]);

  useEffect(() => {
    function flushChats() {
      const storedChats = chatsRef.current.filter(
        (chat) => chat.messages.length > 0
      );

      if (storedChats.length > 0) {
        void saveLocalChats(storedChats);
      }
    }

    window.addEventListener("pagehide", flushChats);
    return () => window.removeEventListener("pagehide", flushChats);
  }, []);

  useEffect(() => {
    if (!isHydrated || !defaultModelRef) return;

    setChats((current) => {
      let changed = false;
      const next = current.map((chat) => {
        if (chat.messages.length > 0) return chat;
        if (
          chat.model === defaultModelRef.modelId &&
          (chat.providerId || DEFAULT_PROVIDER_ID) === defaultModelRef.providerId
        ) {
          return chat;
        }

        changed = true;
        return {
          ...chat,
          model: defaultModelRef.modelId as ModelId,
          providerId: defaultModelRef.providerId,
          updatedAt: Date.now(),
        };
      });

      return changed ? next : current;
    });
  }, [defaultModelRef, isHydrated]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats]
  );

  const visibleChats = useMemo(
    () => sortChats(chats.filter((chat) => chat.messages.length > 0)),
    [chats]
  );

  const createChat = useCallback((workspaceId: string | null = HOME_WORKSPACE_ID) => {
    const currentChat = chats.find((chat) => chat.id === activeChatId);
    const chat = createEmptyChat(
      defaultModelRef?.modelId ?? currentChat?.model ?? DEFAULT_MODEL,
      nanoid(),
      workspaceId ?? HOME_WORKSPACE_ID,
      defaultModelRef?.providerId ??
        currentChat?.providerId ??
        DEFAULT_PROVIDER_ID
    );
    const emptyChats = chats.filter((item) => item.messages.length === 0);

    setChats((current) => [
      chat,
      ...current.filter((item) => item.messages.length > 0),
    ]);
    setActiveChatId(chat.id);

    for (const emptyChat of emptyChats) {
      void deleteLocalChat(emptyChat.id).catch((error) => {
        console.error("Failed to replace empty local chat:", error);
      });
    }

    return chat.id;
  }, [activeChatId, chats, defaultModelRef]);

  const removeWorkspaceFromChats = useCallback((workspaceId: string) => {
    setChats((current) =>
      current.map((chat) =>
        chat.workspaceId === workspaceId
          ? { ...chat, workspaceId: HOME_WORKSPACE_ID, updatedAt: Date.now() }
          : chat
      )
    );
  }, []);

  const setChatWorkspaceId = useCallback(
    (chatId: string, workspaceId: string) => {
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? { ...chat, workspaceId, updatedAt: Date.now() }
            : chat
        )
      );
    },
    []
  );

  /** @deprecated Use removeWorkspaceFromChats */
  const removeProjectFromChats = removeWorkspaceFromChats;

  const getChatById = useCallback(
    (id: string) => chats.find((chat) => chat.id === id) ?? null,
    [chats]
  );

  const selectChat = useCallback((id: string) => {
    setChats((current) => {
      const exists = current.some((chat) => chat.id === id);
      if (!exists) return current;

      return current.filter(
        (chat) => chat.messages.length > 0 || chat.id === id
      );
    });
    setActiveChatId(id);
  }, []);

  const updateChat = useCallback((id: string, update: ChatUpdate) => {
    setChats((current) => {
      const chat = current.find((item) => item.id === id);
      if (!chat) return current;

      const nextProviderId = update.providerId ?? chat.providerId;

      if (
        chat.model === update.model &&
        chat.providerId === nextProviderId &&
        areMessagesEqual(chat.messages, update.messages)
      ) {
        return current;
      }

      const updatedChat: LocalChat = {
        ...chat,
        ...update,
        providerId: nextProviderId,
        title: chat.titleIsCustom ? chat.title : getChatTitle(update.messages),
        updatedAt: Date.now(),
      };

      return sortChats([
        updatedChat,
        ...current.filter((item) => item.id !== updatedChat.id),
      ]);
    });
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    const trimmedTitle = title.trim().replace(/\s+/g, " ");
    if (!trimmedTitle) return;

    setChats((current) =>
      sortChats(
        current.map((chat) =>
          chat.id === id
            ? {
                ...chat,
                title: trimmedTitle,
                titleIsCustom: true,
              }
            : chat
        )
      )
    );
  }, []);

  const lockChatTitle = useCallback((id: string) => {
    setChats((current) =>
      current.map((chat) =>
        chat.id === id && !chat.titleIsCustom
          ? { ...chat, titleIsCustom: true }
          : chat
      )
    );
  }, []);

  const setChatPinned = useCallback((id: string, pinned: boolean) => {
    setChats((current) =>
      sortChats(
        current.map((chat) =>
          chat.id === id
            ? {
                ...chat,
                pinned,
                pinnedAt: pinned ? Date.now() : null,
                updatedAt: Date.now(),
              }
            : chat
        )
      )
    );
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      const remainingChats = chats.filter((chat) => chat.id !== id);
      const nextChats =
        remainingChats.length > 0 ? remainingChats : [createEmptyChat()];

      setChats(nextChats);

      if (activeChatId === id) {
        setActiveChatId(nextChats[0].id);
      }

      void deleteLocalChat(id)
        .then(() =>
          saveLocalChats(
            nextChats.filter((chat) => chat.messages.length > 0)
          )
        )
        .catch((error) => {
          console.error("Failed to delete local chat:", error);
        });
    },
    [activeChatId, chats]
  );

  const removeAllChats = useCallback(() => {
    const chat = createEmptyChat(
      defaultModelRef?.modelId ?? DEFAULT_MODEL,
      nanoid(),
      HOME_WORKSPACE_ID,
      defaultModelRef?.providerId ?? DEFAULT_PROVIDER_ID
    );

    setChats([chat]);
    setActiveChatId(chat.id);

    void deleteAllLocalChats().catch((error) => {
      console.error("Failed to delete all chats:", error);
    });

    return chat.id;
  }, [defaultModelRef]);

  return {
    chats: visibleChats,
    activeChat,
    activeChatId,
    isHydrated,
    getChatById,
    createChat,
    selectChat,
    updateChat,
    setChatWorkspaceId,
    renameChat,
    lockChatTitle,
    setChatPinned,
    removeChat,
    removeAllChats,
    removeWorkspaceFromChats,
    removeProjectFromChats,
  };
}
