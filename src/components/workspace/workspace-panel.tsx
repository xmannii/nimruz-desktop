"use client";

import { WorkspaceActivityPanel } from "@/components/workspace/workspace-activity-panel";
import { WorkspaceArtifactsPanel } from "@/components/workspace/workspace-artifacts-panel";
import { WorkspaceFilesPanel } from "@/components/workspace/workspace-files-panel";
import { WorkspaceSettingsSection } from "@/components/workspace/workspace-settings-section";
import { WorkspaceTasksPanel } from "@/components/workspace/workspace-tasks-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspaceRoots } from "@/hooks/use-workspace-roots";
import { useWorkspaceEvents } from "@/hooks/use-workspace-events";
import { onReveal, type RevealTarget } from "@/lib/workspace";
import type {
  LocalWorkspace,
  WorkspaceTrustSettings,
} from "@/lib/workspace";
import {
  ActivityIcon,
  FileTextIcon,
  FolderIcon,
  ListTodoIcon,
  PanelLeftCloseIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";

type WorkspacePanelSection =
  | "files"
  | "artifacts"
  | "tasks"
  | "activity"
  | "settings";

type WorkspacePanelSettingsProps = {
  workspace: LocalWorkspace;
  onSaveInstructions: (instructions: string) => void;
  onTrustChange: (trust: WorkspaceTrustSettings) => void;
  onAddLinkedRoot: () => void;
  onRemoveRoot: (rootId: string) => void;
  onSetPrimaryRoot?: (rootId: string) => void;
};

type WorkspacePanelProps = {
  workspaceId: string;
  title?: string;
  className?: string;
  defaultTab?: WorkspacePanelSection;
  settings?: WorkspacePanelSettingsProps;
  onCollapse?: () => void;
};

type SectionDef = {
  id: WorkspacePanelSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const BASE_SECTIONS: SectionDef[] = [
  { id: "files", label: "فایل‌ها", icon: FolderIcon },
  { id: "artifacts", label: "آرتیفکت‌ها", icon: FileTextIcon },
  { id: "tasks", label: "تسک‌ها", icon: ListTodoIcon },
  { id: "activity", label: "فعالیت", icon: ActivityIcon },
];

const SETTINGS_SECTION: SectionDef = {
  id: "settings",
  label: "تنظیمات",
  icon: SettingsIcon,
};

function activeSectionKey(workspaceId: string): string {
  return `nimruz:workspace-panel-section:${workspaceId}`;
}

export function WorkspacePanel({
  workspaceId,
  title,
  className,
  defaultTab = "files",
  settings,
  onCollapse,
}: WorkspacePanelProps) {
  const sections = settings
    ? [...BASE_SECTIONS, SETTINGS_SECTION]
    : BASE_SECTIONS;

  const [active, setActive] = useState<WorkspacePanelSection>(() => {
    if (typeof window === "undefined") return defaultTab;
    const stored = window.localStorage.getItem(activeSectionKey(workspaceId));
    return (stored as WorkspacePanelSection | null) ?? defaultTab;
  });

  const { roots } = useWorkspaceRoots(settings ? workspaceId : null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [revealArtifactId, setRevealArtifactId] = useState<string | null>(null);
  const [pulseSection, setPulseSection] =
    useState<WorkspacePanelSection | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(activeSectionKey(workspaceId));
    setActive((stored as WorkspacePanelSection | null) ?? defaultTab);
  }, [workspaceId, defaultTab]);

  const selectSection = useCallback(
    (section: WorkspacePanelSection) => {
      setActive(section);
      window.localStorage.setItem(activeSectionKey(workspaceId), section);
    },
    [workspaceId]
  );

  // Pulse a small sync indicator whenever the agent touches the workspace.
  useWorkspaceEvents(workspaceId, () => {
    setIsSyncing(true);
    window.setTimeout(() => setIsSyncing(false), 1200);
  });

  // Guard against a persisted "settings" section when settings are unavailable.
  useEffect(() => {
    if (active === "settings" && !settings) setActive(defaultTab);
  }, [active, settings, defaultTab]);

  // Deep links from chat tool cards switch section and focus the record.
  useEffect(() => {
    return onReveal((target: RevealTarget) => {
      if (target.workspaceId !== workspaceId) return;
      if (target.kind === "file") {
        selectSection("files");
        setRevealPath(target.path);
      } else if (target.kind === "artifact") {
        selectSection("artifacts");
        setRevealArtifactId(target.artifactId || null);
        setPulseSection("artifacts");
        window.setTimeout(() => setPulseSection(null), 900);
      } else if (target.kind === "task") {
        selectSection("tasks");
      } else if (target.kind === "run") {
        selectSection("activity");
      }
    });
  }, [workspaceId, selectSection]);

  return (
    <div
      dir="rtl"
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground",
        "border-r border-sidebar-border",
        className
      )}
    >
      <Tabs
        value={active}
        onValueChange={(value) => {
          if (typeof value === "string") {
            selectSection(value as WorkspacePanelSection);
          }
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <header className="shrink-0 border-b border-sidebar-border/80 bg-sidebar px-3 pt-3 pb-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                فضای کاری
              </p>
              <h2 className="mt-0.5 truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                {title?.trim() || "بدون عنوان"}
              </h2>
            </div>

            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              {isSyncing ? (
                <Badge
                  variant="secondary"
                  className="h-6 gap-1.5 px-2 text-[11px] font-normal"
                >
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-foreground/70"
                  />
                  همگام
                </Badge>
              ) : null}

              {onCollapse ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-sidebar-foreground"
                        aria-label="بستن پنل فضای کاری"
                        onClick={onCollapse}
                      >
                        <PanelLeftCloseIcon />
                      </Button>
                    }
                  />
                  <TooltipContent>بستن پنل</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <TabsList
            variant="default"
            className={cn(
              "no-scrollbar mt-3 h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-xl p-1",
              "bg-muted/70 dark:bg-muted/40"
            )}
          >
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className={cn(
                    "h-8 shrink-0 rounded-lg px-2.5 text-xs",
                    "data-active:shadow-sm",
                    pulseSection === section.id &&
                      "animate-in zoom-in-95 fade-in-0 duration-300 ring-2 ring-sidebar-foreground/25"
                  )}
                >
                  <Icon data-icon="inline-start" />
                  {section.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <TabsContent
            value="files"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
          >
            <WorkspaceFilesPanel
              workspaceId={workspaceId}
              revealPath={revealPath}
              onRevealHandled={() => setRevealPath(null)}
            />
          </TabsContent>

          <TabsContent
            value="artifacts"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
          >
            <WorkspaceArtifactsPanel
              workspaceId={workspaceId}
              revealArtifactId={revealArtifactId}
              onRevealHandled={() => setRevealArtifactId(null)}
            />
          </TabsContent>

          <TabsContent
            value="tasks"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
          >
            <WorkspaceTasksPanel workspaceId={workspaceId} />
          </TabsContent>

          <TabsContent
            value="activity"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
          >
            <WorkspaceActivityPanel workspaceId={workspaceId} />
          </TabsContent>

          {settings ? (
            <TabsContent
              value="settings"
              className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
            >
              <WorkspaceSettingsSection {...settings} roots={roots} />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
