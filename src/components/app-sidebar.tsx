"use client";

import { useMemo, useState } from "react";
import { ChatRenameDialog } from "@/components/chat-rename-dialog";
import { WorkspaceDialog } from "@/components/workspace-dialog";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { LocalChat, LocalWorkspace } from "@/lib/chat/storage";
import { exportChatJson, exportChatMarkdown } from "@/lib/chat/export-chat";
import type { WorkspaceInput } from "@/hooks/use-workspaces";
import { SettingsSidebarNav } from "@/components/settings/settings-nav";
import { ChatSidebarTitle } from "@/components/chat/chat-sidebar-title";
import { cn } from "@/lib/utils";
import { HOME_WORKSPACE_ID, isHomeWorkspace } from "@/lib/workspace";
import {
  ChevronDownIcon,
  DownloadIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  CogIcon,
  SquarePenIcon,
  Trash2Icon,
  ArrowRightIcon,
} from "lucide-react";

type AppSidebarProps = {
  chats: LocalChat[];
  workspaces: LocalWorkspace[];
  activeChatId: string | null;
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
  onBackToChat: () => void;
  settingsActive?: boolean;
  memoryCount?: number;
};

function ChatItemMenu({
  chat,
  onRename,
  onDelete,
  onPin,
}: {
  chat: LocalChat;
  onRename: (chat: LocalChat) => void;
  onDelete: (chat: LocalChat) => void;
  onPin: (chat: LocalChat, pinned: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction
            showOnHover
            aria-label={`گزینه‌های ${chat.title}`}
            title="گزینه‌های گفتگو"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" dir="rtl">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onPin(chat, !chat.pinned)}>
            {chat.pinned ? <PinOffIcon /> : <PinIcon />}
            {chat.pinned ? "برداشتن سنجاق" : "سنجاق کردن"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportChatMarkdown(chat)}>
            <DownloadIcon />
            خروجی Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportChatJson(chat)}>
            <DownloadIcon />
            خروجی JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRename(chat)}>
            <PencilIcon />
            تغییر نام
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(chat)}
          >
            <Trash2Icon />
            حذف گفتگو
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  chats,
  workspaces,
  activeChatId,
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
  onBackToChat,
  settingsActive = false,
  memoryCount = 0,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
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
  const workspaceIds = useMemo(
    () => new Set(workspaces.map((workspace) => workspace.id)),
    [workspaces]
  );
  const pinnedUnassignedChats = useMemo(
    () =>
      chats.filter(
        (chat) =>
          chat.pinned &&
          (!chat.workspaceId || !workspaceIds.has(chat.workspaceId))
      ),
    [chats, workspaceIds]
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
      if (grouped.has(workspaceId)) {
        grouped.get(workspaceId)?.push(chat);
      }
    }

    return grouped;
  }, [chats, workspaceIds, workspaces]);

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
            className="gap-0.5 border-b border-sidebar-border px-2 pt-2.5 pb-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2"
          >
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={{ children: "گفتگوی جدید", side: "left" }}
                  className="h-8 text-[13px]"
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
                  tooltip={{ children: "جستجوی گفتگوها", side: "left" }}
                  className="h-8 text-[13px] text-muted-foreground"
                  onClick={() => setHistoryOpen(true)}
                >
                  {isIconMode ? <HistoryIcon /> : <SearchIcon />}
                  <span>
                    {isIconMode ? "تاریخچه گفتگوها" : "جستجو"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
        )}

        <SidebarContent dir="rtl" className="gap-0">
          {settingsActive ? (
            <SettingsSidebarNav memoryCount={memoryCount} />
          ) : !isIconMode ? (
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
              <SidebarGroup className="px-2 pt-3">
                <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground pe-8">
                  پروژه‌ها
                </SidebarGroupLabel>
                <SidebarGroupAction
                  type="button"
                  className="top-3 size-6 rounded-md text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label="ساخت پروژه جدید"
                  title="پروژه جدید"
                  onClick={openCreateWorkspaceDialog}
                >
                  <PlusIcon className="size-3.5" />
                </SidebarGroupAction>
                <SidebarGroupContent>
                  {workspaces.length > 0 ? (
                    <SidebarMenu className="gap-0">
                      {workspaces.map((workspace) => {
                        const workspaceChats =
                          chatsByWorkspace.get(workspace.id) ?? [];
                        const home = isHomeWorkspace(workspace);

                        return (
                          <Collapsible
                            key={workspace.id}
                            defaultOpen={home}
                            render={<SidebarMenuItem />}
                          >
                            <CollapsibleTrigger
                              render={
                                <SidebarMenuButton
                                  title={workspace.description || undefined}
                                  className="h-8 text-[13px] text-muted-foreground hover:text-foreground"
                                />
                              }
                            >
                              {home ? (
                                <HomeIcon className="size-3.5 opacity-70" />
                              ) : (
                                <FolderIcon className="size-3.5 opacity-70" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-start font-normal">
                                {workspace.title}
                              </span>
                              <ChevronDownIcon className="size-3 shrink-0 opacity-50 transition-transform in-data-[panel-open]:rotate-180" />
                            </CollapsibleTrigger>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <SidebarMenuAction
                                    showOnHover
                                    aria-label={`گزینه‌های ${workspace.title}`}
                                    title="گزینه‌های پروژه"
                                  />
                                }
                              >
                                <MoreHorizontalIcon />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" dir="rtl">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleOpenWorkspace(workspace.id)
                                    }
                                  >
                                    {home ? <HomeIcon /> : <FolderIcon />}
                                    {home
                                      ? "باز کردن خانه"
                                      : "باز کردن پروژه"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleNewWorkspaceChat(workspace.id)
                                    }
                                  >
                                    <PlusIcon />
                                    گفتگوی جدید
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      openEditWorkspaceDialog(workspace)
                                    }
                                  >
                                    <PencilIcon />
                                    ویرایش
                                  </DropdownMenuItem>
                                  {home ? null : (
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() =>
                                        setWorkspaceToDelete(workspace)
                                      }
                                    >
                                      <Trash2Icon />
                                      حذف پروژه
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <CollapsibleContent>
                              <SidebarMenuSub className="mx-0 me-0 ms-2.5 border-s border-sidebar-border px-0 ps-1.5">
                                {workspaceChats.length === 0 ? (
                                  <SidebarMenuSubItem>
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                      گفتگویی نیست
                                    </p>
                                  </SidebarMenuSubItem>
                                ) : (
                                  workspaceChats.map((chat) => (
                                    <SidebarMenuSubItem
                                      key={chat.id}
                                      className="group/menu-item"
                                    >
                                      <SidebarMenuButton
                                        size="sm"
                                        isActive={chat.id === activeChatId}
                                        className={cn(
                                          "h-7 text-[13px] font-normal",
                                          chat.id === activeChatId &&
                                            "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                                        )}
                                        onClick={() =>
                                          handleSelectChat(chat.id)
                                        }
                                      >
                                        <ChatSidebarTitle
                                          title={chat.title}
                                          typingTitle={typingTitles[chat.id]}
                                        />
                                      </SidebarMenuButton>
                                      <ChatItemMenu
                                        chat={chat}
                                        onRename={setChatToRename}
                                        onDelete={setChatToDelete}
                                        onPin={(item, pinned) =>
                                          onPinChat(item.id, pinned)
                                        }
                                      />
                                    </SidebarMenuSubItem>
                                  ))
                                )}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </SidebarMenu>
                  ) : null}
                </SidebarGroupContent>
              </SidebarGroup>

              {pinnedUnassignedChats.length > 0 ? (
                <SidebarGroup className="px-2 pt-2">
                  <SidebarGroupLabel className="h-6 px-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
                    سنجاق‌شده
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0">
                      {pinnedUnassignedChats.map((chat) => (
                        <SidebarMenuItem key={chat.id}>
                          <SidebarMenuButton
                            isActive={chat.id === activeChatId}
                            className={cn(
                              "h-7 text-[13px] font-normal",
                              chat.id === activeChatId &&
                                "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                            )}
                            onClick={() => handleSelectChat(chat.id)}
                          >
                            <PinIcon className="size-3.5 opacity-50" />
                            <ChatSidebarTitle
                              title={chat.title}
                              typingTitle={typingTitles[chat.id]}
                            />
                          </SidebarMenuButton>
                          <ChatItemMenu
                            chat={chat}
                            onRename={setChatToRename}
                            onDelete={setChatToDelete}
                            onPin={(item, pinned) =>
                              onPinChat(item.id, pinned)
                            }
                          />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}

              {workspaces.length === 0 && chats.length === 0 ? (
                <SidebarGroup className="px-4 pt-8">
                  <p className="text-center text-xs leading-6 text-muted-foreground">
                    هنوز گفتگویی نیست.
                    <br />
                    با گفتگوی جدید شروع کنید.
                  </p>
                </SidebarGroup>
              ) : null}
            </div>
          ) : null}
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
          <CommandInput placeholder="جستجوی گفتگو..." />
          <CommandList>
            <CommandEmpty>گفتگویی یافت نشد</CommandEmpty>
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
                      <FolderIcon />
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
            <AlertDialogTitle>حذف فضای کاری؟</AlertDialogTitle>
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
              حذف فضای کاری
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
