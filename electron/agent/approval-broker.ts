import { nanoid } from "nanoid";
import type {
  ApprovalRecord,
  ToolCallRecord,
  ToolCallRisk,
} from "@/lib/workspace";
import type { AppDatabase } from "../storage/database";
import type { WorkspaceEventBus } from "./events";

export type RunApprovalDecision = {
  approved: boolean;
  forSession: boolean;
};

type PendingApproval = {
  approval: ApprovalRecord;
  toolCall: ToolCallRecord;
  resolve: (decision: RunApprovalDecision) => void;
  cleanup: () => void;
};

/**
 * Bridges long-lived native provider approval requests to the renderer.
 *
 * The provider turn remains blocked until `resolve` is called through IPC.
 * Approval records are durable for observability, while the resolver itself is
 * intentionally process-local: after a restart the provider process no longer
 * owns the original request and startup recovery marks that run interrupted.
 */
export class RunApprovalBroker {
  readonly #database: AppDatabase;
  readonly #events?: WorkspaceEventBus;
  readonly #pending = new Map<string, PendingApproval>();

  constructor(database: AppDatabase, events?: WorkspaceEventBus) {
    this.#database = database;
    this.#events = events;
  }

  request(options: {
    runId: string;
    workspaceId: string | null;
    toolName: string;
    risk: ToolCallRisk;
    reason: string;
    input: unknown;
    signal?: AbortSignal;
  }): Promise<RunApprovalDecision> {
    const now = Date.now();
    const toolCallId = nanoid();
    const approval: ApprovalRecord = {
      id: nanoid(),
      runId: options.runId,
      toolCallId,
      toolName: options.toolName,
      risk: options.risk,
      reason: options.reason,
      decision: "pending",
      decidedAt: null,
      createdAt: now,
    };
    const toolCall: ToolCallRecord = {
      id: toolCallId,
      runId: options.runId,
      toolName: options.toolName,
      risk: options.risk,
      inputJson: JSON.stringify(options.input),
      outputJson: null,
      status: "awaiting_approval",
      error: null,
      startedAt: now,
      finishedAt: null,
    };

    this.#database.saveToolCall(toolCall);
    this.#database.saveApproval(approval);
    const run = this.#database.getAgentRun(options.runId);
    if (run) {
      this.#database.saveAgentRun({
        ...run,
        status: "awaiting_approval",
        updatedAt: now,
      });
    }
    this.#events?.emit({
      type: "approval-changed",
      workspaceId: options.workspaceId,
      runId: options.runId,
    });
    this.#events?.emit({
      type: "run-changed",
      workspaceId: options.workspaceId,
      runId: options.runId,
      status: "awaiting_approval",
    });

    return new Promise<RunApprovalDecision>((resolve) => {
      const abort = () => {
        this.resolve(approval.id, { approved: false, forSession: false });
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      this.#pending.set(approval.id, {
        approval,
        toolCall,
        resolve,
        cleanup: () => options.signal?.removeEventListener("abort", abort),
      });
      if (options.signal?.aborted) abort();
    });
  }

  resolve(id: string, decision: RunApprovalDecision): boolean {
    const pending = this.#pending.get(id);
    if (!pending) return false;
    this.#pending.delete(id);
    pending.cleanup();

    const now = Date.now();
    this.#database.saveApproval({
      ...pending.approval,
      decision: decision.approved ? "approved" : "denied",
      decidedAt: now,
    });
    this.#database.saveToolCall({
      ...pending.toolCall,
      status: decision.approved ? "running" : "denied",
      error: decision.approved ? null : "Denied by user.",
      finishedAt: decision.approved ? null : now,
    });

    const run = this.#database.getAgentRun(pending.approval.runId);
    const hasMorePending = [...this.#pending.values()].some(
      (entry) => entry.approval.runId === pending.approval.runId
    );
    if (
      run &&
      run.status === "awaiting_approval" &&
      !hasMorePending &&
      run.finishedAt === null
    ) {
      this.#database.saveAgentRun({
        ...run,
        status: "running",
        updatedAt: now,
      });
    }

    this.#events?.emit({
      type: "approval-changed",
      workspaceId: run?.workspaceId ?? null,
      runId: pending.approval.runId,
    });
    this.#events?.emit({
      type: "run-changed",
      workspaceId: run?.workspaceId ?? null,
      runId: pending.approval.runId,
      status: hasMorePending ? "awaiting_approval" : "running",
    });
    pending.resolve(decision);
    return true;
  }

  cancelRun(runId: string) {
    for (const [id, pending] of this.#pending) {
      if (pending.approval.runId === runId) {
        this.resolve(id, { approved: false, forSession: false });
      }
    }
  }

  dispose() {
    for (const id of [...this.#pending.keys()]) {
      this.resolve(id, { approved: false, forSession: false });
    }
  }
}
