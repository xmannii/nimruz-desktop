"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TYPING_MS_PER_CHAR = 34;

export function useTypingChatTitles() {
  const [typingTitles, setTypingTitles] = useState<Record<string, string>>({});
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };
  }, []);

  const clearTyping = useCallback((chatId: string) => {
    setTypingTitles((current) => {
      if (!(chatId in current)) return current;
      const next = { ...current };
      delete next[chatId];
      return next;
    });
  }, []);

  const animateChatTitle = useCallback(
    (chatId: string, title: string, onComplete: (finalTitle: string) => void) => {
      const trimmed = title.trim().replace(/\s+/g, " ");
      if (!trimmed) return;

      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];

      setTypingTitles((current) => ({ ...current, [chatId]: "" }));

      let index = 0;
      const tick = () => {
        index += 1;
        const partial = trimmed.slice(0, index);
        setTypingTitles((current) => ({ ...current, [chatId]: partial }));

        if (index < trimmed.length) {
          const timer = window.setTimeout(tick, TYPING_MS_PER_CHAR);
          timersRef.current.push(timer);
          return;
        }

        onComplete(trimmed);
        clearTyping(chatId);
      };

      const timer = window.setTimeout(tick, TYPING_MS_PER_CHAR);
      timersRef.current.push(timer);
    },
    [clearTyping]
  );

  return {
    typingTitles,
    animateChatTitle,
  };
}
