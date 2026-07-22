"use client";

import { NimruzLogo } from "@/components/logo";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  ChatMessageActions,
  copyTextToClipboard,
} from "@/components/chat/chat-message-actions";
import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { ShenavaDownloadDialog } from "@/components/speech/shenava-download-dialog";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShenavaSpeechInput } from "@/hooks/use-shenava-speech-input";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useWorkspaces } from "@/hooks/use-workspaces";
import {
  AGENT_MODES,
  AGENT_MODE_LABELS,
  DEFAULT_AGENT_MODE,
  type AgentMode,
} from "@/lib/chat/agent-mode";
import type {
  CompanionActivitySnapshot,
  CompanionConversationMessage,
  CompanionConversationPart,
  CompanionConversationSnapshot,
  CompanionScreenCapturePermission,
  CompanionScreenshot,
  CompanionSubmissionStatus,
} from "@/lib/companion";
import type { ProviderModelRef } from "@/lib/models/catalog";
import {
  DEFAULT_COMPANION_SHORTCUT_SETTINGS,
  formatCompanionAccelerator,
  type CompanionShortcutStatus,
} from "@/lib/settings/companion";
import { HOME_WORKSPACE_ID } from "@/lib/workspace";
import {
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  ExternalLinkIcon,
  FolderIcon,
  ListTodoIcon,
  Maximize2Icon,
  MicIcon,
  MonitorUpIcon,
  PlusIcon,
  SquareIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  ShieldAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type CompanionPhase =
  | "compose"
  | "submitting"
  | "running"
  | "completed"
  | "failed";

const VOICE_WAVE_HEIGHTS = [8, 16, 24, 13, 28, 19, 10, 23, 15, 26, 12, 20];

function CompanionMessageViewport({
  isStreaming,
  children,
}: {
  isStreaming: boolean;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const { scrollToEnd } = useMessageScroller();

  useEffect(() => {
    if (!isStreaming) return;
    isFollowingRef.current = true;
    scrollToEnd({ behavior: "smooth" });
  }, [isStreaming, scrollToEnd]);

  useEffect(() => {
    if (!isStreaming) return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const content = viewport.querySelector<HTMLElement>(
      '[data-slot="message-scroller-content"]'
    );
    if (!content) return;

    let frame = 0;
    const followContent = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (isFollowingRef.current) {
          viewport.scrollTop = Math.max(
            0,
            viewport.scrollHeight - viewport.clientHeight
          );
        }
      });
    };
    const observer = new ResizeObserver(followContent);
    observer.observe(content);
    followContent();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isStreaming]);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    isFollowingRef.current = distanceFromEnd <= 48;
  }

  return (
    <MessageScrollerViewport
      ref={viewportRef}
      dir="rtl"
      onScroll={handleScroll}
    >
      {children}
    </MessageScrollerViewport>
  );
}

const TOOL_LABELS: Record<string, string> = {
  list_directory: "بررسی پوشه",
  read_file: "خواندن فایل",
  search_files: "جستجوی فایل‌ها",
  grep: "جستجو در محتوا",
  write_file: "نوشتن فایل",
  apply_patch: "ویرایش فایل",
  move_file: "انتقال فایل",
  delete_file: "حذف فایل",
  run_command: "اجرای فرمان",
  fetch_url: "خواندن صفحه وب",
  create_artifact: "ساخت خروجی",
  update_task: "به‌روزرسانی کار",
  write_plan: "نوشتن برنامه",
  update_plan: "به‌روزرسانی برنامه",
  spawn_subagent: "سپردن کار به ایجنت",
  ask_user_question: "درخواست اطلاعات",
};

