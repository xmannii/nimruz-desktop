"use client";

import { ChatContextUsage } from "@/components/chat/chat-context-usage";
import { ExpertSlashSuggestions } from "@/components/chat/expert-slash-suggestions";
import { ComposerContextChips } from "@/components/chat/composer-context-chips";
import { ComposerWorkspacePicker } from "@/components/chat/composer-workspace-picker";
import {
  MentionSuggestions,
  type MentionSuggestion,
} from "@/components/chat/mention-suggestions";
import {
  applyMention,
  getMentionQuery,
  parseMentions,
  removeMention,
  splitMentionQuery,
  WORKSPACE_MENTION,
  type ComposerAttachment,
} from "@/lib/chat/composer-context";
import { classifyFile } from "@/lib/workspace";
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
import {
  CODEX_PROVIDER_ID,
  type ProviderModelRef,
} from "@/lib/models/catalog";
import {
  CODEX_REASONING_EFFORT_LEVELS,
  type ReasoningEffort,
} from "@/lib/models/reasoning";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { shouldExpandComposer } from "./composer-utils";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  workspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  attachments?: ComposerAttachment[];
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
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
  workspaceId = null,
  onWorkspaceChange,
  attachments = [],
  onAttachmentsChange,
}: ChatComposerProps) {
  const { resolveModel, experts, workspaces } = useAppShell();
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [mentionEntries, setMentionEntries] = useState<MentionSuggestion[]>([]);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collapsedWidthRef = useRef<number | null>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const modelConfig = resolveModel(model);
  const isCodexProvider = model.providerId === CODEX_PROVIDER_ID;
  const canUseWorkspaceContext = Boolean(workspaceId) && !isCodexProvider;
  const canAttach =
    !isCodexProvider && (modelConfig?.supportsImages ?? false);
  const showReasoningEffort = modelConfig?.supportsReasoningEffort ?? false;
  const reasoningEffortLevels =
    model.providerId === CODEX_PROVIDER_ID
      ? CODEX_REASONING_EFFORT_LEVELS
      : undefined;
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

  const mentionQuery = canUseWorkspaceContext ? getMentionQuery(text) : null;
  const hasMentionPicker = mentionQuery !== null && mentionEntries.length > 0;
  const mentions = useMemo(() => parseMentions(text), [text]);

  useEffect(() => {
    if (!text && !selectedExpert) setIsExpanded(false);
  }, [text, selectedExpert]);

  useEffect(() => {
    if (
      !isCodexProvider ||
      attachments.length === 0 ||
      !onAttachmentsChange
    ) {
      return;
    }
    onAttachmentsChange([]);
    toast.info(
      "پیوست‌های فضای کاری پاک شدند؛ Codex فقط پیام متنی دریافت می‌کند."
    );
  }, [attachments.length, isCodexProvider, onAttachmentsChange]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [slashQuery, expertSuggestions.length]);

  // Load `@` mention suggestions from the workspace file tree.
  useEffect(() => {
    if (!workspaceId || mentionQuery === null) {
      setMentionEntries([]);
      return;
    }
    let cancelled = false;
    const { dir, name } = splitMentionQuery(mentionQuery);
    void window.desktop.storage
      .listWorkspaceFiles(workspaceId, dir)
      .then((entries) => {
        if (cancelled) return;
        const filtered = entries
          .filter((entry) =>
            name ? entry.name.toLowerCase().includes(name.toLowerCase()) : true
          )
          .slice(0, 8);
        const relativeBase = dir === "." ? "" : `${dir}/`;
        const suggestions: MentionSuggestion[] = filtered.map((entry) => ({
          kind: "file",
          value:
            entry.kind === "directory"
              ? `${relativeBase}${entry.name}/`
              : `${relativeBase}${entry.name}`,
          label: `${relativeBase}${entry.name}`,
          entry,
        }));
        if (dir === "." && "workspace".includes(name.toLowerCase())) {
          suggestions.unshift({
            kind: "workspace",
            value: WORKSPACE_MENTION,
            label: "کل فضای کاری",
          });
        }
        setMentionEntries(suggestions);
        setMentionHighlight(0);
      })
      .catch(() => {
        if (!cancelled) setMentionEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, mentionQuery]);

  function selectMention(suggestion: MentionSuggestion) {
    const keepOpen =
      suggestion.kind === "file" && suggestion.entry.kind === "directory";
    onTextChange(applyMention(text, suggestion.value, { keepOpen }));
    focusComposer();
  }

  function handleRemoveMention(mention: string) {
    onTextChange(removeMention(text, mention));
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files || files.length === 0 || !workspaceId) return;

    const selected = Array.from(files);
    const isImage = (file: File) =>
      file.type.startsWith("image/") ||
      classifyFile(file.name) === "image";
    const allowed = canAttach ? selected : selected.filter((f) => !isImage(f));

    if (allowed.length < selected.length) {
      toast.error("مدل انتخاب‌شده از تصویر پشتیبانی نمی‌کند؛ تصاویر افزوده نشدند.");
    }
    if (allowed.length === 0) {
      focusComposer();
      return;
    }

    setIsImporting(true);
    try {
      const payload = await Promise.all(
        allowed.map(async (file) => ({
          name: file.name,
          base64: await fileToBase64(file),
          mimeType: file.type || undefined,
        }))
      );
      const imported =
        await window.desktop.storage.importWorkspaceFiles(workspaceId, payload);
      if (imported.length > 0) {
        const next: ComposerAttachment[] = imported.map((item, index) => {
          const category = classifyFile(item.name);
          const image =
            item.mimeType.startsWith("image/") || category === "image";
          return {
            id: item.relativePath,
            name: item.name,
            relativePath: item.relativePath,
            mimeType: item.mimeType,
            category,
            sizeBytes: item.sizeBytes,
            dataUrl: image
              ? `data:${item.mimeType};base64,${payload[index].base64}`
              : undefined,
          };
        });
        const existing = new Set(attachments.map((a) => a.id));
        const merged = [
          ...attachments,
          ...next.filter((a) => !existing.has(a.id)),
        ];
        onAttachmentsChange?.(merged);
        toast.success(
          `${imported.length.toLocaleString("fa-IR")} فایل افزوده شد.`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود."
      );
    } finally {
      setIsImporting(false);
      focusComposer();
    }
  }

  function handleRemoveAttachment(id: string) {
    onAttachmentsChange?.(attachments.filter((a) => a.id !== id));
    focusComposer();
  }

  const canImport = canUseWorkspaceContext;
  const attachmentTitle = isCodexProvider
    ? "پیوست و اشاره به فایل‌های فضای کاری در حالت Codex در دسترس نیست"
    : canImport || canAttach
      ? "افزودن فایل"
      : "برای افزودن فایل یک فضای کاری لازم است";

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

  const canSend =
    Boolean(text.trim()) || (canUseWorkspaceContext && attachments.length > 0);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend || isBusy) return;
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
    if (hasMentionPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((index) =>
          Math.min(index + 1, mentionEntries.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((index) => Math.max(index - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectMention(mentionEntries[mentionHighlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionEntries([]);
        return;
      }
    }

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

      {hasMentionPicker ? (
        <MentionSuggestions
          suggestions={mentionEntries}
          highlightIndex={mentionHighlight}
          onHighlight={setMentionHighlight}
          onSelect={selectMention}
        />
      ) : null}

      {centered && onWorkspaceChange ? (
        <div dir="rtl" className="mb-2 flex items-center justify-start gap-2">
          <span className="text-xs text-muted-foreground">پروژه:</span>
          <ComposerWorkspacePicker
            workspaces={workspaces}
            workspaceId={workspaceId}
            onWorkspaceChange={onWorkspaceChange}
            disabled={isBusy}
          />
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void handleImportFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <MobileComposer
        badgeProps={badgeProps}
        textareaProps={textareaProps}
        model={model}
        onModelChange={onModelChange}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={onReasoningEffortChange}
        showReasoningEffort={showReasoningEffort}
        reasoningEffortLevels={reasoningEffortLevels}
        isBusy={isBusy}
        canAttach={canAttach}
        canImport={canImport}
        attachmentTitle={attachmentTitle}
        isImporting={isImporting}
        onAttach={() => fileInputRef.current?.click()}
        text={text}
        canSend={canSend}
        onStop={onStop}
        centered={centered}
        attachments={
          canImport &&
          (attachments.length > 0 || mentions.length > 0 || isImporting) ? (
            <ComposerContextChips
              attachments={attachments}
              onRemoveAttachment={handleRemoveAttachment}
              mentions={mentions}
              onRemoveMention={handleRemoveMention}
              isImporting={isImporting}
            />
          ) : null
        }
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
        reasoningEffortLevels={reasoningEffortLevels}
        isBusy={isBusy}
        canAttach={canAttach}
        canImport={canImport}
        attachmentTitle={attachmentTitle}
        isImporting={isImporting}
        onAttach={() => fileInputRef.current?.click()}
        isExpanded={
          centered ||
          isExpanded ||
          Boolean(selectedExpert) ||
          attachments.length > 0 ||
          mentions.length > 0 ||
          isImporting
        }
        text={text}
        canSend={canSend}
        onStop={onStop}
        centered={centered}
        attachments={
          canImport &&
          (attachments.length > 0 || mentions.length > 0 || isImporting) ? (
            <ComposerContextChips
              attachments={attachments}
              onRemoveAttachment={handleRemoveAttachment}
              mentions={mentions}
              onRemoveMention={handleRemoveMention}
              isImporting={isImporting}
            />
          ) : null
        }
      />

      {centered ? (
        <ComposerFooter model={model} showContext={false} />
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
      <span dir="rtl">
        {model?.providerId === CODEX_PROVIDER_ID
          ? "Codex ایزوله است؛ فایل‌ها و ابزارهای فضای کاری در دسترس نیستند"
          : "چت‌بات متن‌باز نیمروز"}
      </span>
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
  reasoningEffortLevels?: readonly ReasoningEffort[];
  isBusy: boolean;
  canAttach: boolean;
  canImport?: boolean;
  attachmentTitle?: string;
  isImporting?: boolean;
  onAttach?: () => void;
  text: string;
  canSend?: boolean;
  onStop: () => void;
  centered?: boolean;
  attachments?: ReactNode;
};

function MobileComposer({
  badgeProps,
  textareaProps,
  model,
  onModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  showReasoningEffort,
  reasoningEffortLevels,
  isBusy,
  canAttach,
  canImport = false,
  attachmentTitle,
  isImporting = false,
  onAttach,
  text,
  canSend = false,
  onStop,
  centered = false,
  attachments = null,
}: ComposerSharedProps) {
  return (
    <div
      dir="ltr"
      className="flex flex-col overflow-hidden rounded-2xl border border-input bg-input/30 shadow-sm ring-1 ring-foreground/5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:hidden"
    >
      {badgeProps ? (
        <SelectedExpertBadge {...badgeProps} className="pb-0" />
      ) : null}

      {attachments}

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
              attachmentTitle ??
              (canImport || canAttach
                ? "افزودن فایل"
                : "برای افزودن فایل یک فضای کاری لازم است")
            }
            disabled={(!canImport && !canAttach) || isBusy || isImporting}
            onClick={onAttach}
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
              levels={reasoningEffortLevels}
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
            disabled={!canSend}
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
  reasoningEffortLevels,
  isBusy,
  canAttach,
  canImport = false,
  attachmentTitle,
  isImporting = false,
  onAttach,
  isExpanded,
  text,
  canSend = false,
  onStop,
  centered = false,
  attachments = null,
}: ComposerSharedProps & {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isExpanded: boolean;
  centered?: boolean;
}) {
  const showExpandedLayout = isExpanded || Boolean(badgeProps) || Boolean(attachments);

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

      {attachments}

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
                attachmentTitle ??
                (canImport || canAttach
                  ? "افزودن فایل"
                  : "برای افزودن فایل یک فضای کاری لازم است")
              }
              disabled={(!canImport && !canAttach) || isBusy || isImporting}
              onClick={onAttach}
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
                levels={reasoningEffortLevels}
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
                disabled={!canSend}
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
              disabled={!canSend}
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
