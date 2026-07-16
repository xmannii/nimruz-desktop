"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EXPERT_TEMPLATES, type ExpertTemplate } from "@/lib/settings/expert-templates";
import {
  EXPERT_LIMITS,
  getExpertValidationErrors,
  normalizeExpertSlug,
  upsertExpert,
  type Expert,
} from "@/lib/settings/experts";
import {
  BotIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const EMPTY_EXPERT: Partial<Expert> = {
  name: "",
  slug: "",
  description: "",
  instructions: "",
  triggers: [],
  enabled: true,
};

export function ExpertsSettingsSection() {
  const { experts, handleExpertsChange } = useAppShell();
  const [draft, setDraft] = useState<Partial<Expert> | null>(null);
  const [triggerText, setTriggerText] = useState("");
  const [testPrompt, setTestPrompt] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Expert | null>(null);
  const validationErrors = useMemo(
    () => (draft ? getExpertValidationErrors(draft, experts) : []),
    [draft, experts]
  );

  function edit(expert?: Expert, template?: ExpertTemplate) {
    const next = expert
      ? { ...expert }
      : template
        ? { ...EMPTY_EXPERT, ...template, id: undefined }
        : { ...EMPTY_EXPERT };
    setDraft(next);
    setTriggerText(next.triggers?.join("، ") ?? "");
    setTestPrompt(template?.example ?? "");
  }

  function save() {
    if (!draft || validationErrors.length) return;
    const next = upsertExpert(experts, {
      ...draft,
      slug: normalizeExpertSlug(draft.slug || draft.name),
      triggers: triggerText
        .split(/[,،\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
    if (next === experts || next.length === 0) return;
    handleExpertsChange(next);
    setDraft(null);
    setTestPrompt("");
    toast.success("متخصص ذخیره شد.");
  }

  async function copyTestCommand(expert: Partial<Expert>) {
    const slug = normalizeExpertSlug(expert.slug || expert.name);
    const command = `/${slug} ${testPrompt.trim()}`.trim();
    await navigator.clipboard.writeText(command);
    toast.success("دستور آزمایش کپی شد؛ آن را در گفتگو اجرا کنید.");
  }

  function toggleExpert(expert: Expert, enabled: boolean) {
    handleExpertsChange(upsertExpert(experts, { ...expert, enabled }));
  }

  return (
    <SettingsSection
      title="متخصص‌ها"
      description="دستیارهای تخصصی برای کارهای تکراری — با /نام-متخصص در گفتگو فراخوانی می‌شوند."
      icon={BotIcon}
    >
      {!draft ? (
        <>
          <div
            dir="rtl"
            className="rounded-2xl border border-border/70 bg-muted/30 p-4"
          >
            <p className="text-sm font-medium">نحوه استفاده در گفتگو</p>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-xs leading-6 text-muted-foreground">
              <li>یک متخصص بسازید یا از قالب‌ها شروع کنید و آن را فعال نگه دارید.</li>
              <li>
                در ابتدای پیام،{" "}
                <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  /نام-متخصص
                </code>{" "}
                را بنویسید — فهرست پیشنهادها نمایش داده می‌شود.
              </li>
              <li>
                با ↑↓ حرکت کنید و Enter یا Tab بزنید — نام متخصص به‌صورت
                نشان (badge) در نوار پیام ظاهر می‌شود.
              </li>
              <li>درخواست خود را بنویسید و ارسال کنید.</li>
            </ol>
            <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
              دستور{" "}
              <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                /linkedin-writer
              </code>{" "}
              در متن پیام نمایش داده نمی‌شود؛ فقط نشان متخصص را می‌بینید.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">از یک قالب شروع کنید یا متخصص دلخواه خود را بسازید.</p>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => edit()}
              disabled={experts.length >= EXPERT_LIMITS.maxEntries}
            >
              <PlusIcon className="size-4" /> متخصص جدید
            </Button>
          </div>

          <div dir="rtl" className="grid gap-2 sm:grid-cols-2">
            {EXPERT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-2xl border border-border/70 p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
                onClick={() => edit(undefined, template)}
                disabled={experts.length >= EXPERT_LIMITS.maxEntries}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden>{template.icon}</span>
                  <strong className="text-sm">{template.name}</strong>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.description}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <ExpertEditor
          draft={draft}
          setDraft={setDraft}
          triggerText={triggerText}
          setTriggerText={setTriggerText}
          testPrompt={testPrompt}
          setTestPrompt={setTestPrompt}
          validationErrors={validationErrors}
          onCopyTest={() => void copyTestCommand(draft)}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}

      {experts.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          هنوز متخصصی ندارید. یکی از قالب‌ها را انتخاب کنید، یا در گفتگو بگویید
          «یک متخصص برای من بساز».
        </div>
      ) : !draft ? (
        <div className="flex flex-col gap-2.5">
          {experts.map((expert) => (
            <div key={expert.id} dir="rtl" className="rounded-2xl border border-border/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{expert.name}</strong>
                    <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-xs">/{expert.slug}</code>
                    <span className="text-[11px] text-muted-foreground">{expert.enabled ? "فعال" : "غیرفعال"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{expert.description}</p>
                </div>
                <Switch
                  checked={expert.enabled}
                  onCheckedChange={(enabled) => toggleExpert(expert, enabled)}
                  aria-label={`${expert.enabled ? "غیرفعال کردن" : "فعال کردن"} ${expert.name}`}
                />
              </div>
              <div className="mt-3 flex gap-1 border-t border-border/50 pt-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => edit(expert)}>
                  <PencilIcon className="size-3.5" /> ویرایش و آزمایش
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="me-auto gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(expert)}
                >
                  <Trash2Icon className="size-3.5" /> حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف متخصص؟</AlertDialogTitle>
            <AlertDialogDescription>
              متخصص «{deleteTarget?.name}» حذف می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) handleExpertsChange(experts.filter((item) => item.id !== deleteTarget.id));
                setDeleteTarget(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

type ExpertEditorProps = {
  draft: Partial<Expert>;
  setDraft: (draft: Partial<Expert>) => void;
  triggerText: string;
  setTriggerText: (value: string) => void;
  testPrompt: string;
  setTestPrompt: (value: string) => void;
  validationErrors: string[];
  onCopyTest: () => void;
  onCancel: () => void;
  onSave: () => void;
};

function ExpertEditor({
  draft,
  setDraft,
  triggerText,
  setTriggerText,
  testPrompt,
  setTestPrompt,
  validationErrors,
  onCopyTest,
  onCancel,
  onSave,
}: ExpertEditorProps) {
  return (
    <div dir="rtl" className="flex flex-col gap-5 rounded-2xl border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{draft.id ? "ویرایش متخصص" : "بررسی و ساخت متخصص"}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          پس از ذخیره، با نوشتن /{draft.slug || "نام-متخصص"} در گفتگو قابل فراخوانی است.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          نام
          <Input
            value={draft.name ?? ""}
            maxLength={EXPERT_LIMITS.name}
            onChange={(event) => setDraft({
              ...draft,
              name: event.target.value,
              slug: draft.id ? draft.slug : normalizeExpertSlug(event.target.value),
            })}
            placeholder="مثلاً نویسنده لینکدین"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          دستور فراخوانی
          <Input
            dir="ltr"
            value={draft.slug ?? ""}
            maxLength={EXPERT_LIMITS.slug}
            onChange={(event) => setDraft({ ...draft, slug: normalizeExpertSlug(event.target.value) })}
            placeholder="linkedin-writer"
          />
          <span className="text-xs text-muted-foreground">نمونه: /{draft.slug || "linkedin-writer"}</span>
        </label>
      </div>

      <label className="grid gap-1.5 text-sm">
        چه کاری انجام می‌دهد؟
        <Textarea
          value={draft.description ?? ""}
          maxLength={EXPERT_LIMITS.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="یک وظیفه مشخص و محدود را توضیح دهید."
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        روش و سبک کار
        <Textarea
          className="min-h-40"
          value={draft.instructions ?? ""}
          maxLength={EXPERT_LIMITS.instructions}
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
          placeholder="مراحل کار، لحن، قالب خروجی، بایدها و نبایدها را بنویسید."
        />
        <span className="text-xs text-muted-foreground">دستور دقیق و چند مثال کوتاه، نتیجه را قابل‌اعتمادتر می‌کند.</span>
      </label>
      <label className="grid gap-1.5 text-sm">
        عبارت‌های مرتبط (اختیاری)
        <Input
          value={triggerText}
          onChange={(event) => setTriggerText(event.target.value)}
          placeholder="پست لینکدین، کپشن حرفه‌ای، LinkedIn post"
        />
      </label>

      <div className="rounded-xl bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <PlayIcon className="size-4" /> آزمایش در گفتگو
        </div>
        <p className="mb-2 text-xs leading-5 text-muted-foreground">
          در گفتگو / را بزنید و متخصص را انتخاب کنید، سپس این متن را بچسبانید
          و ارسال کنید.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)} placeholder="یک درخواست واقعی برای آزمایش بنویسید…" />
          <Button type="button" variant="secondary" className="shrink-0 gap-1.5" disabled={!testPrompt.trim() || !normalizeExpertSlug(draft.slug || draft.name)} onClick={onCopyTest}>
            <CopyIcon className="size-3.5" /> کپی دستور آزمایش
          </Button>
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span><strong className="font-medium">فعال</strong><span className="mt-0.5 block text-xs text-muted-foreground">متخصص در فهرست / و مسیریابی خودکار نمایش داده شود.</span></span>
        <Switch checked={draft.enabled !== false} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
      </label>

      {validationErrors.length ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {validationErrors.map((error) => <p key={error}>• {error}</p>)}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckIcon className="size-3.5" /> آماده ذخیره است.</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>انصراف</Button>
        <Button type="button" onClick={onSave} disabled={validationErrors.length > 0}>ذخیره متخصص</Button>
      </div>
    </div>
  );
}
