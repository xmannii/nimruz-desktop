"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RemoteAccessSession } from "@/lib/remote-access";
import { CopyIcon, PowerIcon, RadioTowerIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function CommandBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  async function copy() {
    await navigator.clipboard.writeText(value);
    toast.success("کپی شد.");
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => void copy()}
        >
          <CopyIcon data-icon="inline-start" />
          کپی
        </Button>
      </div>
      <pre
        dir="ltr"
        className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-5"
      >
        {value}
      </pre>
    </div>
  );
}

export function RemoteAccessSettingsSection() {
  const [session, setSession] = useState<RemoteAccessSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void window.desktop.remoteAccess
      .getStatus()
      .then((status) =>
        status.enabled ? window.desktop.remoteAccess.start() : null
      )
      .then((value) => {
        if (!cancelled) setSession(value);
      })
      .catch(() => {
        if (!cancelled) toast.error("خواندن وضعیت دسترسی راه دور ناموفق بود.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setIsLoading(true);
    try {
      setSession(await window.desktop.remoteAccess.start());
      toast.success("دسترسی راه دور برای این نشست فعال شد.");
    } catch {
      toast.error("فعال‌سازی دسترسی راه دور ناموفق بود.");
    } finally {
      setIsLoading(false);
    }
  }

  async function disable() {
    setIsLoading(true);
    try {
      await window.desktop.remoteAccess.stop();
      setSession(null);
      toast.success("دسترسی راه دور خاموش شد.");
    } catch {
      toast.error("خاموش کردن دسترسی راه دور ناموفق بود.");
    } finally {
      setIsLoading(false);
    }
  }

  const endpoint = session?.endpoint ?? "";
  const curlCommand = session
    ? `curl -H "Authorization: Bearer ${session.token}" ${endpoint}/v1/status`
    : "";
  const tunnelCommand = session
    ? `ssh -N -L ${new URL(endpoint).port}:127.0.0.1:${new URL(endpoint).port} USER@THIS-PC`
    : "";

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="پایش و تأیید راه دور"
        description="وضعیت اجراها را ببینید و درخواست‌های واقعی Codex را از یک اتصال تونل‌شده تأیید یا رد کنید."
        icon={RadioTowerIcon}
      >
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={session ? "default" : "secondary"}>
                {session ? "فعال در این نشست" : "خاموش"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                پس از بستن نیمروز خودکار خاموش می‌شود.
              </span>
            </div>
            <Button
              type="button"
              variant={session ? "outline" : "default"}
              disabled={isLoading}
              onClick={() => void (session ? disable() : enable())}
            >
              <PowerIcon data-icon="inline-start" />
              {session ? "خاموش کردن" : "فعال کردن"}
            </Button>
          </div>
        </div>

        {session ? (
          <div className="space-y-5">
            <CommandBox label="تونل SSH روی رایانه راه دور" value={tunnelCommand} />
            <CommandBox label="نمونه خواندن وضعیت" value={curlCommand} />
            <CommandBox label="توکن موقت این نشست" value={session.token} />
            <p className="text-xs leading-6 text-muted-foreground">
              برای تصمیم‌گیری، یک درخواست POST به
              <code dir="ltr" className="mx-1 rounded bg-muted px-1">
                /v1/approvals/APPROVAL_ID
              </code>
              با بدنه
              <code dir="ltr" className="mx-1 rounded bg-muted px-1">
                {'{"approved":true}'}
              </code>
              بفرستید. تصمیم نشست‌محور از راه دور مجاز نیست.
            </p>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="مرز امنیتی"
        description="این سرویس مستقیماً روی شبکه محلی منتشر نمی‌شود."
        icon={ShieldCheckIcon}
      >
        <ul className="list-disc space-y-2 pe-5 text-sm leading-6 text-muted-foreground">
          <li>فقط به 127.0.0.1 گوش می‌دهد و برای استفاده راه دور به تونل نیاز دارد.</li>
          <li>توکن ۲۵۶ بیتی فقط در حافظه نگهداری و با هر نشست تازه عوض می‌شود.</li>
          <li>پیام گفتگو، خروجی ابزار و امکان اجرای دستور از این API ارائه نمی‌شود.</li>
          <li>درخواست‌های دارای Origin مرورگر رد می‌شوند تا وب‌سایت‌ها به API محلی دسترسی نداشته باشند.</li>
        </ul>
      </SettingsSection>
    </div>
  );
}
