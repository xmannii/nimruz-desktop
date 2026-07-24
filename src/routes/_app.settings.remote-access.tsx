import { RemoteAccessSettingsSection } from "@/components/settings/remote-access-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/remote-access")({
  component: RemoteAccessSettingsSection,
});
