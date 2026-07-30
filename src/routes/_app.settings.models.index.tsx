import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models/")({
  component: ModelsOverviewRoute,
});

function ModelsOverviewRoute() {
  const { provider } = Route.useSearch();
  return (
    <ModelsSettingsSection initialProviderId={provider} view="overview" />
  );
}
