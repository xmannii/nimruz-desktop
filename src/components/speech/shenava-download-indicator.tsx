"use client";

import { ShenavaDownloadDialog } from "@/components/speech/shenava-download-dialog";
import { Button } from "@/components/ui/button";
import { useShenavaModel } from "@/hooks/use-shenava-model";
import {
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
} from "@/lib/speech/shenava";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

export function ShenavaDownloadIndicator() {
  const model = useShenavaModel();
  const [dialogOpen, setDialogOpen] = useState(false);

  const downloadingModelKey = SHENAVA_MODEL_KEYS.find(
    (modelKey) => model.status.models[modelKey].phase === "downloading"
  );

  if (!downloadingModelKey) return null;

  const downloadingStatus = model.status.models[downloadingModelKey];
  const definition = SHENAVA_MODELS[downloadingModelKey];

  const progress = Math.min(
    100,
    (downloadingStatus.downloadedBytes / downloadingStatus.totalBytes) * 100
  );
  const roundedProgress = Math.round(progress);
  const progressLabel = roundedProgress.toLocaleString("fa-IR");

  return (
    <>
      <Button
        type="button"
        dir="rtl"
        variant="secondary"
        size="sm"
        className="titlebar-no-drag relative h-8 min-w-20 overflow-hidden rounded-full px-3 text-xs shadow-none"
        aria-label={`دانلود مدل ${definition.shortName}، ${progressLabel} درصد`}
        onClick={() => setDialogOpen(true)}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <DownloadIcon data-icon="inline-start" />
        <span className="hidden sm:inline">{definition.shortName}</span>
        <span className="tabular-nums">
          {progressLabel}٪
        </span>
        <span
          aria-hidden
          className="absolute bottom-0 start-0 h-0.5 bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </Button>

      <ShenavaDownloadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={model.status}
        initialModelKey={downloadingModelKey}
        onDownload={() => undefined}
        onCancelDownload={() => {
          void model.cancelDownload();
          setDialogOpen(false);
        }}
      />
    </>
  );
}
