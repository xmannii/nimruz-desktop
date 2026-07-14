"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectInput } from "@/hooks/use-projects";
import type { LocalProject } from "@/lib/chat/storage";
import { useState, type FormEvent } from "react";

type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: LocalProject | null;
  onSubmit: (input: ProjectInput) => void;
};

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: ProjectDialogProps) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [showTitleError, setShowTitleError] = useState(false);
  const isEditing = Boolean(project);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setShowTitleError(true);
      return;
    }

    onSubmit({ title, description });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <form className="contents" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "ویرایش پروژه" : "پروژه جدید"}
            </DialogTitle>
            <DialogDescription>
              پروژه‌ها گفتگوهای مرتبط را کنار هم نگه می‌دارند.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={showTitleError || undefined}>
              <FieldLabel htmlFor="project-title">عنوان پروژه</FieldLabel>
              <Input
                id="project-title"
                value={title}
                maxLength={80}
                autoFocus
                aria-invalid={showTitleError || undefined}
                placeholder="مثلاً برنامه‌ریزی سفر"
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (event.target.value.trim()) setShowTitleError(false);
                }}
              />
              {showTitleError ? (
                <FieldError>عنوان پروژه را وارد کنید.</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="project-description">
                توضیحات (اختیاری)
              </FieldLabel>
              <Textarea
                id="project-description"
                value={description}
                maxLength={500}
                rows={4}
                placeholder="یادداشتی کوتاه درباره این پروژه"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="submit">
              {isEditing ? "ذخیره تغییرات" : "ساخت پروژه"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
