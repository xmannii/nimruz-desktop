"use client";

import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import type {
  TerminalEvent,
  TerminalSession,
  WorkspaceTestScript,
} from "@/lib/terminal";
import { cn } from "@/lib/utils";
import {
  FlaskConicalIcon,
  PlusIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type WorkspaceTerminalPanelProps = {
  workspaceId: string;
  chatId?: string;
};

/**
 * Attaches xterm.js to a main-process PTY. The process and its bounded output
 * buffer outlive renderer reloads, so switching panels does not kill commands.
 */
export function WorkspaceTerminalPanel({
  workspaceId,
  chatId,
}: WorkspaceTerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<TerminalSession[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [scripts, setScripts] = useState<WorkspaceTestScript[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedScript, setSelectedScript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const refresh = useCallback(async () => {
    const [nextSessions, nextScripts] = await Promise.all([
      window.desktop.terminal.list(workspaceId, chatId),
      window.desktop.terminal.listTests(workspaceId, chatId),
    ]);
    setSessions(nextSessions);
    setScripts(nextScripts);
    setSelectedScript((current) =>
      nextScripts.some((script) => script.name === current)
        ? current
        : (nextScripts[0]?.name ?? "")
    );
    setActiveId((current) =>
      nextSessions.some((session) => session.id === current)
        ? current
        : (nextSessions.at(-1)?.id ?? null)
    );
  }, [workspaceId, chatId]);

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    );
  }, [refresh]);

  useEffect(
    () =>
      window.desktop.terminal.onEvent((event: TerminalEvent) => {
        const belongsHere = sessionsRef.current.some(
          (session) => session.id === event.sessionId
        );
        if (!belongsHere) return;
        if (event.type === "exit") {
          setSessions((current) =>
            current.map((session) =>
              session.id === event.sessionId
                ? {
                    ...session,
                    status: "exited",
                    exitCode: event.exitCode,
                  }
                : session
            )
          );
        }
      }),
    []
  );

  useEffect(() => {
    const host = hostRef.current;
    const active = sessions.find((session) => session.id === activeId);
    if (!host || !active) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;

    void Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      window.desktop.terminal.list(workspaceId, chatId),
    ]).then(([xterm, fitModule, latestSessions]) => {
      if (disposed) return;
      const latest =
        latestSessions.find((session) => session.id === active.id) ?? active;
      terminal = new xterm.Terminal({
        cursorBlink: latest.status === "running",
        convertEol: false,
        fontFamily:
          '"Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
        fontSize: 12,
        scrollback: 5_000,
        theme: {
          background: "#111111",
          foreground: "#e5e5e5",
          cursor: "#fafafa",
          selectionBackground: "#525252",
        },
      });
      const fit = new fitModule.FitAddon();
      terminal.loadAddon(fit);
      terminal.open(host);
      if (latest.output) terminal.write(latest.output);
      const input = terminal.onData((data) => {
        void window.desktop.terminal.write(active.id, data).catch(() => {});
      });
      const unsubscribe = window.desktop.terminal.onEvent((event) => {
        if (event.sessionId !== active.id) return;
        if (event.type === "data") terminal?.write(event.data);
      });
      const resize = () => {
        if (!terminal || disposed) return;
        try {
          fit.fit();
          void window.desktop.terminal.resize(
            active.id,
            terminal.cols,
            terminal.rows
          );
        } catch {
          // The panel can be temporarily zero-sized while switching sections.
        }
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      terminal.focus();
      return () => {
        input.dispose();
        unsubscribe();
      };
    }).then((release) => {
      if (disposed) release?.();
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      terminal?.dispose();
      host.replaceChildren();
    };
  }, [activeId, workspaceId, chatId]);

  const startShell = async () => {
    setError(null);
    try {
      const session = await window.desktop.terminal.start(
        workspaceId,
        chatId
      );
      setSessions((current) => [...current, session]);
      setActiveId(session.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const runTest = async () => {
    if (!selectedScript) return;
    setError(null);
    try {
      const session = await window.desktop.terminal.startTest(
        workspaceId,
        selectedScript,
        chatId
      );
      setSessions((current) => [...current, session]);
      setActiveId(session.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const closeSession = async (id: string) => {
    await window.desktop.terminal.close(id);
    setSessions((current) => current.filter((session) => session.id !== id));
    setActiveId((current) => {
      if (current !== id) return current;
      return sessionsRef.current.filter((session) => session.id !== id).at(-1)
        ?.id ?? null;
    });
  };

  return (
    <section
      dir="ltr"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-[#111]"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#181818] p-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveId(session.id)}
              className={cn(
                "flex h-7 max-w-44 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-neutral-400",
                activeId === session.id && "bg-white/10 text-neutral-100"
              )}
            >
              {session.kind === "test" ? (
                <FlaskConicalIcon className="size-3" />
              ) : (
                <TerminalIcon className="size-3" />
              )}
              <span className="truncate">{session.title}</span>
              {session.status === "exited" ? (
                <span
                  className={cn(
                    "text-[10px]",
                    session.exitCode === 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {session.exitCode}
                </span>
              ) : null}
              <span
                role="button"
                tabIndex={0}
                aria-label="بستن ترمینال"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeSession(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void closeSession(session.id);
                }}
              >
                <XIcon className="size-3" />
              </span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label="ترمینال جدید"
          onClick={() => void startShell()}
        >
          <PlusIcon />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-[#151515] p-1.5">
        <select
          aria-label="اسکریپت آزمون"
          value={selectedScript}
          onChange={(event) => setSelectedScript(event.target.value)}
          className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] text-neutral-200 outline-none"
        >
          {scripts.length === 0 ? (
            <option value="">No test scripts</option>
          ) : null}
          {scripts.map((script) => (
            <option key={script.name} value={script.name}>
              {script.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px]"
          disabled={!selectedScript}
          onClick={() => void runTest()}
        >
          Run
        </Button>
      </div>

      {error ? (
        <p className="shrink-0 bg-red-950/60 px-2 py-1 text-[11px] text-red-200">
          {error}
        </p>
      ) : null}
      {activeId ? (
        <div ref={hostRef} className="min-h-0 flex-1 p-1" />
      ) : (
        <button
          type="button"
          onClick={() => void startShell()}
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-xs text-neutral-500 hover:text-neutral-300"
        >
          <TerminalIcon className="size-6" />
          Open a workspace terminal
        </button>
      )}
    </section>
  );
}
