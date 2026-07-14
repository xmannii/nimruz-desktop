"use client";

import {
  deleteLocalChat,
  loadLocalChats,
  saveLocalChats,
  type LocalChat,
} from "@/lib/chat/storage";
import {
  DEFAULT_MODEL,
  getModelById,
  type ModelId,
} from "@/lib/models";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SAVE_DELAY = 250;

function createEmptyChat(
  model: ModelId = DEFAULT_MODEL,
  id: string = nanoid(),
  projectId: string | null = null
): LocalChat {
  const now = Date.now();

  return {
    id,
    title: "گفتگوی جدید",
    model,
    messages: [],
    projectId,
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
  return {
    ...chat,
    model: getModelById(chat.model) ? chat.model : DEFAULT_MODEL,
    messages: Array.isArray(chat.messages) ? chat.messages : [],
    projectId: typeof chat.projectId === "string" ? chat.projectId : null,
    titleIsCustom: Boolean(chat.titleIsCustom),
  };
}

export type ChatUpdate = {
  messages: UIMessage[];
  model: ModelId;
};

export function useChatHistory(initialChatId?: string) {
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
                : nanoid()
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
              : nanoid()
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

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats]
  );

  const visibleChats = useMemo(
    () => chats.filter((chat) => chat.messages.length > 0),
    [chats]
  );

  const createChat = useCallback((projectId: string | null = null) => {
    const currentChat = chats.find((chat) => chat.id === activeChatId);
    const chat = createEmptyChat(
      currentChat?.model ?? DEFAULT_MODEL,
      nanoid(),
      projectId
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
  }, [activeChatId, chats]);

  const removeProjectFromChats = useCallback((projectId: string) => {
    setChats((current) =>
      current.map((chat) =>
        chat.projectId === projectId ? { ...chat, projectId: null } : chat
      )
    );
  }, []);

  const selectChat = useCallback((id: string) => {
    setChats((current) =>
      current.filter((chat) => chat.messages.length > 0 || chat.id === id)
    );
    setActiveChatId(id);
  }, []);

  const updateChat = useCallback((id: string, update: ChatUpdate) => {
    setChats((current) => {
      const chat = current.find((item) => item.id === id);
      if (!chat) return current;

      if (
        chat.model === update.model &&
        areMessagesEqual(chat.messages, update.messages)
      ) {
        return current;
      }

      const updatedChat: LocalChat = {
        ...chat,
        ...update,
        title: chat.titleIsCustom ? chat.title : getChatTitle(update.messages),
        updatedAt: Date.now(),
      };

      return [
        updatedChat,
        ...current.filter((item) => item.id !== updatedChat.id),
      ];
    });
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    const trimmedTitle = title.trim().replace(/\s+/g, " ");
    if (!trimmedTitle) return;

    setChats((current) =>
      current.map((chat) =>
        chat.id === id
          ? {
              ...chat,
              title: trimmedTitle,
              titleIsCustom: true,
            }
          : chat
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

  return {
    chats: visibleChats,
    activeChat,
    activeChatId,
    isHydrated,
    createChat,
    selectChat,
    updateChat,
    renameChat,
    removeChat,
    removeProjectFromChats,
  };
}
