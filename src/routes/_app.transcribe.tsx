import { FileTranscriptionPage } from "@/components/speech/file-transcription-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/transcribe")({
  component: FileTranscriptionPage,
});
