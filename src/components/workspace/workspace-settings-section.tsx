"use client";

import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceMcpSettings } from "@/components/workspace/workspace-mcp-settings";
import type {
  LocalWorkspace,
  WorkspaceRoot,
  WorkspaceTrustLevel,
  WorkspaceTrustSettings,
} from "@/lib/workspace";
import { FolderPlusIcon, StarIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

type WorkspaceSettingsSectionProps = {
  workspace: LocalWorkspace;
  roots: WorkspaceRoot[];
  onSaveInstructions: (instructions: string) => void;
  onTrustChange: (trust: WorkspaceTrustSettings) => void;
  onAddLinkedRoot: () => void;
  onRemoveRoot: (rootId: string) => void;
  onSetPrimaryRoot?: (rootId: string) => void;
};

const TRUST_LEVEL_LABELS: Record<WorkspaceTrustLevel, string> = {
  ask: "همیشه بپرس",
  auto_read: "خواندن خودکار",
  auto_write: "نوشتن خودکار",
  auto_shell: "اجرای دستور خودکار",
};

export function WorkspaceSettingsSection({
  workspace,
  roots,
  onSaveInstructions,
  onTrustChange,
  onAddLinkedRoot,
  onRemoveRoot,
  onSetPrimaryRoot,
}: WorkspaceSettingsSectionProps) {
  const [instructions, setInstructions] = useState(workspace.instructions);
  const hasExplicitPrimary = roots.some((root) => root.isPrimary);

  useEffect(() => {
    setInstructions(workspace.instructions);
  }, [workspace.id, workspace.instructions]);

  function handleTrustLevelChange(level: WorkspaceTrustLevel) {
    onTrustChange({ ...workspace.trust, level });
  }

  function handleToggle(key: keyof Omit<WorkspaceTrustSettings, "level">) {
    onTrustChange({ ...workspace.trust, [key]: !workspace.trust[key] });
  }

  return (
    <ScrollArea dir="rtl" className="h-full min-h-0">
      <div className="flex flex-col gap-6 pe-2 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspace-instructions">
              دستورالعمل‌های فضای کاری
            </FieldLabel>
            <Textarea
              id="workspace-instructions"
              rows={5}
              value={instructions}
              maxLength={4000}
              placeholder="مثلاً: همیشه پاسخ‌ها را به فارسی و مختصر بنویس."
              onChange={(event) => setInstructions(event.target.value)}
              onBlur={() => {
                if (instructions !== workspace.instructions) {
                  onSaveInstructions(instructions);
                }
              }}
            />
            <FieldDescription>
              این متن به دستیار در تمام گفتگوهای این فضای کاری داده می‌شود.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldLabel>پوشه‌های پیوندشده</FieldLabel>
            <FieldDescription>
              دستیار فقط می‌تواند به فایل‌های پوشه‌ی مدیریت‌شده و پوشه‌های
              پیوندشده دسترسی داشته باشد. پوشه‌ی «اصلی» محل پیش‌فرض برای مسیرهای
              نسبی و اجرای دستورهاست.
            </FieldDescription>
          </Field>
          <div className="flex flex-col gap-1.5">
            {roots.map((root) => {
              const isImplicitPrimary =
                !hasExplicitPrimary && root.kind === "managed";
              const isPrimary = root.isPrimary || isImplicitPrimary;
              return (
                <div
                  key={root.id}
                  className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">
                        {root.label}
                      </span>
                      {isPrimary ? (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          اصلی
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {root.kind === "managed" ? "مدیریت‌شده" : "پیوندشده"}
                      </span>
                    </div>
                    <span
                      className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                      dir="ltr"
                      title={root.path}
                    >
                      {root.path}
                    </span>
                  </div>
                  {!isPrimary && onSetPrimaryRoot ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="تنظیم به‌عنوان پوشه اصلی"
                      onClick={() => onSetPrimaryRoot(root.id)}
                    >
                      <StarIcon />
                    </Button>
                  ) : null}
                  {root.kind === "linked" ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveRoot(root.id)}
                    >
                      <TrashIcon />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onAddLinkedRoot}
          >
            <FolderPlusIcon />
            افزودن پوشه
          </Button>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspace-trust-level">سطح اعتماد</FieldLabel>
            <NativeSelect
              id="workspace-trust-level"
              value={workspace.trust.level}
              onChange={(event) =>
                handleTrustLevelChange(event.target.value as WorkspaceTrustLevel)
              }
            >
              {Object.entries(TRUST_LEVEL_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              تعیین می‌کند دستیار پیش از اجرای ابزارها چه زمانی نیاز به تأیید
              شما دارد.
            </FieldDescription>
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">تأیید خودکار خواندن</p>
              <p className="text-xs text-muted-foreground">
                خواندن فایل و لیست پوشه بدون تأیید
              </p>
            </div>
            <Switch
              checked={workspace.trust.autoApproveReads}
              onCheckedChange={() => handleToggle("autoApproveReads")}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">تأیید خودکار نوشتن</p>
              <p className="text-xs text-muted-foreground">
                ساخت و ویرایش فایل بدون تأیید
              </p>
            </div>
            <Switch
              checked={workspace.trust.autoApproveWrites}
              onCheckedChange={() => handleToggle("autoApproveWrites")}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">تأیید خودکار دسترسی به وب</p>
              <p className="text-xs text-muted-foreground">
                دریافت صفحه وب و جستجوی اینترنتی بدون تأیید
              </p>
            </div>
            <Switch
              checked={workspace.trust.autoApproveNetwork}
              onCheckedChange={() => handleToggle("autoApproveNetwork")}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">تأیید خودکار اجرای دستور</p>
              <p className="text-xs text-muted-foreground">
                اجرای دستورهای شل بدون تأیید
              </p>
            </div>
            <Switch
              checked={workspace.trust.autoApproveShell}
              onCheckedChange={() => handleToggle("autoApproveShell")}
            />
          </div>
        </FieldGroup>

        <FieldGroup>
          <WorkspaceMcpSettings workspaceId={workspace.id} />
        </FieldGroup>
      </div>
    </ScrollArea>
  );
}
