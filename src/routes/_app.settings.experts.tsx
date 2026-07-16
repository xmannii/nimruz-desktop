import { ExpertsSettingsSection } from "@/components/settings/experts-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/experts")({
  component: ExpertsSettingsSection,
});
