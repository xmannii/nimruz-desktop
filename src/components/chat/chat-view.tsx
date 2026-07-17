"use client";

import { useAppShell } from "@/components/app-shell-context";
import { OpenRouterApiKeyAlert } from "@/components/openrouter-api-key-alert";
import { ChatSession } from "@/components/chat/chat-session";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { onReveal } from "@/lib/workspace";
import { PanelLeftOpenIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";

const WORKSPACE_PANEL_COLLAPSED_KEY = "nimruz:workspace-panel-collapsed";
/** Below this container width the workspace panel cannot fit alongside chat. */
const WORKSPACE_PANEL_MIN_FIT_WIDTH = 880;

type ChatViewProps = {
  chatId?: string;
  workspaceId?: string;
};

export function ChatView({ chatId, workspaceId }: ChatViewProps) {
  const {
    activeChat,
    activeChatId,
    isHydrated,
    areWorkspacesHydrated,
    areSettingsHydrated,
    workspaces,
    personalization,
    memories,
    experts,
    credentialRefreshSignal,
    stopCurrentChatRef,
    getChatById,
    selectChat,
    updateChat,
    handleMemoriesChange,
    handleExpertsChange,
    updateWorkspace,
    updateWorkspaceTrust,
    addLinkedRoot,
    setPrimaryRoot,
    removeRoot,
  } = useAppShell();

  const resolvedChat = useMemo(() => {
    if (!chatId) return activeChat;
    // State moved ahead of the URL (createChat before navigate finishes).
    if (activeChatId && chatId !== activeChatId && activeChat) {
      return activeChat;
    }
    if (activeChat?.id === chatId) return activeChat;
    return getChatById(chatId);
  }, [activeChat, activeChatId, chatId, getChatById]);

  const panelWorkspaceId = workspaceId ?? resolvedChat?.workspaceId ?? null;
  const panelWorkspace = useMemo(
    () =>
      panelWorkspaceId
        ? workspaces.find((workspace) => workspace.id === panelWorkspaceId) ?? null
        : null,
    [panelWorkspaceId, workspaces]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const canFitPanelRef = useRef(true);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(WORKSPACE_PANEL_COLLAPSED_KEY) === "1";
  });

  const persistCollapsed = useCallback((collapsed: boolean) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORKSPACE_PANEL_COLLAPSED_KEY,
      collapsed ? "1" : "0"
    );
  }, []);

  const collapsePanel = useCallback(() => {
    panelRef.current?.collapse();
  }, []);

  const expandPanel = useCallback(() => {
    panelRef.current?.expand();
  }, []);

  // When the agent creates an artifact (or other reveal), open the side panel.
  useEffect(() => {
    if (!panelWorkspace) return;
    return onReveal((target) => {
      if (target.workspaceId !== panelWorkspace.id) return;
      if (!canFitPanelRef.current) return;
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.isCollapsed()) {
        panel.expand();
        setIsPanelCollapsed(false);
        persistCollapsed(false);
      }
    });
  }, [panelWorkspace, persistCollapsed]);

  const handlePanelResize = useCallback(
    (panelSize: PanelSize) => {
      const collapsed = panelSize.asPercentage < 1;
      setIsPanelCollapsed((previous) => {
        // Only remember the choice when the window can actually fit the panel,
        // so an auto-collapse on a narrow window does not overwrite the pref.
        if (previous !== collapsed && canFitPanelRef.current) {
          persistCollapsed(collapsed);
        }
        return collapsed;
      });
    },
    [persistCollapsed]
  );

  // Apply the saved preference before paint so the panel does not flash open.
  useLayoutEffect(() => {
    if (!panelWorkspace) return;
    const panel = panelRef.current;
    if (!panel) return;
    const prefersCollapsed =
      window.localStorage.getItem(WORKSPACE_PANEL_COLLAPSED_KEY) === "1";
    if (prefersCollapsed) {
      if (!panel.isCollapsed()) panel.collapse();
      return;
    }

    // react-resizable-panels v4 interprets numeric sizes as pixels. Repair an
    // already-mounted panel left at the old 28px default during hot reload.
    if (!panel.isCollapsed() && panel.getSize().inPixels < 200) {
      panel.resize("30");
    }
  }, [panelWorkspace]);

  // Auto-collapse when the window becomes too narrow to hold both panes, and
  // restore the user's preference once there is room again.
  useEffect(() => {
    if (!panelWorkspace) return;
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const fits = width >= WORKSPACE_PANEL_MIN_FIT_WIDTH;
      canFitPanelRef.current = fits;
      const panel = panelRef.current;
      if (!panel) return;
      if (!fits) {
        if (!panel.isCollapsed()) panel.collapse();
      } else if (
        window.localStorage.getItem(WORKSPACE_PANEL_COLLAPSED_KEY) !== "1" &&
        panel.isCollapsed()
      ) {
        panel.expand();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [panelWorkspace]);

  useEffect(() => {
    if (!chatId || !isHydrated) return;
    if (chatId === activeChatId) return;
    if (getChatById(chatId)) {
      selectChat(chatId);
    }
    // Only react to URL changes (browser back/forward). Do not depend on
    // activeChatId — createChat updates state before navigate, and syncing
    // back to the stale URL chat undoes the new draft.
  }, [chatId, isHydrated]);

  const chatSession =
    isHydrated && areWorkspacesHydrated && areSettingsHydrated && resolvedChat ? (
      <ChatSession
        key={resolvedChat.id}
        chat={resolvedChat}
        onChatChange={updateChat}
        stopRef={stopCurrentChatRef}
        personalization={personalization}
        memories={memories}
        experts={experts}
        onMemoriesChange={handleMemoriesChange}
        onExpertsChange={handleExpertsChange}
      />
    ) : (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        در حال بارگذاری گفتگوها…
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {resolvedChat ? (
        <OpenRouterApiKeyAlert
          refreshSignal={credentialRefreshSignal}
          providerId={resolvedChat.providerId}
        />
      ) : null}

      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {panelWorkspace ? (
          <>
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 min-w-0 flex-1 overflow-hidden"
            >
              <ResizablePanel
                id="workspace-chat"
                defaultSize="70"
                minSize="45"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                {chatSession}
              </ResizablePanel>
              <ResizableHandle
                withHandle
                className={isPanelCollapsed ? "hidden" : undefined}
              />
              <ResizablePanel
                id="workspace-tools"
                panelRef={panelRef}
                collapsible
                collapsedSize={0}
                defaultSize="30"
                minSize="20"
                maxSize="45"
                onResize={handlePanelResize}
                className="min-h-0 min-w-0 overflow-hidden"
              >
                <WorkspacePanel
                  workspaceId={panelWorkspace.id}
                  title={panelWorkspace.title}
                  className="h-full"
                  onCollapse={collapsePanel}
                  settings={{
                    workspace: panelWorkspace,
                    onSaveInstructions: (instructions) =>
                      updateWorkspace(panelWorkspace.id, {
                        title: panelWorkspace.title,
                        description: panelWorkspace.description,
                        instructions,
                      }),
                    onTrustChange: (trust) =>
                      void updateWorkspaceTrust(panelWorkspace.id, trust),
                    onAddLinkedRoot: () =>
                      void addLinkedRoot(panelWorkspace.id),
                    onRemoveRoot: (rootId) => void removeRoot(rootId),
                    onSetPrimaryRoot: (rootId) =>
                      void setPrimaryRoot(panelWorkspace.id, rootId),
                  }}
                />
              </ResizablePanel>
            </ResizablePanelGroup>

            {isPanelCollapsed ? (
              <div className="absolute inset-y-0 left-0 z-20 flex items-center">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                          "h-24 w-7 rounded-none rounded-r-xl border border-l-0 border-border/70",
                          "bg-sidebar px-0 text-muted-foreground shadow-sm",
                          "hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                        aria-label="باز کردن پنل فضای کاری"
                        onClick={expandPanel}
                      >
                        <PanelLeftOpenIcon />
                      </Button>
                    }
                  />
                  <TooltipContent side="right">پنل فضای کاری</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </>
        ) : (
          chatSession
        )}
      </div>
    </div>
  );
}
