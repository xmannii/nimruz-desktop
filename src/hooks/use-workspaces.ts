"use client";

import {
  deleteLocalWorkspace,
  loadLocalWorkspaces,
  saveLocalWorkspace,
} from "@/lib/chat/storage";
import {
  createHomeWorkspace,
  DEFAULT_WORKSPACE_TRUST,
  HOME_WORKSPACE_ID,
  isHomeWorkspace,
  loadStoredActiveWorkspaceId,
  writeStoredActiveWorkspaceId,
  type LocalWorkspace,
  type WorkspaceInput,
  type WorkspaceRoot,
  type WorkspaceTrustSettings,
} from "@/lib/workspace";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";

export type { WorkspaceInput };

function normalizeWorkspaceInput(input: WorkspaceInput) {
  const title = input.title.trim().replace(/\s+/g, " ");
  const description = input.description?.trim() ?? "";
  const instructions = input.instructions?.trim() ?? "";

  if (!title) {
    throw new Error("Workspace title is required.");
  }

  return { title, description, instructions };
}

function sortWorkspaces(workspaces: LocalWorkspace[]): LocalWorkspace[] {
  return [...workspaces].sort((a, b) => {
    if (isHomeWorkspace(a)) return -1;
    if (isHomeWorkspace(b)) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<
    string | null
  >(null);
  const [workspaceRoots, setWorkspaceRoots] = useState<WorkspaceRoot[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadLocalWorkspaces()
      .then(async (loaded) => {
        if (cancelled) return;

        let next = loaded.filter(
          (workspace) =>
            typeof workspace.id === "string" &&
            typeof workspace.title === "string" &&
            workspace.title.trim().length > 0
        );

        if (!next.some((workspace) => isHomeWorkspace(workspace))) {
          const home = createHomeWorkspace();
          next = [home, ...next];
          try {
            await saveLocalWorkspace(home);
          } catch (error) {
            console.error("Failed to create Home workspace:", error);
          }
        }

        next = sortWorkspaces(next);
        setWorkspaces(next);

        const active = await loadStoredActiveWorkspaceId(
          next.map((workspace) => workspace.id)
        );
        if (cancelled) return;
        setActiveWorkspaceIdState(active);
        writeStoredActiveWorkspaceId(active);
      })
      .catch((error) => {
        console.error("Failed to load workspaces:", error);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setWorkspaceRoots([]);
      return;
    }

    let cancelled = false;
    void window.desktop.storage
      .loadWorkspaceRoots(activeWorkspaceId)
      .then((roots) => {
        if (!cancelled) setWorkspaceRoots(roots);
      })
      .catch((error) => {
        console.error("Failed to load workspace roots:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    const next = id ?? HOME_WORKSPACE_ID;
    setActiveWorkspaceIdState(next);
    writeStoredActiveWorkspaceId(next);
  }, []);

  const createWorkspace = useCallback((input: WorkspaceInput) => {
    const normalizedInput = normalizeWorkspaceInput(input);
    const folderPath = input.primaryFolderPath?.trim();
    if (!folderPath) {
      throw new Error("A working folder is required for project workspaces.");
    }

    const now = Date.now();
    const workspace: LocalWorkspace = {
      id: nanoid(),
      ...normalizedInput,
      trust: {
        ...DEFAULT_WORKSPACE_TRUST,
        ...input.trust,
      },
      createdAt: now,
      updatedAt: now,
    };

    setWorkspaces((current) => sortWorkspaces([workspace, ...current]));
    setActiveWorkspaceId(workspace.id);
    void saveLocalWorkspace(workspace)
      .then(async () => {
        const root = await window.desktop.storage.addLinkedWorkspaceRoot(
          workspace.id,
          { path: folderPath, makePrimary: true }
        );
        if (root) {
          setWorkspaceRoots((current) =>
            current.some((item) => item.id === root.id)
              ? current
              : [...current, root]
          );
        }
      })
      .catch((error) => {
        console.error("Failed to save workspace:", error);
      });

    return workspace;
  }, [setActiveWorkspaceId]);

  const updateWorkspace = useCallback((id: string, input: WorkspaceInput) => {
    if (isHomeWorkspace(id)) {
      // Home keeps a fixed title; allow description/instructions edits only.
      const description = input.description?.trim() ?? "";
      const instructions = input.instructions?.trim() ?? "";
      setWorkspaces((current) => {
        const existing = current.find((workspace) => workspace.id === id);
        if (!existing) return current;
        const updated: LocalWorkspace = {
          ...existing,
          description,
          instructions,
          trust: {
            ...existing.trust,
            ...input.trust,
          },
          updatedAt: Date.now(),
        };
        void saveLocalWorkspace(updated).catch((error) => {
          console.error("Failed to update workspace:", error);
        });
        return sortWorkspaces([
          updated,
          ...current.filter((workspace) => workspace.id !== id),
        ]);
      });
      return;
    }

    const normalizedInput = normalizeWorkspaceInput(input);

    setWorkspaces((current) => {
      const existing = current.find((workspace) => workspace.id === id);
      if (!existing) return current;

      const updated: LocalWorkspace = {
        ...existing,
        ...normalizedInput,
        trust: {
          ...existing.trust,
          ...input.trust,
        },
        updatedAt: Date.now(),
      };

      void saveLocalWorkspace(updated).catch((error) => {
        console.error("Failed to update workspace:", error);
      });

      return sortWorkspaces([
        updated,
        ...current.filter((workspace) => workspace.id !== id),
      ]);
    });
  }, []);

  const updateWorkspaceTrust = useCallback(
    async (id: string, trust: WorkspaceTrustSettings) => {
      const updated = await window.desktop.storage.updateWorkspaceTrust(
        id,
        trust
      );
      setWorkspaces((current) =>
        sortWorkspaces(
          current.map((workspace) =>
            workspace.id === id ? updated : workspace
          )
        )
      );
      return updated;
    },
    []
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      if (isHomeWorkspace(id)) {
        throw new Error("Cannot delete the Home workspace.");
      }
      setWorkspaces((current) => {
        const next = current.filter((workspace) => workspace.id !== id);
        if (activeWorkspaceId === id) {
          setActiveWorkspaceId(HOME_WORKSPACE_ID);
        }
        return sortWorkspaces(next);
      });
      void deleteLocalWorkspace(id).catch((error) => {
        console.error("Failed to delete workspace:", error);
      });
    },
    [activeWorkspaceId, setActiveWorkspaceId]
  );

  const addLinkedRoot = useCallback(
    async (
      workspaceId: string,
      options?: { path?: string; makePrimary?: boolean }
    ) => {
      const root = await window.desktop.storage.addLinkedWorkspaceRoot(
        workspaceId,
        options
      );
      if (!root) return null;
      setWorkspaceRoots((current) => {
        const withoutStale = options?.makePrimary
          ? current.map((item) => ({ ...item, isPrimary: false }))
          : current;
        const existingIndex = withoutStale.findIndex(
          (item) => item.id === root.id
        );
        if (existingIndex >= 0) {
          const next = [...withoutStale];
          next[existingIndex] = root;
          return next;
        }
        return [...withoutStale, root];
      });
      return root;
    },
    []
  );

  const setPrimaryRoot = useCallback(
    async (workspaceId: string, rootId: string) => {
      const roots = await window.desktop.storage.setPrimaryWorkspaceRoot(
        workspaceId,
        rootId
      );
      setWorkspaceRoots(roots);
      return roots;
    },
    []
  );

  const chooseWorkingFolder = useCallback(async () => {
    const picked = await window.desktop.storage.pickDirectory();
    return picked?.path ?? null;
  }, []);

  const removeRoot = useCallback(async (rootId: string) => {
    await window.desktop.storage.removeWorkspaceRoot(rootId);
    setWorkspaceRoots((current) =>
      current.filter((root) => root.id !== rootId)
    );
  }, []);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces.find((workspace) => isHomeWorkspace(workspace)) ??
    null;

  const homeWorkspace =
    workspaces.find((workspace) => isHomeWorkspace(workspace)) ?? null;

  return {
    workspaces,
    homeWorkspace,
    activeWorkspace,
    activeWorkspaceId: activeWorkspaceId ?? HOME_WORKSPACE_ID,
    workspaceRoots,
    isHydrated,
    setActiveWorkspaceId,
    createWorkspace,
    updateWorkspace,
    updateWorkspaceTrust,
    removeWorkspace,
    addLinkedRoot,
    setPrimaryRoot,
    chooseWorkingFolder,
    removeRoot,
    /** @deprecated */
    projects: workspaces,
    /** @deprecated */
    createProject: createWorkspace,
    /** @deprecated */
    updateProject: updateWorkspace,
    /** @deprecated */
    removeProject: removeWorkspace,
  };
}

/** @deprecated Use useWorkspaces */
export { useWorkspaces as useProjects };
/** @deprecated */
export type ProjectInput = WorkspaceInput;
