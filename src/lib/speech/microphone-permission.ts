import { toast } from "sonner";

export async function openMicrophonePrivacySettings() {
  try {
    const opened = await window.desktop.privacy.openMicrophoneSettings();
    if (!opened) {
      toast.info("تنظیمات میکروفن را از بخش حریم خصوصی سیستم باز کنید.");
    }
    return opened;
  } catch {
    toast.error("بازکردن تنظیمات حریم خصوصی میکروفن ناموفق بود.");
    return false;
  }
}

export function showMicrophonePermissionDeniedToast() {
  toast.error("دسترسی میکروفن رد شده است.", {
    description: "برای فعال‌کردن دسترسی، تنظیمات حریم خصوصی سیستم را باز کنید.",
    action: {
      label: "بازکردن تنظیمات",
      onClick: () => void openMicrophonePrivacySettings(),
    },
  });
}
