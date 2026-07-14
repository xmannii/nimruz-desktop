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
import type { LocalChat } from "@/lib/chat/storage";
import { useState, type FormEvent } from "react";

type ChatRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: LocalChat;
  onSubmit: (title: string) => void;
};

export function ChatRenameDialog({
  open,
  onOpenChange,
  chat,
  onSubmit,
}: ChatRenameDialogProps) {
  const [title, setTitle] = useState(chat.title);
  const [showTitleError, setShowTitleError] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setShowTitleError(true);
      return;
    }

    onSubmit(title);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <form className="contents" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>تغییر نام گفتگو</DialogTitle>
            <DialogDescription>
              نامی انتخاب کنید که بعداً راحت‌تر این گفتگو را پیدا کنید.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={showTitleError || undefined}>
              <FieldLabel htmlFor="chat-title">نام گفتگو</FieldLabel>
              <Input
                id="chat-title"
                value={title}
                maxLength={80}
                autoFocus
                aria-invalid={showTitleError || undefined}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (event.target.value.trim()) setShowTitleError(false);
                }}
              />
              {showTitleError ? (
                <FieldError>نام گفتگو را وارد کنید.</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="submit">ذخیره</Button>
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
