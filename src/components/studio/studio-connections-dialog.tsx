"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import {
  publishStudioConnections,
  useStudioConnections,
} from "@/hooks/use-studio-connections";
import type { StudioConnectionId } from "@/lib/studio/types";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

const SERVICES: Array<{
  id: StudioConnectionId;
  name: string;
  mark: ReactNode;
  description: string;
  keyUrl: string;
  placeholder: string;
}> = [
  {
    id: "google",
    name: "Google AI Studio",
    mark: (
      <span className="bg-[conic-gradient(from_200deg,#4285f4,#34a853,#fbbc05,#ea4335,#4285f4)] bg-clip-text text-base font-bold text-transparent">
        G
      </span>
    ),
    description: "Imagen و Nano Banana برای تصویر، Veo برای ویدیو، Gemini TTS برای صدا.",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza…",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    mark: <span className="text-sm font-bold">II</span>,
    description: "صداهای شخصی، طراحی‌شده و کلون‌شده حساب خودتان.",
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk_…",
  },
];

function ConnectionRow({ service }: { service: (typeof SERVICES)[number] }) {
  const { connections } = useStudioConnections();
  const { refresh: refreshCatalog } = useStudioCatalog();
  const status = connections?.[service.id];
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    try {
      publishStudioConnections(
        await window.desktop.studio.connections.setKey(service.id, key)
      );
      setKey("");
      setEditing(false);
      await refreshCatalog();
      toast.success(`${service.name} متصل شد و مدل‌هایش اضافه شدند.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره کلید ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  }

  async function disconnect() {
    publishStudioConnections(await window.desktop.studio.connections.clearKey(service.id));
    await refreshCatalog();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-foreground/5">
          {service.mark}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium" dir="ltr">{service.name}</span>
            {status?.configured ? (
              <Badge variant="secondary" className="gap-1">
                <CheckIcon className="size-3" />
                {status.source === "provider" ? "از تنظیمات مدل‌ها" : "متصل"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{service.description}</p>
        </div>
      </div>
      {editing || !status?.configured ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) void save();
          }}
        >
          <Input
            type="password"
            dir="ltr"
            autoComplete="off"
            value={key}
            placeholder={service.placeholder}
            aria-label={`کلید ${service.name}`}
            className="h-9 flex-1 font-mono text-xs"
            onChange={(event) => setKey(event.target.value)}
          />
          <Button type="submit" size="sm" className="h-9" disabled={!key.trim() || isSaving}>
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            اتصال
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span dir="ltr" className="font-mono">{status.hint}</span>
          <Button type="button" variant="ghost" size="xs" className="ms-auto" onClick={() => setEditing(true)}>
            تغییر کلید
          </Button>
          {status.source === "studio" ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => void disconnect()}
            >
              قطع اتصال
            </Button>
          ) : null}
        </div>
      )}
      {!status?.configured ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="self-start px-0 text-muted-foreground"
          onClick={() => void window.desktop.updates.openUrl(service.keyUrl)}
        >
          دریافت کلید رایگان
          <ExternalLinkIcon data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
}

export function StudioConnectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>سرویس‌های استودیو</DialogTitle>
          <DialogDescription>
            OpenRouter همیشه در دسترس است. با اتصال مستقیم، مدل‌های بیشتری اضافه می‌شوند.
            کلیدها رمزگذاری‌شده روی همین دستگاه می‌مانند.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {SERVICES.map((service) => (
            <ConnectionRow key={service.id} service={service} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
