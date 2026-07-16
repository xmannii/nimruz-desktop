"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import { useWorkspaceRoots } from "@/hooks/use-workspace-roots";
import { cn } from "@/lib/utils";
import type { WorkspaceFileEntry, WorkspaceRoot } from "@/lib/workspace";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  MoreVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { FilePreview } from "@/components/workspace/file-preview";

type WorkspaceFilesPanelProps = {
  workspaceId: string;
  /** Optional absolute path a tool asked the panel to reveal. */
  revealPath?: string | null;
  onRevealHandled?: () => void;
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function formatModified(ms: number | null): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

function parentPath(target: string): string {
  const normalized = target.replace(/[/\\]+$/, "");
  const idx = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\")
  );
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

function baseName(target: string): string {
  return target.split(/[/\\]/).filter(Boolean).at(-1) ?? target;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${name}`;
}

function rootDisplayLabel(root: WorkspaceRoot): string {
  if (root.kind === "managed") return "فایل‌های داخلی";
  if (root.isPrimary) {
    return root.label?.trim() || baseName(root.path) || "پوشه کاری";
  }
  return root.label?.trim() || baseName(root.path) || "پوشه";
}

type SortMode = "name" | "modified";

export function WorkspaceFilesPanel({
  workspaceId,
  revealPath,
  onRevealHandled,
}: WorkspaceFilesPanelProps) {
  const { roots, isLoading: rootsLoading } = useWorkspaceRoots(workspaceId);

  const [root, setRoot] = useState<WorkspaceRoot | null>(null);
  const [pickingRoot, setPickingRoot] = useState(false);
  const [nav, setNav] = useState<{ stack: string[]; index: number }>({
    stack: [],
    index: -1,
  });
  const history = nav.stack;
  const historyIndex = nav.index;
  const [entries, setEntries] = useState<WorkspaceFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("name");
  const [filter, setFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [dialog, setDialog] = useState<
    | { mode: "new-folder" | "new-file"; value: string }
    | { mode: "rename"; value: string; target: string }
    | null
  >(null);

  const currentPath = historyIndex >= 0 ? history[historyIndex] : null;

  const load = useCallback(
    async (targetPath: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await window.desktop.storage.listWorkspaceFiles(
          workspaceId,
          targetPath
        );
        setEntries(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "بارگذاری فایل‌ها ناموفق بود."
        );
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId]
  );

  const navigateTo = useCallback((dirPath: string) => {
    setSelectedFile(null);
    setNav((prev) => {
      const trimmed = prev.stack.slice(0, prev.index + 1);
      trimmed.push(dirPath);
      return { stack: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  // Reset when switching workspaces.
  useEffect(() => {
    setRoot(null);
    setPickingRoot(false);
    setNav({ stack: [], index: -1 });
    setEntries([]);
    setSelectedFile(null);
    setFilter("");
    setShowFilter(false);
  }, [workspaceId]);

  const openRoot = useCallback((selected: WorkspaceRoot) => {
    setPickingRoot(false);
    setRoot(selected);
    setSelectedFile(null);
    setNav({ stack: [selected.path], index: 0 });
  }, []);

  // Auto-open the primary (or first) root so files appear immediately.
  useEffect(() => {
    if (pickingRoot || root || rootsLoading || roots.length === 0) return;
    const preferred =
      roots.find((item) => item.isPrimary) ??
      roots.find((item) => item.kind === "linked") ??
      roots.find((item) => item.kind === "managed") ??
      roots[0];
    if (preferred) openRoot(preferred);
  }, [pickingRoot, root, roots, rootsLoading, openRoot]);

  // Load directory whenever the current path changes.
  useEffect(() => {
    if (currentPath) void load(currentPath);
  }, [currentPath, load]);

  // Live refresh on file changes in the current directory or preview.
  useWorkspaceEvents(workspaceId, (events) => {
    if (
      !hasEventType(
        events,
        "file-created",
        "file-updated",
        "file-deleted",
        "file-moved",
        "root-changed"
      )
    ) {
      return;
    }
    if (currentPath) void load(currentPath);
  });

  // Handle a reveal request pointing at an absolute file path.
  useEffect(() => {
    if (!revealPath || roots.length === 0) return;
    const owningRoot =
      roots.find((item) => revealPath.startsWith(item.path)) ?? null;
    if (!owningRoot) {
      onRevealHandled?.();
      return;
    }
    const dir = parentPath(revealPath);
    setRoot(owningRoot);
    if (dir !== owningRoot.path) {
      setNav({ stack: [owningRoot.path, dir], index: 1 });
    } else {
      setNav({ stack: [owningRoot.path], index: 0 });
    }
    setSelectedFile(revealPath);
    onRevealHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealPath, roots]);

  const goBack = () => {
    setSelectedFile(null);
    setNav((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  };
  const goForward = () => {
    setSelectedFile(null);
    setNav((prev) => ({
      ...prev,
      index: Math.min(prev.stack.length - 1, prev.index + 1),
    }));
  };
  const goUp = () => {
    if (!root || !currentPath || currentPath === root.path) return;
    navigateTo(parentPath(currentPath));
  };

  const breadcrumbs = useMemo(() => {
    if (!root || !currentPath) return [];
    const relative = currentPath.slice(root.path.length).replace(/^[/\\]+/, "");
    const segments = relative ? relative.split(/[/\\]/).filter(Boolean) : [];
    const crumbs = [{ label: rootDisplayLabel(root), path: root.path }];
    let acc = root.path;
    for (const segment of segments) {
      acc = joinPath(acc, segment);
      crumbs.push({ label: segment, path: acc });
    }
    return crumbs;
  }, [root, currentPath]);

  const visibleEntries = useMemo(() => {
    const filtered = filter.trim()
      ? entries.filter((entry) =>
          entry.name.toLowerCase().includes(filter.trim().toLowerCase())
        )
      : entries;
    return [...filtered].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      if (sort === "modified") {
        return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
      }
      return a.name.localeCompare(b.name, "fa");
    });
  }, [entries, filter, sort]);

  function handleEntryClick(entry: WorkspaceFileEntry) {
    if (entry.kind === "directory") {
      navigateTo(entry.path);
    } else {
      setSelectedFile(entry.path);
    }
  }

  async function handleReveal(path: string) {
    try {
      await window.desktop.storage.revealWorkspacePath(workspaceId, path);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "باز کردن در سیستم ناموفق بود."
      );
    }
  }

  async function handleDelete(entry: WorkspaceFileEntry) {
    try {
      await window.desktop.storage.deleteWorkspaceEntry(
        workspaceId,
        entry.path
      );
      toast.success(`«${entry.name}» حذف شد.`);
      if (currentPath) void load(currentPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حذف ناموفق بود.");
    }
  }

  async function handleDialogSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dialog || !currentPath) return;
    const name = dialog.value.trim();
    if (!name) return;
    try {
      if (dialog.mode === "new-folder") {
        await window.desktop.storage.createWorkspaceDirectory(
          workspaceId,
          joinPath(currentPath, name)
        );
        toast.success("پوشه ساخته شد.");
      } else if (dialog.mode === "new-file") {
        await window.desktop.storage.createWorkspaceFile(
          workspaceId,
          joinPath(currentPath, name),
          ""
        );
        toast.success("فایل ساخته شد.");
      } else if (dialog.mode === "rename") {
        await window.desktop.storage.renameWorkspaceEntry(
          workspaceId,
          dialog.target,
          joinPath(parentPath(dialog.target), name)
        );
        toast.success("تغییر نام انجام شد.");
      }
      setDialog(null);
      if (currentPath) void load(currentPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "عملیات ناموفق بود.");
    }
  }

  // --- Render ---

  if (rootsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // While roots load (or before auto-open), keep a calm spinner.
  if (!root && !pickingRoot) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Manual root selection (user tapped the roots switcher).
  if (!root) {
    return (
      <div dir="rtl" className="flex h-full min-h-0 flex-col gap-2">
        <p className="px-1 text-xs text-muted-foreground">
          پوشه کاری را برای مرور انتخاب کنید.
        </p>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-1.5 pe-2">
            {roots.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openRoot(item)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 px-3 py-2.5 text-right hover:bg-muted/50"
                >
                  <HardDriveIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {rootDisplayLabel(item)}
                      </span>
                      {item.isPrimary ? (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          اصلی
                        </span>
                      ) : null}
                    </span>
                    <span
                      dir="ltr"
                      className="truncate text-left font-mono text-[11px] text-muted-foreground"
                    >
                      {item.path}
                    </span>
                  </div>
                  <ChevronLeftIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>
    );
  }

  // File preview view.
  if (selectedFile) {
    return (
      <div dir="rtl" className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="بازگشت"
            onClick={() => setSelectedFile(null)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {baseName(selectedFile)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            title="باز کردن در سیستم"
            onClick={() => void handleReveal(selectedFile)}
          >
            <ExternalLinkIcon />
          </Button>
        </div>
        <FilePreview
          workspaceId={workspaceId}
          path={selectedFile}
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;
  const atRoot = currentPath === root.path;

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-0.5 px-0.5">
        <Button
          size="icon-sm"
          variant="ghost"
          title="تعویض پوشه"
          onClick={() => {
            setPickingRoot(true);
            setRoot(null);
            setSelectedFile(null);
          }}
        >
          <HardDriveIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="عقب"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <ArrowRightIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="جلو"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <ArrowLeftIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="بالا"
          disabled={atRoot}
          onClick={goUp}
        >
          <ArrowUpIcon />
        </Button>
        <div className="flex-1" />
        <Button
          size="icon-sm"
          variant={showFilter ? "secondary" : "ghost"}
          title="جستجو"
          onClick={() => {
            setShowFilter((v) => !v);
            if (showFilter) setFilter("");
          }}
        >
          <SearchIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon-sm" variant="ghost" title="ساخت">
                <FolderPlusIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="start" dir="rtl">
            <DropdownMenuItem
              onClick={() => setDialog({ mode: "new-folder", value: "" })}
            >
              <FolderPlusIcon />
              پوشه جدید
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDialog({ mode: "new-file", value: "" })}
            >
              <FilePlusIcon />
              فایل جدید
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="icon-sm"
          variant="ghost"
          title={sort === "name" ? "مرتب‌سازی بر اساس تاریخ" : "مرتب‌سازی بر اساس نام"}
          onClick={() => setSort((s) => (s === "name" ? "modified" : "name"))}
        >
          <span className="text-[10px] font-medium">
            {sort === "name" ? "نام" : "تاریخ"}
          </span>
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="باز کردن در سیستم"
          onClick={() => void handleReveal(currentPath ?? root.path)}
        >
          <ExternalLinkIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="بازخوانی"
          onClick={() => currentPath && void load(currentPath)}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {/* Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-1 pb-0.5 text-xs">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
            {index > 0 ? (
              <ChevronLeftIcon className="size-3 text-muted-foreground" />
            ) : null}
            <button
              type="button"
              onClick={() => navigateTo(crumb.path)}
              className={cn(
                "shrink-0 truncate rounded px-1 py-0.5 hover:bg-muted/60",
                index === breadcrumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {showFilter ? (
        <Input
          autoFocus
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="فیلتر بر اساس نام…"
          className="h-8"
        />
      ) : null}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : visibleEntries.length === 0 ? (
        <Empty className="flex-1 border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>
              {filter ? "نتیجه‌ای یافت نشد" : "پوشه خالی است"}
            </EmptyTitle>
            <EmptyDescription>
              {error ?? "هنوز فایلی در این مسیر ساخته نشده است."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-0.5 pe-2">
            {visibleEntries.map((entry) => (
              <li key={entry.path} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleEntryClick(entry)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm hover:bg-muted/60"
                >
                  {entry.kind === "directory" ? (
                    <FolderIcon className="size-4 shrink-0 text-sky-500/80" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {sort === "modified"
                      ? formatModified(entry.modifiedAt)
                      : formatSize(entry.sizeBytes)}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100"
                        title="عملیات"
                      >
                        <MoreVerticalIcon />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" dir="rtl">
                    <DropdownMenuItem
                      onClick={() =>
                        setDialog({
                          mode: "rename",
                          value: entry.name,
                          target: entry.path,
                        })
                      }
                    >
                      <PencilIcon />
                      تغییر نام
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleReveal(entry.path)}>
                      <ExternalLinkIcon />
                      باز کردن در سیستم
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void handleDelete(entry)}
                    >
                      <Trash2Icon />
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent dir="rtl">
          <form onSubmit={handleDialogSubmit} className="contents">
            <DialogHeader>
              <DialogTitle>
                {dialog?.mode === "rename"
                  ? "تغییر نام"
                  : dialog?.mode === "new-file"
                    ? "فایل جدید"
                    : "پوشه جدید"}
              </DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={dialog?.value ?? ""}
              onChange={(event) =>
                setDialog((prev) =>
                  prev ? { ...prev, value: event.target.value } : prev
                )
              }
              placeholder="نام…"
            />
            <DialogFooter>
              <Button type="submit">تأیید</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
              >
                انصراف
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
