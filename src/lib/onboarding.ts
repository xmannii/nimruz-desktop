export const ONBOARDING_STORAGE_KEY = "nimruz:onboarding-completed";

function readLegacyOnboardingState(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    if (await window.desktop.storage.loadOnboardingCompleted()) return true;
  } catch {
    // Fall back to the legacy renderer preference.
  }

  const completed = readLegacyOnboardingState();
  if (completed) {
    void window.desktop.storage.saveOnboardingCompleted(true).catch(() => undefined);
  }
  return completed;
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // Ignore quota / private mode failures.
  }
  await window.desktop.storage.saveOnboardingCompleted(true);
}

export async function resetOnboarding(): Promise<void> {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore.
  }
  await window.desktop.storage.saveOnboardingCompleted(false);
}
