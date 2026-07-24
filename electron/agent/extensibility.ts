/**
 * Stubs for agent runtime extensibility points that are not enabled yet:
 * browser automation and background (unattended) runs.
 *
 * Each capability is gated by `AGENTIC_WORKSPACE_FEATURE.slices` so it can
 * ship disabled and be turned on per-slice later without touching callers.
 * `buildAgentTools` in `./tools.ts` should call the relevant `build*Tools`
 * helper once its slice flips to `true` and merge the result into the tool
 * set.
 */

import type { ToolSet } from "ai";
import { AGENTIC_WORKSPACE_FEATURE } from "@/lib/workspace";

export type ExtensibilityContext = {
  workspaceId: string | null;
  chatId: string;
  runId: string;
};

/**
 * Future: expose a sandboxed/controlled browser to the agent (navigate,
 * click, extract content) beyond the current `fetch_url` text-only tool.
 * Returns an empty tool set while `slices.browserAutomation` is disabled.
 */
export function buildBrowserAutomationTools(
  _ctx: ExtensibilityContext
): ToolSet {
  if (!AGENTIC_WORKSPACE_FEATURE.slices.browserAutomation) {
    return {};
  }

  throw new Error("Browser automation is not implemented yet.");
}

export type BackgroundRunRequest = {
  workspaceId: string;
  chatId: string;
  prompt: string;
  scheduledAt?: number;
};

/**
 * Future: allow queuing an agent run that executes without an attached
 * client (e.g. scheduled or triggered work). Currently a no-op while
 * `slices.backgroundRuns` is disabled; the runtime always requires an
 * active request/response cycle today.
 */
export function scheduleBackgroundRun(
  _request: BackgroundRunRequest
): { queued: false; reason: string } {
  if (!AGENTIC_WORKSPACE_FEATURE.slices.backgroundRuns) {
    return {
      queued: false,
      reason: "Background runs are not enabled yet.",
    };
  }

  return {
    queued: false,
    reason: "Background run execution is not implemented yet.",
  };
}
