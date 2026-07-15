import { SettingsLayout } from "@/components/settings/settings-layout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});
