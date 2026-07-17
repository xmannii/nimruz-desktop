"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  ArtifactPreview,
  normalizeArtifactKind,
} from "@/components/workspace/artifact-preview";
import { cn } from "@/lib/utils";
import type { ArtifactKind, ArtifactRecord } from "@/lib/workspace";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import {
  BracesIcon,
  ChevronRightIcon,
  CodeIcon,
  FileTextIcon,
  GitBranchIcon,
  ImageIcon,
  LayoutIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";

type WorkspaceArtifactsPanelProps = {
  workspaceId: string;
  revealArtifactId?: string | null;
  onRevealHandled?: () => void;
};

const KIND_META: Record<
  ReturnType<typeof normalizeArtifactKind>,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  html: { label: "HTML", icon: LayoutIcon },
  markdown: { label: "مارک‌داون", icon: FileTextIcon },
  svg: { label: "SVG", icon: ImageIcon },
  mermaid: { label: "نمودار", icon: GitBranchIcon },
  code: { label: "کد", icon: CodeIcon },
  data: { label: "داده", icon: BracesIcon },
};

function kindMeta(kind: ArtifactKind) {
  return KIND_META[normalizeArtifactKind(kind)];
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function WorkspaceArtifactsPanel({
  workspaceId,
  revealArtifactId,
  onRevealHandled,
}: WorkspaceArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<ArtifactRecord | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [revealAnimKey, setRevealAnimKey] = useState(0);
  const [openOnPreview, setOpenOnPreview] = useState(false);
  const revealRetryIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.desktop.storage.listArtifacts(workspaceId);
      setArtifacts(result.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      console.error("Failed to load artifacts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setSelected(null);
    setContent(null);
    void load();
  }, [workspaceId, load]);

  useWorkspaceEvents(workspaceId, (events) => {
    if (hasEventType(events, "artifact-changed")) void load();
  });

  const handleSelect = useCallback(
    (artifact: ArtifactRecord, options?: { fromReveal?: boolean }) => {
      setSelected(artifact);
      setContent(null);
      setOpenOnPreview(Boolean(options?.fromReveal));
      if (options?.fromReveal) {
        setRevealAnimKey((key) => key + 1);
      }
      void window.desktop.storage
        .readArtifact(workspaceId, artifact.id)
        .then(setContent)
        .catch((error) => {
          console.error("Failed to read artifact:", error);
          setContent("خطا در خواندن محتوا.");
        });
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!revealArtifactId) {
      revealRetryIdRef.current = null;
      return;
    }
    const match = artifacts.find((item) => item.id === revealArtifactId);
    if (match) {
      handleSelect(match, { fromReveal: true });
      onRevealHandled?.();
      revealRetryIdRef.current = null;
      return;
    }
    if (isLoading) return;
    if (revealRetryIdRef.current !== revealArtifactId) {
      revealRetryIdRef.current = revealArtifactId;
      void load();
      return;
    }
    onRevealHandled?.();
  }, [
    revealArtifactId,
    artifacts,
    isLoading,
    handleSelect,
    onRevealHandled,
    load,
  ]);

  function handleDelete(artifact: ArtifactRecord) {
    void window.desktop.storage.deleteArtifact(artifact.id).then(() => {
      setArtifacts((current) =>
        current.filter((item) => item.id !== artifact.id)
      );
      if (selected?.id === artifact.id) {
        setSelected(null);
        setContent(null);
      }
    });
  }

  if (isLoading && artifacts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (selected) {
    const meta = kindMeta(selected.kind);
    const KindIcon = meta.icon;

    return (
      <div
        key={revealAnimKey || selected.id}
        dir="rtl"
        className={cn(
          "flex h-full min-h-0 flex-col",
          revealAnimKey > 0 &&
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300 fill-mode-both"
        )}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-sidebar-border/80 px-2 py-1.5">
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7"
            title="بازگشت به فهرست"
            aria-label="بازگشت به فهرست"
            onClick={() => {
              setSelected(null);
              setContent(null);
              setOpenOnPreview(false);
            }}
          >
            <ChevronRightIcon />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <KindIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                {selected.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {meta.label} · {formatDate(selected.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        {content === null ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ArtifactPreview
            key={`${selected.id}:${openOnPreview ? "preview" : "default"}`}
            artifact={selected}
            content={content}
            className="min-h-0 flex-1"
            initialTab={openOnPreview ? "preview" : undefined}
            toolbarEnd={
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="حذف آرتیفکت"
                aria-label="حذف آرتیفکت"
                onClick={() => handleDelete(selected)}
              >
                <Trash2Icon />
              </Button>
            }
          />
        )}
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <Empty className="h-full border-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>هنوز آرتیفکتی ساخته نشده</EmptyTitle>
          <EmptyDescription>
            دستیار می‌تواند صفحات HTML، فلوچارت، گزارش مارک‌داون، SVG یا نمونه
            کد بسازد — اینجا تمام‌صفحه پیش‌نمایش می‌شوند.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <p className="text-xs text-muted-foreground">
          {artifacts.length.toLocaleString("fa-IR")} آرتیفکت
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {artifacts.map((artifact) => {
            const meta = kindMeta(artifact.kind);
            const KindIcon = meta.icon;
            return (
              <li key={artifact.id}>
                <div className="group flex items-center gap-0.5 rounded-xl hover:bg-muted/60">
                  <button
                    type="button"
                    onClick={() => handleSelect(artifact)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-right"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground">
                      <KindIcon className="size-3.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {artifact.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[10px] font-normal"
                        >
                          {meta.label}
                        </Badge>
                        <span className="truncate">
                          {formatDate(artifact.updatedAt)}
                        </span>
                      </span>
                    </span>
                    <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="me-1 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="حذف آرتیفکت"
                    aria-label={`حذف ${artifact.title}`}
                    onClick={() => handleDelete(artifact)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
