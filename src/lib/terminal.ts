export type TerminalSessionKind = "shell" | "test";
export type TerminalSessionStatus = "running" | "exited";
export const TERMINAL_EVENT_CHANNEL = "terminal:event";

export type TerminalSession = {
  id: string;
  workspaceId: string;
  chatId: string | null;
  kind: TerminalSessionKind;
  title: string;
  cwd: string;
  status: TerminalSessionStatus;
  exitCode: number | null;
  output: string;
  createdAt: number;
};

export type WorkspaceTestScript = {
  name: string;
  command: string;
};

export type TerminalEvent =
  | { type: "data"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number };
