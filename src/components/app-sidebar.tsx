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
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  MessageSquareIcon,
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

type ChatSectionKey = "today" | "yesterday" | "week" | "older";

const SECTION_LABELS: Record<ChatSectionKey, string> = {
  today: "امروز",
  yesterday: "دیروز",
  week: "۷ روز گذشته",
  older: "قدیمی‌تر",
};

const SECTION_ORDER: ChatSectionKey[] = [
  "today",
  "yesterday",
  "week",
  "older",
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getChatSection(timestamp: number): ChatSectionKey {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const weekAgo = today - 7 * 24 * 60 * 60 * 1000;

  if (timestamp >= today) return "today";
  if (timestamp >= yesterday) return "yesterday";
  if (timestamp >= weekAgo) return "week";
  return "older";
}

function groupChats(chats: LocalChat[]) {
  const groups = new Map<ChatSectionKey, LocalChat[]>();

  for (const key of SECTION_ORDER) {
    groups.set(key, []);
  }

  for (const chat of chats) {
    groups.get(getChatSection(chat.updatedAt))?.push(chat);
  }

  return SECTION_ORDER.map((key) => ({
    key,
    label: SECTION_LABELS[key],
    chats: groups.get(key) ?? [],
  })).filter((group) => group.chats.length > 0);
}

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
            className="gap-1.5 border-b border-sidebar-border/70 px-2.5 pt-3 pb-2.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2"
          >
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  variant={isIconMode ? "outline" : "default"}
                  tooltip={{ children: "گفتگوی جدید", side: "left" }}
                  className={cn(
                    !isIconMode &&
                      "h-9 bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent"
                  )}
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
                  variant={isIconMode ? "outline" : "default"}
                  tooltip={{ children: "جستجوی گفتگوها", side: "left" }}
                  className={cn(
                    !isIconMode &&
                      "h-9 text-sidebar-foreground/75 hover:text-sidebar-foreground"
                  )}
                  onClick={() => setHistoryOpen(true)}
                >
                  {isIconMode ? <HistoryIcon /> : <SearchIcon />}
                  <span>
                    {isIconMode ? "تاریخچه گفتگوها" : "جستجوی گفتگوها"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
        )}

        <SidebarContent dir="rtl" className="gap-0 pt-1">
          {settingsActive ? (
            <SettingsSidebarNav memoryCount={memoryCount} />
          ) : !isIconMode ? (
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
              <SidebarGroup className="pt-2">
                <SidebarGroupLabel className="mb-1 h-7 px-2 text-[11px] font-medium tracking-wide text-muted-foreground pe-9">
                  پروژه‌ها
                </SidebarGroupLabel>
                <SidebarGroupAction
                  type="button"
                  className="top-2.5 size-7 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="ساخت پروژه جدید"
                  title="پروژه جدید"
                  onClick={openCreateWorkspaceDialog}
                >
                  <PlusIcon />
                </SidebarGroupAction>
                <SidebarGroupContent>
                  {workspaces.length > 0 ? (
                    <SidebarMenu className="gap-0.5">
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
                                  className="h-9 font-medium"
                                />
                              }
                            >
                              {home ? <HomeIcon /> : <FolderIcon />}
                              <span className="min-w-0 flex-1 truncate text-start">
                                {workspace.title}
                              </span>
                              <Badge
                                variant="secondary"
                                className="ms-auto h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px] font-normal text-muted-foreground in-data-[panel-open]:hidden"
                              >
                                {workspaceChats.length}
                              </Badge>
                              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform in-data-[panel-open]:rotate-180" />
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
                              <SidebarMenuSub className="mx-0 me-0 ms-3.5 border-s border-sidebar-border/80 px-0 ps-2">
                                <SidebarMenuSubItem className="group/menu-item">
                                  <SidebarMenuButton
                                    size="sm"
                                    className="h-8 text-muted-foreground"
                                    onClick={() =>
                                      handleNewWorkspaceChat(workspace.id)
                                    }
                                  >
                                    <PlusIcon />
                                    <span>گفتگوی جدید</span>
                                  </SidebarMenuButton>
                                </SidebarMenuSubItem>
                                {workspaceChats.map((chat) => (
                                  <SidebarMenuSubItem
                                    key={chat.id}
                                    className="group/menu-item"
                                  >
                                    <SidebarMenuButton
                                      size="sm"
                                      isActive={chat.id === activeChatId}
                                      className={cn(
                                        "h-8",
                                        chat.id === activeChatId &&
                                          "relative font-medium before:absolute before:inset-y-1.5 before:end-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground"
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
                                ))}
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
                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="h-7 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                    سنجاق‌شده
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0.5">
                      {pinnedUnassignedChats.map((chat) => (
                        <SidebarMenuItem key={chat.id}>
                          <SidebarMenuButton
                            isActive={chat.id === activeChatId}
                            className={cn(
                              "h-8",
                              chat.id === activeChatId &&
                                "relative font-medium before:absolute before:inset-y-1.5 before:end-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground"
                            )}
                            onClick={() => handleSelectChat(chat.id)}
                          >
                            <PinIcon className="opacity-70" />
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
                <SidebarGroup className="flex-1 justify-center">
                  <Empty className="border-0 bg-transparent p-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MessageSquareIcon />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm">هنوز گفتگویی نیست</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        با یک گفتگوی جدید شروع کنید یا پروژه بسازید.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </SidebarGroup>
              ) : null}
            </div>
          ) : null}
        </SidebarContent>

        <SidebarFooter
          dir="rtl"
          className="gap-1 border-t border-sidebar-border/70 p-2.5 group-data-[collapsible=icon]:p-2"
        >
          <SidebarMenu className="gap-0.5">
            {!settingsActive && chats.length > 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={{ children: "حذف همه گفتگوها", side: "left" }}
                  className="h-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setDeleteAllOpen(true);
                    closeMobileSidebar();
                  }}
                >
                  <Trash2Icon />
                  <span className="group-data-[collapsible=icon]:sr-only">
                    حذف همه گفتگوها
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            <SidebarMenuItem>
              {settingsActive ? (
                <SidebarMenuButton
                  tooltip={{ children: "بازگشت به گفتگو", side: "left" }}
                  className="h-8"
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
                  className="h-8"
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
