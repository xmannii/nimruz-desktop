"use client";

import { DISMISSED_UPDATE_STORAGE_KEY } from "@/lib/updates";
import type { UpdateCheckResult } from "@/lib/updates";
import { useEffect, useState } from "react";

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string) {
  try {
    localStorage.setItem(DISMISSED_UPDATE_STORAGE_KEY, version);
  } catch {
    // Ignore quota / private mode failures.
  }
}

function clearDismissedVersion() {
  try {
    localStorage.removeItem(DISMISSED_UPDATE_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export type AvailableUpdate = Extract<UpdateCheckResult, { status: "available" }>;

export function useAppUpdate(options?: { autoCheck?: boolean; delayMs?: number }) {
  const autoCheck = options?.autoCheck ?? true;
  const delayMs = options?.delayMs ?? 2500;

  const [version, setVersion] = useState<string | null>(null);
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.desktop.updates.getVersion().then((next) => {
      if (!cancelled) setVersion(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function check(options?: { silent?: boolean }) {
    setChecking(true);
    try {
      const result = await window.desktop.updates.check();
      setLastResult(result);

      if (result.status === "available") {
        const dismissed = readDismissedVersion();
        if (dismissed === result.latestVersion && options?.silent) {
          setAvailable(null);
        } else {
          if (dismissed && dismissed !== result.latestVersion) {
            clearDismissedVersion();
          }
          setAvailable(result);
        }
      } else {
        setAvailable(null);
      }

      return result;
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!autoCheck) return;

    const timer = window.setTimeout(() => {
      void check({ silent: true }).catch(() => {
        // Startup checks stay quiet on failure.
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
    // Run once on mount for the startup prompt.
  }, [autoCheck, delayMs]);


  function dismiss() {
    if (available) {
      writeDismissedVersion(available.latestVersion);
    }
    setAvailable(null);
  }

  async function openDownload() {
    if (!available) return;
    const url = available.downloadUrl ?? available.releaseUrl;
    await window.desktop.updates.openUrl(url);
  }

  async function openReleasePage() {
    if (!available) return;
    await window.desktop.updates.openUrl(available.releaseUrl);
  }

  return {
    version,
    available,
    checking,
    lastResult,
    check,
    dismiss,
    openDownload,
    openReleasePage,
  };
}
