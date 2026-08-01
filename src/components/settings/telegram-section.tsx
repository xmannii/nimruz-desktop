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
import type {
  TelegramProxyMode,
  TelegramStatus,
} from "@/lib/telegram";
import { getTelegramErrorMessage } from "@/lib/telegram-errors";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  KeyRoundIcon,
  SendIcon,
  ShieldCheckIcon,
  UnplugIcon,
  WifiIcon,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
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

export type TelegramSettingsView =
  | "overview"
  | "pairing"
  | "connection"
  | "runtime";

export function TelegramSettingsSection({
  view = "overview",
}: {
  view?: TelegramSettingsView;
}) {
  const { workspaces } = useAppShell();
  const navigate = useNavigate();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("home");
  const [proxyMode, setProxyMode] = useState<TelegramProxyMode>("direct");
  const [proxyUrl, setProxyUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktop.telegram
      .getStatus()
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setWorkspaceId(next.settings.workspaceId);
        setProxyMode(next.settings.proxy.mode);
        setProxyUrl(next.settings.proxy.url ?? "");
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
      toast.error(getTelegramErrorMessage(error, "این کار تلگرام انجام نشد."));
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
    if (next) {
      setToken("");
      void navigate({ to: "/settings/telegram/pairing" });
    }
  }

  async function saveProxy() {
    const next = await runAction(
      () =>
        window.desktop.telegram.setProxy({
          mode: proxyMode,
          url: proxyMode === "custom" ? proxyUrl : null,
        }),
      status?.tokenConfigured
        ? "روش اتصال ذخیره و با تلگرام بررسی شد."
        : "روش اتصال ذخیره شد."
    );
    if (!next) return;
    setProxyMode(next.settings.proxy.mode);
    setProxyUrl(next.settings.proxy.url ?? "");
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

  async function exportBotAvatar() {
    setIsSaving(true);
    try {
      const result = await window.desktop.telegram.exportBotAvatar();
      if (result.saved) {
        toast.success("تصویر پروفایل ذخیره شد — آن را در BotFather روی ربات بگذارید.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره تصویر پروفایل ناموفق بود."
      );
    } finally {
      setIsSaving(false);
    }
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
      {view === "connection" ? (
        <SettingsSection
        title="روش اتصال به تلگرام"
        description="اتصال ربات می‌تواند مستقیم باشد، از پراکسی سیستم‌عامل استفاده کند یا فقط برای تلگرام از یک پراکسی سفارشی عبور کند. این انتخاب روی مدل‌ها و به‌روزرسانی برنامه اثری ندارد."
        icon={WifiIcon}
      >
        <FieldGroup className="gap-4">
          <Field className="rounded-2xl border border-border/70 bg-background p-4">
            <FieldContent>
              <FieldTitle>مسیر شبکه</FieldTitle>
              <FieldDescription>
                اگر تلگرام با اتصال مستقیم در دسترس نیست، ابتدا پراکسی
                سیستم‌عامل و سپس پراکسی سفارشی را امتحان کنید.
              </FieldDescription>
            </FieldContent>

            <FieldGroup>
              <Field>
                <FieldLabel>روش اتصال</FieldLabel>
                <Select
                  value={proxyMode}
                  disabled={isSaving}
                  onValueChange={(value) => {
                    if (
                      value === "direct" ||
                      value === "system" ||
                      value === "custom"
                    ) {
                      setProxyMode(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {proxyMode === "system"
                        ? "پراکسی سیستم‌عامل"
                        : proxyMode === "custom"
                          ? "پراکسی سفارشی"
                          : "اتصال مستقیم"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="direct">اتصال مستقیم</SelectItem>
                      <SelectItem value="system">
                        پراکسی سیستم‌عامل
                      </SelectItem>
                      <SelectItem value="custom">پراکسی سفارشی</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  «پراکسی سیستم‌عامل» تنظیمات شبکهٔ macOS، Windows یا Linux را
                  دنبال می‌کند.
                </FieldDescription>
              </Field>

              {proxyMode === "custom" ? (
                <Field>
                  <FieldLabel htmlFor="telegram-proxy-url">
                    آدرس پراکسی
                  </FieldLabel>
                  <Input
                    id="telegram-proxy-url"
                    dir="ltr"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="socks5://127.0.0.1:1080"
                    value={proxyUrl}
                    disabled={isSaving}
                    onChange={(event) => setProxyUrl(event.target.value)}
                  />
                  <FieldDescription>
                    HTTP، HTTPS، SOCKS4 و SOCKS5 پشتیبانی می‌شوند. برای امنیت،
                    پراکسی دارای نام کاربری یا رمز در این نسخه ذخیره نمی‌شود.
                  </FieldDescription>
                </Field>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={
                  isSaving ||
                  (proxyMode === "custom" && !proxyUrl.trim())
                }
                onClick={() => void saveProxy()}
              >
                {isSaving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <WifiIcon data-icon="inline-start" />
                )}
                ذخیره و بررسی اتصال
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                render={<Link to="/settings/telegram/runtime" />}
              >
                رد کردن و ادامه به امنیت
              </Button>
            </FieldGroup>
          </Field>
          {status?.error ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>اتصال تلگرام برقرار نشد</AlertTitle>
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        </SettingsSection>
      ) : null}

      {view === "overview" ? (
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
          ) : null}
          {status?.error ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>اتصال تلگرام برقرار نشد</AlertTitle>
              <AlertDescription>
                {status.error} برای تغییر مسیر اتصال، زیرصفحهٔ «شبکه و پراکسی»
                را باز کنید.
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        </SettingsSection>
      ) : null}

      {view === "pairing" ? (
        <SettingsSection
        title="جفت‌کردن حساب"
        description="لازم نیست شناسه عددی تلگرام را پیدا کنید؛ لینک امن با شناسه واقعی حساب را هنگام شروع ربات ثبت می‌کند. پس از Start، راهنمای کامل با قالب‌بندی در چت ربات می‌آید."
        icon={ShieldCheckIcon}
      >
        {!status?.tokenConfigured ? (
          <FieldGroup>
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>ابتدا ربات را متصل کنید</AlertTitle>
              <AlertDescription>
                در تلگرام به{" "}
                <span dir="ltr">@BotFather</span> پیام دهید،{" "}
                <span dir="ltr">/newbot</span> بزنید، نام و username را بسازید،
                توکن را کپی کنید و در مرحلهٔ «تنظیم ربات» ذخیره کنید.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              className="self-start"
              render={<Link to="/settings/telegram" />}
            >
              <KeyRoundIcon data-icon="inline-start" />
              رفتن به تنظیم ربات
            </Button>
          </FieldGroup>
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
            <Button
              type="button"
              className="self-start"
              render={<Link to="/settings/telegram/connection" />}
            >
              ادامه به شبکه و پراکسی
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
      ) : null}

      {view === "runtime" ? (
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
      ) : null}

      {view === "overview" ? (
        <SettingsSection
        title="تصویر پروفایل ربات"
        description="اختیاری: آواتار آمادهٔ نیمروز برای BotFather — روی اتصال تأثیری ندارد."
        icon={ImageIcon}
      >
        <Field className="rounded-2xl border border-border/70 bg-background p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <img
              src="/telegram-bot-avatar.png"
              alt="آواتار پیشنهادی ربات نیمروز"
              width={72}
              height={72}
              className="size-16 shrink-0 rounded-xl border border-border/60 bg-muted object-cover shadow-sm"
            />
            <FieldContent className="min-w-0 flex-1 gap-2">
              <FieldTitle>آواتار نیمروز برای تلگرام</FieldTitle>
              <FieldDescription>
                PNG مربعی را ذخیره کنید، سپس در{" "}
                <span dir="ltr">@BotFather</span> ←{" "}
                <span dir="ltr">Edit Bot → Edit Botpic</span> بفرستید.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                className="mt-1 self-start"
                disabled={isSaving}
                onClick={() => void exportBotAvatar()}
              >
                <DownloadIcon data-icon="inline-start" />
                ذخیره تصویر پروفایل
              </Button>
            </FieldContent>
          </div>
        </Field>
        </SettingsSection>
      ) : null}
    </div>
  );
}
