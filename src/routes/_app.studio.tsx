import { StudioPage } from "@/components/studio/studio-page";
import { isStudioTab, type StudioTab } from "@/lib/studio/format";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/studio")({
  validateSearch: (search: Record<string, unknown>): { tab: StudioTab } => ({
    tab: isStudioTab(search.tab) ? search.tab : "image",
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { tab } = Route.useSearch();
  return <StudioPage tab={tab} />;
}
