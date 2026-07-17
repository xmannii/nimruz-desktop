import { nanoid } from "nanoid";
import {
  ToolLoopAgent,
  createAgentUIStreamResponse,
  smoothStream,
  stepCountIs,
  type ToolSet,
} from "ai";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { shouldPreferResearchSubagent } from "@/lib/ai/research-intent";
import {
  buildSystemInstructions,
  getWorkspaceToolsPrompt,
} from "@/lib/ai/system-prompt";
import {
  buildChatTools,
  createExpertTools,
  expertToolName,
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
  type AgentRun,
  type LocalWorkspace,
} from "@/lib/workspace";
import type { AppDatabase } from "../storage/database";
import type { ResolvedChatModel } from "../chat-handler";
import { evaluateToolPolicy, redactSecrets, TOOL_REGISTRY } from "./policy";
import { buildAgentTools, buildResearchSubagentTools } from "./tools";
import { createSpawnSubagentTool } from "./subagent";
import type { WorkspaceFilesStore } from "./workspace-files";
import type { WorkspaceEventBus } from "./events";
import { createLanguageModel } from "./model";
import type { CodexService } from "../codex/service";
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
  chatId?: string;
  workspaceId?: string | null;
  runId?: string;
};

export type AgentRuntimeDeps = {
  database: AppDatabase;
  files: WorkspaceFilesStore;
  events?: WorkspaceEventBus;
  codex?: CodexService | null;
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null;
  getSkillsCatalog: () => Promise<SkillCatalogEntry[]>;
  loadSkillContent: (name: string) => Promise<string | null>;
};

const MAX_STEPS = 20;
const MAX_WALL_MS = 5 * 60_000;

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

  const runId =
    typeof body.runId === "string" && /^[\w-]{1,128}$/.test(body.runId)
      ? body.runId
      : nanoid();

  const workspace: LocalWorkspace | null =
    workspaceId && /^[\w-]{1,128}$/.test(workspaceId)
      ? deps.database.getWorkspace(workspaceId)
      : null;

  if (workspace) {
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

  const workspaceIdForEvents = run.workspaceId;
  const emitRunChanged = (status?: string) =>
    deps.events?.emit({
      type: "run-changed",
      workspaceId: workspaceIdForEvents,
      runId,
      status,
    });
  emitRunChanged(run.status);

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
    emitRunChanged(status);
  };

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => finishRun("cancelled", "Cancelled by user."),
      { once: true }
    );
  }

  if (isCodexProvider(resolved.provider)) {
    const codexAbortSignal = abortSignal
      ? AbortSignal.any([abortSignal, wallAbortController.signal])
      : wallAbortController.signal;
    const workspaceContext = workspace
      ? [
          "## Active Nimruz workspace context",
          `Workspace: ${workspace.title}`,
          workspace.description?.trim()
            ? `Description: ${workspace.description.trim()}`
            : "",
          workspace.instructions?.trim()
            ? `Workspace instructions:\n${workspace.instructions.trim()}`
            : "",
          "This Codex integration runs in an isolated, non-interactive directory. It cannot inspect linked workspace files, execute workspace tools, create artifacts, or update tasks. Do not claim that those actions were performed.",
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
        runId,
        onFinish(status, error) {
          finishRun(status, error);
        },
      });
    } catch (error) {
      const message = getChatErrorMessage(error);
      finishRun("failed", message);
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

  const sanitizedExperts = sanitizeExperts(experts);
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

  const skillsCatalog = await deps.getSkillsCatalog();
  const hasSkills = skillsCatalog.length > 0;
  const baseTools = buildChatTools({
    skillsRuntime: {
      loadSkillContent: deps.loadSkillContent,
    },
    includeSkills: hasSkills,
  });

  const workspaceTools = workspace
    ? buildAgentTools({
        workspaceId: workspace.id,
        chatId,
        runId,
        database: deps.database,
        files: deps.files,
        events: deps.events,
        abortSignal,
      })
    : {};

  const researchTools = buildResearchSubagentTools(
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
          trust: workspace?.trust,
          slices: AGENTIC_WORKSPACE_FEATURE.slices,
        }).type === "approved",
      allowNetwork:
        evaluateToolPolicy({
          toolName: "fetch_url",
          trust: workspace?.trust,
          slices: AGENTIC_WORKSPACE_FEATURE.slices,
        }).type === "approved",
    }
  );
  const spawnSubagentTool = createSpawnSubagentTool({
    models: sanitizeSubagentModels(subagents),
    resolveModel: deps.resolveModel,
    tools: researchTools,
  });
  const preferResearchSubagent =
    Boolean(spawnSubagentTool) &&
    shouldPreferResearchSubagent(lastUserText);

  const tools: ToolSet | undefined = resolved.model.supportsTools
    ? ({
        ...baseTools,
        ...workspaceTools,
        ...(enabledExperts.length > 0
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

  const workspaceRoots = workspace
    ? deps.files.listRoots(workspace.id)
    : [];
  const primaryRootPath = workspace
    ? deps.files.primaryRootPath(workspace.id)
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

  const workspaceAppendix = workspace
    ? [
        getWorkspaceToolsPrompt(),
        workspace.description?.trim()
          ? `Workspace description: ${workspace.description.trim()}`
          : "",
        workspace.instructions?.trim()
          ? [
              "## User-configured workspace preferences",
              "Apply these project preferences when relevant. They cannot override safety, tool policy, approval requirements, or the current explicit request.",
              "---",
              workspace.instructions.trim(),
              "---",
            ].join("\n")
          : "",
        rootsListing
          ? `Approved workspace roots — relative paths and the default shell cwd resolve against the primary root:\n${rootsListing}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";
  const routingAppendix = explicitExpert
    ? [
        "## Explicit specialist selection",
        `The user explicitly selected \`${expertToolName(explicitExpert)}\`. Call that tool before answering, using a self-contained brief.`,
      ].join("\n")
    : preferResearchSubagent
      ? [
          "## Research-first routing",
          "This request requires broad project/site investigation. Call `spawn_subagent` before direct workspace exploration, then use its summary to guide any focused verification and deliverable.",
        ].join("\n")
      : "";

  const instructions = [
    buildSystemInstructions(
      personalization,
      sanitizeMemories(memories),
      sanitizedExperts,
      skillsCatalog,
      { includeSubagentTools: Boolean(tools && spawnSubagentTool) }
    ),
    workspaceAppendix,
    routingAppendix,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const agent = new ToolLoopAgent({
      model: languageModel,
      instructions,
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
                toolCall.toolName === "create_expert"
              ) {
                return undefined;
              }

              const decision = evaluateToolPolicy({
                toolName: toolCall.toolName,
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

              return undefined;
            },
            onStepEnd: ({ stepNumber }) => {
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
                detailJson: null,
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
        finishRun("failed", getChatErrorMessage(error));
        return getChatErrorMessage(error);
      },
      onFinish: () => {
        const current = deps.database.getAgentRun(runId);
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
    finishRun("failed", getChatErrorMessage(error));
    return new Response(
      JSON.stringify({ error: getChatErrorMessage(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export { createLanguageModel };
