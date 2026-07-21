"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  formatBytes,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  type ShenavaModelKey,
  type ShenavaStatus,
} from "@/lib/speech/shenava";
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function ShenavaDownloadDialog({
  open,
  onOpenChange,
  status,
  initialModelKey,
  onDownload,
  onCancelDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ShenavaStatus;
  initialModelKey?: ShenavaModelKey;
  onDownload: (modelKey: ShenavaModelKey) => void;
  onCancelDownload: () => void;
}) {
  const downloadingModelKey = useMemo(
    () =>
      SHENAVA_MODEL_KEYS.find(
        (modelKey) => status.models[modelKey].phase === "downloading"
      ),
    [status.models]
  );
  const [selectedModelKey, setSelectedModelKey] =
    useState<ShenavaModelKey>(
      initialModelKey ?? downloadingModelKey ?? status.activeModelKey
    );

  useEffect(() => {
    if (!open) return;
    setSelectedModelKey(
      downloadingModelKey ?? initialModelKey ?? status.activeModelKey
    );
  }, [downloadingModelKey, initialModelKey, open, status.activeModelKey]);

  const modelKey = downloadingModelKey ?? selectedModelKey;
  const definition = SHENAVA_MODELS[modelKey];
  const modelStatus = status.models[modelKey];
  const isDownloading = modelStatus.phase === "downloading";
  const progress = Math.min(
    100,
    (modelStatus.downloadedBytes / modelStatus.totalBytes) * 100
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>دانلود مدل گفتار فارسی</DialogTitle>
          <DialogDescription>
            مدل فقط یک‌بار دانلود می‌شود و تبدیل گفتار به متن پس از آن روی
            دستگاه شما انجام می‌شود.
          </DialogDescription>
        </DialogHeader>

        {isDownloading ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{definition.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  مدل {Math.round(definition.parameters / 1_000_000).toLocaleString("fa-IR")} میلیون‌پارامتری
                </p>
              </div>
              <Badge variant="outline">در حال دانلود</Badge>
            </div>
            <Progress value={progress}>
              <ProgressLabel>در حال دانلود…</ProgressLabel>
              <ProgressValue>
                {() =>
                  `${formatBytes(modelStatus.downloadedBytes)} از ${formatBytes(modelStatus.totalBytes)}`
                }
              </ProgressValue>
            </Progress>
            <p className="text-sm leading-6 text-muted-foreground">
              می‌توانید این پنجره را ببندید؛ دانلود در پس‌زمینه ادامه پیدا
              می‌کند و درصد پیشرفت در نوار بالای برنامه نمایش داده می‌شود.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ToggleGroup
              value={[selectedModelKey]}
              onValueChange={(values) => {
                const next = values[0];
                if (next) setSelectedModelKey(next as ShenavaModelKey);
              }}
              orientation="vertical"
              variant="outline"
              className="w-full"
              aria-label="انتخاب مدل گفتار"
            >
              {SHENAVA_MODEL_KEYS.map((candidateKey) => {
                const candidate = SHENAVA_MODELS[candidateKey];
                const candidateStatus = status.models[candidateKey];
                return (
                  <ToggleGroupItem
                    key={candidateKey}
                    value={candidateKey}
                    className="h-auto w-full justify-start whitespace-normal rounded-xl p-3 text-start data-[state=on]:border-primary"
                  >
                    <span className="flex w-full items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {candidate.displayName}
                          {candidate.recommended ? (
                            <Badge variant="secondary">پیشنهادی</Badge>
                          ) : null}
                          {candidateStatus.installed ? (
                            <Badge variant="outline">
                              <CheckIcon data-icon="inline-start" />
                              نصب‌شده
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-xs leading-5 text-muted-foreground">
                          {candidate.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(candidate.totalBytes)}
                      </span>
                    </span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5">
              <span className="text-sm text-muted-foreground">اندازه مدل</span>
              <span className="text-sm font-medium">
                {Math.round(definition.parameters / 1_000_000).toLocaleString("fa-IR")} میلیون پارامتر · {formatBytes(definition.totalBytes)}
              </span>
            </div>

            <Alert>
              <ShieldAlertIcon />
              <AlertTitle>مجوز غیرتجاری</AlertTitle>
              <AlertDescription>
                این مدل با مجوز {definition.license} منتشر شده و برای کاربرد
                تجاری مجاز نیست، مگر اینکه از سازنده مجوز جداگانه بگیرید.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() =>
              void window.desktop.updates.openUrl(definition.modelUrl)
            }
          >
            <ExternalLinkIcon data-icon="inline-start" />
            صفحه مدل
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() =>
              void window.desktop.updates.openUrl(definition.licenseUrl)
            }
          >
            <ExternalLinkIcon data-icon="inline-start" />
            متن مجوز
          </Button>
        </div>

        <DialogFooter>
          {isDownloading ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onCancelDownload}
              >
                لغو دانلود
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                بستن و ادامه دانلود
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                فعلاً نه
              </Button>
              <Button
                type="button"
                onClick={() => onDownload(selectedModelKey)}
              >
                {modelStatus.installed ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                {modelStatus.installed
                  ? "استفاده از این مدل"
                  : "پذیرش مجوز و دانلود"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
