import { TelegramSettingsSection } from "@/components/settings/telegram-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/telegram")({
  component: TelegramSettingsSection,
});

