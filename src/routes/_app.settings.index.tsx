import { PersonalizationSettingsSection } from "@/components/settings/personalization-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/")({
  component: PersonalizationSettingsSection,
});
