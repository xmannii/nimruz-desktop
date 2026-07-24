import { McpSettingsSection } from "@/components/settings/mcp-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/mcp")({
  component: McpSettingsSection,
});
