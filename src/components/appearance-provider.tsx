"use client";

import { applyAppearanceSettings } from "@/lib/appearance/apply";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  loadAppearanceSettings,
  saveAppearanceSettings,
  sanitizeAppearanceSettings,
  type AppearanceSettings,
} from "@/lib/settings/appearance";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SAVE_DEBOUNCE_MS = 300;
const APPEARANCE_SYNC_KEY = "nimruz-appearance-sync";

function publishAppearance(settings: AppearanceSettings) {
  try {
    window.localStorage.setItem(
      APPEARANCE_SYNC_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // Durable settings remain available through SQLite.
  }
}

type AppearanceContextValue = {
  appearance: AppearanceSettings;
  isHydrated: boolean;
  updateAppearance: (settings: AppearanceSettings) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings>(
    DEFAULT_APPEARANCE_SETTINGS
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<AppearanceSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadAppearanceSettings()
      .then((loaded) => {
        if (cancelled) return;
        setAppearance(loaded);
        applyAppearanceSettings(loaded);
      })
      .catch((error) => {
        console.error("Failed to load appearance settings:", error);
        if (!cancelled) {
          applyAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_SYNC_KEY || !event.newValue) return;
      try {
        const next = sanitizeAppearanceSettings(JSON.parse(event.newValue));
        setAppearance(next);
        applyAppearanceSettings(next);
      } catch {
        // Ignore malformed cross-window state.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        void saveAppearanceSettings(pending).catch((error) => {
          console.error("Failed to flush appearance settings:", error);
        });
      }
    };
  }, []);

  const updateAppearance = useCallback((settings: AppearanceSettings) => {
    setAppearance(settings);
    applyAppearanceSettings(settings);
    publishAppearance(settings);
    pendingRef.current = settings;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const next = pendingRef.current;
      if (!next) return;
      pendingRef.current = null;
      void saveAppearanceSettings(next).catch((error) => {
        console.error("Failed to save appearance settings:", error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  return (
    <AppearanceContext.Provider
      value={{ appearance, isHydrated, updateAppearance }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearanceSettings() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error(
      "useAppearanceSettings must be used within AppearanceProvider"
    );
  }
  return context;
}
