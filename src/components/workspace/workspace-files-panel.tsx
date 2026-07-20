"use client";

import {
  FileTree,
  FileTreeActions,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
  FileTreeName,
} from "@/components/ai-elements/file-tree";
import { FilePreview } from "@/components/workspace/file-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { classifyFile } from "@/lib/workspace";
import type {
  WorkspaceFileChange,
  WorkspaceFileEntry,
  WorkspaceRoot,
} from "@/lib/workspace";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  FileDiffIcon,
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
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type WorkspaceFilesPanelProps = {
  workspaceId: string;
  /** Optional absolute path a tool asked the panel to reveal. */
  revealPath?: string | null;
  onRevealHandled?: () => void;
};

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

function ancestorDirs(rootPath: string, dirPath: string): string[] {
  const normalizedRoot = rootPath.replace(/[/\\]+$/, "");
  const normalizedDir = dirPath.replace(/[/\\]+$/, "");
  if (!normalizedDir.startsWith(normalizedRoot)) return [normalizedRoot];

  const relative = normalizedDir
    .slice(normalizedRoot.length)
    .replace(/^[/\\]+/, "");
  const segments = relative ? relative.split(/[/\\]/).filter(Boolean) : [];
  const dirs = [normalizedRoot];
  let acc = normalizedRoot;
  for (const segment of segments) {
    acc = joinPath(acc, segment);
    dirs.push(acc);
  }
  return dirs;
}

function sortEntries(entries: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, "fa");
  });
}

function EntryActions({
  entry,
  onRename,
  onReveal,
  onDelete,
}: {
  entry: WorkspaceFileEntry;
  onRename: (entry: WorkspaceFileEntry) => void;
  onReveal: (path: string) => void;
  onDelete: (entry: WorkspaceFileEntry) => void;
}) {
  return (
    <FileTreeActions
      className={cn(
        "opacity-0 transition-opacity",
        "group-hover/folder:opacity-100 group-hover/file:opacity-100",
        "has-[[data-popup-open]]:opacity-100"
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-6 opacity-100"
              title="عملیات"
              aria-label={`عملیات ${entry.name}`}
            >
              <MoreVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" dir="rtl">
          <DropdownMenuItem onClick={() => onRename(entry)}>
            <PencilIcon />
            تغییر نام
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onReveal(entry.path)}>
            <ExternalLinkIcon />
            باز کردن در سیستم
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(entry)}
          >
            <Trash2Icon />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </FileTreeActions>
  );
}

function TreeNodes({
  entries,
  childrenByPath,
  loadingPaths,
  filter,
  changesByPath,
  onRename,
  onReveal,
  onDelete,
}: {
  entries: WorkspaceFileEntry[];
  childrenByPath: Map<string, WorkspaceFileEntry[]>;
  loadingPaths: Set<string>;
  filter: string;
  changesByPath: Map<string, WorkspaceFileChange>;
  onRename: (entry: WorkspaceFileEntry) => void;
  onReveal: (path: string) => void;
  onDelete: (entry: WorkspaceFileEntry) => void;
}): ReactNode {
  const query = filter.trim().toLowerCase();
  const visible = sortEntries(
    query
      ? entries.filter((entry) => entry.name.toLowerCase().includes(query))
      : entries
  );

  if (visible.length === 0) {
    return (
      <p className="px-2 py-1.5 font-sans text-[11px] text-muted-foreground">
        {query ? "نتیجه‌ای یافت نشد" : "خالی"}
      </p>
    );
  }

  return visible.map((entry) => {
    if (entry.kind === "directory") {
      const children = childrenByPath.get(entry.path);
      const isLoading = loadingPaths.has(entry.path);
      return (
        <FileTreeFolder
          key={entry.path}
          path={entry.path}
          name={entry.name}
          actions={
            <EntryActions
              entry={entry}
              onRename={onRename}
              onReveal={onReveal}
              onDelete={onDelete}
            />
          }
        >
          {isLoading && !children ? (
            <div className="flex items-center gap-2 px-2 py-1.5 font-sans text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              در حال بارگذاری…
            </div>
          ) : children ? (
            <TreeNodes
              entries={children}
              childrenByPath={childrenByPath}
              loadingPaths={loadingPaths}
              filter={filter}
              changesByPath={changesByPath}
              onRename={onRename}
              onReveal={onReveal}
              onDelete={onDelete}
            />
          ) : null}
        </FileTreeFolder>
      );
    }

    const change = changesByPath.get(entry.path);

    return (
      <FileTreeFile key={entry.path} path={entry.path} name={entry.name}>
        <span className="size-4 shrink-0" />
        <FileTreeIcon>
          <FileIcon className="size-4 text-muted-foreground" />
        </FileTreeIcon>
        <FileTreeName>{entry.name}</FileTreeName>
        {change ? (
          changeHasLineStats(change) ? (
            <span
              dir="ltr"
              className="shrink-0 font-mono text-[10px] text-muted-foreground"
            >
              <span className="text-primary">+{change.additions}</span>{" "}
              <span className="text-destructive">-{change.deletions}</span>
            </span>
          ) : (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              {CHANGE_STATUS_LABELS[change.status]}
            </span>
          )
        ) : null}
        <EntryActions
          entry={entry}
          onRename={onRename}
          onReveal={onReveal}
          onDelete={onDelete}
        />
      </FileTreeFile>
    );
  });
}

