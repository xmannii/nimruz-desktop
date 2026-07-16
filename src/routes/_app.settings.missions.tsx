import { MissionsSettingsSection } from "@/components/settings/missions-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/missions")({
  component: MissionsSettingsSection,
});
