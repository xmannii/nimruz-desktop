"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroupButton } from "@/components/ui/input-group";
import type { AgentMode } from "@/lib/chat/agent-mode";
import type { Expert } from "@/lib/settings/experts";
import type { SkillSummary } from "@/lib/skills";
import type { McpServerConfig } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  CheckIcon,
  FileUpIcon,
  ImageOffIcon,
  PlusIcon,
  ServerIcon,
  SparklesIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export type ComposerAddMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  mobile?: boolean;
  workspaceId?: string | null;
  agentMode: AgentMode;
  isCodexProvider: boolean;
  supportsImages: boolean;
  supportsTools: boolean;
  canImportFiles: boolean;
  fileUnavailableReason: string;
  experts: Expert[];
  selectedExpertSlug: string | null;
  onSelectExpert: (expert: Expert) => void;
  onAttachFiles: () => void;
  onInsertSkill: (skill: SkillSummary) => void;
  mcpServerIds?: string[];
  onMcpServerIdsChange: (ids: string[] | undefined) => void;
};

function MenuRow({
  icon: Icon,
  title,
  description,
  active = false,
  muted = false,
  trailing,
}: {
  icon: typeof FileUpIcon;
  title: string;
  description?: string;
  active?: boolean;
  muted?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
          active
            ? "border-primary/20 bg-primary/10 text-primary"
            : "border-transparent bg-muted text-muted-foreground group-data-selected/command-item:bg-background",
          muted && "opacity-60"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing}
    </>
  );
}

const panelItemClassName = "gap-2.5 rounded-lg px-2 py-1.5";
const panelGroupClassName =
  "px-1 pb-1 pt-0 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground/70";

export function ComposerAddMenuTrigger({
  open,
  onOpenChange,
  disabled = false,
  mobile = false,
}: Pick<ComposerAddMenuProps, "open" | "onOpenChange" | "disabled" | "mobile">) {
  return (
    <InputGroupButton
      size="icon-sm"
      type="button"
      variant="secondary"
      className={cn(
        mobile && "size-10 shrink-0 rounded-full",
        open && "bg-muted"
      )}
      aria-label="افزودن به پیام"
      aria-expanded={open}
      title="افزودن فایل، MCP، مهارت یا متخصص"
      disabled={disabled}
      onClick={() => onOpenChange(!open)}
    >
      <PlusIcon />
    </InputGroupButton>
  );
}

