"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  PERSONALIZATION_LIMITS,
  type PersonalizationSettings,
  type ResponseStyle,
} from "@/lib/settings/personalization";
import {
  MEMORY_CATEGORY_LABELS,
  MEMORY_LIMITS,
  type MemoryEntry,
} from "@/lib/settings/memories";
import { cn } from "@/lib/utils";
import {
  BrainIcon,
  CheckIcon,
  KeyRoundIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  CredentialStatus,
  CredentialTestResult,
} from "@/lib/desktop-api";

type PersonalizationSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PersonalizationSettings;
  onSave: (settings: PersonalizationSettings) => void;
  memories: MemoryEntry[];
  onDeleteMemory: (id: string) => void;
  initialTab?: "personalization" | "memories" | "connection";
  onCredentialsChange?: () => void;
};

const RESPONSE_STYLE_OPTIONS: Array<{
  value: ResponseStyle;
  label: string;
  description: string;
}> = [
  {
    value: "balanced",
    label: "متعادل",
    description: "مناسب برای بیشتر گفتگوها",
  },
  {
    value: "concise",
    label: "کوتاه",
    description: "مستقیم و بدون حاشیه",
  },
  {
    value: "detailed",
    label: "توضیحی",
    description: "با جزئیات و مثال بیشتر",
  },
  {
    value: "creative",
    label: "خلاق",
    description: "ایده‌پرداز و متنوع",
  },
];

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-muted/20 p-3.5",
        className
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        {Icon ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/60">
            <Icon className="size-3.5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function PersonalizationSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  memories,
  onDeleteMemory,
  initialTab = "personalization",
  onCredentialsChange,
}: PersonalizationSettingsDialogProps) {
  const [draft, setDraft] = useState(settings);
  const [activeTab, setActiveTab] = useState("personalization");
  const [credentialStatus, setCredentialStatus] =
    useState<CredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [credentialResult, setCredentialResult] =
    useState<CredentialTestResult | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setActiveTab(initialTab);
      setApiKey("");
      setCredentialResult(null);
      void window.desktop.credentials
        .getStatus()
        .then(setCredentialStatus)
        .catch((error) => {
          setCredentialResult({
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : "خواندن وضعیت کلید ممکن نشد.",
          });
        });
    }
  }, [open, settings, initialTab]);

  function updateDraft<Key extends keyof PersonalizationSettings>(
    key: Key,
    value: PersonalizationSettings[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
    onOpenChange(false);
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    setCredentialBusy(true);
    setCredentialResult(null);
    try {
      const status = await window.desktop.credentials.setOpenRouterKey(apiKey);
      setCredentialStatus(status);
      setApiKey("");
      setCredentialResult({
        ok: true,
        message: "کلید OpenRouter با موفقیت ذخیره شد.",
      });
      onCredentialsChange?.();
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "ذخیره کلید ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleTestApiKey() {
    setCredentialBusy(true);
    setCredentialResult(null);
    try {
      setCredentialResult(
        await window.desktop.credentials.testOpenRouterKey(
          apiKey.trim() || undefined
        )
      );
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "آزمون اتصال ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleClearApiKey() {
    setCredentialBusy(true);
    try {
      setCredentialStatus(
        await window.desktop.credentials.clearOpenRouterKey()
      );
      setApiKey("");
      setCredentialResult({
        ok: true,
        message: "کلید OpenRouter حذف شد.",
      });
      onCredentialsChange?.();
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "حذف کلید ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        showCloseButton={false}
        className="flex h-[min(40rem,calc(100dvh-2rem))] max-h-[min(40rem,calc(100dvh-2rem))] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <form
          className="flex h-full min-h-0 flex-col overflow-hidden"
          onSubmit={handleSubmit}
        >
          <DialogHeader className="relative shrink-0 gap-1 border-b border-border px-4 py-3.5 pe-12">
            <DialogTitle>تنظیمات</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              شخصی‌سازی، خاطره‌ها و اتصال OpenRouter. داده‌ها فقط روی این
              دستگاه ذخیره می‌شوند.
            </DialogDescription>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2.5 end-2"
                />
              }
            >
              <XIcon />
              <span className="sr-only">بستن تنظیمات</span>
            </DialogClose>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b border-border px-4 py-3">
              <TabsList className="grid h-9 w-full grid-cols-3">
                <TabsTrigger value="personalization">شخصی‌سازی</TabsTrigger>
                <TabsTrigger value="memories" className="gap-1.5">
                  خاطره‌ها
                  {memories.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-4 px-1 text-[10px] leading-none"
                    >
                      {memories.length.toLocaleString("fa-IR")}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="connection">اتصال</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TabsContent value="personalization" className="px-4 py-4">
                <div className="flex flex-col gap-4">
                  <SettingsSection
                    title="سبک پاسخ"
                    description="نحوه پاسخ‌دهی دستیار را مشخص کنید."
                    icon={SparklesIcon}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {RESPONSE_STYLE_OPTIONS.map((option) => {
                        const isSelected = draft.responseStyle === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              updateDraft("responseStyle", option.value)
                            }
                            className={cn(
                              "rounded-xl border px-3 py-2.5 text-right transition-colors",
                              isSelected
                                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                                : "border-border/70 bg-background/70 hover:bg-muted/60"
                            )}
                          >
                            <span className="block text-sm font-medium">
                              {option.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="درباره شما"
                    description="به دستیار کمک کنید پاسخ‌های مرتبط‌تری بدهد."
                    icon={UserRoundIcon}
                  >
                    <FieldGroup className="gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="nickname">نام یا لقب</FieldLabel>
                          <Input
                            id="nickname"
                            dir="rtl"
                            value={draft.nickname}
                            maxLength={PERSONALIZATION_LIMITS.nickname}
                            placeholder="مثلاً مانی"
                            autoComplete="nickname"
                            onChange={(event) =>
                              updateDraft("nickname", event.target.value)
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="occupation">شغل</FieldLabel>
                          <Input
                            id="occupation"
                            dir="rtl"
                            value={draft.occupation}
                            maxLength={PERSONALIZATION_LIMITS.occupation}
                            placeholder="مثلاً توسعه‌دهنده"
                            autoComplete="organization-title"
                            onChange={(event) =>
                              updateDraft("occupation", event.target.value)
                            }
                          />
                        </Field>
                      </div>

                      <Field>
                        <FieldLabel htmlFor="about">معرفی کوتاه</FieldLabel>
                        <Textarea
                          id="about"
                          dir="rtl"
                          value={draft.about}
                          maxLength={PERSONALIZATION_LIMITS.about}
                          rows={3}
                          placeholder="علایق، اهداف یا حوزه‌های تخصصی شما."
                          onChange={(event) =>
                            updateDraft("about", event.target.value)
                          }
                        />
                        <FieldDescription className="text-[11px]">
                          {draft.about.length.toLocaleString("fa-IR")}
                          {" / "}
                          {PERSONALIZATION_LIMITS.about.toLocaleString("fa-IR")}
                        </FieldDescription>
                      </Field>
                    </FieldGroup>
                  </SettingsSection>

                  <SettingsSection
                    title="دستورهای دلخواه"
                    description="قوانین ثابتی که همیشه در پاسخ‌ها رعایت شود."
                  >
                    <Field>
                      <Textarea
                        id="custom-instructions"
                        dir="rtl"
                        value={draft.customInstructions}
                        maxLength={PERSONALIZATION_LIMITS.customInstructions}
                        rows={3}
                        placeholder="مثلاً همیشه با مثال پاسخ بده یا از اصطلاحات ساده استفاده کن."
                        onChange={(event) =>
                          updateDraft("customInstructions", event.target.value)
                        }
                      />
                      <FieldDescription className="text-[11px]">
                        {draft.customInstructions.length.toLocaleString("fa-IR")}
                        {" / "}
                        {PERSONALIZATION_LIMITS.customInstructions.toLocaleString(
                          "fa-IR"
                        )}
                      </FieldDescription>
                    </Field>
                  </SettingsSection>
                </div>
              </TabsContent>

              <TabsContent value="memories" className="px-4 py-4">
                <SettingsSection
                  title="خاطره‌های ذخیره‌شده"
                  description={`دستیار می‌تواند در گفتگو خاطره ذخیره کند. حداکثر ${MEMORY_LIMITS.maxEntries.toLocaleString("fa-IR")} مورد.`}
                  icon={BrainIcon}
                  className="bg-transparent"
                >
                  {memories.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <BrainIcon className="size-4" />
                      </span>
                      <p className="text-sm font-medium text-foreground">
                        هنوز خاطره‌ای ندارید
                      </p>
                      <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                        وقتی در گفتگو از دستیار بخواهید چیزی را به خاطر بسپارد،
                        اینجا نمایش داده می‌شود.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {memories.map((memory) => (
                        <div
                          key={memory.id}
                          dir="rtl"
                          className="group flex items-start gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {MEMORY_CATEGORY_LABELS[memory.category]}
                              </Badge>
                            </div>
                            <p className="text-sm leading-6 text-foreground">
                              {memory.content}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 hover:text-destructive"
                            aria-label="حذف خاطره"
                            onClick={() => onDeleteMemory(memory.id)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </SettingsSection>
              </TabsContent>

              <TabsContent value="connection" className="px-4 py-4">
                <SettingsSection
                  title="کلید OpenRouter"
                  description="کلید با سرویس امن سیستم‌عامل رمزگذاری می‌شود و هرگز دوباره نمایش داده نمی‌شود."
                  icon={KeyRoundIcon}
                >
                  <div className="flex flex-col gap-3">
                    {credentialStatus ? (
                      <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs leading-5">
                        <p>
                          وضعیت:{" "}
                          {credentialStatus.configured
                            ? `تنظیم‌شده ${credentialStatus.hint ?? ""}`
                            : "تنظیم‌نشده"}
                        </p>
                        <p className="text-muted-foreground">
                          فضای امن: {credentialStatus.backend}
                        </p>
                      </div>
                    ) : null}

                    {credentialStatus && !credentialStatus.secure ? (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                        فضای امن سیستم‌عامل در دسترس نیست. در لینوکس GNOME
                        Keyring/libsecret یا KWallet را فعال و برنامه را دوباره
                        اجرا کنید.
                      </p>
                    ) : null}

                    <Field>
                      <FieldLabel htmlFor="openrouter-api-key">
                        کلید جدید
                      </FieldLabel>
                      <Input
                        id="openrouter-api-key"
                        dir="ltr"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        placeholder="sk-or-v1-…"
                        onChange={(event) => setApiKey(event.target.value)}
                      />
                    </Field>

                    {credentialResult ? (
                      <p
                        className={cn(
                          "text-xs leading-5",
                          credentialResult.ok
                            ? "text-foreground"
                            : "text-destructive"
                        )}
                        role="status"
                      >
                        {credentialResult.message}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          credentialBusy ||
                          !apiKey.trim() ||
                          credentialStatus?.secure === false
                        }
                        onClick={() => void handleSaveApiKey()}
                      >
                        {credentialBusy ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <CheckIcon />
                        )}
                        ذخیره کلید
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          credentialBusy ||
                          (!apiKey.trim() &&
                            !credentialStatus?.configured)
                        }
                        onClick={() => void handleTestApiKey()}
                      >
                        آزمون اتصال
                      </Button>
                      {credentialStatus?.configured ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={credentialBusy}
                          onClick={() => void handleClearApiKey()}
                        >
                          <Trash2Icon />
                          حذف کلید
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </SettingsSection>
              </TabsContent>
            </div>
          </Tabs>

          <Separator />

          <DialogFooter className="shrink-0 gap-2 px-4 py-3">
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
              انصراف
            </DialogClose>
            <Button type="submit" size="sm">
              <CheckIcon data-icon="inline-start" />
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
