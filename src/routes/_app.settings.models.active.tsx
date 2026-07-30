import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models/active")({
  component: ActiveModelsRoute,
});

function ActiveModelsRoute() {
  const { provider } = Route.useSearch();
  return <ModelsSettingsSection initialProviderId={provider} view="models" />;
}
