import { ChangelogSettingsSection } from "@/components/settings/changelog-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/changelog")({
  component: ChangelogSettingsSection,
});
