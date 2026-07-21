"use client";

import { ShenavaDownloadDialog } from "@/components/speech/shenava-download-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { useShenavaModel } from "@/hooks/use-shenava-model";
import {
  formatBytes,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import { CheckIcon, DownloadIcon, LockKeyholeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function OnboardingSpeechStep() {
  const model = useShenavaModel();
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadModelKey, setDownloadModelKey] =
    useState<ShenavaModelKey>(model.status.activeModelKey);
  const downloadingModelKey = SHENAVA_MODEL_KEYS.find(
    (modelKey) => model.status.models[modelKey].phase === "downloading"
  );

  function openDownload(modelKey: ShenavaModelKey) {
    setDownloadModelKey(modelKey);
    setDownloadOpen(true);
  }

  async function handleDownload(modelKey: ShenavaModelKey) {
    try {
      const next = await model.download(modelKey);
      if (next.models[modelKey].installed) {
        setDownloadOpen(false);
        toast.success(
          `مدل ${SHENAVA_MODELS[modelKey].shortName} دانلود و فعال شد.`
        );
      }
    } catch {
      toast.error("دانلود مدل شنوا ناموفق بود.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground/85">
        <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          صدا پس از دانلود مدل روی همین دستگاه به متن تبدیل می‌شود؛ نیازی به
          کلید API نیست و فایل صوتی شما برای پردازش ارسال نمی‌شود.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SHENAVA_MODEL_KEYS.map((modelKey) => {
          const definition = SHENAVA_MODELS[modelKey];
          const status = model.status.models[modelKey];
          const isDownloading = status.phase === "downloading";
          const isActive =
            status.installed && model.status.activeModelKey === modelKey;
          const progress = Math.min(
            100,
            (status.downloadedBytes / status.totalBytes) * 100
          );

          return (
            <Card key={modelKey} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {definition.shortName}
                  {definition.recommended ? (
                    <Badge variant="secondary">پیشنهادی</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>{definition.description}</CardDescription>
                <CardAction>
                  {isActive ? (
                    <Badge variant="outline">فعال</Badge>
                  ) : status.installed ? (
                    <Badge variant="outline">نصب‌شده</Badge>
                  ) : isDownloading ? (
                    <Badge variant="outline">در حال دانلود</Badge>
                  ) : null}
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                {isDownloading ? (
                  <Progress value={progress}>
                    <ProgressLabel>در حال دانلود…</ProgressLabel>
                    <ProgressValue>
                      {() =>
                        `${formatBytes(status.downloadedBytes)} از ${formatBytes(status.totalBytes)}`
                      }
                    </ProgressValue>
                  </Progress>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {formatBytes(definition.totalBytes)} · {Math.round(
                      definition.parameters / 1_000_000
                    ).toLocaleString("fa-IR")} میلیون پارامتر
                  </p>
                )}
              </CardContent>

              <CardFooter>
                {isDownloading ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDownloadOpen(true)}
                  >
                    دیدن دانلود
                  </Button>
                ) : status.installed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void model.select(modelKey)}
                  >
                    <CheckIcon data-icon="inline-start" />
                    {isActive ? "در حال استفاده" : "استفاده از این مدل"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(downloadingModelKey) || model.isLoading}
                    onClick={() => openDownload(modelKey)}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    دانلود
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="px-1 text-xs leading-5 text-muted-foreground">
        دانلود اختیاری است. هر دو مدل با مجوز غیرتجاری CC BY-NC 4.0 منتشر شده‌اند
        و بعداً از تنظیمات گفتار قابل مدیریت‌اند.
      </p>

      <ShenavaDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        status={model.status}
        initialModelKey={downloadModelKey}
        onDownload={(modelKey) => void handleDownload(modelKey)}
        onCancelDownload={() => {
          void model.cancelDownload();
          setDownloadOpen(false);
        }}
      />
    </div>
  );
}
