import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models/providers")({
  component: ModelProvidersRoute,
});

function ModelProvidersRoute() {
  const { provider } = Route.useSearch();
  return (
    <ModelsSettingsSection initialProviderId={provider} view="providers" />
  );
}