const CHANGE_STATUS_LABELS: Record<WorkspaceFileChange["status"], string> = {
  added: "افزوده",
  modified: "ویرایش",
  deleted: "حذف",
  renamed: "تغییر نام",
  untracked: "جدید",
};

function changeHasLineStats(change: WorkspaceFileChange): boolean {
  const category = classifyFile(change.path);
  return category !== "binary" && category !== "image";
}

function ChangedFilesShelf({
  changes,
  onOpenFile,
}: {
  changes: WorkspaceFileChange[];
  onOpenFile: (change: WorkspaceFileChange) => void;
}) {
  const [open, setOpen] = useState(true);
  const totalAdditions = changes.reduce(
    (total, change) => total + change.additions,
    0
  );
  const totalDeletions = changes.reduce(
    (total, change) => total + change.deletions,
    0
  );

  if (changes.length === 0) return null;

  return (
    <div className="shrink-0 px-2 pb-2">
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm"
      >
        <CollapsibleTrigger className="flex h-9 w-full items-center gap-2 px-2.5 text-start outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50">
          <FileDiffIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {changes.length.toLocaleString("fa-IR")} فایل ویرایش‌شده
          </span>
          {totalAdditions > 0 ? (
            <span dir="ltr" className="font-mono text-[10px] text-primary">
              +{totalAdditions}
            </span>
          ) : null}
          {totalDeletions > 0 ? (
            <span
              dir="ltr"
              className="font-mono text-[10px] text-destructive"
            >
              -{totalDeletions}
            </span>
          ) : null}
          {open ? (
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/60">
          <ScrollArea className="max-h-52">
            <ul className="flex flex-col py-1" dir="ltr">
              {changes.map((change) => {
                const lineStats = changeHasLineStats(change);
                const filename = baseName(change.relativePath);
                const directory = parentPath(change.relativePath);
                const isDeleted = change.status === "deleted";

                return (
                  <li key={change.path}>
                    <button
                      type="button"
                      disabled={isDeleted}
                      onClick={() => onOpenFile(change)}
                      className="group flex w-full items-center gap-2 px-2.5 py-1.5 text-left outline-none hover:bg-muted/45 focus-visible:bg-muted/60 disabled:cursor-default disabled:opacity-60"
                    >
                      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate font-mono text-[11px] text-foreground">
                            {filename}
                          </span>
                          {directory !== change.relativePath ? (
                            <span className="truncate font-mono text-[9px] text-muted-foreground">
                              {directory}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {change.agentTouched ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                          ایجنت
                        </Badge>
                      ) : null}
                      {lineStats ? (
                        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                          <span className="text-primary">+{change.additions}</span>
                          <span className="text-destructive">-{change.deletions}</span>
                        </span>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                          {CHANGE_STATUS_LABELS[change.status]}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function WorkspaceFilesPanel({
  workspaceId,
  revealPath,
  onRevealHandled,
}: WorkspaceFilesPanelProps) {
  const { roots, isLoading: rootsLoading } = useWorkspaceRoots(workspaceId);

  const [root, setRoot] = useState<WorkspaceRoot | null>(null);
  const [pickingRoot, setPickingRoot] = useState(false);
  const [childrenByPath, setChildrenByPath] = useState<
    Map<string, WorkspaceFileEntry[]>
  >(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(
    () => new Set()
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [changes, setChanges] = useState<WorkspaceFileChange[]>([]);
  const [dialog, setDialog] = useState<
    | { mode: "new-folder" | "new-file"; value: string }
    | { mode: "rename"; value: string; target: string }
    | null
  >(null);

  const loadGeneration = useRef(0);

  const entryByPath = useMemo(() => {
    const map = new Map<string, WorkspaceFileEntry>();
    for (const entries of childrenByPath.values()) {
      for (const entry of entries) map.set(entry.path, entry);
    }
    return map;
  }, [childrenByPath]);

  const changesByPath = useMemo(
    () => new Map(changes.map((change) => [change.path, change])),
    [changes]
  );

  const loadChanges = useCallback(async () => {
    try {
      const result = await window.desktop.storage.listWorkspaceChanges(workspaceId);
      setChanges(result);
    } catch (changeError) {
      console.error("Failed to load workspace changes:", changeError);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  const load = useCallback(
    async (targetPath: string) => {
      const generation = loadGeneration.current;
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.add(targetPath);
        return next;
      });
      setError(null);
      try {
        const result = await window.desktop.storage.listWorkspaceFiles(
          workspaceId,
          targetPath
        );
        if (generation !== loadGeneration.current) return;
        setChildrenByPath((prev) => {
          const next = new Map(prev);
          next.set(targetPath, result);
          return next;
        });
      } catch (err) {
        if (generation !== loadGeneration.current) return;
        setError(
          err instanceof Error ? err.message : "بارگذاری فایل‌ها ناموفق بود."
        );
        setChildrenByPath((prev) => {
          const next = new Map(prev);
          next.set(targetPath, []);
          return next;
        });
      } finally {
        if (generation === loadGeneration.current) {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(targetPath);
            return next;
          });
        }
      }
    },
    [workspaceId]
  );

  const openRoot = useCallback(
    (selected: WorkspaceRoot) => {
      loadGeneration.current += 1;
      setPickingRoot(false);
      setRoot(selected);
      setChildrenByPath(new Map());
      setLoadingPaths(new Set());
      setExpanded(new Set([selected.path]));
      setSelectedPath(selected.path);
      setPreviewFile(null);
      setFilter("");
      setShowFilter(false);
      setError(null);
      void load(selected.path);
    },
    [load]
  );

  const openFileInPanel = useCallback(
    async (path: string) => {
      const owningRoot =
        roots.find((item) => path.startsWith(item.path)) ?? null;
      if (!owningRoot) {
        toast.error("فایل خارج از پوشه‌های این فضای کاری است.");
        return;
      }

      if (!root || root.id !== owningRoot.id) {
        openRoot(owningRoot);
      }

      const dirs = ancestorDirs(owningRoot.path, parentPath(path));
      await Promise.all(dirs.map((directory) => load(directory)));
      setExpanded((current) => new Set([...current, ...dirs]));
      setSelectedPath(path);
      setPreviewFile(path);
    },
    [load, openRoot, root, roots]
  );

  // Reset when switching workspaces.
  useEffect(() => {
    loadGeneration.current += 1;
    setRoot(null);
    setPickingRoot(false);
    setChildrenByPath(new Map());
    setLoadingPaths(new Set());
    setExpanded(new Set());
    setSelectedPath(null);
    setPreviewFile(null);
    setFilter("");
    setShowFilter(false);
    setError(null);
  }, [workspaceId]);

  // Auto-open the preferred root. New workspaces briefly only have an empty
  // managed root before the linked folder is attached — upgrade when it arrives.
  useEffect(() => {
    if (pickingRoot || rootsLoading || roots.length === 0) return;

    const preferred =
      roots.find((item) => item.isPrimary) ??
      roots.find((item) => item.kind === "linked") ??
      roots.find((item) => item.kind === "managed") ??
      roots[0];
    if (!preferred) return;

    if (!root) {
      openRoot(preferred);
      return;
    }

    // Current root was removed (e.g. unlinked).
    if (!roots.some((item) => item.id === root.id)) {
      openRoot(preferred);
      return;
    }

    // Still on managed while a primary/linked working folder now exists.
    if (
      root.kind === "managed" &&
      preferred.id !== root.id &&
      (preferred.isPrimary || preferred.kind === "linked")
    ) {
      openRoot(preferred);
    }
  }, [pickingRoot, root, roots, rootsLoading, openRoot]);

  // Lazy-load children whenever a folder is expanded.
  useEffect(() => {
    if (!root) return;
    for (const path of expanded) {
      if (!childrenByPath.has(path) && !loadingPaths.has(path)) {
        void load(path);
      }
    }
  }, [root, expanded, childrenByPath, loadingPaths, load]);

  // Live refresh on file changes for already-loaded directories.
  useWorkspaceEvents(workspaceId, (events) => {
    if (
      !hasEventType(
        events,
        "file-created",
        "file-updated",
        "file-deleted",
        "file-moved",
        "root-changed",
        "run-changed"
      )
    ) {
      return;
    }
    for (const path of childrenByPath.keys()) {
      void load(path);
    }
    void loadChanges();
  });

  // Handle a reveal request pointing at an absolute file path.
  useEffect(() => {
    if (!revealPath || roots.length === 0) return;

    let active = true;
    void openFileInPanel(revealPath).finally(() => {
      if (active) onRevealHandled?.();
    });
    return () => {
      active = false;
    };
  }, [onRevealHandled, openFileInPanel, revealPath, roots.length]);

  const targetDirForCreate = useMemo(() => {
    if (!root) return null;
    if (!selectedPath) return root.path;
    if (selectedPath === root.path) return root.path;
    const entry = entryByPath.get(selectedPath);
    if (entry?.kind === "directory") return entry.path;
    return parentPath(selectedPath);
  }, [root, selectedPath, entryByPath]);

  function handleSelect(path: string) {
    setSelectedPath(path);
    if (root && path === root.path) {
      setPreviewFile(null);
      return;
    }
    const entry = entryByPath.get(path);
    if (entry?.kind === "file") {
      setPreviewFile(path);
    } else {
      setPreviewFile(null);
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
      if (previewFile === entry.path) setPreviewFile(null);
      if (selectedPath === entry.path) {
        setSelectedPath(root?.path ?? null);
      }
      const parent = parentPath(entry.path);
      void load(parent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حذف ناموفق بود.");
    }
  }

  async function handleDialogSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const name = dialog.value.trim();
    if (!name) return;
    try {
      if (dialog.mode === "new-folder") {
        if (!targetDirForCreate) return;
        await window.desktop.storage.createWorkspaceDirectory(
          workspaceId,
          joinPath(targetDirForCreate, name)
        );
        toast.success("پوشه ساخته شد.");
        setExpanded((prev) => new Set(prev).add(targetDirForCreate));
        void load(targetDirForCreate);
      } else if (dialog.mode === "new-file") {
        if (!targetDirForCreate) return;
        await window.desktop.storage.createWorkspaceFile(
          workspaceId,
          joinPath(targetDirForCreate, name),
          ""
        );
        toast.success("فایل ساخته شد.");
        setExpanded((prev) => new Set(prev).add(targetDirForCreate));
        void load(targetDirForCreate);
      } else if (dialog.mode === "rename") {
        await window.desktop.storage.renameWorkspaceEntry(
          workspaceId,
          dialog.target,
          joinPath(parentPath(dialog.target), name)
        );
        toast.success("تغییر نام انجام شد.");
        void load(parentPath(dialog.target));
      }
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "عملیات ناموفق بود.");
    }
  }

  function refreshTree() {
    if (!root) return;
    for (const path of childrenByPath.keys()) {
      void load(path);
    }
    if (!childrenByPath.has(root.path)) void load(root.path);
  }

  // --- Render ---

  if (rootsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!root && !pickingRoot) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

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

  if (previewFile) {
    return (
      <div dir="rtl" className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-1.5">
          <Button
            size="icon-xs"
            variant="ghost"
            title="بازگشت به فایل‌ها"
            onClick={() => setPreviewFile(null)}
          >
            <ChevronLeftIcon />
          </Button>
          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            dir="ltr"
            className="min-w-0 flex-1 truncate text-left font-mono text-[11px]"
          >
            {baseName(previewFile)}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            title="باز کردن در سیستم"
            onClick={() => void handleReveal(previewFile)}
          >
            <ExternalLinkIcon />
          </Button>
        </div>
        <FilePreview
          workspaceId={workspaceId}
          path={previewFile}
          className="min-h-0 flex-1"
        />
        <ChangedFilesShelf
          changes={changes}
          onOpenFile={(change) => void openFileInPanel(change.path)}
        />
      </div>
    );
  }

  const rootEntries = childrenByPath.get(root.path);
  const rootLoading = loadingPaths.has(root.path) && !rootEntries;

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border/60 px-1.5">
        {roots.length > 1 ? (
          <Button
            size="icon-sm"
            variant="ghost"
            title="تعویض پوشه"
            onClick={() => {
              setPickingRoot(true);
              setRoot(null);
              setPreviewFile(null);
            }}
          >
            <HardDriveIcon />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 truncate px-1 text-xs font-medium">
          {rootDisplayLabel(root)}
        </div>
        <Button
          size="icon-xs"
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
              <Button size="icon-xs" variant="ghost" title="ساخت">
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
          size="icon-xs"
          variant="ghost"
          title="باز کردن در سیستم"
          onClick={() =>
            void handleReveal(selectedPath ?? targetDirForCreate ?? root.path)
          }
        >
          <ExternalLinkIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          title="بازخوانی"
          onClick={refreshTree}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {showFilter ? (
        <div className="shrink-0 border-b border-border/50 p-1.5">
          <Input
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="فیلتر بر اساس نام…"
            className="h-7 rounded-md border-border/60 bg-muted/30 text-xs"
          />
        </div>
      ) : null}

      {rootLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : !rootEntries || rootEntries.length === 0 ? (
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
        <ScrollArea className="min-h-0 flex-1" dir="ltr">
          <FileTree
            className="border-0 bg-transparent font-sans [&>div]:p-1"
            dir="ltr"
            expanded={expanded}
            onExpandedChange={setExpanded}
            selectedPath={selectedPath ?? undefined}
            onSelect={handleSelect}
          >
            <TreeNodes
              entries={rootEntries}
              childrenByPath={childrenByPath}
              loadingPaths={loadingPaths}
              filter={filter}
              changesByPath={changesByPath}
              onRename={(entry) =>
                setDialog({
                  mode: "rename",
                  value: entry.name,
                  target: entry.path,
                })
              }
              onReveal={(path) => void handleReveal(path)}
              onDelete={(entry) => void handleDelete(entry)}
            />
          </FileTree>
        </ScrollArea>
      )}

      <ChangedFilesShelf
        changes={changes}
        onOpenFile={(change) => void openFileInPanel(change.path)}
      />

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
