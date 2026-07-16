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
import type { WorkspaceInput } from "@/hooks/use-workspaces";
import type { LocalWorkspace } from "@/lib/chat/storage";
import { isHomeWorkspace } from "@/lib/workspace";
import { FolderIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

type WorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: LocalWorkspace | null;
  onSubmit: (input: WorkspaceInput) => void;
};

export function WorkspaceDialog({
  open,
  onOpenChange,
  workspace,
  onSubmit,
}: WorkspaceDialogProps) {
  const [title, setTitle] = useState(workspace?.title ?? "");
  const [description, setDescription] = useState(workspace?.description ?? "");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);
  const [showFolderError, setShowFolderError] = useState(false);
  const isEditing = Boolean(workspace);
  const isHome = isHomeWorkspace(workspace);

  async function handleChooseFolder() {
    const picked = await window.desktop.storage.pickDirectory();
    if (picked?.path) {
      setFolderPath(picked.path);
      setShowFolderError(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isHome && !title.trim()) {
      setShowTitleError(true);
      return;
    }

    if (!isEditing && !folderPath?.trim()) {
      setShowFolderError(true);
      return;
    }

    onSubmit({
      title: isHome ? workspace!.title : title,
      description,
      ...(folderPath ? { primaryFolderPath: folderPath } : {}),
    });
    onOpenChange(false);
  }

  const folderName = folderPath
    ? folderPath.split(/[/\\]/).filter(Boolean).at(-1) ?? folderPath
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <form className="contents" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? isHome
                  ? "ویرایش خانه"
                  : "ویرایش پروژه"
                : "پروژه جدید"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "عنوان، توضیحات و تنظیمات این فضا را ویرایش کنید."
                : "هر پروژه به یک پوشه روی رایانه شما وصل می‌شود تا دستیار همان‌جا کار کند."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {isHome ? null : (
              <Field data-invalid={showTitleError || undefined}>
                <FieldLabel htmlFor="workspace-title">عنوان پروژه</FieldLabel>
                <Input
                  id="workspace-title"
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
            )}

            <Field>
              <FieldLabel htmlFor="workspace-description">
                توضیحات (اختیاری)
              </FieldLabel>
              <Textarea
                id="workspace-description"
                value={description}
                maxLength={500}
                rows={4}
                placeholder="یادداشتی کوتاه درباره این پروژه"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            {isEditing ? null : (
              <Field data-invalid={showFolderError || undefined}>
                <FieldLabel>پوشه کاری</FieldLabel>
                {folderPath ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      title={folderPath}
                    >
                      {folderName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setFolderPath(null)}
                      aria-label="حذف پوشه"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => void handleChooseFolder()}
                  >
                    <FolderIcon className="size-4" />
                    انتخاب پوشه از رایانه
                  </Button>
                )}
                {showFolderError ? (
                  <FieldError>برای ساخت پروژه باید یک پوشه انتخاب کنید.</FieldError>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    دستیار فایل‌ها را در این پوشه می‌خواند و می‌نویسد.
                  </p>
                )}
              </Field>
            )}
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
