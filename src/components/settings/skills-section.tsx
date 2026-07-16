"use client";

import { SettingsSection } from "@/components/settings/settings-section";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  isValidSkillName,
  normalizeSkillName,
  SKILL_LIMITS,
  SKILL_SOURCE_LABELS,
  type SkillDocument,
  type SkillSummary,
} from "@/lib/skills/index";
import {
  BookOpenIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type SkillDraft = {
  name: string;
  description: string;
  body: string;
};

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  body: "",
};

export function SkillsSettingsSection() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<SkillSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.desktop.skills.list();
        if (!cancelled) setSkills(next);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "بارگذاری مهارت‌ها ناموفق بود."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(skill: SkillSummary, enabled: boolean) {
    try {
      const next = await window.desktop.skills.setEnabled(skill.name, enabled);
      setSkills(next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تغییر وضعیت مهارت ناموفق بود."
      );
    }
  }

  function openCreate() {
    setEditingName(null);
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  }

  async function openEdit(skill: SkillSummary) {
    if (!skill.editable) return;
    try {
      const body = await window.desktop.skills.getBody(skill.name);
      if (!body) {
        toast.error("محتوای مهارت یافت نشد.");
        return;
      }
      setEditingName(skill.name);
      setDraft({
        name: body.name,
        description: body.description,
        body: body.body,
      });
      setEditorOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "باز کردن مهارت ناموفق بود."
      );
    }
  }

  async function handleSave() {
    const name = normalizeSkillName(draft.name);
    if (!name || !isValidSkillName(name)) {
      toast.error("نام مهارت باید با حروف کوچک و خط تیره باشد (مثل my-skill).");
      return;
    }
    if (!draft.description.trim()) {
      toast.error("توضیح مهارت الزامی است.");
      return;
    }

    const document: SkillDocument = {
      name,
      description: draft.description.trim(),
      body: draft.body,
    };

    setSaving(true);
    try {
      const next = editingName
        ? await window.desktop.skills.update(editingName, document)
        : await window.desktop.skills.create(document);
      setSkills(next);
      setEditorOpen(false);
      toast.success(editingName ? "مهارت به‌روز شد." : "مهارت ساخته شد.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره مهارت ناموفق بود."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const next = await window.desktop.skills.delete(deleteTarget.name);
      setSkills(next);
      setDeleteTarget(null);
      toast.success("مهارت حذف شد.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "حذف مهارت ناموفق بود."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="مهارت‌ها"
        description="دستورالعمل‌های قابل‌بارگذاری برای دستیار. فقط نام و توضیح در هر گفتگو دیده می‌شود؛ متن کامل با ابزار load_skill بارگذاری می‌شود."
        icon={SparklesIcon}
      >
        <div className="flex flex-col gap-3">
          <div
            dir="rtl"
            className="rounded-2xl border border-border/70 bg-muted/20 px-3.5 py-3 text-right text-xs leading-5 text-muted-foreground"
          >
            <p className="mb-1.5 font-medium text-foreground">
              نصب با npx skills
            </p>
            <code
              dir="ltr"
              className="block break-all rounded-lg bg-background/80 px-2.5 py-2 text-left font-mono text-[11px] text-foreground"
            >
              npx skills add &lt;owner/repo&gt; -g -a universal
            </code>
            <p className="mt-2">
              نیمروز مهارت‌ها را از این مسیرها هم می‌خواند:{" "}
              <code dir="ltr" className="font-mono text-[11px]">
                ~/.nimruz/skills
              </code>
              ،{" "}
              <code dir="ltr" className="font-mono text-[11px]">
                ~/.config/agents/skills
              </code>{" "}
              و{" "}
              <code dir="ltr" className="font-mono text-[11px]">
                ~/.agents/skills
              </code>
              .
            </p>
          </div>

          <Button type="button" className="w-full" onClick={openCreate}>
            <PlusIcon className="size-3.5" />
            مهارت جدید
          </Button>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BookOpenIcon className="size-4" />
              </span>
              <p className="text-sm font-medium text-foreground">
                هنوز مهارتی ندارید
              </p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                یک مهارت بسازید یا با npx skills نصب کنید تا دستیار در صورت نیاز
                آن را بارگذاری کند.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {skills.map((skill) => (
                <div
                  key={`${skill.source}:${skill.name}`}
                  dir="rtl"
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        dir="ltr"
                        className="font-mono text-sm font-medium text-foreground"
                      >
                        {skill.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {SKILL_SOURCE_LABELS[skill.source]}
                      </Badge>
                      {!skill.editable ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          فقط خواندنی
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {skill.editable ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label="ویرایش مهارت"
                          onClick={() => void openEdit(skill)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="حذف مهارت"
                          onClick={() => setDeleteTarget(skill)}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    ) : null}
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={(checked) =>
                        void handleToggle(skill, checked)
                      }
                      aria-label={
                        skill.enabled ? "غیرفعال کردن مهارت" : "فعال کردن مهارت"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side="right"
          className="w-full text-right sm:max-w-lg"
          dir="rtl"
        >
          <SheetHeader className="text-right">
            <SheetTitle>
              {editingName ? "ویرایش مهارت" : "مهارت جدید"}
            </SheetTitle>
            <SheetDescription>
              فایل{" "}
              <span dir="ltr" className="font-mono text-xs">
                SKILL.md
              </span>{" "}
              در پوشه Nimruz ذخیره می‌شود.
            </SheetDescription>
          </SheetHeader>

          <FieldGroup className="gap-4 px-4">
            <Field>
              <FieldLabel htmlFor="skill-name">نام</FieldLabel>
              <Input
                id="skill-name"
                dir="ltr"
                className="font-mono"
                value={draft.name}
                disabled={Boolean(editingName) || saving}
                maxLength={SKILL_LIMITS.name}
                placeholder="my-skill"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                حروف کوچک انگلیسی و خط تیره؛ پس از ساخت قابل تغییر نیست.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-description">توضیح</FieldLabel>
              <Textarea
                id="skill-description"
                value={draft.description}
                disabled={saving}
                maxLength={SKILL_LIMITS.description}
                rows={3}
                placeholder="چه زمانی باید از این مهارت استفاده شود؟"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-body">دستورالعمل‌ها</FieldLabel>
              <Textarea
                id="skill-body"
                dir="ltr"
                className="min-h-48 font-mono text-xs"
                value={draft.body}
                disabled={saving}
                maxLength={SKILL_LIMITS.body}
                placeholder="## Instructions&#10;&#10;..."
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </Field>
          </FieldGroup>

          <SheetFooter className="text-right">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditorOpen(false)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : null}
              ذخیره
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مهارت؟</AlertDialogTitle>
            <AlertDialogDescription>
              مهارت{" "}
              <span dir="ltr" className="font-mono">
                {deleteTarget?.name}
              </span>{" "}
              برای همیشه از پوشه Nimruz حذف می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
