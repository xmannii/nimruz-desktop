import { HelpSettingsSection } from "@/components/settings/help-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/help")({
  component: HelpSettingsSection,
});
