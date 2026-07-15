import { ConnectionSettingsSection } from "@/components/settings/connection-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/connection")({
  component: ConnectionSettingsSection,
});
