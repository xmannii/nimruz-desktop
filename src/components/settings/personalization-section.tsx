"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PERSONALIZATION_LIMITS,
  type PersonalizationSettings,
  type ResponseStyle,
} from "@/lib/settings/personalization";
import { cn } from "@/lib/utils";
import { SparklesIcon, UserRoundIcon } from "lucide-react";

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

export function PersonalizationSettingsSection() {
  const { personalization, updatePersonalization } = useAppShell();

  function updateDraft<Key extends keyof PersonalizationSettings>(
    key: Key,
    value: PersonalizationSettings[Key]
  ) {
    updatePersonalization({ ...personalization, [key]: value });
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="سبک پاسخ"
        description="نحوه پاسخ‌دهی دستیار را مشخص کنید."
        icon={SparklesIcon}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RESPONSE_STYLE_OPTIONS.map((option) => {
            const isSelected = personalization.responseStyle === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateDraft("responseStyle", option.value)}
                className={cn(
                  "rounded-2xl border px-3.5 py-3 text-right transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
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
        <FieldGroup className="gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="nickname">نام یا لقب</FieldLabel>
              <Input
                id="nickname"
                dir="rtl"
                value={personalization.nickname}
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
                value={personalization.occupation}
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
              value={personalization.about}
              maxLength={PERSONALIZATION_LIMITS.about}
              rows={4}
              placeholder="علایق، اهداف یا حوزه‌های تخصصی شما."
              onChange={(event) => updateDraft("about", event.target.value)}
            />
            <FieldDescription className="text-xs">
              {personalization.about.length.toLocaleString("fa-IR")}
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
            value={personalization.customInstructions}
            maxLength={PERSONALIZATION_LIMITS.customInstructions}
            rows={5}
            placeholder="مثلاً همیشه با مثال پاسخ بده یا از اصطلاحات ساده استفاده کن."
            onChange={(event) =>
              updateDraft("customInstructions", event.target.value)
            }
          />
          <FieldDescription className="text-xs">
            {personalization.customInstructions.length.toLocaleString("fa-IR")}
            {" / "}
            {PERSONALIZATION_LIMITS.customInstructions.toLocaleString("fa-IR")}
          </FieldDescription>
        </Field>
      </SettingsSection>
    </div>
  );
}
