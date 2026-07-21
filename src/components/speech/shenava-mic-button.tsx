"use client";

import { InputGroupButton } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { MicIcon, SquareIcon } from "lucide-react";

export function ShenavaMicButton({
  isRecording,
  isTranscribing,
  disabled,
  mobile = false,
  onClick,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  disabled?: boolean;
  mobile?: boolean;
  onClick: () => void;
}) {
  const label = isRecording
    ? "پایان ضبط و تبدیل به متن"
    : isTranscribing
      ? "در حال تبدیل گفتار به متن"
      : "گفتار فارسی";

  return (
    <InputGroupButton
      size="icon-sm"
      type="button"
      variant={isRecording ? "destructive" : "secondary"}
      className={mobile ? "size-10 shrink-0 rounded-full" : undefined}
      aria-label={label}
      title={label}
      aria-pressed={isRecording}
      disabled={disabled || isTranscribing}
      onClick={onClick}
    >
      {isTranscribing ? (
        <Spinner />
      ) : isRecording ? (
        <SquareIcon />
      ) : (
        <MicIcon />
      )}
    </InputGroupButton>
  );
}
