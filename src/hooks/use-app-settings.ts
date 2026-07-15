"use client";

import { ensureLegacyMigration } from "@/lib/storage/migrate-legacy";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  loadPersonalizationSettings,
  savePersonalizationSettings,
  type PersonalizationSettings,
} from "@/lib/settings/personalization";
import {
  deleteMemory,
  loadMemories,
  saveMemories,
  type MemoryEntry,
} from "@/lib/settings/memories";
import { useCallback, useEffect, useRef, useState } from "react";

const PERSONALIZATION_SAVE_DEBOUNCE_MS = 400;

export function useAppSettings() {
  const [personalization, setPersonalization] =
    useState<PersonalizationSettings>(DEFAULT_PERSONALIZATION_SETTINGS);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const saveTimerRef = useRef<number | null>(null);
  const savedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void ensureLegacyMigration()
      .then(() =>
        Promise.all([loadPersonalizationSettings(), loadMemories()])
      )
      .then(([loadedPersonalization, loadedMemories]) => {
        if (cancelled) return;
        setPersonalization(loadedPersonalization);
        setMemories(loadedMemories);
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (savedResetTimerRef.current !== null) {
        window.clearTimeout(savedResetTimerRef.current);
      }
    };
  }, []);

  const persistPersonalization = useCallback(
    (settings: PersonalizationSettings) => {
      setSaveState("saving");
      void savePersonalizationSettings(settings)
        .then((saved) => {
          setPersonalization(saved);
          setSaveState("saved");
          if (savedResetTimerRef.current !== null) {
            window.clearTimeout(savedResetTimerRef.current);
          }
          savedResetTimerRef.current = window.setTimeout(() => {
            setSaveState("idle");
          }, 1600);
        })
        .catch((error) => {
          console.error("Failed to save personalization:", error);
          setSaveState("error");
        });
    },
    []
  );

  const updatePersonalization = useCallback(
    (settings: PersonalizationSettings) => {
      setPersonalization(settings);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        persistPersonalization(settings);
      }, PERSONALIZATION_SAVE_DEBOUNCE_MS);
    },
    [persistPersonalization]
  );

  const handleMemoriesChange = useCallback((nextMemories: MemoryEntry[]) => {
    setMemories(nextMemories);
    void saveMemories(nextMemories)
      .then(setMemories)
      .catch((error) => {
        console.error("Failed to save memories:", error);
      });
  }, []);

  const handleDeleteMemory = useCallback((id: string) => {
    setMemories((current) => {
      const next = deleteMemory(current, id);
      void saveMemories(next).catch((error) => {
        console.error("Failed to delete memory:", error);
      });
      return next;
    });
  }, []);

  return {
    personalization,
    memories,
    isHydrated,
    saveState,
    updatePersonalization,
    handleMemoriesChange,
    handleDeleteMemory,
  };
}
