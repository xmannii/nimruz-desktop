"use client";

import { useAppShell } from "@/components/app-shell-context";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/workspace/$workspaceId/")({
  component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const {
    workspaces,
    chats,
    areWorkspacesHydrated,
    createChat,
    updateWorkspace,
    updateWorkspaceTrust,
    addLinkedRoot,
    setPrimaryRoot,
    removeRoot,
  } = useAppShell();

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  );

  const workspaceChats = useMemo(
    () => chats.filter((chat) => chat.workspaceId === workspaceId),
    [chats, workspaceId]
  );

  function handleNewChat() {
    const chatId = createChat(workspaceId);
    void navigate({
      to: "/workspace/$workspaceId/chat/$chatId",
      params: { workspaceId, chatId },
    });
  }

  function handleSelectChat(chatId: string) {
    void navigate({
      to: "/workspace/$workspaceId/chat/$chatId",
      params: { workspaceId, chatId },
    });
  }

  if (!areWorkspacesHydrated) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        در حال بارگذاری فضای کاری…
      </div>
    );
  }

  if (!workspace) {
    return (
      <div dir="rtl" className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        فضای کاری یافت نشد.
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-1 gap-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {workspace.title}
            </h1>
            {workspace.description ? (
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {workspace.description}
              </p>
            ) : null}
          </div>
          <Button onClick={handleNewChat}>
            <PlusIcon />
            گفتگوی جدید
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground/80">
            گفتگوهای این فضای کاری
          </p>
          {workspaceChats.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              هنوز گفتگویی در این فضای کاری شروع نشده است.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {workspaceChats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectChat(chat.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-border/50 px-3 py-2 text-right text-sm hover:bg-muted/40"
                  >
                    <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <WorkspacePanel
        workspaceId={workspace.id}
        className="w-[380px] shrink-0"
        defaultTab="settings"
        settings={{
          workspace,
          onSaveInstructions: (instructions) =>
            updateWorkspace(workspace.id, {
              title: workspace.title,
              description: workspace.description,
              instructions,
            }),
          onTrustChange: (trust) => void updateWorkspaceTrust(workspace.id, trust),
          onAddLinkedRoot: () => void addLinkedRoot(workspace.id),
          onRemoveRoot: (rootId) => void removeRoot(rootId),
          onSetPrimaryRoot: (rootId) =>
            void setPrimaryRoot(workspace.id, rootId),
        }}
      />
    </div>
  );
}
