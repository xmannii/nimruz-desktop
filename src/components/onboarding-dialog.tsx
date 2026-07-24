"use client";

import { NimruzLogo } from "@/components/logo";
import { OnboardingAppearanceStep } from "@/components/onboarding-appearance-step";
import { OnboardingPersonalizationStep } from "@/components/onboarding-personalization-step";
import { OnboardingSpeechStep } from "@/components/onboarding-speech-step";
import {
  Anthropic,
  DeepSeek,
  Ollama,
  OpenAI,
} from "@/components/provider-logos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME_FA } from "@/lib/branding";
import { markOnboardingCompleted } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import {
  FolderKanbanIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  Mic2Icon,
  PaletteIcon,
  SparklesIcon,
  UserRoundIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

type OnboardingStep = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
  showProviders?: boolean;
  showAppearance?: boolean;
  showPersonalization?: boolean;
  showSpeech?: boolean;
};

const PROVIDER_SHOWCASE: Array<{
  id: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    Icon: OpenAI,
    className: "bg-[#111] text-white",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    Icon: Anthropic,
    className: "bg-[#D97757] text-white",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    Icon: DeepSeek,
    className: "bg-[#4D6BFE]/15",
  },
  {
    id: "ollama",
    label: "Ollama",
    Icon: Ollama,
    className: "bg-[#111] text-white",
  },
];

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    icon: SparklesIcon,
    title: `به ${APP_NAME_FA} خوش آمدید`,
    description:
      "دستیار هوش مصنوعی روی دسکتاپ شما — چت، فضای کاری و ابزارها، همه به‌صورت لوکال.",
  },
  {
    id: "appearance",
    icon: PaletteIcon,
    title: "ظاهر دلخواه شما",
    description:
      "حالت روشن یا تیره، پالت رنگ و فونت را همین حالا انتخاب کنید. بعداً از تنظیمات هم قابل تغییر است.",
    showAppearance: true,
  },
  {
    id: "personalization",
    icon: UserRoundIcon,
    title: "شخصی‌سازی",
    description:
      "نام، سبک پاسخ و چند جزئیات دیگر را وارد کنید تا دستیار بهتر شما را بشناسد. همه فیلدها اختیاری‌اند و بعداً از تنظیمات قابل تغییر هستند.",
    showPersonalization: true,
  },
  {
    id: "models",
    icon: KeyRoundIcon,
    title: "اتصال مدل",
    description:
      "لوکال یا ابری — انتخاب با شماست. OpenRouter، Ollama، LM Studio یا هر سرویس سازگار با OpenAI را وصل کنید.",
    showProviders: true,
    bullets: [
      "ابری: OpenRouter یا هر ارائه‌دهنده دیگر با کلید API",
      "لوکال: Ollama یا LM Studio بدون ارسال داده به بیرون",
      "مدل پیش‌فرض را برای چت‌های جدید انتخاب کنید",
    ],
  },
  {
    id: "local-speech",
    icon: Mic2Icon,
    title: "گفتار فارسی، روی دستگاه شما",
    description:
      "مدل شنوا را فقط اگر به گفتار به متن نیاز دارید دانلود کنید. بعد از آن، پیام‌های صوتی و فایل‌های صوتی شما به‌صورت محلی پردازش می‌شوند.",
    showSpeech: true,
  },
  {
    id: "workspaces",
    icon: FolderKanbanIcon,
    title: "فضاهای کاری",
    description:
      "هر فضای کاری به یک پوشه وصل می‌شود تا دستیار بتواند روی فایل‌های همان پروژه کار کند.",
    bullets: [
      "از نوار کناری فضای کاری جدید بسازید و پوشه پروژه را انتخاب کنید",
      "در پنل فضای کاری فایل‌ها، آرتیفکت‌ها و تسک‌ها را ببینید",
    ],
  },
  {
    id: "mcp",
    icon: WaypointsIcon,
    title: "ابزارهای MCP",
    description:
      "سرورهای Model Context Protocol را به هر فضای کاری وصل کنید تا عامل به ابزارهای محلی یا راه‌دور دسترسی داشته باشد.",
    bullets: [
      "از تنظیمات → سرورهای MCP یک سرور stdio، HTTP یا SSE اضافه کنید",
      "قبل از فعال‌کردن، اتصال را آزمایش کنید تا ابزارها را ببینید",
      "از منوی + کنار کادر پیام، برای هر گفتگو مشخص کنید کدام سرور MCP فعال باشد",
      "هر فراخوانی ابزار MCP جداگانه نیاز به تأیید شما دارد",
    ],
  },
  {
    id: "tools",
    icon: MessageSquareTextIcon,
    title: "امکانات چت",
    description: "چند میانبر مفید تا سریع‌تر کار کنید:",
    bullets: [
      "از منوی + فایل، MCP، مهارت یا متخصص را به پیام اضافه کنید",
      "با / در چت متخصص‌ها را فراخوانی کنید",
      "حافظه و مهارت‌ها را از تنظیمات مدیریت کنید",
      "دستیار می‌تواند صفحات وب را بخواند و در فضای کاری فایل بسازد",
    ],
  },
];

type OnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needsModelSetup?: boolean;
  onFinishSetup?: () => void;
};

export function OnboardingDialog({
  open,
  onOpenChange,
  needsModelSetup = false,
  onFinishSetup,
}: OnboardingDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex] ?? STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const Icon = step.icon;

  function completeAndClose() {
    void markOnboardingCompleted().catch((error) => {
      console.error("Failed to save onboarding completion:", error);
    });
    onOpenChange(false);
    setStepIndex(0);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      completeAndClose();
      return;
    }
    onOpenChange(next);
  }

  function handleSkip() {
    completeAndClose();
  }

  function handleNext() {
    if (!isLast) {
      setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
      return;
    }

    completeAndClose();
    if (needsModelSetup) {
      onFinishSetup?.();
    }
  }

  function handleBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir="rtl"
        className={cn(
          "sm:max-w-lg",
          (step.showAppearance ||
            step.showPersonalization ||
            step.showSpeech) && "sm:max-w-xl"
        )}
        showCloseButton={false}
      >
        <DialogHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                {isFirst ? (
                  <NimruzLogo className="size-5" />
                ) : (
                  <Icon className="size-4" />
                )}
              </span>
              <p className="text-xs font-medium text-muted-foreground tabular-nums">
                {`${(stepIndex + 1).toLocaleString("fa-IR")} از ${STEPS.length.toLocaleString("fa-IR")}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5" aria-hidden>
              {STEPS.map((item, index) => (
                <span
                  key={item.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    index === stepIndex
                      ? "w-5 bg-foreground"
                      : "w-1.5 bg-foreground/20"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <DialogTitle className="text-xl leading-8">
              {step.title}
            </DialogTitle>
            <DialogDescription className="text-[0.9375rem] leading-7">
              {step.description}
            </DialogDescription>
          </div>
        </DialogHeader>

        {step.showAppearance ? (
          <div className="max-h-[min(24rem,50vh)] overflow-y-auto rounded-2xl border border-border/70 bg-muted/25 px-4 py-3.5">
            <OnboardingAppearanceStep />
          </div>
        ) : step.showPersonalization ? (
          <div className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-2xl border border-border/70 bg-muted/25 px-4 py-3.5">
            <OnboardingPersonalizationStep />
          </div>
        ) : step.showSpeech ? (
          <div className="max-h-[min(25rem,52vh)] overflow-y-auto rounded-2xl border border-border/70 bg-muted/25 px-4 py-3.5">
            <OnboardingSpeechStep />
          </div>
        ) : step.showProviders || step.bullets?.length ? (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3.5">
            {step.showProviders ? (
              <div className="flex flex-wrap items-center justify-center gap-2.5 pb-1">
                {PROVIDER_SHOWCASE.map(({ id, label, Icon, className }) => (
                  <span
                    key={id}
                    title={label}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-2xl ring-1 ring-foreground/5",
                      className
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="sr-only">{label}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {step.bullets?.length ? (
              <ul className="space-y-2.5">
                {step.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-2.5 text-sm leading-6 text-foreground/90"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/45" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-4 text-sm leading-7 text-muted-foreground">
            چند دقیقه کافی است تا ظاهر را تنظیم کنید، مدل را وصل کنید و شروع به
            گفتگو کنید.
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={handleSkip}
          >
            رد کردن
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {!isFirst ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                قبلی
              </Button>
            ) : null}
            <Button type="button" onClick={handleNext}>
              {isLast
                ? needsModelSetup
                  ? "تنظیم مدل هوش مصنوعی"
                  : "شروع کنید"
                : "بعدی"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
