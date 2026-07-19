"use client";

import { WorkspaceActivityPanel } from "@/components/workspace/workspace-activity-panel";
import { WorkspaceArtifactsPanel } from "@/components/workspace/workspace-artifacts-panel";
import { WorkspaceFilesPanel } from "@/components/workspace/workspace-files-panel";
import { WorkspaceSettingsSection } from "@/components/workspace/workspace-settings-section";
import { WorkspacePlansPanel } from "@/components/workspace/workspace-plans-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  CheckIcon,
  ChevronDownIcon,
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
  | "plan"
  | "activity"
  | "settings";

function normalizePanelSection(
  value: string | null,
  fallback: WorkspacePanelSection
): WorkspacePanelSection {
  if (value === "tasks") return "plan";
  if (
    value === "files" ||
    value === "artifacts" ||
    value === "plan" ||
    value === "activity" ||
    value === "settings"
  ) {
    return value;
  }
  return fallback;
}

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
  { id: "plan", label: "پلن", icon: ListTodoIcon },
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
    return normalizePanelSection(stored, defaultTab);
  });

  const { roots } = useWorkspaceRoots(settings ? workspaceId : null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [revealArtifactId, setRevealArtifactId] = useState<string | null>(null);
  const [revealPlanId, setRevealPlanId] = useState<string | null>(null);
  const [pulseSection, setPulseSection] =
    useState<WorkspacePanelSection | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(activeSectionKey(workspaceId));
    setActive(normalizePanelSection(stored, defaultTab));
  }, [workspaceId, defaultTab]);

  const selectSection = useCallback(
    (section: WorkspacePanelSection) => {
      setActive(section);
      window.localStorage.setItem(activeSectionKey(workspaceId), section);
    },
    [workspaceId]
  );

  useWorkspaceEvents(workspaceId, () => {
    setIsSyncing(true);
    window.setTimeout(() => setIsSyncing(false), 1200);
  });

  useEffect(() => {
    if (active === "settings" && !settings) setActive(defaultTab);
  }, [active, settings, defaultTab]);

  useEffect(() => {
    return onReveal((target: RevealTarget) => {
      if (target.workspaceId !== workspaceId) return;
      if (target.kind === "file") {
        selectSection("files");
        setRevealPath(target.path);
        setPulseSection("files");
        window.setTimeout(() => setPulseSection(null), 900);
      } else if (target.kind === "artifact") {
        selectSection("artifacts");
        setRevealArtifactId(target.artifactId || null);
        setPulseSection("artifacts");
        window.setTimeout(() => setPulseSection(null), 900);
      } else if (target.kind === "task" || target.kind === "plan") {
        selectSection("plan");
        if (target.kind === "plan") {
          setRevealPlanId(target.planId || null);
        }
        setPulseSection("plan");
        window.setTimeout(() => setPulseSection(null), 900);
      } else if (target.kind === "run") {
        selectSection("activity");
        setPulseSection("activity");
        window.setTimeout(() => setPulseSection(null), 900);
      }
    });
  }, [workspaceId, selectSection]);

  const activeSection =
    sections.find((section) => section.id === active) ?? sections[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div
      dir="rtl"
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground",
        "border-r border-sidebar-border",
        className
      )}
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

        <div className="mt-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-xl bg-muted/70 px-2.5 text-start transition-colors",
                    "hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/60",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    pulseSection === active &&
                      "animate-in zoom-in-95 fade-in-0 duration-300 ring-2 ring-sidebar-foreground/25"
                  )}
                  aria-label={`نمای فعلی: ${activeSection.label}. برای تعویض کلیک کنید`}
                >
                  <ActiveIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {activeSection.label}
                  </span>
                  <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="start" dir="rtl" className="min-w-44">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === active;
                return (
                  <DropdownMenuItem
                    key={section.id}
                    onClick={() => selectSection(section.id)}
                    className="gap-2"
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{section.label}</span>
                    {isActive ? (
                      <CheckIcon className="size-3.5 text-muted-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          active === "artifacts" ? "p-0" : "p-2.5"
        )}
      >
        {active === "files" ? (
          <WorkspaceFilesPanel
            key={workspaceId}
            workspaceId={workspaceId}
            revealPath={revealPath}
            onRevealHandled={() => setRevealPath(null)}
          />
        ) : null}

        {active === "artifacts" ? (
          <WorkspaceArtifactsPanel
            workspaceId={workspaceId}
            revealArtifactId={revealArtifactId}
            onRevealHandled={() => setRevealArtifactId(null)}
          />
        ) : null}

        {active === "plan" ? (
          <WorkspacePlansPanel
            workspaceId={workspaceId}
            revealPlanId={revealPlanId}
            onRevealHandled={() => setRevealPlanId(null)}
          />
        ) : null}

        {active === "activity" ? (
          <WorkspaceActivityPanel workspaceId={workspaceId} />
        ) : null}

        {active === "settings" && settings ? (
          <WorkspaceSettingsSection {...settings} roots={roots} />
        ) : null}
      </div>
    </div>
  );
}
