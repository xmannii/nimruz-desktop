import { ModelsSettingsLayout } from "@/components/settings/models-layout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/models")({
  validateSearch: (search: Record<string, unknown>) => ({
    provider:
      typeof search.provider === "string" &&
      /^[\w-]{1,128}$/.test(search.provider)
        ? search.provider
        : undefined,
  }),
  component: ModelsSettingsLayout,
});
