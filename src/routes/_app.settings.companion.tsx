import { CompanionSettingsSection } from "@/components/settings/companion-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/companion")({
  component: CompanionSettingsSection,
});
