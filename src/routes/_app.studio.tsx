import { StudioPage } from "@/components/studio/studio-page";
import { isStudioTab, type StudioTab } from "@/lib/studio/format";
import { createFileRoute } from "@tanstack/react-router";

export type StudioSearch = {
  tab: StudioTab;
  /** Opens this item in the viewer (e.g. from the sidebar). */
  item?: string;
  /** Prefills the tab's prompt (e.g. from the empty chat). */
  prompt?: string;
};

export const Route = createFileRoute("/_app/studio")({
  validateSearch: (search: Record<string, unknown>): StudioSearch => ({
    tab: isStudioTab(search.tab) ? search.tab : "image",
    item:
      typeof search.item === "string" && /^[\w-]{1,128}$/.test(search.item)
        ? search.item
        : undefined,
    prompt:
      typeof search.prompt === "string" && search.prompt.trim()
        ? search.prompt.slice(0, 4_000)
        : undefined,
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { tab, item, prompt } = Route.useSearch();
  return <StudioPage tab={tab} itemId={item} prompt={prompt} />;
}
