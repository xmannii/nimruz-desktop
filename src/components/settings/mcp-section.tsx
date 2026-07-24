"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceMcpSettings } from "@/components/workspace/workspace-mcp-settings";
import { ServerOffIcon, WaypointsIcon } from "lucide-react";
import { useState } from "react";

export function McpSettingsSection() {
  const {
    workspaces,
    activeWorkspaceId,
    areWorkspacesHydrated,
  } = useAppShell();
  const [selectedWorkspaceOverride, setSelectedWorkspaceOverride] = useState<
    string | null
  >(null);

  const selectedWorkspace =
    workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceOverride
    ) ??
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0] ??
    null;

  return (
    <SettingsSection
      title="سرورهای MCP"
      description="ابزارهای محلی یا راه‌دور را به ایجنت یک فضای کاری وصل کنید. هر فراخوانی ابزار MCP جداگانه نیاز به تأیید دارد."
      icon={WaypointsIcon}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="mcp-workspace">فضای کاری</FieldLabel>
          <NativeSelect
            id="mcp-workspace"
            className="w-full"
            value={selectedWorkspace?.id ?? ""}
            disabled={!areWorkspacesHydrated || workspaces.length === 0}
            onChange={(event) =>
              setSelectedWorkspaceOverride(event.target.value)
            }
          >
            {workspaces.map((workspace) => (
              <NativeSelectOption key={workspace.id} value={workspace.id}>
                {workspace.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            سرورها و ابزارهای هر فضای کاری مستقل‌اند. تغییر این انتخاب، فضای
            کاری فعال برنامه را عوض نمی‌کند.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {!areWorkspacesHydrated ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner />
          در حال بارگذاری فضاهای کاری…
        </div>
      ) : selectedWorkspace ? (
        <WorkspaceMcpSettings
          key={selectedWorkspace.id}
          workspaceId={selectedWorkspace.id}
          showHeading={false}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ServerOffIcon />
            </EmptyMedia>
            <EmptyTitle>فضای کاری در دسترس نیست</EmptyTitle>
            <EmptyDescription>
              ابتدا یک فضای کاری بسازید، سپس سرور MCP آن را در اینجا تنظیم کنید.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </SettingsSection>
  );
}
