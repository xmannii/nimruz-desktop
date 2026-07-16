"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { TaskRecord, TaskStatus } from "@/lib/workspace";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import { CircleCheckIcon, CircleIcon, ListTodoIcon, PlusIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type WorkspaceTasksPanelProps = {
  workspaceId: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "برای انجام",
  in_progress: "در حال انجام",
  done: "انجام‌شده",
  cancelled: "لغو شده",
};

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") return "in_progress";
  if (status === "in_progress") return "done";
  return "todo";
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CircleCheckIcon className="size-4 text-emerald-500" />;
  if (status === "cancelled") return <XCircleIcon className="size-4 text-muted-foreground" />;
  if (status === "in_progress") return <CircleIcon className="size-4 fill-amber-400/40 text-amber-500" />;
  return <CircleIcon className="size-4 text-muted-foreground" />;
}

export function WorkspaceTasksPanel({ workspaceId }: WorkspaceTasksPanelProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.desktop.storage.listTasks(workspaceId);
      setTasks(
        result.sort((a, b) => {
          const orderDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          if (orderDiff !== 0) return orderDiff;
          return b.updatedAt - a.updatedAt;
        })
      );
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [workspaceId, load]);

  useWorkspaceEvents(workspaceId, (events) => {
    if (hasEventType(events, "task-changed")) void load();
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    const now = Date.now();
    const task: TaskRecord = {
      id: nanoid(),
      workspaceId,
      runId: null,
      chatId: null,
      title,
      description: "",
      status: "todo",
      createdAt: now,
      updatedAt: now,
    };

    setTasks((current) => [task, ...current]);
    setNewTitle("");
    void window.desktop.storage.saveTask(task).catch((error) => {
      console.error("Failed to save task:", error);
    });
  }

  function handleToggleStatus(task: TaskRecord) {
    const updated: TaskRecord = {
      ...task,
      status: nextStatus(task.status),
      updatedAt: Date.now(),
    };
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? updated : item))
    );
    void window.desktop.storage.saveTask(updated).catch((error) => {
      console.error("Failed to update task:", error);
    });
  }

  function handleDelete(task: TaskRecord) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    void window.desktop.storage.deleteTask(task.id).catch((error) => {
      console.error("Failed to delete task:", error);
    });
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3">
      <form onSubmit={handleCreate} className="flex items-center gap-2 px-0.5">
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="عنوان تسک جدید..."
          maxLength={200}
          className="h-8 text-sm"
        />
        <Button type="submit" size="icon-sm" disabled={!newTitle.trim()}>
          <PlusIcon />
        </Button>
      </form>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <Empty className="flex-1 border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>هنوز تسکی ثبت نشده</EmptyTitle>
            <EmptyDescription>
              تسک‌های این فضای کاری اینجا پیگیری می‌شوند.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-1 pe-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-border/40 px-2 py-1.5"
              >
                <button
                  type="button"
                  title={STATUS_LABELS[task.status]}
                  onClick={() => handleToggleStatus(task)}
                  className="shrink-0"
                >
                  <StatusIcon status={task.status} />
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    (task.status === "done" || task.status === "cancelled") &&
                      "text-muted-foreground line-through"
                  )}
                >
                  {task.title}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(task)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
