import { nanoid } from "nanoid";
import {
  ToolLoopAgent,
  createAgentUIStreamResponse,
  smoothStream,
  stepCountIs,
  type ToolSet,
} from "ai";
import {
  DEFAULT_AGENT_MODE,
  sanitizeAgentMode,
  type AgentMode,
} from "@/lib/chat/agent-mode";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { shouldPreferResearchSubagent } from "@/lib/ai/research-intent";
import {
  buildChatSystemInstructions,
  buildPlanSystemInstructions,
  buildSystemInstructions,
  getAgentModePrompt,
  getWorkspaceToolsPrompt,
} from "@/lib/ai/system-prompt";
import {
  buildChatTools,
  createExpertTools,
  expertToolName,
  planClientTools,
} from "@/lib/ai/tools";
import { sanitizeMemories } from "@/lib/settings/memories";
import {
  findExplicitExpert,
  resolveSelectedExpert,
  sanitizeExperts,
} from "@/lib/settings/experts";
import type { SkillCatalogEntry } from "@/lib/skills/catalog";
import type { ReasoningEffort } from "@/lib/models/reasoning";
import { isReasoningEffort } from "@/lib/models/reasoning";
import { sanitizeSubagentModels } from "@/lib/settings/subagents";
import {
  AGENTIC_WORKSPACE_FEATURE,
  sanitizeChatWorkspaceMode,
  type AgentRun,
  type LocalWorkspace,
} from "@/lib/workspace";
import type { AppDatabase } from "../storage/database";
import type { ResolvedChatModel } from "../chat-handler";
import { evaluateToolPolicy, redactSecrets, TOOL_REGISTRY } from "./policy";
import {
  buildAgentTools,
  buildPlanAgentTools,
  buildPlanExecutionTools,
  buildResearchSubagentTools,
} from "./tools";
import { createSpawnSubagentTool } from "./subagent";
import type { WorkspaceFilesStore } from "./workspace-files";
import type { WorkspaceEventBus } from "./events";
import { createLanguageModel } from "./model";
import {
  createMcpToolSession,
  selectMcpServersForChat,
  type McpToolSession,
} from "./mcp";
import { sanitizeMcpServerIds } from "@/lib/chat/storage";
import type { CodexService, CodexTurnWorkspace } from "../codex/service";
import type { ChatWorktreeManager } from "../git/worktree-manager";
import type { TurnCheckpointManager } from "../git/checkpoint-manager";
import type { RunApprovalBroker } from "./approval-broker";
import { handleCodexChatRequest } from "../codex/chat-handler";
import {
  isCodexProvider,
  requiresProviderApiKey,
} from "./provider-routing";

export type AgentRequestBody = {
  messages: ChatUIMessage[];
  providerId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  personalization?: unknown;
  memories?: unknown;
  experts?: unknown;
  subagents?: unknown;
  selectedExpertSlug?: string;
  mcpServerIds?: string[];
  chatId?: string;
  workspaceId?: string | null;
  workspaceMode?: "shared" | "worktree";
  agentMode?: AgentMode;
  runId?: string;
};

export type AgentRuntimeDeps = {
  database: AppDatabase;
  files: WorkspaceFilesStore;
  events?: WorkspaceEventBus;
  codex?: CodexService | null;
  worktrees?: ChatWorktreeManager;
  checkpoints?: TurnCheckpointManager;
  approvals?: RunApprovalBroker;
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null;
  getSkillsCatalog: () => Promise<SkillCatalogEntry[]>;
  loadSkillContent: (name: string) => Promise<string | null>;
};

const MAX_STEPS = 20;
const MAX_WALL_MS = 5 * 60_000;
const MAX_OBSERVABILITY_JSON = 120_000;

