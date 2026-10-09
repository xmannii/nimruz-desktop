import { createFileRoute, redirect } from "@tanstack/react-router";

// Transcription now lives in Studio; keep old links and shortcuts working.
export const Route = createFileRoute("/_app/transcribe")({
  beforeLoad: () => {
    throw redirect({ to: "/studio", search: { tab: "transcribe" }, replace: true });
  },
});
