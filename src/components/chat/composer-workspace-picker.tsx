"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalWorkspace } from "@/lib/chat/storage";
import { isHomeWorkspace } from "@/lib/workspace";
import { CheckIcon, ChevronDownIcon, FolderIcon, HomeIcon } from "lucide-react";

type ComposerWorkspacePickerProps = {
  workspaces: LocalWorkspace[];
  workspaceId: string | null;
  onWorkspaceChange: (workspaceId: string) => void;
  disabled?: boolean;
};

export function ComposerWorkspacePicker({
  workspaces,
  workspaceId,
  onWorkspaceChange,
  disabled = false,
}: ComposerWorkspacePickerProps) {
  const selected =
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    workspaces.find((workspace) => isHomeWorkspace(workspace)) ??
    null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-8 max-w-full gap-1.5 rounded-full border-border/60 bg-background/80 px-3 text-xs font-medium shadow-none"
            aria-label="انتخاب پروژه"
          >
            {selected && isHomeWorkspace(selected) ? (
              <HomeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{selected?.title ?? "انتخاب پروژه"}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" dir="rtl" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>پروژه این گفتگو</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((workspace) => {
            const active = workspace.id === selected?.id;
            return (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => onWorkspaceChange(workspace.id)}
              >
                {isHomeWorkspace(workspace) ? (
                  <HomeIcon />
                ) : (
                  <FolderIcon />
                )}
                <span className="min-w-0 flex-1 truncate">{workspace.title}</span>
                {active ? <CheckIcon className="size-3.5 opacity-70" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