export function ComposerAddMenuPanel({
  open,
  onOpenChange,
  placement = "bottom",
  workspaceId,
  agentMode,
  isCodexProvider,
  supportsImages,
  supportsTools,
  canImportFiles,
  fileUnavailableReason,
  experts,
  selectedExpertSlug,
  onSelectExpert,
  onAttachFiles,
  onInsertSkill,
  mcpServerIds,
  onMcpServerIdsChange,
}: Omit<ComposerAddMenuProps, "disabled" | "mobile"> & {
  placement?: "top" | "bottom";
}) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const agentFeaturesAvailable =
    agentMode === "general" && !isCodexProvider && supportsTools;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    const skillsRequest = window.desktop.skills.list();
    const serversRequest = workspaceId
      ? window.desktop.storage.listMcpServers(workspaceId)
      : Promise.resolve([]);

    void Promise.allSettled([skillsRequest, serversRequest])
      .then(([skillsResult, serversResult]) => {
        if (cancelled) return;
        setSkills(
          skillsResult.status === "fulfilled"
            ? skillsResult.value.filter((skill) => skill.enabled)
            : []
        );
        setServers(
          serversResult.status === "fulfilled" ? serversResult.value : []
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  function close() {
    onOpenChange(false);
  }

  function toggleServer(server: McpServerConfig) {
    if (!server.enabled || !agentFeaturesAvailable) return;
    const enabledIds = servers
      .filter((item) => item.enabled)
      .map((item) => item.id);
    const selected = new Set(mcpServerIds ?? enabledIds);
    if (selected.has(server.id)) selected.delete(server.id);
    else selected.add(server.id);
    onMcpServerIdsChange([...selected]);
  }

  const enabledExperts = experts.filter((expert) => expert.enabled);

  if (!open) return null;

  const openUpward = placement === "top";
  const searchBlock = (
    <div
      className={cn(
        "px-1.5 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=command-input-wrapper]_div]:h-9 [&_[data-slot=command-input-wrapper]_div]:rounded-lg [&_[data-slot=command-input-wrapper]_div]:border-0 [&_[data-slot=command-input-wrapper]_div]:bg-muted/50",
        openUpward
          ? "border-t border-border/50 pb-1.5 pt-1"
          : "border-b border-border/50 pb-1 pt-1.5"
      )}
    >
      <CommandInput placeholder="جست‌وجو…" className="text-[13px]" />
    </div>
  );

  return (
    <div
      dir="rtl"
      className={cn(
        "z-40 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl",
        openUpward ? "absolute inset-x-0 bottom-full mb-2" : "mt-2"
      )}
    >
      <Command className="flex flex-col rounded-2xl bg-transparent p-0" loop>
        {openUpward ? null : searchBlock}

        <CommandList className="max-h-64 scroll-py-1 p-1">
          <CommandEmpty className="py-6 text-center text-[13px] text-muted-foreground">
            {loading ? "در حال بارگذاری…" : "موردی پیدا نشد."}
          </CommandEmpty>

          <CommandGroup heading="افزودن" className={panelGroupClassName}>
            <CommandItem
              value="upload file image document فایل تصویر سند"
              disabled={!canImportFiles}
              className={panelItemClassName}
              onSelect={() => {
                if (!canImportFiles) return;
                close();
                onAttachFiles();
              }}
            >
              <MenuRow
                icon={FileUpIcon}
                title="افزودن فایل"
                description={
                  canImportFiles
                    ? supportsImages
                      ? "سند یا تصویر"
                      : "فقط سند"
                    : fileUnavailableReason
                }
                muted={!canImportFiles}
                trailing={
                  !supportsImages ? (
                    <ImageOffIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  ) : undefined
                }
              />
            </CommandItem>
          </CommandGroup>

          {servers.length > 0 ? (
            <CommandGroup heading="MCP" className={panelGroupClassName}>
              {servers.map((server) => {
                const checked =
                  server.enabled &&
                  (mcpServerIds === undefined ||
                    mcpServerIds.includes(server.id));
                const unavailable = !server.enabled || !agentFeaturesAvailable;
                const description = !server.enabled
                  ? "غیرفعال در فضای کاری"
                  : !agentFeaturesAvailable
                    ? "فقط حالت ایجنت"
                    : server.transport === "stdio"
                      ? "محلی"
                      : server.transport.toUpperCase();
                return (
                  <CommandItem
                    key={server.id}
                    value={`${server.name} ${server.transport} MCP`}
                    data-checked={checked}
                    disabled={unavailable}
                    className={panelItemClassName}
                    onSelect={() => toggleServer(server)}
                  >
                    <MenuRow
                      icon={ServerIcon}
                      title={server.name}
                      description={description}
                      active={checked}
                      muted={unavailable}
                      trailing={
                        checked ? (
                          <CheckIcon className="size-4 shrink-0 text-primary" />
                        ) : undefined
                      }
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {skills.length > 0 ? (
            <CommandGroup heading="مهارت‌ها" className={panelGroupClassName}>
              {skills.map((skill) => (
                <CommandItem
                  key={skill.name}
                  value={`${skill.name} ${skill.description} مهارت skill`}
                  disabled={!agentFeaturesAvailable}
                  className={panelItemClassName}
                  onSelect={() => {
                    if (!agentFeaturesAvailable) return;
                    close();
                    onInsertSkill(skill);
                  }}
                >
                  <MenuRow
                    icon={SparklesIcon}
                    title={skill.name}
                    description={
                      agentFeaturesAvailable ? skill.description : "فقط حالت ایجنت"
                    }
                    muted={!agentFeaturesAvailable}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {enabledExperts.length > 0 ? (
            <CommandGroup heading="متخصص‌ها" className={panelGroupClassName}>
              {enabledExperts.map((expert) => {
                const selected = selectedExpertSlug === expert.slug;
                return (
                  <CommandItem
                    key={expert.id}
                    value={`${expert.name} ${expert.slug} ${expert.description} متخصص expert`}
                    data-checked={selected}
                    disabled={!agentFeaturesAvailable}
                    className={panelItemClassName}
                    onSelect={() => {
                      if (!agentFeaturesAvailable) return;
                      close();
                      onSelectExpert(expert);
                    }}
                  >
                    <MenuRow
                      icon={BotIcon}
                      title={expert.name}
                      description={
                        agentFeaturesAvailable
                          ? expert.description
                          : "فقط حالت ایجنت"
                      }
                      active={selected}
                      muted={!agentFeaturesAvailable}
                      trailing={
                        selected ? (
                          <CheckIcon className="size-4 shrink-0 text-primary" />
                        ) : undefined
                      }
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
        </CommandList>

        {openUpward ? searchBlock : null}
      </Command>
    </div>
  );
}
