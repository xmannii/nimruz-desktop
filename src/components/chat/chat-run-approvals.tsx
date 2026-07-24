"use client";

import { ToolApprovalCard } from "@/components/workspace/tool-approval-card";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import type { AgentRunSnapshot } from "@/lib/desktop-api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function parseInput(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function approvalToolType(toolName: string) {
  if (toolName === "codex_command") return "tool-run_command";
  if (toolName === "codex_file_change") return "tool-apply_patch";
  return "tool-codex_permissions";
}

/**
 * Displays native provider approvals while the original streaming turn waits.
 * Unlike AI SDK tool approvals, these decisions are sent directly to the
 * provider's still-active JSON-RPC request through the main-process broker.
 */
export function ChatRunApprovals({
  chatId,
  workspaceId,
}: {
  chatId: string;
  workspaceId: string | null;
}) {
  const [snapshots, setSnapshots] = useState<AgentRunSnapshot[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const runs = await window.desktop.storage.listAgentRuns({
      chatId,
      limit: 10,
    });
    const active = runs.filter(
      (run) =>
        run.status === "running" || run.status === "awaiting_approval"
    );
    const loaded = await Promise.all(
      active.map((run) => window.desktop.storage.getAgentRun(run.id))
    );
    setSnapshots(
      loaded.filter((entry): entry is AgentRunSnapshot => entry !== null)
    );
  }, [chatId]);

  useEffect(() => {
    void load().catch((error) =>
      console.error("Failed to load native run approvals:", error)
    );
  }, [load]);

  useWorkspaceEvents(workspaceId, (events) => {
    if (!hasEventType(events, "approval-changed", "run-changed")) return;
    void load();
  });

  const pending = useMemo(
    () =>
      snapshots.flatMap((snapshot) =>
        snapshot.approvals
          .filter((approval) => approval.decision === "pending")
          .map((approval) => ({
            approval,
            toolCall: snapshot.toolCalls.find(
              (call) => call.id === approval.toolCallId
            ),
          }))
      ),
    [snapshots]
  );

  if (pending.length === 0) return null;

  async function respond(
    approvalId: string,
    approved: boolean,
    forSession = false
  ) {
    if (respondingId) return;
    setRespondingId(approvalId);
    try {
      await window.desktop.storage.resolveRunApproval(approvalId, {
        approved,
        forSession,
      });
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "پاسخ به درخواست تأیید ناموفق بود."
      );
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-3 pb-2 sm:px-6">
      {pending.map(({ approval, toolCall }) => (
        <ToolApprovalCard
          key={approval.id}
          workspaceId={workspaceId}
          part={{
            type: approvalToolType(approval.toolName),
            toolCallId: approval.toolCallId,
            state: "approval-requested",
            input: toolCall ? parseInput(toolCall.inputJson) : {},
            approval: { id: approval.id },
          }}
          isResponding={respondingId === approval.id}
          onApprove={() => void respond(approval.id, true)}
          onApproveAlways={() => void respond(approval.id, true, true)}
          onDeny={() => void respond(approval.id, false)}
        />
      ))}
    </div>
  );
}
