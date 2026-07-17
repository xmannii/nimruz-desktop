"use client";

import { useAppShell } from "@/components/app-shell-context";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PERSONALIZATION_LIMITS,
  type PersonalizationSettings,
  type ResponseStyle,
} from "@/lib/settings/personalization";
import { cn } from "@/lib/utils";

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

export function OnboardingPersonalizationStep() {
  const { personalization, updatePersonalization } = useAppShell();

  function updateDraft<Key extends keyof PersonalizationSettings>(
    key: Key,
    value: PersonalizationSettings[Key]
  ) {
    updatePersonalization({ ...personalization, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            نام یا لقب
          </p>
          <span className="text-[0.6875rem] text-muted-foreground/80">
            اختیاری
          </span>
        </div>
        <Input
          dir="rtl"
          value={personalization.nickname}
          maxLength={PERSONALIZATION_LIMITS.nickname}
          placeholder="مثلاً مانی"
          autoComplete="nickname"
          onChange={(event) => updateDraft("nickname", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">سبک پاسخ</p>
        <div className="grid grid-cols-2 gap-2">
          {RESPONSE_STYLE_OPTIONS.map((option) => {
            const isSelected = personalization.responseStyle === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateDraft("responseStyle", option.value)}
                className={cn(
                  "rounded-xl border px-2.5 py-2.5 text-right transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <span className="block text-xs font-medium">{option.label}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">شغل</p>
          <span className="text-[0.6875rem] text-muted-foreground/80">
            اختیاری
          </span>
        </div>
        <Input
          dir="rtl"
          value={personalization.occupation}
          maxLength={PERSONALIZATION_LIMITS.occupation}
          placeholder="مثلاً توسعه‌دهنده"
          autoComplete="organization-title"
          onChange={(event) => updateDraft("occupation", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            معرفی کوتاه
          </p>
          <span className="text-[0.6875rem] text-muted-foreground/80">
            اختیاری
          </span>
        </div>
        <Textarea
          dir="rtl"
          value={personalization.about}
          maxLength={PERSONALIZATION_LIMITS.about}
          rows={3}
          placeholder="علایق، اهداف یا حوزه‌های تخصصی شما."
          onChange={(event) => updateDraft("about", event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            دستورهای دلخواه
          </p>
          <span className="text-[0.6875rem] text-muted-foreground/80">
            اختیاری
          </span>
        </div>
        <Textarea
          dir="rtl"
          value={personalization.customInstructions}
          maxLength={PERSONALIZATION_LIMITS.customInstructions}
          rows={3}
          placeholder="مثلاً همیشه با مثال پاسخ بده یا از اصطلاحات ساده استفاده کن."
          onChange={(event) =>
            updateDraft("customInstructions", event.target.value)
          }
        />
      </div>
    </div>
  );
}
