"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HelpCircleIcon } from "lucide-react";
import { useState } from "react";

export type AskUserQuestionOption = {
  id: string;
  label: string;
};

export type PendingAskUserQuestion = {
  toolCallId: string;
  question: string;
  options: AskUserQuestionOption[];
  allowMultiple?: boolean;
};

type AskUserQuestionBarProps = {
  pending: PendingAskUserQuestion;
  onAnswer: (answers: { id: string; label: string }[]) => void;
  disabled?: boolean;
  className?: string;
};

export function AskUserQuestionBar({
  pending,
  onAnswer,
  disabled = false,
  className,
}: AskUserQuestionBarProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const allowMultiple = Boolean(pending.allowMultiple);

  function toggleOption(id: string) {
    if (allowMultiple) {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
      );
      return;
    }
    const option = pending.options.find((item) => item.id === id);
    if (!option) return;
    onAnswer([{ id: option.id, label: option.label }]);
  }

  function submitMultiple() {
    const fromOptions = pending.options.filter((option) =>
      selectedIds.includes(option.id)
    );
    const trimmed = customText.trim();
    const answers = [
      ...fromOptions.map((option) => ({ id: option.id, label: option.label })),
      ...(trimmed
        ? [{ id: "custom", label: trimmed }]
        : []),
    ];
    if (answers.length === 0) return;
    onAnswer(answers);
  }

  function submitCustomOnly() {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onAnswer([{ id: "custom", label: trimmed }]);
  }

  return (
    <div
      dir="rtl"
      className={cn(
        "border-b border-border/60 bg-muted/40 px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <HelpCircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">
            {pending.question}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pending.options.map((option) => {
              const isSelected = selectedIds.includes(option.id);
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "secondary"}
                  disabled={disabled}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => toggleOption(option.id)}
                >
                  {option.label}
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() =>
                onAnswer([
                  {
                    id: "decide_for_me",
                    label: "خودت بهترین گزینه را انتخاب کن",
                  },
                ])
              }
            >
              تصمیم با تو
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Input
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="سایر…"
              disabled={disabled}
              className="h-8 text-sm"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (allowMultiple) submitMultiple();
                else submitCustomOnly();
              }}
            />
            {allowMultiple ? (
              <Button
                type="button"
                size="sm"
                disabled={
                  disabled ||
                  (selectedIds.length === 0 && !customText.trim())
                }
                onClick={submitMultiple}
              >
                تأیید
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || !customText.trim()}
                onClick={submitCustomOnly}
              >
                ارسال
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
