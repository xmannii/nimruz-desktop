import { SpeechSettingsSection } from "@/components/settings/speech-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/speech")({
  component: SpeechSettingsSection,
});
