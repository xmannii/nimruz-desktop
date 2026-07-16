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
import { ChevronLeftIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type WorkspaceArtifactsPanelProps = {
  workspaceId: string;
  revealArtifactId?: string | null;
  onRevealHandled?: () => void;
};

const KIND_LABELS: Record<
  ReturnType<typeof normalizeArtifactKind>,
  string
> = {
  html: "HTML",
  markdown: "مارک‌داون",
  svg: "SVG",
  mermaid: "نمودار",
  code: "کد",
  data: "داده",
};

function kindLabel(kind: ArtifactKind): string {
  return KIND_LABELS[normalizeArtifactKind(kind)];
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

  // Deep-link from chat tool cards / auto-reveal: open the specific artifact.
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
    // One reload in case the list raced ahead of the write.
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
      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
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
    return (
      <div
        key={revealAnimKey || selected.id}
        dir="rtl"
        className={cn(
          "flex h-full min-h-0 flex-col gap-2",
          revealAnimKey > 0 &&
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300 fill-mode-both"
        )}
      >
        <div className="flex items-center gap-2 px-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setContent(null);
              setOpenOnPreview(false);
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {selected.title}
          </p>
          <Badge variant="outline">{kindLabel(selected.kind)}</Badge>
        </div>
        {content === null ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ArtifactPreview
            artifact={selected}
            content={content}
            className="min-h-0 flex-1"
            initialTab={openOnPreview ? "preview" : undefined}
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
            دستیار می‌تواند صفحات HTML تعاملی، نمودار، گزارش مارک‌داون، SVG یا
            نمونه کد بسازد — اینجا پیش‌نمایش می‌شوند.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea dir="rtl" className="h-full min-h-0">
      <ul className="flex flex-col gap-1.5 pe-2">
        {artifacts.map((artifact) => (
          <li
            key={artifact.id}
            className="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-2"
          >
            <button
              type="button"
              onClick={() => handleSelect(artifact)}
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-right"
            >
              <span className="min-w-0 max-w-full truncate text-sm font-medium">
                {artifact.title}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="h-4">
                  {kindLabel(artifact.kind)}
                </Badge>
                {formatDate(artifact.updatedAt)}
              </span>
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="حذف آرتیفکت"
              onClick={() => handleDelete(artifact)}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
