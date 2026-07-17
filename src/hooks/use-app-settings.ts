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
import { sanitizeExperts, type Expert } from "@/lib/settings/experts";
import {
  loadSubagentModels,
  sanitizeSubagentModels,
  saveSubagentModels,
  type SubagentModel,
} from "@/lib/settings/subagents";

const PERSONALIZATION_SAVE_DEBOUNCE_MS = 400;

export function useAppSettings() {
  const [personalization, setPersonalization] =
    useState<PersonalizationSettings>(DEFAULT_PERSONALIZATION_SETTINGS);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [subagents, setSubagents] = useState<SubagentModel[]>([]);
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
        Promise.all([
          loadPersonalizationSettings(),
          loadMemories(),
          window.desktop.storage.loadExperts(),
          loadSubagentModels(),
        ])
      )
      .then(
        ([
          loadedPersonalization,
          loadedMemories,
          loadedExperts,
          loadedSubagents,
        ]) => {
          if (cancelled) return;
          setPersonalization(loadedPersonalization);
          setMemories(loadedMemories);
          setExperts(loadedExperts);
          setSubagents(loadedSubagents);
        }
      )
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

  const handleExpertsChange = useCallback((nextExperts: Expert[]) => {
    const sanitized = sanitizeExperts(nextExperts);
    setExperts(sanitized);
    void window.desktop.storage.saveExperts(sanitized).then(setExperts).catch((error) => {
      console.error("Failed to save experts:", error);
    });
  }, []);

  const handleSubagentsChange = useCallback(
    (nextSubagents: SubagentModel[]) => {
      const sanitized = sanitizeSubagentModels(nextSubagents);
      setSubagents(sanitized);
      void saveSubagentModels(sanitized)
        .catch((error) => {
          console.error("Failed to save subagent models:", error);
        });
    },
    []
  );

  return {
    personalization,
    memories,
    experts,
    subagents,
    isHydrated,
    saveState,
    updatePersonalization,
    handleMemoriesChange,
    handleDeleteMemory,
    handleExpertsChange,
    handleSubagentsChange,
  };
}
