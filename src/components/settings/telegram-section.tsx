"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import type { TelegramStatus } from "@/lib/telegram";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  KeyRoundIcon,
  SendIcon,
  ShieldCheckIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function connectionBadge(status: TelegramStatus | null) {
  if (!status) return <Badge variant="outline">در حال بررسی…</Badge>;
  switch (status.connectionState) {
    case "online":
      return <Badge variant="secondary">آنلاین</Badge>;
    case "connecting":
      return <Badge variant="outline">در حال اتصال</Badge>;
    case "error":
      return <Badge variant="destructive">خطای اتصال</Badge>;
    case "disabled":
      return <Badge variant="outline">خاموش</Badge>;
    default:
      return <Badge variant="outline">قطع</Badge>;
  }
}

export function TelegramSettingsSection() {
  const { workspaces } = useAppShell();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("home");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktop.telegram
      .getStatus()
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setWorkspaceId(next.settings.workspaceId);
      })
      .catch(() => {
        if (active) toast.error("خواندن وضعیت تلگرام ناموفق بود.");
      });
    const unsubscribe = window.desktop.telegram.onStatusChange((next) => {
      if (!active) return;
      setStatus(next);
      setWorkspaceId(next.settings.workspaceId);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function runAction(
    action: () => Promise<TelegramStatus>,
    success?: string
  ) {
    setIsSaving(true);
    try {
      const next = await action();
      setStatus(next);
      setWorkspaceId(next.settings.workspaceId);
      if (success) toast.success(success);
      return next;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "این کار تلگرام نشد."
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function configure() {
    const next = await runAction(
      () => window.desktop.telegram.configure({ token, workspaceId }),
      "ربات بررسی شد؛ حالا حساب تلگرام خود را جفت کنید."
    );
    if (next) setToken("");
  }

  async function openPairingLink() {
    let current = status;
    if (!current?.pairingLink) {
      current = await runAction(
        () => window.desktop.telegram.beginPairing()
      );
    }
    if (!current?.pairingLink) return;
    await window.desktop.updates.openUrl(current.pairingLink);
  }

  const paired = Boolean(
    status?.settings.pairedUserId && status.settings.pairedChatId
  );
  const selectedWorkspaceExists = workspaces.some(
    (workspace) => workspace.id === workspaceId
  );
  const controlsDisabled = !status || isSaving;

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="دستیار تلگرام"
        description="از تلفن خود به نیمروز پیام بدهید؛ کارها روی همین کامپیوتر و در فضای کاری انتخاب‌شده اجرا می‌شوند. پس از جفت‌سازی، دکمه‌های پایین چت برای گفت‌وگوی تازه، گفت‌وگوهای اخیر، تعویض مدل و توقف در دسترس‌اند."
        icon={SendIcon}
      >
        <FieldGroup className="gap-4">
          <Field className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldContent>
                <FieldTitle>اتصال محلی ربات</FieldTitle>
                <FieldDescription>
                  {status?.settings.botUsername
                    ? `@${status.settings.botUsername}${
                        status.tokenHint ? ` · ${status.tokenHint}` : ""
                      }`
                    : "توکن رباتی را که با BotFather ساخته‌اید وارد کنید."}
                </FieldDescription>
              </FieldContent>
              <div className="flex items-center gap-2">
                {connectionBadge(status)}
                <Switch
                  checked={status?.settings.enabled ?? false}
                  disabled={controlsDisabled || !status?.tokenConfigured}
                  aria-label="فعال‌کردن اتصال تلگرام"
                  onCheckedChange={(enabled) =>
                    void runAction(() =>
                      window.desktop.telegram.setEnabled(enabled)
                    )
                  }
                />
              </div>
            </div>

            <div className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="telegram-token">توکن BotFather</FieldLabel>
                <Input
                  id="telegram-token"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    status?.tokenConfigured
                      ? "برای تعویض، توکن جدید را وارد کنید"
                      : "123456789:AA…"
                  }
                  value={token}
                  disabled={isSaving}
                  onChange={(event) => setToken(event.target.value)}
                />
                <FieldDescription>
                  توکن فقط در فضای امن سیستم‌عامل نگه‌داری می‌شود و به رابط
                  برنامه برگردانده نمی‌شود.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>فضای کاری تلگرام</FieldLabel>
                <Select
                  value={workspaceId}
                  disabled={isSaving}
                  onValueChange={(value) => {
                    if (!value) return;
                    setWorkspaceId(value);
                    if (status?.tokenConfigured) {
                      void runAction(() =>
                        window.desktop.telegram.setWorkspace(value)
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {workspaces.find((workspace) => workspace.id === workspaceId)
                        ?.title ?? workspaceId}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          {workspace.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  پیام‌های جدید فقط به ابزارها و فایل‌های این فضا دسترسی دارند.
                  تغییر فضا یک گفت‌وگوی تلگرام تازه می‌سازد.
                </FieldDescription>
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={
                    isSaving ||
                    !token.trim() ||
                    !selectedWorkspaceExists ||
                    status?.secureStorageAvailable === false
                  }
                  onClick={() => void configure()}
                >
                  {isSaving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <KeyRoundIcon data-icon="inline-start" />
                  )}
                  بررسی و ذخیره توکن
                </Button>
                {status?.tokenConfigured ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() =>
                      void runAction(
                        () => window.desktop.telegram.clearToken(),
                        "توکن و اتصال تلگرام حذف شد."
                      )
                    }
                  >
                    <UnplugIcon data-icon="inline-start" />
                    حذف اتصال
                  </Button>
                ) : null}
              </div>
            </div>
          </Field>

          {!status?.secureStorageAvailable ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>فضای امن سیستم‌عامل در دسترس نیست</AlertTitle>
              <AlertDescription>
                نیمروز توکن ربات را بدون Keychain، DPAPI یا keyring امن ذخیره
                نمی‌کند.
              </AlertDescription>
            </Alert>
          ) : status?.error ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>تلگرام در دسترس نیست</AlertTitle>
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="جفت‌کردن حساب"
        description="لازم نیست شناسه عددی تلگرام را پیدا کنید؛ لینک امن با شناسه واقعی حساب را هنگام شروع ربات ثبت می‌کند."
        icon={ShieldCheckIcon}
      >
        {!status?.tokenConfigured ? (
          <Alert>
            <KeyRoundIcon />
            <AlertTitle>ابتدا ربات را متصل کنید</AlertTitle>
            <AlertDescription>
              یک ربات اختصاصی با BotFather بسازید و توکن آن را در بخش بالا
              ذخیره کنید.
            </AlertDescription>
          </Alert>
        ) : paired ? (
          <FieldGroup>
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>حساب متصل است</AlertTitle>
              <AlertDescription>
                {status.settings.pairedUsername ?? "کاربر تلگرام"} به{" "}
                {status.settings.botUsername
                  ? `@${status.settings.botUsername}`
                  : "ربات"}{" "}
                متصل شده است. فقط همین شناسه تلگرام پذیرفته می‌شود.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={isSaving}
              onClick={() =>
                void runAction(
                  () => window.desktop.telegram.unpair(),
                  "حساب قبلی جدا شد."
                )
              }
            >
              جفت‌کردن حساب دیگر
            </Button>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Alert>
              <SendIcon />
              <AlertTitle>ربات را در تلگرام باز کنید</AlertTitle>
              <AlertDescription>
                دکمه زیر یک کد یک‌بارمصرف را همراه لینک Start می‌فرستد. اولین
                حسابی که آن را تأیید کند به این نیمروز متصل می‌شود.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              className="self-start"
              disabled={isSaving || !status.settings.enabled}
              onClick={() => void openPairingLink()}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              بازکردن ربات و جفت‌سازی
            </Button>
          </FieldGroup>
        )}
      </SettingsSection>

      <SettingsSection
        title="نحوه اجرا"
        description="اتصال بدون سرور واسط و فقط هنگام روشن‌بودن نیمروز کار می‌کند."
        icon={ShieldCheckIcon}
      >
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>مرز امنیتی اجرای راه‌دور</AlertTitle>
          <AlertDescription>
            ربات فقط گفت‌وگوی خصوصی حساب جفت‌شده را می‌پذیرد. خواندن فایل،
            جستجو/دریافت وب و ساخت آرتیفکت مستقیم اجرا می‌شوند؛ نوشتن روی
            پروژه، فرمان ترمینال و عملیات حساس حتی اگر در دسکتاپ مجاز شده باشند،
            در تلگرام دوباره تأیید می‌خواهند. پیام‌های صوتی پس از دریافت از
            تلگرام، با مدل نصب‌شده شنوا روی همین دستگاه رونویسی می‌شوند و متن
            آن‌ها به ایجنت می‌رسد. پاسخ‌های مدل با قالب‌بندی تلگرام (پررنگ، کد،
            لینک و…) نمایش داده می‌شوند. بستن پنجره مشکلی ندارد، اما خود نیمروز
            و کامپیوتر باید روشن و آنلاین بمانند.
          </AlertDescription>
        </Alert>
      </SettingsSection>
    </div>
  );
}
