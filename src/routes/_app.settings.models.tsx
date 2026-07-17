import { ModelsSettingsSection } from "@/components/settings/models-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models")({
  validateSearch: (search: Record<string, unknown>) => ({
    provider:
      typeof search.provider === "string" &&
      /^[\w-]{1,128}$/.test(search.provider)
        ? search.provider
        : undefined,
  }),
  component: ModelsSettingsRoute,
});

function ModelsSettingsRoute() {
  const { provider } = Route.useSearch();
  return <ModelsSettingsSection initialProviderId={provider} />;
}
