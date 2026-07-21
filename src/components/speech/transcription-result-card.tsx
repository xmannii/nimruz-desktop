"use client";

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  formatAudioDuration,
  transcriptExportName,
} from "@/lib/speech/file-transcription";
import { formatBytes, SHENAVA_MODELS, type ShenavaModelKey } from "@/lib/speech/shenava";
import {
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

export type FileTranscriptionStatus =
  | "queued"
  | "decoding"
  | "transcribing"
  | "correcting"
  | "done"
  | "error";

export type FileTranscriptionItem = {
  id: string;
  file: File;
  audioUrl: string;
  status: FileTranscriptionStatus;
  progress: number;
  durationSeconds: number | null;
  transcript: string;
  correctedText: string | null;
  error: string | null;
  correctionError: string | null;
  modelKey: ShenavaModelKey;
};

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function StatusBadge({ item }: { item: FileTranscriptionItem }) {
  if (item.status === "queued") return <Badge variant="outline">در صف</Badge>;
  if (item.status === "decoding") {
    return <Badge variant="outline">در حال خواندن فایل</Badge>;
  }
  if (item.status === "transcribing") {
    return <Badge variant="outline">در حال رونویسی</Badge>;
  }
  if (item.status === "correcting") {
    return <Badge variant="outline">در حال اصلاح</Badge>;
  }
  if (item.status === "error") {
    return <Badge variant="destructive">ناموفق</Badge>;
  }
  return <Badge variant="secondary">آماده</Badge>;
}

export function TranscriptionResultCard({
  item,
  canCorrect,
  onCorrect,
  onRemove,
}: {
  item: FileTranscriptionItem;
  canCorrect: boolean;
  onCorrect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isBusy =
    item.status === "decoding" ||
    item.status === "transcribing" ||
    item.status === "correcting";
  const visibleText = item.correctedText ?? item.transcript;

  async function copyText() {
    if (!visibleText) return;
    try {
      await navigator.clipboard.writeText(visibleText);
      toast.success("متن در کلیپ‌بورد کپی شد.");
    } catch {
      toast.error("کپی‌کردن متن ناموفق بود.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="min-w-0 truncate">{item.file.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>{formatBytes(item.file.size)}</span>
          {item.durationSeconds ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatAudioDuration(item.durationSeconds)}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>Shenava {SHENAVA_MODELS[item.modelKey].shortName}</span>
        </CardDescription>
        <CardAction>
          <StatusBadge item={item} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <audio
          controls
          preload="metadata"
          src={item.audioUrl}
          className="h-10 w-full"
        >
          فایل صوتی در این مرورگر پشتیبانی نمی‌شود.
        </audio>

        {isBusy || item.status === "queued" ? (
          <Progress value={item.progress}>
            <ProgressLabel>
              {item.status === "queued"
                ? "در انتظار فایل قبلی…"
                : item.status === "decoding"
                  ? "در حال آماده‌سازی صدا…"
                  : item.status === "correcting"
                    ? "در حال اصلاح با هوش مصنوعی…"
                    : "در حال تبدیل گفتار به متن…"}
            </ProgressLabel>
            <ProgressValue>
              {() => `${Math.round(item.progress).toLocaleString("fa-IR")}٪`}
            </ProgressValue>
          </Progress>
        ) : null}

        {item.status === "error" ? (
          <p className="text-sm leading-6 text-destructive">{item.error}</p>
        ) : null}

        {item.transcript ? (
          item.correctedText ? (
            <Tabs defaultValue="corrected" dir="rtl">
              <TabsList>
                <TabsTrigger value="corrected">متن اصلاح‌شده</TabsTrigger>
                <TabsTrigger value="raw">رونویسی خام</TabsTrigger>
              </TabsList>
              <TabsContent value="corrected">
                <div className="max-h-72 min-h-28 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-7 whitespace-pre-wrap">
                  {item.correctedText}
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <div className="max-h-72 min-h-28 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-7 whitespace-pre-wrap">
                  {item.transcript}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="max-h-72 min-h-28 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-7 whitespace-pre-wrap">
              {item.transcript}
            </div>
          )
        ) : null}

        {item.correctionError ? (
          <p className="text-sm leading-6 text-destructive">
            متن خام آماده است، اما اصلاح هوشمند ناموفق بود: {item.correctionError}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {item.transcript && item.status === "done" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void copyText()}>
              <CopyIcon data-icon="inline-start" />
              کپی متن
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadText(
                  transcriptExportName(
                    item.file.name,
                    item.correctedText ? "corrected" : "raw"
                  ),
                  visibleText
                )
              }
            >
              <DownloadIcon data-icon="inline-start" />
              خروجی متن
            </Button>
            {item.correctedText ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  downloadText(
                    transcriptExportName(item.file.name, "raw"),
                    item.transcript
                  )
                }
              >
                <FileTextIcon data-icon="inline-start" />
                خروجی خام
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={!canCorrect}
              onClick={() => onCorrect(item.id)}
            >
              <SparklesIcon data-icon="inline-start" />
              اصلاح با هوش مصنوعی
            </Button>
          </>
        ) : null}
        {item.status === "correcting" ? (
          <Button type="button" variant="secondary" disabled>
            <Spinner data-icon="inline-start" />
            در حال اصلاح
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ms-auto"
          aria-label={`حذف ${item.file.name}`}
          disabled={isBusy}
          onClick={() => onRemove(item.id)}
        >
          <Trash2Icon />
        </Button>
      </CardFooter>
    </Card>
  );
}
