export const AGENT_MODES = ["general", "plan", "chat"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export const DEFAULT_AGENT_MODE: AgentMode = "general";

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  general: "ایجنت",
  plan: "پلن",
  chat: "چت",
};

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "general" || value === "plan" || value === "chat";
}

export function sanitizeAgentMode(value: unknown): AgentMode {
  return isAgentMode(value) ? value : DEFAULT_AGENT_MODE;
}

/** Cycle Agent, Plan, and Chat for the composer Shift+Tab shortcut. */
export function nextAgentMode(current: AgentMode): AgentMode {
  const index = AGENT_MODES.indexOf(current);
  const safeIndex = index >= 0 ? index : 0;
  return AGENT_MODES[(safeIndex + 1) % AGENT_MODES.length];
}
