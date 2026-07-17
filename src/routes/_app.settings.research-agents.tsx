import { ResearchAgentsSettingsSection } from "@/components/settings/research-agents-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/research-agents")({
  component: ResearchAgentsSettingsSection,
});
