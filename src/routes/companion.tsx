import { CompanionView } from "@/components/companion/companion-view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/companion")({
  component: CompanionView,
});
