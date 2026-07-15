import { AppearanceSettingsSection } from "@/components/settings/appearance-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/appearance")({
  component: AppearanceSettingsSection,
});
