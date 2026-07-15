"use client";

import { useMemo, useState } from "react";
import { ChatRenameDialog } from "@/components/chat-rename-dialog";
import { ProjectDialog } from "@/components/project-dialog";
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
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type { ProjectInput } from "@/hooks/use-projects";
import {
  FolderIcon,
  HistoryIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  CogIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";

type AppSidebarProps = {
  chats: LocalChat[];
  projects: LocalProject[];
  activeChatId: string | null;
  onNewChat: () => void;
  onNewProjectChat: (projectId: string) => void;
  onCreateProject: (input: ProjectInput) => void;
  onUpdateProject: (id: string, input: ProjectInput) => void;
  onDeleteProject: (id: string) => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
  settingsActive?: boolean;
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
}: {
  chat: LocalChat;
  onRename: (chat: LocalChat) => void;
  onDelete: (chat: LocalChat) => void;
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
  projects,
  activeChatId,
  onNewChat,
  onNewProjectChat,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onOpenSettings,
  settingsActive = false,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<LocalProject | null>(
    null
  );
  const [projectToDelete, setProjectToDelete] = useState<LocalProject | null>(
    null
  );
  const [chatToDelete, setChatToDelete] = useState<LocalChat | null>(null);
  const [chatToRename, setChatToRename] = useState<LocalChat | null>(null);
  const isIconMode = state === "collapsed" && !isMobile;
  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects]
  );
  const unassignedChats = useMemo(
    () =>
      chats.filter(
        (chat) => !chat.projectId || !projectIds.has(chat.projectId)
      ),
    [chats, projectIds]
  );
  const unassignedChatGroups = useMemo(
    () => groupChats(unassignedChats),
    [unassignedChats]
  );
  const chatsByProject = useMemo(() => {
    const grouped = new Map<string, LocalChat[]>();

    for (const project of projects) {
      grouped.set(project.id, []);
    }
    for (const chat of chats) {
      if (chat.projectId && grouped.has(chat.projectId)) {
        grouped.get(chat.projectId)?.push(chat);
      }
    }

    return grouped;
  }, [chats, projects]);

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  function handleSelectChat(id: string) {
    onSelectChat(id);
    setHistoryOpen(false);
    closeMobileSidebar();
  }

  function handleNewProjectChat(projectId: string) {
    onNewProjectChat(projectId);
    closeMobileSidebar();
  }

  function openCreateProjectDialog() {
    setEditingProject(null);
    setProjectDialogOpen(true);
  }

  function openEditProjectDialog(project: LocalProject) {
    setEditingProject(project);
    setProjectDialogOpen(true);
  }

  function handleProjectDialogOpenChange(open: boolean) {
    setProjectDialogOpen(open);
    if (!open) setEditingProject(null);
  }

  function handleProjectSubmit(input: ProjectInput) {
    if (editingProject) {
      onUpdateProject(editingProject.id, input);
    } else {
      onCreateProject(input);
    }
  }

  return (
    <>
      <Sidebar
        side="right"
        collapsible="icon"
        className="!top-[var(--app-header-height)] !bottom-0 !h-auto border-l border-sidebar-border"
      >
        <SidebarContent
          dir="rtl"
          className="pt-3 group-data-[collapsible=icon]:pt-4"
        >
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    variant={isIconMode ? "outline" : "default"}
                    tooltip={{ children: "گفتگوی جدید", side: "left" }}
                    className={
                      isIconMode
                        ? undefined
                        : "h-auto rounded-md px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
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
                    className={
                      isIconMode
                        ? undefined
                        : "h-auto rounded-md px-3 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
                    onClick={() => setHistoryOpen(true)}
                  >
                    {isIconMode ? <HistoryIcon /> : <SearchIcon />}
                    <span>{isIconMode ? "تاریخچه گفتگوها" : "جستجوی گفتگوها"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {!isIconMode ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <SidebarGroup className="mt-2 pt-0">
                <SidebarGroupLabel className="mb-1 pe-8">پروژه‌ها</SidebarGroupLabel>
                <SidebarGroupAction
                  type="button"
                  className="top-2 size-7 bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]"
                  aria-label="ساخت پروژه جدید"
                  title="پروژه جدید"
                  onClick={openCreateProjectDialog}
                >
                  <PlusIcon />
                </SidebarGroupAction>
                <SidebarGroupContent className="mt-2">
                  {projects.length > 0 ? (
                    <SidebarMenu>
                      {projects.map((project) => {
                        const projectChats =
                          chatsByProject.get(project.id) ?? [];

                        return (
                          <Collapsible
                            key={project.id}
                            defaultOpen
                            render={<SidebarMenuItem />}
                          >
                            <CollapsibleTrigger
                              render={
                                <SidebarMenuButton
                                  title={project.description || undefined}
                                />
                              }
                            >
                              <FolderIcon />
                              <span className="truncate">{project.title}</span>
                            </CollapsibleTrigger>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <SidebarMenuAction
                                    showOnHover
                                    aria-label={`گزینه‌های ${project.title}`}
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
                                      handleNewProjectChat(project.id)
                                    }
                                  >
                                    <PlusIcon />
                                    گفتگوی جدید
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      openEditProjectDialog(project)
                                    }
                                  >
                                    <PencilIcon />
                                    ویرایش پروژه
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setProjectToDelete(project)}
                                  >
                                    <Trash2Icon />
                                    حذف پروژه
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <CollapsibleContent>
                              <SidebarMenuSub>
                                <SidebarMenuSubItem className="group/menu-item">
                                  <SidebarMenuButton
                                    size="sm"
                                    onClick={() =>
                                      handleNewProjectChat(project.id)
                                    }
                                  >
                                    <PlusIcon />
                                    <span>گفتگوی جدید</span>
                                  </SidebarMenuButton>
                                </SidebarMenuSubItem>
                                {projectChats.map((chat) => (
                                  <SidebarMenuSubItem
                                    key={chat.id}
                                    className="group/menu-item"
                                  >
                                    <SidebarMenuButton
                                      size="sm"
                                      isActive={chat.id === activeChatId}
                                      onClick={() => handleSelectChat(chat.id)}
                                    >
                                      <span>{chat.title}</span>
                                    </SidebarMenuButton>
                                    <ChatItemMenu
                                      chat={chat}
                                      onRename={setChatToRename}
                                      onDelete={setChatToDelete}
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

              {unassignedChats.length > 0 ? (
                <SidebarGroup className="pt-0">
                  <SidebarGroupLabel>گفتگوها</SidebarGroupLabel>
                  <SidebarGroupContent className="flex flex-col gap-3">
                    {unassignedChatGroups.map((group) => (
                      <div key={group.key} className="flex flex-col gap-0.5">
                        <p className="px-2 text-[11px] font-medium text-muted-foreground">
                          {group.label}
                        </p>
                        <SidebarMenu>
                          {group.chats.map((chat) => (
                            <SidebarMenuItem key={chat.id}>
                              <SidebarMenuButton
                                isActive={chat.id === activeChatId}
                                onClick={() => handleSelectChat(chat.id)}
                              >
                                <span>{chat.title}</span>
                              </SidebarMenuButton>
                              <ChatItemMenu
                                chat={chat}
                                onRename={setChatToRename}
                                onDelete={setChatToDelete}
                              />
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </div>
                    ))}
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}

              {projects.length === 0 && chats.length === 0 ? (
                <SidebarGroup className="flex-1">
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-8 text-center">
                    <p className="text-xs text-muted-foreground">
                      هنوز گفتگویی ذخیره نشده
                    </p>
                  </div>
                </SidebarGroup>
              ) : null}
            </div>
          ) : null}
        </SidebarContent>

        <SidebarFooter
          dir="rtl"
          className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2"
        >
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={{ children: "تنظیمات", side: "left" }}
                isActive={settingsActive}
                onClick={() => onOpenSettings()}
              >
                <CogIcon />
                <span>تنظیمات</span>
              </SidebarMenuButton>
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
            {projects.map((project) => {
              const projectChats = chatsByProject.get(project.id) ?? [];
              if (projectChats.length === 0) return null;

              return (
                <CommandGroup key={project.id} heading={project.title}>
                  {projectChats.map((chat) => (
                    <CommandItem
                      key={chat.id}
                      value={`${chat.title} ${project.title} ${project.description}`}
                      data-checked={
                        chat.id === activeChatId ? true : undefined
                      }
                      onSelect={() => handleSelectChat(chat.id)}
                    >
                      <FolderIcon />
                      <span className="truncate">{chat.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {unassignedChatGroups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.chats.map((chat) => (
                  <CommandItem
                    key={chat.id}
                    value={`${chat.title} ${group.label}`}
                    data-checked={chat.id === activeChatId ? true : undefined}
                    onSelect={() => handleSelectChat(chat.id)}
                  >
                    <MessageSquareIcon />
                    <span className="truncate">{chat.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>

      {projectDialogOpen ? (
        <ProjectDialog
          open
          onOpenChange={handleProjectDialogOpenChange}
          project={editingProject}
          onSubmit={handleProjectSubmit}
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

      <AlertDialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف پروژه؟</AlertDialogTitle>
            <AlertDialogDescription>
              پروژه «{projectToDelete?.title}» حذف می‌شود، اما گفتگوهای آن
              باقی می‌مانند و به بخش گفتگوهای بدون پروژه منتقل می‌شوند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (projectToDelete) {
                  onDeleteProject(projectToDelete.id);
                  setProjectToDelete(null);
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
