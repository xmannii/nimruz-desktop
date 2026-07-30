import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models/add")({
  component: AddModelRoute,
});

function AddModelRoute() {
  const { provider } = Route.useSearch();
  return <ModelsSettingsSection initialProviderId={provider} view="add" />;
}
