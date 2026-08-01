import { TelegramSettingsLayout } from "@/components/settings/telegram-layout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/telegram")({
  component: TelegramSettingsLayout,
});
