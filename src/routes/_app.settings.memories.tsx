import { MemoriesSettingsSection } from "@/components/settings/memories-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/memories")({
  component: MemoriesSettingsSection,
});
