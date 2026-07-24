"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatRenameDialog } from "@/components/chat-rename-dialog";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { SidebarChatRow } from "@/components/chat/sidebar/sidebar-chat-row";
import { SidebarProjectGroup } from "@/components/chat/sidebar/sidebar-project-group";
import { SidebarSection } from "@/components/chat/sidebar/sidebar-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { LocalChat, LocalWorkspace } from "@/lib/chat/storage";
import type { WorkspaceInput } from "@/hooks/use-workspaces";
import { SettingsSidebarNav } from "@/components/settings/settings-nav";
import { ChatSidebarTitle } from "@/components/chat/chat-sidebar-title";
import { useSpeech } from "@/components/speech/speech-provider";
import { HOME_WORKSPACE_ID, isHomeWorkspace } from "@/lib/workspace";
import {
  ArrowRightIcon,
  AudioLinesIcon,
  CogIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";

type AppSidebarProps = {
  chats: LocalChat[];
  runningChatIds: ReadonlySet<string>;
  workspaces: LocalWorkspace[];
  activeChatId: string | null;
  activeWorkspaceId?: string | null;
  onNewChat: () => void;
  onNewWorkspaceChat: (workspaceId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (input: WorkspaceInput) => void;
  onUpdateWorkspace: (id: string, input: WorkspaceInput) => void;
  onDeleteWorkspace: (id: string) => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onDeleteAllChats: () => void;
  onPinChat: (id: string, pinned: boolean) => void;
  typingTitles?: Record<string, string>;
  onOpenSettings: () => void;
  onOpenTranscription: () => void;
  onBackToChat: () => void;
  settingsActive?: boolean;
  transcriptionActive?: boolean;
  memoryCount?: number;
};

export function AppSidebar({
  chats,
  runningChatIds,
  workspaces,
  activeChatId,
  activeWorkspaceId = null,
  onNewChat,
  onNewWorkspaceChat,
  onOpenWorkspace,
  onCreateWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onDeleteAllChats,
  onPinChat,
  typingTitles = {},
  onOpenSettings,
  onOpenTranscription,
  onBackToChat,
  settingsActive = false,
  transcriptionActive = false,
  memoryCount = 0,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { hasBusyItems, isLiveRecording } = useSpeech();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] =
    useState<LocalWorkspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] =
    useState<LocalWorkspace | null>(null);
  const [chatToDelete, setChatToDelete] = useState<LocalChat | null>(null);
  const [chatToRename, setChatToRename] = useState<LocalChat | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const isIconMode = state === "collapsed" && !isMobile;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !settingsActive
      ) {
        event.preventDefault();
        setHistoryOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsActive]);

  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces]
  );
  const workspaceIds = useMemo(
    () => new Set(workspaces.map((workspace) => workspace.id)),
    [workspaces]
  );

  const chatsByWorkspace = useMemo(() => {
    const grouped = new Map<string, LocalChat[]>();

    for (const workspace of workspaces) {
      grouped.set(workspace.id, []);
    }
    for (const chat of chats) {
      const workspaceId =
        chat.workspaceId && workspaceIds.has(chat.workspaceId)
          ? chat.workspaceId
          : HOME_WORKSPACE_ID;
      grouped.get(workspaceId)?.push(chat);
    }

    return grouped;
  }, [chats, workspaceIds, workspaces]);

  const pinnedChats = useMemo(
    () => chats.filter((chat) => chat.pinned),
    [chats]
  );

  const userProjects = useMemo(
    () => workspaces.filter((workspace) => !isHomeWorkspace(workspace)),
    [workspaces]
  );
  const homeWorkspace = useMemo(
    () => workspaces.find((workspace) => isHomeWorkspace(workspace)),
    [workspaces]
  );

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  function handleSelectChat(id: string) {
    onSelectChat(id);
    setHistoryOpen(false);
    closeMobileSidebar();
  }

  function handleNewWorkspaceChat(workspaceId: string) {
    onNewWorkspaceChat(workspaceId);
    closeMobileSidebar();
  }

  function handleOpenWorkspace(workspaceId: string) {
    onOpenWorkspace(workspaceId);
    closeMobileSidebar();
  }

  function openCreateWorkspaceDialog() {
    setEditingWorkspace(null);
    setWorkspaceDialogOpen(true);
  }

  function openEditWorkspaceDialog(workspace: LocalWorkspace) {
    setEditingWorkspace(workspace);
    setWorkspaceDialogOpen(true);
  }

  function handleWorkspaceDialogOpenChange(open: boolean) {
    setWorkspaceDialogOpen(open);
    if (!open) setEditingWorkspace(null);
  }

  function handleWorkspaceSubmit(input: WorkspaceInput) {
    if (editingWorkspace) {
      onUpdateWorkspace(editingWorkspace.id, input);
    } else {
      onCreateWorkspace(input);
    }
  }

  function getWorkspaceLabel(chat: LocalChat): string | undefined {
    const workspaceId =
      chat.workspaceId && workspaceIds.has(chat.workspaceId)
        ? chat.workspaceId
        : HOME_WORKSPACE_ID;
    const workspace = workspaceById.get(workspaceId);
    if (!workspace || isHomeWorkspace(workspace)) return undefined;
    return workspace.title;
  }

  function isProjectNavActive(workspaceId: string): boolean {
    const normalizedActive = activeWorkspaceId ?? HOME_WORKSPACE_ID;
    if (workspaceId !== normalizedActive) return false;
    if (!activeChatId) return true;
    const activeChat = chats.find((chat) => chat.id === activeChatId);
    if (!activeChat) return true;
    const chatWorkspaceId =
      activeChat.workspaceId && workspaceIds.has(activeChat.workspaceId)
        ? activeChat.workspaceId
        : HOME_WORKSPACE_ID;
    return chatWorkspaceId !== workspaceId;
  }

  return (
    <>
      <Sidebar
        side="right"
        collapsible="icon"
        className="!top-[var(--app-header-height)] !bottom-0 !h-auto border-l border-sidebar-border"
      >
        {settingsActive ? null : (
          <SidebarHeader
            dir="rtl"
            className="gap-2 border-b border-sidebar-border px-2.5 pt-3 pb-2.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2"
          >
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={{ children: "گفتگوی جدید", side: "left" }}
                  className="h-9 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  onClick={() => {
                    onNewChat();
                    closeMobileSidebar();
                  }}
                >
                  <SquarePenIcon />
                  <span>گفتگوی جدید</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={{ children: "رونویسی صوت", side: "left" }}
                  isActive={transcriptionActive}
                  className="h-8 text-[13px]"
                  onClick={() => {
                    onOpenTranscription();
                    closeMobileSidebar();
                  }}
                >
                  <AudioLinesIcon />
                  <span className="flex-1 text-start">رونویسی صوت</span>
                  {hasBusyItems || isLiveRecording ? (
                    <LoaderCircleIcon
                      className="animate-spin"
                      aria-label="رونویسی در پس‌زمینه"
                    />
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="mt-2">
                <SidebarMenuButton
                  tooltip={{ children: "جستجوی گفتگوها", side: "left" }}
                  className="h-8 border border-sidebar-border/60 bg-sidebar-accent/30 text-[13px] text-muted-foreground shadow-none hover:bg-sidebar-accent/60"
                  onClick={() => setHistoryOpen(true)}
                >
                  {isIconMode ? <HistoryIcon /> : <SearchIcon />}
                  <span className="flex-1 text-start">
                    {isIconMode ? "تاریخچه" : "جستجوی گفتگوها…"}
                  </span>
                  {!isIconMode ? (
                    <kbd className="pointer-events-none hidden rounded border border-sidebar-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                      ⌘K
                    </kbd>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
        )}

        <SidebarContent dir="rtl" className="gap-0 overflow-hidden">
          {settingsActive ? (
            <SettingsSidebarNav memoryCount={memoryCount} />
          ) : isIconMode ? (
            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
              <SidebarMenu className="gap-1 px-2 py-2">
                {userProjects.map((workspace) => (
                  <SidebarMenuItem key={workspace.id}>
                    <SidebarMenuButton
                      tooltip={{
                        children: workspace.title,
                        side: "left",
                      }}
                      isActive={isProjectNavActive(workspace.id)}
                      className="text-muted-foreground"
                      onClick={() => handleOpenWorkspace(workspace.id)}
                    >
                      <FolderIcon />
                      <span>{workspace.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {homeWorkspace ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={{
                        children: homeWorkspace.title,
                        side: "left",
                      }}
                      isActive={isProjectNavActive(homeWorkspace.id)}
                      onClick={() => handleOpenWorkspace(homeWorkspace.id)}
                    >
                      <FolderIcon />
                      <span>{homeWorkspace.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={{ children: "پروژه جدید", side: "left" }}
                    className="text-muted-foreground"
                    onClick={openCreateWorkspaceDialog}
                  >
                    <PlusIcon />
                    <span>پروژه جدید</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </ScrollArea>
          ) : (
            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
              <div className="pb-3">
                {pinnedChats.length > 0 ? (
                  <SidebarSection
                    title="سنجاق‌شده"
                    count={pinnedChats.length}
                    className="pt-2"
                  >
                    <SidebarMenu className="gap-0.5">
                      {pinnedChats.map((chat) => (
                        <SidebarChatRow
                          key={`pinned-${chat.id}`}
                          chat={chat}
                          isRunning={runningChatIds.has(chat.id)}
                          activeChatId={activeChatId}
                          typingTitles={typingTitles}
                          workspaceLabel={getWorkspaceLabel(chat)}
                          onSelect={handleSelectChat}
                          onRename={setChatToRename}
                          onDelete={setChatToDelete}
                          onPin={(item, pinned) =>
                            onPinChat(item.id, pinned)
                          }
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarSection>
                ) : null}

                {pinnedChats.length > 0 && workspaces.length > 0 ? (
                  <Separator className="mx-3 my-2 bg-sidebar-border/60" />
                ) : null}

                <SidebarSection
                  title="پروژه‌ها"
                  count={workspaces.length}
                  className={pinnedChats.length === 0 ? "pt-2" : undefined}
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      aria-label="ساخت پروژه جدید"
                      title="پروژه جدید"
                      onClick={openCreateWorkspaceDialog}
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                  }
                >
                  {workspaces.length > 0 ? (
                    <SidebarMenu className="gap-0.5">
                      {userProjects.map((workspace) => (
                        <SidebarProjectGroup
                          key={workspace.id}
                          workspace={workspace}
                          chats={chatsByWorkspace.get(workspace.id) ?? []}
                          runningChatIds={runningChatIds}
                          activeChatId={activeChatId}
                          activeWorkspaceId={activeWorkspaceId}
                          typingTitles={typingTitles}
                          onSelectChat={handleSelectChat}
                          onNewChat={handleNewWorkspaceChat}
                          onOpenWorkspace={handleOpenWorkspace}
                          onEditWorkspace={openEditWorkspaceDialog}
                          onDeleteWorkspace={setWorkspaceToDelete}
                          onRenameChat={setChatToRename}
                          onDeleteChat={setChatToDelete}
                          onPinChat={(item, pinned) =>
                            onPinChat(item.id, pinned)
                          }
                        />
                      ))}

                      {homeWorkspace ? (
                        <SidebarProjectGroup
                          workspace={homeWorkspace}
                          chats={chatsByWorkspace.get(homeWorkspace.id) ?? []}
                          runningChatIds={runningChatIds}
                          activeChatId={activeChatId}
                          activeWorkspaceId={activeWorkspaceId}
                          typingTitles={typingTitles}
                          defaultOpen
                          onSelectChat={handleSelectChat}
                          onNewChat={handleNewWorkspaceChat}
                          onOpenWorkspace={handleOpenWorkspace}
                          onEditWorkspace={openEditWorkspaceDialog}
                          onDeleteWorkspace={setWorkspaceToDelete}
                          onRenameChat={setChatToRename}
                          onDeleteChat={setChatToDelete}
                          onPinChat={(item, pinned) =>
                            onPinChat(item.id, pinned)
                          }
                        />
                      ) : null}
                    </SidebarMenu>
                  ) : null}

                  {userProjects.length === 0 ? (
                    <div className="mx-1 rounded-lg border border-dashed border-sidebar-border/80 bg-sidebar-accent/20 px-3 py-4 text-center">
                      <FolderIcon
                        aria-hidden
                        className="mx-auto mb-2 size-5 text-muted-foreground/60"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        پروژه‌ای ندارید.
                        <br />
                        پروژه‌ها گفتگوها و فایل‌های مرتبط را کنار هم نگه
                        می‌دارند.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 h-7 text-xs"
                        onClick={openCreateWorkspaceDialog}
                      >
                        <PlusIcon aria-hidden className="size-3.5" />
                        ساخت پروژه
                      </Button>
                    </div>
                  ) : null}
                </SidebarSection>
              </div>
            </ScrollArea>
          )}
        </SidebarContent>

        <SidebarFooter
          dir="rtl"
          className="gap-0.5 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:p-2"
        >
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              {settingsActive ? (
                <SidebarMenuButton
                  tooltip={{ children: "بازگشت به گفتگو", side: "left" }}
                  className="h-8 text-[13px]"
                  onClick={() => {
                    onBackToChat();
                    closeMobileSidebar();
                  }}
                >
                  <ArrowRightIcon />
                  <span>بازگشت به گفتگو</span>
                  {runningChatIds.size > 0 ? (
                    <LoaderCircleIcon
                      aria-label="پاسخ در حال دریافت است"
                      className="ms-auto size-3.5 animate-spin text-primary group-data-[collapsible=icon]:hidden"
                    />
                  ) : null}
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  tooltip={{ children: "تنظیمات", side: "left" }}
                  className="h-8 text-[13px]"
                  onClick={() => {
                    onOpenSettings();
                    closeMobileSidebar();
                  }}
                >
                  <CogIcon />
                  <span>تنظیمات</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
            {!settingsActive && chats.length > 0 ? (
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton
                        tooltip={{ children: "بیشتر", side: "left" }}
                        className="h-8 text-[13px] text-muted-foreground"
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                    <span>بیشتر</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" dir="rtl">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setDeleteAllOpen(true);
                        closeMobileSidebar();
                      }}
                    >
                      <Trash2Icon />
                      حذف همه گفتگوها
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <CommandDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="جستجوی گفتگوها"
        description="جستجو و انتخاب گفتگو"
      >
        <Command dir="rtl">
          <CommandInput placeholder="جستجوی گفتگو…" />
          <CommandList>
            <CommandEmpty>گفتگویی یافت نشد</CommandEmpty>
            {pinnedChats.length > 0 ? (
              <CommandGroup heading="سنجاق‌شده">
                {pinnedChats.map((chat) => (
                  <CommandItem
                    key={`search-pinned-${chat.id}`}
                    value={`${chat.title} pinned ${getWorkspaceLabel(chat) ?? ""}`}
                    data-checked={
                      chat.id === activeChatId ? true : undefined
                    }
                    onSelect={() => handleSelectChat(chat.id)}
                  >
                    <PinIcon />
                    {runningChatIds.has(chat.id) ? (
                      <LoaderCircleIcon
                        aria-label="پاسخ در حال دریافت است"
                        className="animate-spin text-primary"
                      />
                    ) : null}
                    <ChatSidebarTitle
                      title={chat.title}
                      typingTitle={typingTitles[chat.id]}
                      className="truncate"
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {workspaces.map((workspace) => {
              const workspaceChats = chatsByWorkspace.get(workspace.id) ?? [];
              if (workspaceChats.length === 0) return null;

              return (
                <CommandGroup key={workspace.id} heading={workspace.title}>
                  {workspaceChats.map((chat) => (
                    <CommandItem
                      key={chat.id}
                      value={`${chat.title} ${workspace.title} ${workspace.description}`}
                      data-checked={
                        chat.id === activeChatId ? true : undefined
                      }
                      onSelect={() => handleSelectChat(chat.id)}
                    >
                      {chat.pinned ? (
                        <PinIcon />
                      ) : runningChatIds.has(chat.id) ? (
                        <LoaderCircleIcon
                          aria-label="پاسخ در حال دریافت است"
                          className="animate-spin text-primary"
                        />
                      ) : isHomeWorkspace(workspace) ? (
                        <HomeIcon />
                      ) : (
                        <FolderIcon />
                      )}
                      <ChatSidebarTitle
                        title={chat.title}
                        typingTitle={typingTitles[chat.id]}
                        className="truncate"
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>

      {workspaceDialogOpen ? (
        <WorkspaceDialog
          open
          onOpenChange={handleWorkspaceDialogOpenChange}
          workspace={editingWorkspace}
          onSubmit={handleWorkspaceSubmit}
        />
      ) : null}

      {chatToRename ? (
        <ChatRenameDialog
          key={chatToRename.id}
          open
          chat={chatToRename}
          onOpenChange={(open) => {
            if (!open) setChatToRename(null);
          }}
          onSubmit={(title) => onRenameChat(chatToRename.id, title)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(chatToDelete)}
        onOpenChange={(open) => {
          if (!open) setChatToDelete(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف گفتگو؟</AlertDialogTitle>
            <AlertDialogDescription>
              گفتگو «{chatToDelete?.title}» برای همیشه حذف می‌شود و قابل
              بازیابی نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (chatToDelete) {
                  onDeleteChat(chatToDelete.id);
                  setChatToDelete(null);
                }
              }}
            >
              حذف گفتگو
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف همه گفتگوها؟</AlertDialogTitle>
            <AlertDialogDescription>
              {chats.length} گفتگو برای همیشه حذف می‌شود و قابل بازیابی نیست.
              یک گفتگوی خالی جدید باز می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDeleteAllChats();
                setDeleteAllOpen(false);
              }}
            >
              حذف همه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(workspaceToDelete)}
        onOpenChange={(open) => {
          if (!open) setWorkspaceToDelete(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف پروژه؟</AlertDialogTitle>
            <AlertDialogDescription>
              پروژه «{workspaceToDelete?.title}» حذف می‌شود؛ گفتگوهای آن به
              خانه منتقل می‌شوند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (workspaceToDelete) {
                  onDeleteWorkspace(workspaceToDelete.id);
                  setWorkspaceToDelete(null);
                }
              }}
            >
              حذف پروژه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
