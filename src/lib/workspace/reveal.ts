/**
 * Lightweight in-app channel for asking the workspace panel to reveal a file,
 * artifact, task, or run. Used by chat tool cards to deep-link into the panel
 * without prop drilling across the tree.
 */

export type RevealTarget =
  | { kind: "file"; workspaceId: string; path: string }
  | { kind: "artifact"; workspaceId: string; artifactId: string }
  | { kind: "task"; workspaceId: string; taskId: string }
  | { kind: "plan"; workspaceId: string; planId: string }
  | { kind: "run"; workspaceId: string; runId: string };

const EVENT_NAME = "nimruz:workspace-reveal";

const target: EventTarget | null =
  typeof window === "undefined" ? null : new EventTarget();

export function requestReveal(detail: RevealTarget): void {
  target?.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function onReveal(
  callback: (detail: RevealTarget) => void
): () => void {
  if (!target) return () => {};
  const handler = (event: Event) => {
    callback((event as CustomEvent<RevealTarget>).detail);
  };
  target.addEventListener(EVENT_NAME, handler);
  return () => target.removeEventListener(EVENT_NAME, handler);
}
