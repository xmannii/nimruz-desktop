import { NotificationsSettingsSection } from "@/components/settings/notifications-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsSettingsSection,
});
