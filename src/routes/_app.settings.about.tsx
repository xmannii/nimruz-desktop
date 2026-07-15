import { AboutSettingsSection } from "@/components/settings/about-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/about")({
  component: AboutSettingsSection,
});
