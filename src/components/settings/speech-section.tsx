"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { ShenavaDownloadDialog } from "@/components/speech/shenava-download-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Spinner } from "@/components/ui/spinner";
import { useShenavaModel } from "@/hooks/use-shenava-model";
import {
  formatBytes,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  type ShenavaModelKey,
  type ShenavaModelStatus,
} from "@/lib/speech/shenava";
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  Mic2Icon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function ModelStatusBadge({
  status,
  active,
}: {
  status: ShenavaModelStatus;
  active: boolean;
}) {
  if (status.installed && active) {
    return <Badge variant="secondary">در حال استفاده</Badge>;
  }
  if (status.installed) return <Badge variant="outline">نصب‌شده</Badge>;
  if (status.phase === "downloading") {
    return <Badge variant="outline">در حال دانلود</Badge>;
  }
  if (status.phase === "error") {
    return <Badge variant="destructive">خطای دانلود</Badge>;
  }
  return <Badge variant="outline">دانلود نشده</Badge>;
}

export function SpeechSettingsSection() {
  const model = useShenavaModel();
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadModelKey, setDownloadModelKey] =
    useState<ShenavaModelKey>(model.status.activeModelKey);
  const [removeModelKey, setRemoveModelKey] =
    useState<ShenavaModelKey | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
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

  async function handleSelect(modelKey: ShenavaModelKey) {
    try {
      await model.select(modelKey);
      toast.success(
        `مدل ${SHENAVA_MODELS[modelKey].shortName} برای گفتار به متن فعال شد.`
      );
    } catch {
      toast.error("تغییر مدل فعال ناموفق بود.");
    }
  }

  async function handleRemove() {
    if (!removeModelKey) return;
    const definition = SHENAVA_MODELS[removeModelKey];
    setIsRemoving(true);
    try {
      await model.remove(removeModelKey);
      setRemoveModelKey(null);
      toast.success(`مدل ${definition.shortName} از این دستگاه پاک شد.`);
    } catch {
      toast.error("پاک‌کردن مدل ناموفق بود.");
    } finally {
      setIsRemoving(false);
    }
  }

  const removeStatus = removeModelKey
    ? model.status.models[removeModelKey]
    : null;

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="گفتار به متن"
        description="مدل دلخواه را دانلود کنید، بین مدل‌های نصب‌شده جابه‌جا شوید و پیام فارسی را روی دستگاه به متن تبدیل کنید."
        icon={Mic2Icon}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {SHENAVA_MODEL_KEYS.map((modelKey) => {
            const definition = SHENAVA_MODELS[modelKey];
            const status = model.status.models[modelKey];
            const active = model.status.activeModelKey === modelKey;
            const isDownloading = status.phase === "downloading";
            const downloadProgress = Math.min(
              100,
              (status.downloadedBytes / status.totalBytes) * 100
            );

            return (
              <Card key={modelKey}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {definition.displayName}
                    {definition.recommended ? (
                      <Badge variant="secondary">پیشنهادی</Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{definition.description}</CardDescription>
                  <CardAction>
                    <ModelStatusBadge status={status} active={active} />
                  </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  {isDownloading ? (
                    <Progress value={downloadProgress}>
                      <ProgressLabel>در حال دانلود…</ProgressLabel>
                      <ProgressValue>
                        {() =>
                          `${formatBytes(status.downloadedBytes)} از ${formatBytes(status.totalBytes)}`
                        }
                      </ProgressValue>
                    </Progress>
                  ) : null}

                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <dt className="text-muted-foreground">اندازه مدل</dt>
                      <dd className="font-medium">
                        {Math.round(
                          definition.parameters / 1_000_000
                        ).toLocaleString("fa-IR")} میلیون پارامتر
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <dt className="text-muted-foreground">حجم روی دیسک</dt>
                      <dd className="font-medium">
                        {status.installed
                          ? formatBytes(status.installedBytes)
                          : "۰ بایت"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>

                <CardFooter className="flex flex-wrap gap-2">
                  {isDownloading ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void model.cancelDownload()}
                    >
                      لغو دانلود
                    </Button>
                  ) : status.installed ? (
                    <>
                      {!active ? (
                        <Button
                          type="button"
                          onClick={() => void handleSelect(modelKey)}
                        >
                          <CheckIcon data-icon="inline-start" />
                          استفاده از این مدل
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void window.desktop.speech.shenava.reveal(modelKey)
                        }
                      >
                        <FolderOpenIcon data-icon="inline-start" />
                        نمایش فایل‌ها
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={Boolean(downloadingModelKey)}
                        onClick={() => setRemoveModelKey(modelKey)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        پاک‌کردن
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      disabled={Boolean(downloadingModelKey)}
                      onClick={() => openDownload(modelKey)}
                    >
                      <DownloadIcon data-icon="inline-start" />
                      دانلود مدل
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() =>
                      void window.desktop.updates.openUrl(definition.modelUrl)
                    }
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    Hugging Face
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>حریم خصوصی و مجوز</AlertTitle>
          <AlertDescription>
            پس از دانلود، پردازش صدا کاملاً روی این دستگاه انجام می‌شود. هر دو
            مدل با مجوز CC BY-NC 4.0 منتشر شده‌اند و برای کاربرد تجاری مجاز
            نیستند.
          </AlertDescription>
        </Alert>
      </SettingsSection>

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

      <AlertDialog
        open={removeModelKey !== null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setRemoveModelKey(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              مدل {removeModelKey ? SHENAVA_MODELS[removeModelKey].shortName : "شنوا"} پاک شود؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              حدود {formatBytes(removeStatus?.installedBytes ?? 0)} از فضای
              دیسک آزاد می‌شود. مدل دیگر، اگر نصب شده باشد، حذف نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
            >
              {isRemoving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              پاک‌کردن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
