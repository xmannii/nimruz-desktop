"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  MCP_SERVER_LIMITS,
  type McpServerConfig,
  type McpServerState,
  type McpTransportKind,
} from "@/lib/workspace";
import {
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type McpDraft = {
  name: string;
  transport: McpTransportKind;
  command: string;
  argsText: string;
  url: string;
};

const EMPTY_DRAFT: McpDraft = {
  name: "",
  transport: "stdio",
  command: "",
  argsText: "",
  url: "",
};

const TRANSPORT_LABELS: Record<McpTransportKind, string> = {
  stdio: "محلی (stdio)",
  http: "HTTP",
  sse: "SSE",
};

function serverDraft(server: McpServerConfig): McpDraft {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command ?? "",
    argsText: (server.args ?? []).join("\n"),
    url: server.url ?? "",
  };
}

function connectionDetail(server: McpServerConfig) {
  return server.transport === "stdio"
    ? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")
    : server.url ?? "";
}

/**
 * Manage one workspace's MCP integrations. Connection tests happen in the
 * Electron main process, so the renderer never spawns processes or connects
 * directly to arbitrary endpoints.
 */
export function WorkspaceMcpSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [states, setStates] = useState<Record<string, McpServerState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [draft, setDraft] = useState<McpDraft>(EMPTY_DRAFT);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.desktop.storage
      .listMcpServers(workspaceId)
      .then((items) => {
        if (!cancelled) setServers(items);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "بارگذاری سرورهای MCP ناموفق بود"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  function openEdit(server: McpServerConfig) {
    setEditing(server);
    setDraft(serverDraft(server));
    setDialogOpen(true);
  }

  function buildConfig(existing?: McpServerConfig): McpServerConfig {
    const now = Date.now();
    const common = {
      id: existing?.id ?? nanoid(),
      workspaceId,
      name: draft.name,
      transport: draft.transport,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return draft.transport === "stdio"
      ? {
          ...common,
          command: draft.command,
          args: draft.argsText.split(/\r?\n/).filter((arg) => arg.length > 0),
        }
      : { ...common, url: draft.url };
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const saved = await window.desktop.storage.saveMcpServer(
        buildConfig(editing ?? undefined)
      );
      setServers((current) => {
        const index = current.findIndex((item) => item.id === saved.id);
        if (index < 0) return [...current, saved];
        const next = [...current];
        next[index] = saved;
        return next;
      });
      setStates((current) => {
        const next = { ...current };
        delete next[saved.id];
        return next;
      });
      setDialogOpen(false);
      toast.success(editing ? "سرور MCP به‌روزرسانی شد" : "سرور MCP افزوده شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیرهٔ سرور MCP ناموفق بود"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleServer(server: McpServerConfig, enabled: boolean) {
    try {
      const saved = await window.desktop.storage.saveMcpServer({
        ...server,
        enabled,
        updatedAt: Date.now(),
      });
      setServers((current) =>
        current.map((item) => (item.id === saved.id ? saved : item))
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تغییر وضعیت MCP ناموفق بود"
      );
    }
  }

  async function testServer(server: McpServerConfig) {
    setTestingId(server.id);
    setStates((current) => ({
      ...current,
      [server.id]: {
        serverId: server.id,
        status: "connecting",
        toolNames: [],
      },
    }));
    try {
      const state = await window.desktop.storage.testMcpServer(server);
      setStates((current) => ({ ...current, [server.id]: state }));
      if (state.status === "connected") {
        toast.success(
          `${state.toolNames.length.toLocaleString("fa-IR")} ابزار MCP پیدا شد`
        );
      } else {
        toast.error(state.error ?? "اتصال MCP ناموفق بود");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "اتصال MCP ناموفق بود";
      setStates((current) => ({
        ...current,
        [server.id]: {
          serverId: server.id,
          status: "error",
          error: message,
          toolNames: [],
        },
      }));
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  }

  async function removeServer() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await window.desktop.storage.deleteMcpServer(workspaceId, target.id);
      setServers((current) =>
        current.filter((server) => server.id !== target.id)
      );
      setDeleteTarget(null);
      toast.success("سرور MCP حذف شد");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "حذف سرور MCP ناموفق بود"
      );
    }
  }

  const canSave =
    draft.name.trim().length > 0 &&
    (draft.transport === "stdio"
      ? draft.command.trim().length > 0
      : draft.url.trim().length > 0);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">سرورهای MCP</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              ابزارهای محلی یا راه‌دور را به عامل این فضای کاری وصل کنید. هر
              فراخوانی ابزار MCP جداگانه نیاز به تأیید دارد.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              loading ||
              servers.length >= MCP_SERVER_LIMITS.maxServersPerWorkspace
            }
            onClick={openCreate}
          >
            <PlusIcon data-icon="inline-start" />
            افزودن
          </Button>
        </div>

        <p className="rounded-lg bg-muted/45 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          این نسخه عمداً فقط اتصال‌های بدون رمز را پشتیبانی می‌کند؛ کلیدها و
          headerهای احراز هویت تا اضافه‌شدن ذخیره‌سازی امن پذیرفته نمی‌شوند.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Spinner />
            در حال بارگذاری…
          </div>
        ) : servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
            هنوز سرور MCP برای این فضای کاری ثبت نشده است.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {servers.map((server) => {
              const state = states[server.id];
              return (
                <div
                  key={server.id}
                  className="rounded-xl border border-border/60 bg-muted/15 p-3"
                >
                  <div className="flex items-start gap-2">
                    <ServerIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-xs font-medium">
                          {server.name}
                        </p>
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          {TRANSPORT_LABELS[server.transport]}
                        </Badge>
                        {state?.status === "connected" ? (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            متصل ·{" "}
                            {state.toolNames.length.toLocaleString("fa-IR")} ابزار
                          </Badge>
                        ) : null}
                      </div>
                      <p
                        dir="ltr"
                        title={connectionDetail(server)}
                        className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                      >
                        {connectionDetail(server)}
                      </p>
                      {state?.status === "error" ? (
                        <p className="mt-1 text-[11px] text-destructive">
                          {state.error}
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={server.enabled}
                      aria-label={`فعال‌سازی ${server.name}`}
                      onCheckedChange={(enabled) =>
                        void toggleServer(server, enabled)
                      }
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={testingId !== null}
                      onClick={() => void testServer(server)}
                    >
                      {testingId === server.id ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RefreshCwIcon data-icon="inline-start" />
                      )}
                      آزمایش اتصال
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`ویرایش ${server.name}`}
                      onClick={() => openEdit(server)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`حذف ${server.name}`}
                      onClick={() => setDeleteTarget(server)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "ویرایش سرور MCP" : "افزودن سرور MCP"}
            </DialogTitle>
            <DialogDescription>
              اتصال در فرایند اصلی نیمروز ساخته می‌شود و ابزارها فقط در همین
              فضای کاری در دسترس‌اند.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              نام
              <Input
                value={draft.name}
                maxLength={MCP_SERVER_LIMITS.name}
                placeholder="مثلاً ابزارهای پروژه"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              نوع اتصال
              <NativeSelect
                className="w-full"
                value={draft.transport}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    transport: event.target.value as McpTransportKind,
                  }))
                }
              >
                <NativeSelectOption value="stdio">
                  محلی (stdio)
                </NativeSelectOption>
                <NativeSelectOption value="http">
                  HTTP streamable
                </NativeSelectOption>
                <NativeSelectOption value="sse">SSE</NativeSelectOption>
              </NativeSelect>
            </label>

            {draft.transport === "stdio" ? (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  فرمان اجرایی
                  <Input
                    dir="ltr"
                    value={draft.command}
                    maxLength={MCP_SERVER_LIMITS.command}
                    placeholder="node یا مسیر کامل فایل اجرایی"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        command: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  آرگومان‌ها
                  <Textarea
                    dir="ltr"
                    rows={4}
                    value={draft.argsText}
                    placeholder={"server.mjs\n--mode\nreadonly"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        argsText: event.target.value,
                      }))
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">
                    هر آرگومان را در یک خط بنویسید؛ فرمان از shell عبور نمی‌کند.
                  </span>
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm">
                نشانی سرور
                <Input
                  dir="ltr"
                  type="url"
                  value={draft.url}
                  maxLength={MCP_SERVER_LIMITS.url}
                  placeholder={
                    draft.transport === "http"
                      ? "https://example.com/mcp"
                      : "https://example.com/sse"
                  }
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
              </label>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void saveDraft()}
            >
              {saving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlugZapIcon data-icon="inline-start" />
              )}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              سرور «{deleteTarget?.name ?? "MCP"}» حذف شود؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              پیکربندی از این فضای کاری حذف می‌شود. برنامه یا سرویس خارجی پاک
              نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void removeServer();
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