function CompanionToolPart({
  part,
}: {
  part: Extract<CompanionConversationPart, { type: "tool" }>;
}) {
  const isLoading = part.state === "running" || part.state === "approval";
  const isError = part.state === "failed";
  const action = TOOL_LABELS[part.toolName] ?? part.toolName.replaceAll("_", " ");
  const label =
    part.state === "approval"
      ? `${action} · منتظر تأیید`
      : part.state === "running"
        ? `در حال ${action}…`
        : part.state === "failed"
          ? `${action} ناموفق بود`
          : `${action} انجام شد`;

  return (
    <ChatToolInvocation
      icon={<WrenchIcon />}
      label={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">{label}</span>
          {part.subject ? (
            <span dir="ltr" className="truncate text-[11px] opacity-70">
              {part.subject}
            </span>
          ) : null}
        </span>
      }
      isLoading={isLoading}
      isError={isError}
    />
  );
}

function CompanionAssistantPart({
  part,
  isStreaming,
}: {
  part: CompanionConversationPart;
  isStreaming: boolean;
}) {
  if (part.type === "reasoning") {
    const isLoading = part.state === "running";
    return (
      <ChatToolInvocation
        icon={<BrainIcon />}
        label={isLoading ? "در حال فکر کردن…" : "استدلال انجام شد"}
        isLoading={isLoading}
        expandable={!isLoading && Boolean(part.text)}
        expandMode="click"
        panelTitle="استدلال"
      >
        <p dir="auto" className="whitespace-pre-wrap text-start text-xs">
          {part.text}
        </p>
      </ChatToolInvocation>
    );
  }
  if (part.type === "tool") return <CompanionToolPart part={part} />;
  return (
    <div
      dir="rtl"
      className="w-full px-1 py-1 text-start text-sm leading-6 text-foreground"
    >
      <MessageResponse
        mode={isStreaming ? "streaming" : "static"}
        isAnimating={false}
        className="text-sm leading-6"
      >
        {part.text}
      </MessageResponse>
    </div>
  );
}

