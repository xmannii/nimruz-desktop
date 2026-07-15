import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models")({
  component: ModelsSettingsSection,
});
