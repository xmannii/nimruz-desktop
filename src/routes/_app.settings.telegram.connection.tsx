import { TelegramSettingsSection } from "@/components/settings/telegram-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/telegram/connection")({
  component: TelegramConnectionRoute,
});

function TelegramConnectionRoute() {
  return <TelegramSettingsSection view="connection" />;
}