function observabilityJson(value: unknown): string {
  try {
    const json = JSON.stringify(redactSecrets(value));
    return (json ?? "null").slice(0, MAX_OBSERVABILITY_JSON);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}

function resolveModelOrError(
  resolveModel: AgentRuntimeDeps["resolveModel"],
  providerId?: string,
  modelId?: string
): { resolved: ResolvedChatModel } | { error: Response } {
  const resolved = resolveModel(providerId, modelId);
  if (!resolved) {
    return {
      error: new Response(
        JSON.stringify({
          error:
            "هیچ مدل فعالی در دسترس نیست. یک ارائه‌دهنده و مدل را در تنظیمات فعال کنید.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (
    requiresProviderApiKey(resolved.provider) &&
    !resolved.apiKey
  ) {
    return {
      error: new Response(
        JSON.stringify({
          error:
            resolved.provider.kind === "openrouter"
              ? "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید."
              : `کلید API برای «${resolved.provider.name}» تنظیم نشده است.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { resolved };
}

export async function handleAgentChatRequest(
  body: AgentRequestBody,
  deps: AgentRuntimeDeps,
  abortSignal?: AbortSignal
): Promise<Response> {
  const {
    messages,
    providerId,
    model,
    reasoningEffort,
    personalization,
    memories,
    experts,
    subagents,
    selectedExpertSlug,
    chatId = "unknown",
    workspaceId = null,
  } = body;
  const workspaceMode = sanitizeChatWorkspaceMode(body.workspaceMode);
  const mcpServerIds = sanitizeMcpServerIds(body.mcpServerIds);
  const agentMode = sanitizeAgentMode(body.agentMode ?? DEFAULT_AGENT_MODE);
  const isPlanMode = agentMode === "plan";
  const isChatMode = agentMode === "chat";

  const resolvedResult = resolveModelOrError(
    deps.resolveModel,
    providerId,
    model
  );
  if ("error" in resolvedResult) return resolvedResult.error;
  const resolved = resolvedResult.resolved;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Messages are required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    isPlanMode &&
    (isCodexProvider(resolved.provider) || !resolved.model.supportsTools)
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Plan mode requires a tool-capable non-Codex model so it can ask questions, research, and save the plan.",
        code: "PLAN_MODE_MODEL_UNSUPPORTED",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const runId =
    typeof body.runId === "string" && /^[\w-]{1,128}$/.test(body.runId)
      ? body.runId
      : nanoid();

  const workspace: LocalWorkspace | null =
    workspaceId && /^[\w-]{1,128}$/.test(workspaceId)
      ? deps.database.getWorkspace(workspaceId)
      : null;

  if (isPlanMode && !workspace) {
    return new Response(
      JSON.stringify({
        error: "Plan mode requires an active workspace so the plan can be saved.",
        code: "PLAN_MODE_WORKSPACE_REQUIRED",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  if (workspace && !isChatMode) {
    deps.files.ensureManagedRoot(workspace.id);
  }

  const now = Date.now();
  const run: AgentRun = {
    id: runId,
    workspaceId: workspace?.id ?? null,
    chatId,
    status: "running",
    model: resolved.model.modelId,
    providerId: resolved.provider.id,
    error: null,
    stepCount: 0,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  deps.database.saveAgentRun(run);

  const saveRunUsage = (usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  }) => {
    const current = deps.database.getAgentRun(runId);
    if (!current) return;
    const inputTokens = Math.max(0, usage.inputTokens ?? 0);
    const outputTokens = Math.max(0, usage.outputTokens ?? 0);
    const totalTokens = Math.max(
      0,
      usage.totalTokens ?? inputTokens + outputTokens
    );
    deps.database.saveAgentRun({
      ...current,
      inputTokens,
      outputTokens,
      cachedInputTokens: Math.max(
        0,
        usage.inputTokenDetails?.cacheReadTokens ?? 0
      ),
      reasoningTokens: Math.max(
        0,
        usage.outputTokenDetails?.reasoningTokens ?? 0
      ),
      totalTokens,
      estimatedCostUsd:
        (inputTokens * resolved.model.inputPricePerM +
          outputTokens * resolved.model.outputPricePerM) /
        1_000_000,
      updatedAt: Date.now(),
    });
    emitRunChanged();
  };

  const workspaceIdForEvents = run.workspaceId;
  const emitRunChanged = (status?: string) =>
    deps.events?.emit({
      type: "run-changed",
      workspaceId: workspaceIdForEvents,
      runId,
      status,
    });
  emitRunChanged(run.status);

  let checkpointFinalized = false;
  const finalizeCheckpoint = async () => {
    if (checkpointFinalized || !deps.checkpoints) return;
    checkpointFinalized = true;
    const checkpoint = await deps.checkpoints.complete(runId);
    if (checkpoint) {
      deps.events?.emit({
        type: "checkpoint-changed",
        workspaceId: checkpoint.workspaceId,
        chatId: checkpoint.chatId,
        runId,
      });
    }
  };

  const wallAbortController = new AbortController();
  const wallTimer = setTimeout(() => {
    const current = deps.database.getAgentRun(runId);
    if (
      current &&
      (current.status === "running" || current.status === "awaiting_approval")
    ) {
      deps.database.saveAgentRun({
        ...current,
        status: "failed",
        error: "Run exceeded wall-clock time limit.",
        updatedAt: Date.now(),
        finishedAt: Date.now(),
      });
      emitRunChanged("failed");
      void finalizeCheckpoint();
      wallAbortController.abort(
        new Error("Run exceeded wall-clock time limit.")
      );
    }
  }, MAX_WALL_MS);

  const finishRun = (status: AgentRun["status"], error?: string | null) => {
    clearTimeout(wallTimer);
    const current = deps.database.getAgentRun(runId);
    if (!current) return;
    if (
      current.status === "completed" ||
      current.status === "failed" ||
      current.status === "cancelled" ||
      current.finishedAt !== null
    ) {
      return;
    }
    deps.database.saveAgentRun({
      ...current,
      status,
      error: error ?? current.error,
      updatedAt: Date.now(),
      finishedAt: Date.now(),
    });
    if (
      status === "completed" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      deps.approvals?.finishRun(runId, status, error);
    }
    emitRunChanged(status);
  };

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        finishRun("cancelled", "Cancelled by user.");
        void finalizeCheckpoint();
      },
      { once: true }
    );
  }

  if (isCodexProvider(resolved.provider)) {
    const codexAbortSignal = abortSignal
      ? AbortSignal.any([abortSignal, wallAbortController.signal])
      : wallAbortController.signal;
    let codexWorkspace: CodexTurnWorkspace | undefined;

    if (workspace && !isChatMode) {
      if (workspaceMode === "worktree") {
        if (!deps.worktrees) {
          finishRun("failed", "Worktree support is unavailable.");
          return new Response(
            JSON.stringify({ error: "Worktree support is unavailable." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        try {
          await deps.worktrees.ensureWorktree(workspace.id, chatId);
          deps.events?.emit({
            type: "worktree-changed",
            workspaceId: workspace.id,
            chatId,
          });
        } catch (error) {
          const message = getChatErrorMessage(error);
          finishRun("failed", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const cwd = deps.files.primaryRootPath(workspace.id, chatId);
      const roots = deps.files
        .listRoots(workspace.id, chatId)
        .map((root) => root.path);
      if (!cwd || roots.length === 0) {
        finishRun("failed", "The workspace has no approved working folder.");
        return new Response(
          JSON.stringify({
            error: "The workspace has no approved working folder.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!deps.approvals) {
        finishRun("failed", "Codex approval support is unavailable.");
        return new Response(
          JSON.stringify({ error: "Codex approval support is unavailable." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      if (deps.checkpoints) {
        try {
          await deps.checkpoints.begin({
            runId,
            chatId,
            workspaceId: workspace.id,
            workingPath: cwd,
          });
        } catch (error) {
          const message = getChatErrorMessage(error);
          if (!/not a git repository/i.test(message)) {
            finishRun("failed", message);
            return new Response(JSON.stringify({ error: message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      codexWorkspace = {
        cwd,
        roots,
        onApproval: async (request) => {
          const toolName =
            request.kind === "command"
              ? "codex_command"
              : request.kind === "file-change"
                ? "codex_file_change"
                : "codex_permissions";
          const risk =
            request.kind === "command"
              ? "shell"
              : request.kind === "file-change"
                ? "write"
                : "external";
          return deps.approvals!.request({
            runId,
            workspaceId: workspace.id,
            toolName,
            risk,
            reason: request.reason,
            input: redactSecrets({
              command: request.command,
              cwd: request.cwd,
              itemId: request.itemId,
              details: request.details,
            }),
            externalCallId: request.itemId,
            signal: codexAbortSignal,
          });
        },
      };
    }

    const workspaceContext = !isChatMode && workspace
      ? [
          "## Active Nimruz workspace context",
          `Workspace: ${workspace.title}`,
          workspace.description?.trim()
            ? `Description: ${workspace.description.trim()}`
            : "",
          workspace.instructions?.trim()
            ? `Workspace instructions:\n${workspace.instructions.trim()}`
            : "",
          codexWorkspace
            ? [
                `Approved workspace root: ${codexWorkspace.cwd}`,
                "You are running in Nimruz's workspace-write sandbox. Work only inside the approved workspace roots. Use native Codex file and command tools, request approval when required, and verify changes before finishing.",
              ].join("\n")
            : "This Codex integration is in conversational isolation and cannot inspect linked workspace files or execute workspace tools.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "";

    let response: Response;
    try {
      response = await handleCodexChatRequest({
        body,
        chatId,
        resolved,
        codex: deps.codex ?? null,
        signal: codexAbortSignal,
        additionalInstructions: workspaceContext,
        workspace: codexWorkspace,
        runId,
        onFinish(status, error) {
          finishRun(status, error);
          void finalizeCheckpoint();
        },
        onUsage: saveRunUsage,
        onItemCompleted(itemId, itemType) {
          deps.approvals?.completeExternalCall(runId, itemId, { itemType });
          emitRunChanged();
        },
      });
    } catch (error) {
      const message = getChatErrorMessage(error);
      finishRun("failed", message);
      void finalizeCheckpoint();
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      let message = `Codex request failed (${response.status}).`;
      try {
        const payload = (await response.clone().json()) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim()) {
          message = payload.error.trim();
        }
      } catch {
        // Preserve the response for the renderer even if its body is not JSON.
      }
      finishRun("failed", message);
      void finalizeCheckpoint();
    }

    return response;
  }

  let languageModel;
  try {
    languageModel = createLanguageModel(resolved);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "پیکربندی مدل نامعتبر است.";
    finishRun("failed", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (workspace && !isChatMode && !isPlanMode) {
    if (workspaceMode === "worktree") {
      if (!deps.worktrees) {
        finishRun("failed", "Worktree support is unavailable.");
        return new Response(
          JSON.stringify({ error: "Worktree support is unavailable." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      try {
        const worktree = await deps.worktrees.ensureWorktree(
          workspace.id,
          chatId
        );
        deps.events?.emit({
          type: "worktree-changed",
          workspaceId: workspace.id,
          chatId,
        });
        void worktree;
      } catch (error) {
        const message = getChatErrorMessage(error);
        finishRun("failed", message);
        return new Response(JSON.stringify({ error: message }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (deps.checkpoints) {
      const workingPath = deps.files.primaryRootPath(workspace.id, chatId);
      try {
        await deps.checkpoints.begin({
          runId,
          chatId,
          workspaceId: workspace.id,
          workingPath,
        });
      } catch (error) {
        const message = getChatErrorMessage(error);
        // Checkpoints are a Git feature; non-Git workspaces continue with their
        // existing agent workflow. A Git-backed workspace must not silently
        // lose checkpoint protection because of another capture failure.
        if (!/not a git repository/i.test(message)) {
          finishRun("failed", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }
  }

  let mcpSession: McpToolSession | null = null;
  if (
    workspace &&
    !isChatMode &&
    !isPlanMode &&
    resolved.model.supportsTools &&
    AGENTIC_WORKSPACE_FEATURE.slices.mcp
  ) {
    const cwd = deps.files.primaryRootPath(workspace.id, chatId);
    if (cwd) {
      mcpSession = await createMcpToolSession({
        servers: selectMcpServersForChat(
          deps.database.listMcpServers(workspace.id),
          mcpServerIds
        ),
        cwd,
      });
    }
  }
  const closeMcpSession = async () => {
    const activeSession = mcpSession;
    mcpSession = null;
    await activeSession?.close();
  };
  abortSignal?.addEventListener(
    "abort",
    () => void closeMcpSession(),
    { once: true }
  );

  const sanitizedExperts = isChatMode ? [] : sanitizeExperts(experts);
  const enabledExperts = sanitizedExperts.filter((expert) => expert.enabled);
  const lastUserText =
    [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.parts?.filter(
        (
          part
        ): part is Extract<
          (typeof messages)[number]["parts"][number],
          { type: "text" }
        > => part.type === "text"
      )
      .map((part) => part.text)
      .join("\n") ?? "";

  const explicitExpert =
    resolveSelectedExpert(sanitizedExperts, selectedExpertSlug) ??
    findExplicitExpert(sanitizedExperts, lastUserText);

  const skillsCatalog = isChatMode ? [] : await deps.getSkillsCatalog();
  const hasSkills = skillsCatalog.length > 0;
  const baseTools = isChatMode
    ? {}
    : buildChatTools({
        skillsRuntime: {
          loadSkillContent: deps.loadSkillContent,
        },
        includeSkills: hasSkills,
      });

  const toolContext = {
    workspaceId: workspace?.id ?? null,
    chatId,
    runId,
    database: deps.database,
    files: deps.files,
    events: deps.events,
    abortSignal,
  };

  const workspaceTools = isChatMode
    ? {}
    : isPlanMode
      ? buildPlanAgentTools(toolContext)
      : workspace
        ? {
            ...buildAgentTools({
              ...toolContext,
              workspaceId: workspace.id,
            }),
            ...buildPlanExecutionTools({
              ...toolContext,
              workspaceId: workspace.id,
            }),
          }
        : {};

  const researchTools = isChatMode
    ? {}
    : buildResearchSubagentTools(
        {
          workspaceId: workspace?.id ?? null,
          chatId,
          runId,
          database: deps.database,
          files: deps.files,
          events: deps.events,
          abortSignal,
        },
        {
          // Nested ToolLoopAgents cannot pause for approvals. Expose only
          // capabilities the parent workspace policy already auto-approves.
          allowWorkspaceRead:
            evaluateToolPolicy({
              toolName: "read_file",
              agentMode,
              trust: workspace?.trust,
              slices: AGENTIC_WORKSPACE_FEATURE.slices,
            }).type === "approved",
          allowNetwork:
            evaluateToolPolicy({
              toolName: "fetch_url",
              agentMode,
              trust: workspace?.trust,
              slices: AGENTIC_WORKSPACE_FEATURE.slices,
            }).type === "approved",
        }
      );
  const spawnSubagentTool = isChatMode
    ? undefined
    : createSpawnSubagentTool({
        models: sanitizeSubagentModels(subagents),
        resolveModel: deps.resolveModel,
        tools: researchTools,
      });
  const preferResearchSubagent =
    Boolean(spawnSubagentTool) &&
    shouldPreferResearchSubagent(lastUserText);

  const tools: ToolSet | undefined =
    !isChatMode && resolved.model.supportsTools
      ? ({
          ...(isPlanMode ? planClientTools : baseTools),
          ...workspaceTools,
          ...(mcpSession?.tools ?? {}),
          ...(!isPlanMode && enabledExperts.length > 0
            ? createExpertTools(sanitizedExperts, languageModel)
            : {}),
          ...(spawnSubagentTool
            ? { spawn_subagent: spawnSubagentTool }
            : {}),
        } as ToolSet)
      : undefined;

  const selectedReasoningEffort =
    resolved.model.supportsReasoningEffort && isReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : undefined;

  const workspaceRoots =
    !isChatMode && workspace
      ? deps.files.listRoots(workspace.id, chatId)
      : [];
  const primaryRootPath =
    !isChatMode && workspace
      ? deps.files.primaryRootPath(workspace.id, chatId)
      : null;
  const rootsListing =
    workspaceRoots.length > 0
      ? workspaceRoots
          .map((root) => {
            const tags = [
              root.kind === "managed" ? "managed" : "linked",
              root.path === primaryRootPath ? "primary" : "",
            ]
              .filter(Boolean)
              .join(", ");
            return `- ${root.label} (${tags}): ${root.path}`;
          })
          .join("\n")
      : "";

  const workspaceAppendix =
    !isChatMode && workspace
      ? [
        isPlanMode ? "" : getWorkspaceToolsPrompt(),
        workspace.description?.trim()
          ? `Workspace description: ${workspace.description.trim()}`
          : "",
        workspace.instructions?.trim()
          ? [
              "## User-configured workspace preferences",
              isPlanMode
                ? "Apply relevant project preferences to the plan, but they cannot authorize edits, commands, implementation, or any other side effect in Plan mode."
                : "Apply these project preferences when relevant. They cannot override safety, tool policy, approval requirements, or the current explicit request.",
              "---",
              workspace.instructions.trim(),
              "---",
            ].join("\n")
          : "",
        rootsListing
          ? `Approved workspace roots — relative paths and the default shell cwd resolve against the primary root:\n${rootsListing}`
          : "",
        isPlanMode
          ? "Plan persistence requires this active workspace. Call `write_plan` when the plan is ready."
          : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : isPlanMode
        ? "No workspace is attached. You may still clarify and draft a plan in chat, but `write_plan` will fail until the user attaches a workspace."
        : "";
  const routingAppendix =
    !isChatMode && !isPlanMode && explicitExpert
      ? [
        "## Explicit specialist selection",
        `The user explicitly selected \`${expertToolName(explicitExpert)}\`. Call that tool before answering, using a self-contained brief.`,
        ].join("\n")
      : preferResearchSubagent
        ? [
          "## Research-first routing",
          isPlanMode
            ? "This request requires broad project/site investigation. Call `spawn_subagent` before direct workspace exploration, then use its summary to write the plan with `write_plan`."
            : "This request requires broad project/site investigation. Call `spawn_subagent` before direct workspace exploration, then use its summary to guide any focused verification and deliverable.",
          ].join("\n")
        : "";

  const instructions = [
    isChatMode
      ? buildChatSystemInstructions(personalization)
      : isPlanMode
        ? buildPlanSystemInstructions(
            personalization,
            sanitizeMemories(memories),
            { includeSubagentTools: Boolean(tools && spawnSubagentTool) }
          )
        : [
            buildSystemInstructions(
              personalization,
              sanitizeMemories(memories),
              sanitizedExperts,
              skillsCatalog,
              { includeSubagentTools: Boolean(tools && spawnSubagentTool) }
            ),
            getAgentModePrompt(),
          ].join("\n\n"),
    workspaceAppendix,
    routingAppendix,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const observedToolCalls = new Map<string, string>();
    const agent = new ToolLoopAgent({
      model: languageModel,
      instructions,
      onEnd: async ({ usage }) => {
        saveRunUsage(usage);
        await closeMcpSession();
      },
      ...(selectedReasoningEffort
        ? { reasoning: selectedReasoningEffort }
        : {}),
      ...(tools
        ? {
            tools,
            stopWhen: stepCountIs(MAX_STEPS),
            toolApproval: ({ toolCall }) => {
              // Client-side tools pause naturally without execute.
              if (
                toolCall.toolName === "save_memory" ||
                toolCall.toolName === "delete_memory" ||
                toolCall.toolName === "create_expert" ||
                toolCall.toolName === "ask_user_question"
              ) {
                return undefined;
              }

              const decision = evaluateToolPolicy({
                toolName: toolCall.toolName,
                agentMode,
                trust: workspace?.trust,
                slices: AGENTIC_WORKSPACE_FEATURE.slices,
              });

              const meta = TOOL_REGISTRY[toolCall.toolName];
              const toolCallId = nanoid();
              deps.database.saveToolCall({
                id: toolCallId,
                runId,
                toolName: toolCall.toolName,
                risk: meta?.risk ?? "external",
                inputJson: JSON.stringify(
                  redactSecrets(
                    "input" in toolCall ? toolCall.input : toolCall
                  )
                ),
                outputJson: null,
                status:
                  decision.type === "user-approval"
                    ? "awaiting_approval"
                    : decision.type === "denied"
                      ? "denied"
                      : "queued",
                error: decision.type === "denied" ? decision.reason : null,
                startedAt: Date.now(),
                finishedAt: decision.type === "denied" ? Date.now() : null,
              });
              observedToolCalls.set(toolCall.toolCallId, toolCallId);

              if (decision.type === "user-approval") {
                deps.database.saveApproval({
                  id: nanoid(),
                  runId,
                  toolCallId,
                  toolName: toolCall.toolName,
                  risk: meta?.risk ?? "external",
                  reason: decision.reason ?? "Approval required",
                  decision: "pending",
                  decidedAt: null,
                  createdAt: Date.now(),
                });
                const current = deps.database.getAgentRun(runId);
                if (current) {
                  deps.database.saveAgentRun({
                    ...current,
                    status: "awaiting_approval",
                    updatedAt: Date.now(),
                  });
                }
                emitRunChanged("awaiting_approval");
                deps.events?.emit({
                  type: "approval-changed",
                  workspaceId: workspaceIdForEvents,
                  runId,
                });
                return "user-approval";
              }

              if (decision.type === "denied") {
                return { type: "denied" as const, reason: decision.reason };
              }

              if (decision.type === "approved") {
                return "approved";
              }

              return {
                type: "denied" as const,
                reason: "Tool policy returned no executable decision.",
              };
            },
            onToolExecutionStart: ({ toolCall }) => {
              const id = observedToolCalls.get(toolCall.toolCallId);
              if (!id) return;
              const call = deps.database
                .listToolCalls(runId)
                .find((candidate) => candidate.id === id);
              if (!call) return;
              deps.database.saveToolCall({
                ...call,
                status: "running",
              });
              emitRunChanged("running");
            },
            onToolExecutionEnd: ({ toolCall, toolOutput }) => {
              const id = observedToolCalls.get(toolCall.toolCallId);
              if (!id) return;
              observedToolCalls.delete(toolCall.toolCallId);
              const call = deps.database
                .listToolCalls(runId)
                .find((candidate) => candidate.id === id);
              if (!call) return;
              const failed = toolOutput.type === "tool-error";
              const value =
                "output" in toolOutput
                  ? toolOutput.output
                  : "error" in toolOutput
                    ? toolOutput.error
                    : toolOutput;
              deps.database.saveToolCall({
                ...call,
                outputJson: failed ? null : observabilityJson(value),
                status: failed ? "failed" : "completed",
                error: failed ? getChatErrorMessage(value) : null,
                finishedAt: Date.now(),
              });
              emitRunChanged("running");
            },
            onStepEnd: ({ stepNumber, usage, finishReason }) => {
              const current = deps.database.getAgentRun(runId);
              if (!current) return;
              deps.database.saveAgentRun({
                ...current,
                stepCount: Math.max(current.stepCount, stepNumber + 1),
                updatedAt: Date.now(),
              });
              deps.database.addAgentRunStep({
                id: nanoid(),
                runId,
                stepIndex: stepNumber,
                kind: "model",
                summary: `Step ${stepNumber + 1}`,
                detailJson: observabilityJson({
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  totalTokens: usage.totalTokens,
                  finishReason,
                }),
                createdAt: Date.now(),
              });
              emitRunChanged("running");
            },
          }
        : {}),
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal,
      timeout: MAX_WALL_MS,
      experimental_transform: smoothStream({
        delayInMs: 12,
        chunking:
          typeof Intl !== "undefined" && "Segmenter" in Intl
            ? new Intl.Segmenter("fa", { granularity: "word" })
            : "word",
      }),
      sendReasoning: true,
      onError: (error) => {
        void closeMcpSession();
        finishRun("failed", getChatErrorMessage(error));
        void finalizeCheckpoint();
        return getChatErrorMessage(error);
      },
      onFinish: async () => {
        void closeMcpSession();
        const current = deps.database.getAgentRun(runId);
        await finalizeCheckpoint();
        if (current?.status === "awaiting_approval") return;
        finishRun("completed");
      },
      headers: {
        "X-Nimruz-Run-Id": runId,
      },
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage, runId };
        }
      },
    });
  } catch (error) {
    await closeMcpSession();
    await finalizeCheckpoint();
    finishRun("failed", getChatErrorMessage(error));
    return new Response(
      JSON.stringify({ error: getChatErrorMessage(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export { createLanguageModel };
