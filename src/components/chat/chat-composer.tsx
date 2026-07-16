"use client";

import { ChatContextUsage } from "@/components/chat/chat-context-usage";
import { ExpertSlashSuggestions } from "@/components/chat/expert-slash-suggestions";
import { ModelPicker } from "@/components/chat/model-picker";
import { ReasoningEffortSlider } from "@/components/chat/reasoning-effort-slider";
import { SelectedExpertBadge } from "@/components/chat/selected-expert-badge";
import { useAppShell } from "@/components/app-shell-context";
import type { ChatUIMessage } from "@/lib/chat/message";
import {
  filterExpertSuggestions,
  getExpertSlashQuery,
  resolveSelectedExpert,
  type Expert,
} from "@/lib/settings/experts";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProviderModelRef } from "@/lib/models/catalog";
import type { ReasoningEffort } from "@/lib/models/reasoning";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { shouldExpandComposer } from "./composer-utils";

type ChatComposerProps = {
  text: string;
  onTextChange: (value: string) => void;
  model: ProviderModelRef;
  onModelChange: (model: ProviderModelRef) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  selectedExpertSlug: string | null;
  onSelectedExpertChange: (slug: string | null) => void;
  status: ChatStatus;
  onSubmit: () => void;
  onStop: () => void;
  centered?: boolean;
  messages?: ChatUIMessage[];
};

