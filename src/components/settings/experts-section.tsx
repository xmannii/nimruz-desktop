"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EXPERT_LIMITS, normalizeExpertSlug, upsertExpert, type Expert } from "@/lib/settings/experts";
import { PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

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

  function edit(expert?: Expert) {
    setDraft(expert ? { ...expert } : { ...EMPTY_EXPERT });
    setTriggerText(expert?.triggers.join("، ") ?? "");
  }

  function save() {
    if (!draft) return;
    const next = upsertExpert(experts, {
      ...draft,
      slug: normalizeExpertSlug(draft.slug || draft.name),
      triggers: triggerText.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean),
    });
    if (next === experts || next.length === 0) return;
    handleExpertsChange(next);
    setDraft(null);
  }

  return (
    <SettingsSection
      title="متخصص‌ها"
      description="دستیارهای تخصصی برای کارهای تکراری بسازید. با /نام-متخصص آن‌ها را مستقیم صدا بزنید؛ نیمروز نیز در درخواست‌های مرتبط می‌تواند خودکار از آن‌ها کمک بگیرد."
      icon={SparklesIcon}
    >
      <div className="flex justify-end">
        <Button type="button" size="sm" className="gap-1.5" onClick={() => edit()} disabled={experts.length >= EXPERT_LIMITS.maxEntries}>
          <PlusIcon className="size-4" /> متخصص جدید
        </Button>
      </div>

      {draft ? (
        <div dir="rtl" className="flex flex-col gap-4 rounded-2xl border border-border p-4">
          <label className="grid gap-1.5 text-sm">نام<Input value={draft.name ?? ""} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: draft.id ? draft.slug : normalizeExpertSlug(event.target.value) })} placeholder="مثلاً نویسنده لینکدین" /></label>
          <label className="grid gap-1.5 text-sm">دستور<Input dir="ltr" value={draft.slug ?? ""} onChange={(event) => setDraft({ ...draft, slug: normalizeExpertSlug(event.target.value) })} placeholder="linkedin-post" /><span className="text-xs text-muted-foreground">نمونه: /{draft.slug || "linkedin-post"}</span></label>
          <label className="grid gap-1.5 text-sm">چه کاری انجام می‌دهد؟<Textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="پست‌های طبیعی و بهینه لینکدین می‌نویسد." /></label>
          <label className="grid gap-1.5 text-sm">روش و سبک کار<Textarea className="min-h-40" value={draft.instructions ?? ""} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="لحن، ساختار، طول، بایدها و نبایدها را با زبان ساده توضیح دهید." /></label>
          <label className="grid gap-1.5 text-sm">عبارت‌های مرتبط (اختیاری)<Input value={triggerText} onChange={(event) => setTriggerText(event.target.value)} placeholder="پست لینکدین، کپشن حرفه‌ای، LinkedIn post" /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>فعال</span><Switch checked={draft.enabled !== false} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>انصراف</Button><Button type="button" onClick={save} disabled={!draft.name?.trim() || !draft.description?.trim() || !draft.instructions?.trim()}>ذخیره</Button></div>
        </div>
      ) : null}

      {experts.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">هنوز متخصصی ندارید. می‌توانید اینجا بسازید یا در گفتگو بگویید «یک متخصص برای من بساز».</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {experts.map((expert) => (
            <div key={expert.id} dir="rtl" className="flex items-start gap-3 rounded-2xl border border-border/70 p-3.5">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => edit(expert)}><div className="flex items-center gap-2"><strong className="text-sm">{expert.name}</strong><code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-xs">/{expert.slug}</code>{!expert.enabled ? <span className="text-xs text-muted-foreground">غیرفعال</span> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{expert.description}</p></button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="حذف متخصص" onClick={() => handleExpertsChange(experts.filter((item) => item.id !== expert.id))}><Trash2Icon /></Button>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