function CompanionMessage({
  message,
  isStreaming,
}: {
  message: CompanionConversationMessage;
  isStreaming: boolean;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter(
        (part): part is Extract<CompanionConversationPart, { type: "text" }> =>
          part.type === "text"
      )
      .map((part) => part.text)
      .join("\n\n");
    if (!text) return null;
    return (
      <Bubble align="start" variant="default">
        <BubbleContent dir="auto" className="whitespace-pre-wrap text-start">
          {text}
        </BubbleContent>
      </Bubble>
    );
  }

  const copyText = message.parts
    .filter(
      (part): part is Extract<CompanionConversationPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n\n");

  return (
    <div className="flex w-full max-w-full flex-col gap-1">
      {message.parts.map((part, index) => (
        <CompanionAssistantPart
          key={`${message.id}-${part.type}-${index}`}
          part={part}
          isStreaming={isStreaming}
        />
      ))}
      {!isStreaming && copyText ? (
        <ChatMessageActions
          showCopy
          className="mt-0"
          onCopy={() =>
            void copyTextToClipboard(copyText, "پاسخ کپی شد.")
          }
        />
      ) : null}
    </div>
  );
}

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
  })}:${remainingSeconds.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
  })}`;
}

export function CompanionView() {
  const {
    defaultRef,
    enabledGroups,
    isHydrated: isCatalogHydrated,
    resolveModel,
  } = useModelCatalog();
  const {
    workspaces,
    activeWorkspaceId,
    isHydrated: areWorkspacesHydrated,
  } = useWorkspaces();
  const [text, setText] = useState("");
  const [screenshot, setScreenshot] = useState<CompanionScreenshot | null>(
    null
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [phase, setPhase] = useState<CompanionPhase>("compose");
  const [status, setStatus] = useState<CompanionSubmissionStatus | null>(null);
  const [conversation, setConversation] =
    useState<CompanionConversationSnapshot | null>(null);
  const [shortcutStatus, setShortcutStatus] =
    useState<CompanionShortcutStatus | null>(null);
  const [activity, setActivity] = useState<CompanionActivitySnapshot>({
    items: [],
  });
  const [capturePermission, setCapturePermission] =
    useState<CompanionScreenCapturePermission | null>(null);
  const [modelRef, setModelRef] = useState<ProviderModelRef | null>(null);
  const [agentMode, setAgentMode] =
    useState<AgentMode>(DEFAULT_AGENT_MODE);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const isBusy = phase === "submitting" || phase === "running";
  const requestIdRef = useRef<string | null>(null);
  const earlyStatusRef = useRef<CompanionSubmissionStatus | null>(null);
  const ignoredChatIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const microphoneButtonRef = useRef<HTMLButtonElement>(null);
  const speech = useShenavaSpeechInput(
    (transcript) => {
      setText((current) => {
        const prefix = current.trimEnd();
        return prefix ? `${prefix} ${transcript}` : transcript;
      });
      window.setTimeout(() => microphoneButtonRef.current?.focus(), 0);
    },
    {
      enableSpaceShortcut: !isBusy,
      showTranscriptionSuccessToast: false,
    }
  );

  const selectedModel = resolveModel(modelRef);

  useEffect(() => {
    if (!isCatalogHydrated) return;
    if (!selectedModel && defaultRef) setModelRef(defaultRef);
  }, [defaultRef, isCatalogHydrated, selectedModel]);

  useEffect(() => {
    if (!areWorkspacesHydrated) return;
    const hasSelectedWorkspace =
      workspaceId !== null &&
      workspaces.some((workspace) => workspace.id === workspaceId);
    if (!hasSelectedWorkspace) setWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId, areWorkspacesHydrated, workspaceId, workspaces]);

  useEffect(() => {
    return window.desktop.companion.onVisibilityChange((visible) => {
      if (visible) {
        void window.desktop.companion
          .getScreenCapturePermission()
          .then(setCapturePermission);
      }
      if (visible && phase === "compose") {
        window.setTimeout(() => microphoneButtonRef.current?.focus(), 60);
      }
    });
  }, [phase]);

  useEffect(() => {
    void window.desktop.companion
      .getScreenCapturePermission()
      .then(setCapturePermission);
    return window.desktop.companion.onActivity(setActivity);
  }, []);

  useEffect(() => {
    let active = true;
    void window.desktop.companion.getShortcutStatus().then((next) => {
      if (active) setShortcutStatus(next);
    });
    const unsubscribe = window.desktop.companion.onShortcutStatus((next) => {
      if (active) setShortcutStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return window.desktop.companion.onToggleMicrophone(() => {
      if (!isBusy) void speech.handleMicrophone();
    });
  }, [isBusy, speech.handleMicrophone]);

  const applySubmissionStatus = useCallback(
    (next: CompanionSubmissionStatus) => {
      setStatus(next);
      if (next.state === "failed") {
        setPhase("failed");
      } else if (next.state === "completed") {
        setPhase("completed");
      } else if (next.state === "running") {
        setPhase("running");
      }
    },
    []
  );

  useEffect(() => {
    return window.desktop.companion.onSubmissionStatus((next) => {
      const activeRequestId = requestIdRef.current;
      if (!activeRequestId) {
        earlyStatusRef.current = next;
        return;
      }
      if (next.requestId === activeRequestId) applySubmissionStatus(next);
    });
  }, [applySubmissionStatus]);

  useEffect(() => {
    return window.desktop.companion.onConversation((next) => {
      if (next.chatId === ignoredChatIdRef.current) return;
      setConversation(next);
      setStatus((current) => ({
        requestId: current?.requestId ?? "conversation",
        state: next.state === "running" ? "running" : "completed",
        chatId: next.chatId,
        workspaceId: next.workspaceId,
      }));
      if (next.state === "running") {
        setPhase("running");
      } else {
        setPhase((current) =>
          current !== "submitting" &&
          next.messages.some((message) => message.role === "assistant")
            ? "completed"
            : current
        );
      }
    });
  }, []);

  const reset = useCallback(() => {
    ignoredChatIdRef.current = conversation?.chatId ?? status?.chatId ?? null;
    void window.desktop.companion.clearConversation();
    setText("");
    setScreenshot(null);
    setConversation(null);
    setPhase("compose");
    setStatus(null);
    requestIdRef.current = null;
    earlyStatusRef.current = null;
    window.setTimeout(() => microphoneButtonRef.current?.focus(), 0);
  }, [conversation?.chatId, status?.chatId]);

  const hasConversation = Boolean(conversation || status?.chatId);
  const hasLiveStructuredProgress = Boolean(
    conversation?.messages
      .at(-1)
      ?.parts.some(
        (part) =>
          (part.type === "reasoning" && part.state === "running") ||
          (part.type === "tool" &&
            (part.state === "running" || part.state === "approval"))
      )
  );
  const shortcutSettings =
    shortcutStatus?.settings ?? DEFAULT_COMPANION_SHORTCUT_SETTINGS;
  const shortcutLabel = formatCompanionAccelerator(
    shortcutSettings.accelerator,
    window.desktop.platform
  );
  const microphoneShortcutLabel = formatCompanionAccelerator(
    shortcutSettings.microphoneAccelerator,
    window.desktop.platform
  );

  async function captureScreen() {
    if (isCapturing || isBusy) return;
    setIsCapturing(true);
    try {
      const permission =
        await window.desktop.companion.getScreenCapturePermission();
      setCapturePermission(permission);
      if (permission === "denied" || permission === "restricted") return;
      const capture = await window.desktop.companion.captureScreen();
      setScreenshot(capture);
      setCapturePermission("granted");
      toast.success("تصویر صفحه به درخواست اضافه شد.");
    } catch (captureError) {
      const permission = await window.desktop.companion
        .getScreenCapturePermission()
        .catch(() => "unknown" as const);
      setCapturePermission(permission);
      if (permission === "denied" || permission === "restricted") return;
      toast.error(
        captureError instanceof Error
          ? captureError.message
          : "گرفتن تصویر صفحه ناموفق بود. دسترسی ضبط صفحه را بررسی کنید."
      );
    } finally {
      setIsCapturing(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function openCaptureSettings() {
    void window.desktop.companion.openScreenCaptureSettings();
  }

  async function submit() {
    const prompt = text.trim();
    if ((!prompt && !screenshot) || isBusy) return;
    ignoredChatIdRef.current = null;
    setPhase("submitting");
    try {
      const result = await window.desktop.companion.submit({
        text: prompt,
        ...(screenshot ? { screenshot } : {}),
        ...((conversation?.chatId ?? status?.chatId)
          ? { chatId: conversation?.chatId ?? status?.chatId }
          : {}),
        workspaceId: workspaceId ?? activeWorkspaceId ?? HOME_WORKSPACE_ID,
        ...(modelRef ? { model: modelRef } : {}),
        agentMode,
      });
      requestIdRef.current = result.requestId;
      setText("");
      setScreenshot(null);
      const earlyStatus = earlyStatusRef.current;
      earlyStatusRef.current = null;
      if (earlyStatus?.requestId === result.requestId) {
        applySubmissionStatus(earlyStatus);
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "ارسال درخواست ناموفق بود.";
      setStatus({
        requestId: requestIdRef.current ?? "local-error",
        state: "failed",
        message,
      });
      setPhase("failed");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    void submit();
  }

  function openFullChat() {
    const target =
      (conversation?.chatId ?? status?.chatId) &&
      (conversation?.workspaceId ?? status?.workspaceId)
        ? {
            chatId: (conversation?.chatId ?? status?.chatId) as string,
            workspaceId: (conversation?.workspaceId ??
              status?.workspaceId) as string,
          }
        : undefined;
    void window.desktop.companion.openMain(target);
  }

  const capturePermissionAlert =
    capturePermission === "denied" || capturePermission === "restricted" ? (
      <Alert variant="destructive" className="shrink-0">
        <ShieldAlertIcon />
        <AlertTitle>اجازه ضبط صفحه لازم است</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            در تنظیمات macOS، دسترسی Screen Recording را برای نیمروز فعال کنید.
            ممکن است macOS یک‌بار بازکردن دوباره برنامه را بخواهد.
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="w-fit"
            onClick={openCaptureSettings}
          >
            باز کردن تنظیمات سیستم
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        </AlertDescription>
      </Alert>
    ) : null;

  return (
    <main
      dir="rtl"
      className="flex h-dvh flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
    >
      <header className="titlebar-drag flex h-16 shrink-0 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <NimruzLogo className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {conversation?.title ?? "دستیار سریع نیمروز"}
              </p>
              <Badge variant={isBusy ? "default" : "secondary"}>
                {isBusy ? "در حال کار" : "ایجنت"}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {shortcutStatus?.state === "registered" ? (
                <Kbd title="میانبر بازکردن دستیار">{shortcutLabel}</Kbd>
              ) : null}
              {shortcutStatus?.microphoneState === "registered" ? (
                <Kbd title="میانبر میکروفن">{microphoneShortcutLabel}</Kbd>
              ) : null}
            </div>
          </div>
        </div>
        <div className="titlebar-no-drag flex items-center gap-1">
          {hasConversation ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="شروع گفتگوی سریع جدید"
                    onClick={reset}
                  >
                    <PlusIcon />
                  </Button>
                }
              />
              <TooltipContent>گفتگوی جدید</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="باز کردن برنامه کامل"
                  onClick={openFullChat}
                >
                  <Maximize2Icon />
                </Button>
              }
            />
            <TooltipContent>باز کردن برنامه کامل</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="بستن دستیار سریع"
            onClick={() => void window.desktop.companion.hide()}
          >
            <XIcon />
          </Button>
        </div>
      </header>

      {activity.items.length > 0 ? (
        <section className="shrink-0 border-y bg-muted/30 px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <Spinner />
              <span>ایجنت‌ها در حال کارند</span>
            </div>
            <Badge variant="secondary">
              {activity.items.length.toLocaleString("fa-IR")}
            </Badge>
          </div>
          <div className="flex flex-col gap-1">
            {activity.items.slice(0, 2).map((item) => {
              const isCurrent = item.chatId === conversation?.chatId;
              return (
                <Button
                  key={item.chatId}
                  type="button"
                  variant={isCurrent ? "secondary" : "ghost"}
                  size="sm"
                  className="h-auto w-full justify-start px-2 py-1.5 text-start"
                  onClick={() =>
                    void window.desktop.companion.openMain({
                      chatId: item.chatId,
                      workspaceId: item.workspaceId,
                    })
                  }
                >
                  <ListTodoIcon data-icon="inline-start" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.title}</span>
                    {item.prompt ? (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {item.prompt}
                      </span>
                    ) : null}
                  </span>
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasConversation ? (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1.5 border-y px-3 py-2">
            <Badge variant="outline">
              <FolderIcon data-icon="inline-start" />
              {workspaces.find(
                (workspace) =>
                  workspace.id ===
                  (conversation?.workspaceId ?? status?.workspaceId)
              )?.title ?? "فضای کاری"}
            </Badge>
            <Badge variant="outline">
              <SlidersHorizontalIcon data-icon="inline-start" />
              {AGENT_MODE_LABELS[agentMode]}
            </Badge>
            <Badge variant="outline" className="min-w-0">
              <SparklesIcon data-icon="inline-start" />
              <span className="truncate">{selectedModel?.name ?? "مدل"}</span>
            </Badge>
          </div>

          <MessageScrollerProvider
            autoScroll={false}
            defaultScrollPosition="end"
          >
            <MessageScroller className="min-h-0 flex-1">
              <CompanionMessageViewport isStreaming={isBusy}>
                <MessageScrollerContent className="gap-3 px-3 py-4">
                  {(conversation?.messages.length ?? 0) > 0 ? (
                    conversation?.messages.map((message, index) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                      >
                        <CompanionMessage
                          message={message}
                          isStreaming={
                            isBusy &&
                            index === (conversation?.messages.length ?? 0) - 1 &&
                            message.role === "assistant"
                          }
                        />
                      </MessageScrollerItem>
                    ))
                  ) : (
                    <MessageScrollerItem className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
                      {phase === "failed" ? (
                        <XIcon aria-hidden />
                      ) : (
                        <Spinner />
                      )}
                      <p className="text-sm">
                        {phase === "failed"
                          ? status?.message || "شروع گفتگو ناموفق بود."
                          : "در حال آماده‌کردن گفتگو…"}
                      </p>
                    </MessageScrollerItem>
                  )}
                  {isBusy &&
                  (conversation?.messages.length ?? 0) > 0 &&
                  !hasLiveStructuredProgress ? (
                    <MessageScrollerItem>
                      <ChatToolInvocation
                        icon={<SparklesIcon />}
                        label="ایجنت در حال کار است…"
                        isLoading
                      />
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </CompanionMessageViewport>
              <MessageScrollerButton behavior="smooth" className="bottom-3" />
            </MessageScroller>
          </MessageScrollerProvider>

          <form
            className="flex shrink-0 flex-col gap-2 border-t px-3 py-3"
            onSubmit={handleSubmit}
          >
            {capturePermissionAlert}
            {screenshot ? (
              <Attachment size="xs" className="w-full">
                <AttachmentMedia variant="image">
                  <img
                    src={`data:${screenshot.mediaType};base64,${screenshot.base64}`}
                    alt="پیش‌نمایش تصویر صفحه"
                  />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>تصویر صفحه فعلی</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label="حذف تصویر صفحه"
                    onClick={() => setScreenshot(null)}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ) : null}

            <InputGroup className="min-h-24 items-stretch">
              <InputGroupTextarea
                ref={textareaRef}
                value={text}
                maxLength={12_000}
                placeholder={
                  isBusy ? "ایجنت در حال پاسخ است…" : "پیام بعدی را بنویسید…"
                }
                aria-label="پیام بعدی به ایجنت"
                className="min-h-14 px-3 pt-3 text-sm leading-6"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <div className="flex items-center gap-1">
                  <InputGroupButton
                    size="icon-sm"
                    aria-label="گرفتن تصویر صفحه فعلی"
                    disabled={isCapturing || isBusy}
                    onClick={() => void captureScreen()}
                  >
                    {isCapturing ? <Spinner /> : <MonitorUpIcon />}
                  </InputGroupButton>
                  <InputGroupButton
                    ref={microphoneButtonRef}
                    size="icon-sm"
                    variant={speech.isRecording ? "destructive" : "ghost"}
                    aria-label={
                      speech.isRecording ? "پایان ضبط صدا" : "شروع ضبط صدا"
                    }
                    disabled={speech.isTranscribing || isBusy}
                    onClick={() => void speech.handleMicrophone()}
                  >
                    {speech.isTranscribing ? (
                      <Spinner />
                    ) : speech.isRecording ? (
                      <SquareIcon />
                    ) : (
                      <MicIcon />
                    )}
                  </InputGroupButton>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {isBusy ? "در حال اجرا" : "Enter برای ارسال"}
                  </span>
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant="default"
                    aria-label="ارسال پیام"
                    disabled={isBusy || (!text.trim() && !screenshot)}
                  >
                    {isBusy ? <Spinner /> : <ArrowUpIcon />}
                  </InputGroupButton>
                </div>
              </InputGroupAddon>
            </InputGroup>

            {phase === "failed" && status?.message ? (
              <p className="text-xs text-destructive">{status.message}</p>
            ) : null}
          </form>
        </section>
      ) : phase === "compose" ? (
        <form
          className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3"
          onSubmit={handleSubmit}
        >
          <section className="flex shrink-0 flex-col items-center gap-2 text-center">
            <div className="relative flex size-24 items-center justify-center">
              {speech.isRecording ? (
                <>
                  <span className="absolute inset-0 rounded-full bg-destructive/10 motion-safe:animate-ping" />
                  <span className="absolute inset-2 rounded-full border border-destructive/30" />
                </>
              ) : null}
              <Button
                ref={microphoneButtonRef}
                type="button"
                size="icon-xl"
                variant={speech.isRecording ? "destructive" : "default"}
                aria-label={
                  speech.isRecording
                    ? "پایان ضبط و تبدیل به متن"
                    : speech.isTranscribing
                      ? "در حال تبدیل گفتار به متن"
                      : "شروع گفتار فارسی"
                }
                aria-pressed={speech.isRecording}
                disabled={speech.isTranscribing}
                onClick={() => void speech.handleMicrophone()}
              >
                {speech.isTranscribing ? (
                  <Spinner />
                ) : speech.isRecording ? (
                  <SquareIcon />
                ) : (
                  <MicIcon />
                )}
              </Button>
            </div>

            <div className="flex min-h-10 flex-col items-center justify-center gap-1">
              <p className="text-sm font-medium">
                {speech.isRecording
                  ? "در حال شنیدن… برای پایان Space را بزنید"
                  : speech.isTranscribing
                    ? "در حال تبدیل صدا به متن…"
                    : "برای صحبت Space را بزنید"}
              </p>
              {speech.isRecording ? (
                <div dir="ltr" className="flex h-6 items-center gap-1">
                  <span className="me-1 text-xs tabular-nums text-muted-foreground">
                    {formatRecordingDuration(speech.recordingSeconds)}
                  </span>
                  {VOICE_WAVE_HEIGHTS.map((height, index) => (
                    <span
                      key={`${height}-${index}`}
                      aria-hidden
                      className="recording-wave-bar w-1 rounded-full bg-destructive"
                      style={{
                        height,
                        animationDelay: `${index * -70}ms`,
                        animationDuration: `${620 + (index % 4) * 90}ms`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Kbd>Space</Kbd>
                  <span>در این پنجره</span>
                  {shortcutStatus?.microphoneState === "registered" ? (
                    <>
                      <span>·</span>
                      <Kbd>{microphoneShortcutLabel}</Kbd>
                      <span>از هرجا</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            <Separator className="flex-1" />
            <span>یا بنویسید</span>
            <Separator className="flex-1" />
          </div>

          {capturePermissionAlert}

          {screenshot ? (
            <Attachment size="xs" className="w-full">
              <AttachmentMedia variant="image">
                <img
                  src={`data:${screenshot.mediaType};base64,${screenshot.base64}`}
                  alt="پیش‌نمایش تصویر صفحه"
                />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>تصویر صفحه فعلی</AttachmentTitle>
                <AttachmentDescription>
                  {screenshot.width.toLocaleString("fa-IR")} × {screenshot.height.toLocaleString("fa-IR")}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label="حذف تصویر صفحه"
                  onClick={() => setScreenshot(null)}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ) : null}

          <InputGroup className="min-h-32 flex-1 items-stretch">
            <InputGroupAddon
              align="block-start"
              className="grid grid-cols-3 gap-1.5 border-b px-2 py-2"
              data-space-shortcut-ignore
            >
              <Select
                value={workspaceId}
                onValueChange={(value) => {
                  if (value) setWorkspaceId(value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0 px-2"
                  aria-label="انتخاب فضای کاری"
                  disabled={!areWorkspacesHydrated}
                >
                  <FolderIcon aria-hidden />
                  <SelectValue>
                    {workspaces.find((workspace) => workspace.id === workspaceId)
                      ?.title ?? "فضای کاری"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" side="top">
                  <SelectGroup>
                    <SelectLabel>فضای کاری</SelectLabel>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        <FolderIcon aria-hidden />
                        {workspace.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                value={agentMode}
                onValueChange={(value) => {
                  if (value && AGENT_MODES.includes(value as AgentMode)) {
                    setAgentMode(value as AgentMode);
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0 px-2"
                  aria-label="انتخاب حالت ایجنت"
                >
                  <SlidersHorizontalIcon aria-hidden />
                  <SelectValue>{AGENT_MODE_LABELS[agentMode]}</SelectValue>
                </SelectTrigger>
                <SelectContent align="center" side="top">
                  <SelectGroup>
                    <SelectLabel>حالت اجرا</SelectLabel>
                    {AGENT_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {AGENT_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                value={selectedModel?.id ?? null}
                onValueChange={(value) => {
                  if (!value) return;
                  const model = enabledGroups
                    .flatMap((group) => group.models)
                    .find((item) => item.id === value);
                  if (model) {
                    setModelRef({
                      providerId: model.providerId,
                      modelId: model.modelId,
                    });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0 px-2"
                  aria-label="انتخاب مدل"
                  disabled={!isCatalogHydrated || enabledGroups.length === 0}
                >
                  <SparklesIcon aria-hidden />
                  <SelectValue>{selectedModel?.name ?? "مدل"}</SelectValue>
                </SelectTrigger>
                <SelectContent align="end" side="top">
                  {enabledGroups.map((group) => (
                    <SelectGroup key={group.provider.id}>
                      <SelectLabel>{group.provider.name}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <SparklesIcon aria-hidden />
                          {model.fullName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </InputGroupAddon>
            <InputGroupTextarea
              ref={textareaRef}
              value={text}
              maxLength={12_000}
              placeholder="درخواست را بنویسید…"
              aria-label="درخواست از ایجنت"
              className="min-h-14 px-3 pt-3 text-sm leading-6"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <InputGroupButton
                size="sm"
                aria-label="گرفتن تصویر صفحه فعلی"
                disabled={isCapturing}
                onClick={() => void captureScreen()}
              >
                {isCapturing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <MonitorUpIcon data-icon="inline-start" />
                )}
                افزودن صفحه
              </InputGroupButton>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  Enter برای ارسال
                </span>
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  aria-label="ارسال درخواست"
                  disabled={!text.trim() && !screenshot}
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </form>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 pb-8 text-center">
          <div className="relative flex size-20 items-center justify-center rounded-full bg-secondary">
            {phase === "completed" ? (
              <>
                <CheckIcon className="size-8 text-primary" aria-hidden />
              </>
            ) : phase === "failed" ? (
              <XIcon className="size-8 text-destructive" aria-hidden />
            ) : (
              <>
                {phase === "running" ? (
                  <span className="absolute inset-0 rounded-full border border-primary/30 motion-safe:animate-ping" />
                ) : null}
                <Spinner className="size-7" />
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">
              {phase === "completed"
                ? "کار ایجنت تمام شد"
                : phase === "running"
                  ? "ایجنت در حال کار است"
                : phase === "failed"
                  ? "کار ایجنت ناموفق بود"
                  : "در حال آماده‌سازی ایجنت…"}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {phase === "completed"
                ? "نتیجه آماده است و می‌توانید آن را در گفتگوی کامل ببینید."
                : phase === "running"
                ? "می‌توانید این پنجره را ببندید؛ کار در پس‌زمینه ادامه دارد."
                : phase === "failed"
                  ? status?.message || "لطفاً دوباره تلاش کنید."
                  : "گفتگوی جدید و زمینه لازم در حال آماده‌شدن است."}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2">
            {phase === "running" || phase === "completed" ? (
              <Button type="button" className="w-full" onClick={openFullChat}>
                <ExternalLinkIcon data-icon="inline-start" />
                دیدن گفتگوی کامل
              </Button>
            ) : null}
            <Button
              type="button"
              variant={
                phase === "running" || phase === "completed"
                  ? "outline"
                  : "default"
              }
              className="w-full"
              onClick={reset}
            >
              <PlusIcon data-icon="inline-start" />
              {phase === "failed" ? "تلاش دوباره" : "درخواست جدید"}
            </Button>
          </div>
        </section>
      )}

      <ShenavaDownloadDialog
        open={speech.downloadDialogOpen}
        onOpenChange={speech.setDownloadDialogOpen}
        status={speech.status}
        onDownload={(modelKey) => void speech.downloadModel(modelKey)}
        onCancelDownload={() => void speech.cancelDownload()}
      />
    </main>
  );
}