export function ChatComposer({
  text,
  onTextChange,
  model,
  onModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  selectedExpertSlug,
  onSelectedExpertChange,
  status,
  onSubmit,
  onStop,
  centered = false,
  messages = [],
}: ChatComposerProps) {
  const { resolveModel, experts } = useAppShell();
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const collapsedWidthRef = useRef<number | null>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const modelConfig = resolveModel(model);
  const canAttach = modelConfig?.supportsImages ?? false;
  const showReasoningEffort = modelConfig?.supportsReasoningEffort ?? false;
  const selectedExpert = useMemo(
    () => resolveSelectedExpert(experts, selectedExpertSlug),
    [experts, selectedExpertSlug]
  );
  const slashQuery = getExpertSlashQuery(text);
  const expertSuggestions = useMemo(
    () => filterExpertSuggestions(experts, slashQuery),
    [experts, slashQuery]
  );
  const hasExpertPicker = expertSuggestions.length > 0;

  useEffect(() => {
    if (!text && !selectedExpert) setIsExpanded(false);
  }, [text, selectedExpert]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [slashQuery, expertSuggestions.length]);

  function focusComposer() {
    requestAnimationFrame(() => {
      const el =
        textareaRef.current ??
        formRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function selectExpert(expert: Expert) {
    onSelectedExpertChange(expert.slug);
    onTextChange("");
    focusComposer();
  }

  function clearExpert() {
    onSelectedExpertChange(null);
    focusComposer();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || isBusy) return;
    onSubmit();
  }

  function handleTextChange(el: HTMLTextAreaElement) {
    const value = el.value;
    onTextChange(value);

    if (window.matchMedia("(min-width: 768px)").matches) {
      if (!isExpanded) {
        collapsedWidthRef.current = el.getBoundingClientRect().width;
      }

      setIsExpanded(
        shouldExpandComposer(el, value, isExpanded, collapsedWidthRef.current)
      );
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (hasExpertPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((index) =>
          Math.min(index + 1, expertSuggestions.length - 1)
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        selectExpert(expertSuggestions[highlightIndex]);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && slashQuery !== null) {
        e.preventDefault();
        selectExpert(expertSuggestions[highlightIndex]);
        return;
      }
    }

    if (
      e.key === "Backspace" &&
      !text &&
      selectedExpert &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      clearExpert();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  const placeholder = selectedExpert
    ? "درخواست خود را برای این متخصص بنویسید..."
    : centered
      ? "ایده، سؤال، یا / برای انتخاب متخصص..."
      : "پیام خود را بنویسید... (/ برای متخصص)";

  const textareaProps = {
    dir: "rtl" as const,
    placeholder,
    value: text,
    rows: centered ? 4 : 1,
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
      handleTextChange(e.currentTarget),
    onKeyDown: handleKeyDown,
    disabled: isBusy,
  };

  const badgeProps = selectedExpert
    ? {
        name: selectedExpert.name,
        onClear: clearExpert,
        disabled: isBusy,
      }
    : null;

  return (
    <form
      ref={formRef}
      className={cn(
        "relative w-full",
        centered
          ? "shrink"
          : "shrink-0 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:pb-1.5"
      )}
      onSubmit={handleSubmit}
    >
      {hasExpertPicker ? (
        <ExpertSlashSuggestions
          suggestions={expertSuggestions}
          highlightIndex={highlightIndex}
          onHighlight={setHighlightIndex}
          onSelect={selectExpert}
        />
      ) : null}

      <MobileComposer
        badgeProps={badgeProps}
        textareaProps={textareaProps}
        model={model}
        onModelChange={onModelChange}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={onReasoningEffortChange}
        showReasoningEffort={showReasoningEffort}
        isBusy={isBusy}
        canAttach={canAttach}
        text={text}
        onStop={onStop}
        centered={centered}
      />

      <DesktopComposer
        badgeProps={badgeProps}
        textareaRef={textareaRef}
        textareaProps={textareaProps}
        model={model}
        onModelChange={onModelChange}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={onReasoningEffortChange}
        showReasoningEffort={showReasoningEffort}
        isBusy={isBusy}
        canAttach={canAttach}
        isExpanded={centered || isExpanded || Boolean(selectedExpert)}
        text={text}
        onStop={onStop}
        centered={centered}
      />

      {centered ? (
        <ComposerFooter showContext={false} />
      ) : (
        <ComposerFooter
          messages={messages}
          model={model}
          showContext={messages.length > 0}
        />
      )}
    </form>
  );
}

function ComposerFooter({
  messages = [],
  model,
  showContext = false,
}: {
  messages?: ChatUIMessage[];
  model?: ProviderModelRef;
  showContext?: boolean;
}) {
  return (
    <div
      dir="ltr"
      className="relative flex items-center justify-center px-1 pt-2 text-[11px] leading-none text-muted-foreground/75"
    >
      <span dir="rtl">چت‌بات متن‌باز نیمروز</span>
      {showContext && model ? (
        <div className="absolute right-0 flex items-center gap-1">
          <ChatContextUsage messages={messages} model={model.modelId} />
        </div>
      ) : null}
    </div>
  );
}

type BadgeProps = {
  name: string;
  onClear: () => void;
  disabled?: boolean;
};

type ComposerSharedProps = {
  badgeProps: BadgeProps | null;
  textareaProps: {
    dir: "rtl";
    placeholder: string;
    value: string;
    rows: number;
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    disabled: boolean;
  };
  model: ProviderModelRef;
  onModelChange: (model: ProviderModelRef) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  showReasoningEffort: boolean;
  isBusy: boolean;
  canAttach: boolean;
  text: string;
  onStop: () => void;
  centered?: boolean;
};

function MobileComposer({
  badgeProps,
  textareaProps,
  model,
  onModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  showReasoningEffort,
  isBusy,
  canAttach,
  text,
  onStop,
  centered = false,
}: ComposerSharedProps) {
  return (
    <div
      dir="ltr"
      className="flex flex-col overflow-hidden rounded-2xl border border-input bg-input/30 shadow-sm ring-1 ring-foreground/5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:hidden"
    >
      {badgeProps ? (
        <SelectedExpertBadge {...badgeProps} className="pb-0" />
      ) : null}

      <Textarea
        {...textareaProps}
        className={cn(
          "max-h-40 resize-none rounded-none border-0 bg-transparent px-3.5 py-3 text-base leading-6 shadow-none ring-0 focus-visible:ring-0",
          centered ? "min-h-28" : "min-h-12",
          badgeProps && "pt-2"
        )}
      />

      <div className="flex items-center gap-2 border-t border-border/50 px-2 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <InputGroupButton
            size="icon-sm"
            type="button"
            variant="secondary"
            className="size-10 shrink-0 rounded-full"
            aria-label="افزودن پیوست"
            title={
              canAttach
                ? "افزودن پیوست"
                : "این مدل از تصویر پشتیبانی نمی‌کند"
            }
            disabled={!canAttach || isBusy}
          >
            <PlusIcon />
          </InputGroupButton>

          <ModelPicker
            value={model}
            onValueChange={onModelChange}
            disabled={isBusy}
            compact
          />

          {showReasoningEffort ? (
            <ReasoningEffortSlider
              value={reasoningEffort}
              onValueChange={onReasoningEffortChange}
              disabled={isBusy}
              compact
            />
          ) : null}
        </div>

        {isBusy ? (
          <Button
            type="button"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            onClick={onStop}
            aria-label="توقف"
          >
            <SquareIcon />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            disabled={!text.trim()}
            aria-label="ارسال"
          >
            <ArrowUpIcon />
          </Button>
        )}
      </div>
    </div>
  );
}

function DesktopComposer({
  badgeProps,
  textareaRef,
  textareaProps,
  model,
  onModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  showReasoningEffort,
  isBusy,
  canAttach,
  isExpanded,
  text,
  onStop,
  centered = false,
}: ComposerSharedProps & {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isExpanded: boolean;
  centered?: boolean;
}) {
  const showExpandedLayout = isExpanded || Boolean(badgeProps);

  return (
    <div
      dir="ltr"
      className={cn(
        "hidden overflow-hidden md:flex md:flex-col",
        showExpandedLayout
          ? "rounded-2xl border border-input bg-input/30 shadow-sm ring-1 ring-foreground/5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
          : "rounded-full border border-input bg-input/30 shadow-sm ring-1 ring-foreground/5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      )}
    >
      {badgeProps ? <SelectedExpertBadge {...badgeProps} /> : null}

      <InputGroup
        dir="ltr"
        className={cn(
          "rounded-none border-0 bg-transparent shadow-none ring-0",
          showExpandedLayout ? "items-end" : "items-center"
        )}
      >
        <InputGroupAddon
          align={showExpandedLayout ? "block-end" : "inline-start"}
          className={cn(
            "gap-1.5",
            showExpandedLayout
              ? "order-last justify-between px-2 pb-2"
              : "py-1 ps-2 pe-1"
          )}
        >
          <div className="flex items-center gap-1.5">
            <InputGroupButton
              size="icon-sm"
              type="button"
              variant="secondary"
              aria-label="افزودن پیوست"
              title={
                canAttach
                  ? "افزودن پیوست"
                  : "این مدل از تصویر پشتیبانی نمی‌کند"
              }
              disabled={!canAttach || isBusy}
            >
              <PlusIcon />
            </InputGroupButton>

            <ModelPicker
              value={model}
              onValueChange={onModelChange}
              disabled={isBusy}
            />

            {showReasoningEffort ? (
              <ReasoningEffortSlider
                value={reasoningEffort}
                onValueChange={onReasoningEffortChange}
                disabled={isBusy}
              />
            ) : null}
          </div>

          {showExpandedLayout ? (
            isBusy ? (
              <InputGroupButton
                size="icon-sm"
                type="button"
                variant="default"
                onClick={onStop}
                aria-label="توقف"
              >
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                size="icon-sm"
                type="submit"
                variant="default"
                disabled={!text.trim()}
                aria-label="ارسال"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )
          ) : null}
        </InputGroupAddon>

        <InputGroupTextarea
          ref={textareaRef}
          {...textareaProps}
          className={cn(
            "max-h-48 overflow-y-auto text-base leading-7",
            showExpandedLayout ? "px-3 py-3" : "py-2.5",
            centered ? "min-h-28" : "min-h-11",
            badgeProps && "pt-1"
          )}
        />

        <InputGroupAddon
          align="inline-end"
          className={cn("py-1 ps-1 pe-2", showExpandedLayout && "hidden")}
        >
          {isBusy ? (
            <InputGroupButton
              size="icon-sm"
              type="button"
              variant="default"
              onClick={onStop}
              aria-label="توقف"
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              size="icon-sm"
              type="submit"
              variant="default"
              disabled={!text.trim()}
              aria-label="ارسال"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
