import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { AppDatabase } from "../storage/database";
import type { WorkspaceFilesStore } from "./workspace-files";
import type { WorkspaceEventBus } from "./events";
import { defaultShellCwd, runScopedCommand } from "./shell";
import type { TaskStatus } from "@/lib/workspace";
import { fetchPage } from "@/lib/web/fetch-page";

export type AgentToolContext = {
  workspaceId: string | null;
  chatId: string;
  runId: string;
  database: AppDatabase;
  files: WorkspaceFilesStore;
  events?: WorkspaceEventBus;
  abortSignal?: AbortSignal;
};

function requireWorkspaceId(ctx: AgentToolContext): string {
  if (!ctx.workspaceId) {
    throw new Error("This tool requires an active workspace.");
  }
  return ctx.workspaceId;
}

export function buildAgentTools(ctx: AgentToolContext): ToolSet {
  const workspaceTools = {
    list_directory: tool({
      description:
        "List files/folders at a workspace path. Use first to discover structure before read/edit. Relative paths → primary root.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe("Directory to list; `.` is the primary working root"),
      }),
      execute: async ({ path: dirPath }) => {
        const workspaceId = requireWorkspaceId(ctx);
        const entries = ctx.files.listDirectory(workspaceId, dirPath);
        return {
          path: dirPath,
          entries: entries.map((entry) => ({
            name: entry.name,
            kind: entry.kind,
            sizeBytes: entry.sizeBytes,
          })),
        };
      },
    }),
    read_file: tool({
      description:
        "Read workspace file text (code/text/PDF). Always read before editing. Use offset/limit for large files.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to primary root, or absolute under an approved root"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Character offset to start reading from"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200_000)
          .optional()
          .describe("Max characters to return"),
      }),
      execute: async ({ path: filePath, offset, limit }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return ctx.files.readFileText(workspaceId, filePath, { offset, limit });
      },
    }),
    search_files: tool({
      description:
        "Search text across approved roots. Prefer over shell grep when locating symbols/phrases before reading many files.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Case-insensitive text to find"),
        glob: z
          .string()
          .optional()
          .describe("Optional filename filter, e.g. *.md or *.ts"),
        maxMatches: z.number().int().min(1).max(200).optional(),
      }),
      execute: async ({ query, glob, maxMatches }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return {
          matches: ctx.files.searchFiles(workspaceId, query, {
            glob,
            maxMatches,
          }),
        };
      },
    }),
    write_file: tool({
      description:
        "Create or fully overwrite a project file on disk. Prefer apply_patch for small edits. Do NOT use for previewable deliverables (HTML/UI, reports, diagrams, samples) — use create_artifact. May require approval.",
      inputSchema: z.object({
        path: z.string().describe("Destination path"),
        content: z.string().describe("Full new file contents"),
      }),
      execute: async ({ path: filePath, content }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return ctx.files.writeFile(workspaceId, filePath, content);
      },
    }),
    apply_patch: tool({
      description:
        "Surgical edit: replace exact oldText with newText in an existing project file. Prefer over write_file. Re-read and retry if the patch fails.",
      inputSchema: z.object({
        path: z.string().describe("File to edit"),
        oldText: z
          .string()
          .min(1)
          .describe("Exact current text to replace (include enough context to be unique)"),
        newText: z.string().describe("Replacement text"),
      }),
      execute: async ({ path: filePath, oldText, newText }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return ctx.files.applyPatch(workspaceId, filePath, oldText, newText);
      },
    }),
    move_file: tool({
      description:
        "Move/rename a file within approved roots. Not for copying.",
      inputSchema: z.object({
        from: z.string().describe("Current path"),
        to: z.string().describe("New path"),
      }),
      execute: async ({ from, to }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return ctx.files.moveFile(workspaceId, from, to);
      },
    }),
    delete_file: tool({
      description:
        "Permanently delete a file or empty directory. Only when asked or clearly required.",
      inputSchema: z.object({
        path: z.string().describe("Path to delete"),
      }),
      execute: async ({ path: filePath }) => {
        const workspaceId = requireWorkspaceId(ctx);
        return ctx.files.deleteFile(workspaceId, filePath);
      },
    }),
    run_command: tool({
      description:
        "Run a non-interactive shell command in an approved root (default cwd: primary). For tests/scripts/CLIs — not interactive or unconstrained destructive commands.",
      inputSchema: z.object({
        command: z.string().min(1).describe("Full shell command line"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory; defaults to the primary workspace root"),
      }),
      execute: async ({ command, cwd }) => {
        const workspaceId = requireWorkspaceId(ctx);
        const roots = ctx.files.getApprovedRoots(workspaceId);
        const workdir =
          cwd ?? ctx.files.primaryRootPath(workspaceId) ?? defaultShellCwd(roots);
        return runScopedCommand({
          command,
          cwd: workdir,
          roots,
          abortSignal: ctx.abortSignal,
        });
      },
    }),
    create_artifact: tool({
      description:
        "REQUIRED for previewable deliverables. MUST call this instead of putting mermaid/HTML/SVG/long code/reports in chat. Triggers: فلوچارت/دیاگرام/بکش, draw/flowchart/diagram, HTML/UI/SVG, reports, code samples, JSON/CSV. Put the FULL body in `content`; chat reply = short summary only. Use write_file only for project-tree files.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        kind: z
          .enum(["html", "markdown", "svg", "mermaid", "code", "data"])
          .describe(
            "html=page/UI; markdown=report/doc; svg=graphic; mermaid=diagram source; code=sample; data=JSON/CSV"
          ),
        content: z
          .string()
          .describe(
            "Full body. html: complete document. mermaid: source only (no fences). data: JSON or CSV."
          ),
        language: z
          .string()
          .max(40)
          .optional()
          .describe("Required for kind=code (e.g. ts, python, rust)"),
        mimeType: z.string().optional(),
      }),
      execute: async ({ title, kind, content, language, mimeType }) => {
        const workspaceId = requireWorkspaceId(ctx);
        const artifact = ctx.files.createArtifact({
          workspaceId,
          title,
          kind,
          content,
          language,
          mimeType,
          runId: ctx.runId,
          chatId: ctx.chatId,
        });
        return {
          id: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          path: artifact.storagePath,
          sizeBytes: artifact.sizeBytes,
        };
      },
    }),
    update_task: tool({
      description:
        "Create/update a checklist item for multi-step work. Short plan; mark in_progress/done. Skip for one-shot answers.",
      inputSchema: z.object({
        id: z
          .string()
          .optional()
          .describe("Existing task id to update; omit to create"),
        title: z.string().min(1).max(200),
        description: z.string().max(5_000).optional(),
        status: z.enum(["todo", "in_progress", "done", "cancelled"]),
      }),
      execute: async ({ id, title, description, status }) => {
        const workspaceId = requireWorkspaceId(ctx);
        const now = Date.now();
        const taskId = id && /^[\w-]{1,128}$/.test(id) ? id : nanoid();
        const existing = ctx.database
          .listTasks(workspaceId)
          .find((task) => task.id === taskId);
        const task = {
          id: taskId,
          workspaceId,
          runId: ctx.runId,
          chatId: ctx.chatId,
          title,
          description: description ?? existing?.description ?? "",
          status: status as TaskStatus,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        ctx.database.saveTask(task);
        ctx.events?.emit({
          type: "task-changed",
          workspaceId,
          taskId: task.id,
        });
        return task;
      },
    }),
  } satisfies ToolSet;

  const webTools = {
    fetch_url: tool({
      description:
        "Fetch a public HTTP(S) page as text. Use for shared/known URLs. Not for private/local addresses.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async ({ url }) => fetchPage(url),
    }),
    web_search: tool({
      description:
        "Search the public web. If unavailable, use fetch_url on known URLs or ask for links.",
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        // Provider-backed search can be wired later; return a structured stub
        // that guides the model to use fetch_url on known sources.
        return {
          query,
          results: [],
          message:
            "Direct web search is not configured. Use fetch_url with known source URLs, or ask the user for links.",
          suggestedLimit: limit ?? 5,
        };
      },
    }),
  } satisfies ToolSet;

  return {
    ...workspaceTools,
    ...webTools,
  };
}
