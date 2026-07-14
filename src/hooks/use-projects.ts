"use client";

import {
  deleteLocalProject,
  loadLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/chat/storage";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";

export type ProjectInput = {
  title: string;
  description?: string;
};

function normalizeProjectInput(input: ProjectInput) {
  const title = input.title.trim().replace(/\s+/g, " ");
  const description = input.description?.trim() ?? "";

  if (!title) {
    throw new Error("Project title is required.");
  }

  return { title, description };
}

export function useProjects() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadLocalProjects()
      .then((loadedProjects) => {
        if (cancelled) return;

        setProjects(
          loadedProjects.filter(
            (project) =>
              typeof project.id === "string" &&
              typeof project.title === "string" &&
              project.title.trim().length > 0
          )
        );
      })
      .catch((error) => {
        console.error("Failed to load local projects:", error);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createProject = useCallback((input: ProjectInput) => {
    const normalizedInput = normalizeProjectInput(input);
    const now = Date.now();
    const project: LocalProject = {
      id: nanoid(),
      ...normalizedInput,
      createdAt: now,
      updatedAt: now,
    };

    setProjects((current) => [project, ...current]);
    void saveLocalProject(project).catch((error) => {
      console.error("Failed to save local project:", error);
    });

    return project;
  }, []);

  const updateProject = useCallback((id: string, input: ProjectInput) => {
    const normalizedInput = normalizeProjectInput(input);

    setProjects((current) => {
      const existingProject = current.find((project) => project.id === id);
      if (!existingProject) return current;

      const updatedProject: LocalProject = {
        ...existingProject,
        ...normalizedInput,
        updatedAt: Date.now(),
      };

      void saveLocalProject(updatedProject).catch((error) => {
        console.error("Failed to update local project:", error);
      });

      return [
        updatedProject,
        ...current.filter((project) => project.id !== id),
      ];
    });
  }, []);

  const removeProject = useCallback((id: string) => {
    setProjects((current) => current.filter((project) => project.id !== id));
    void deleteLocalProject(id).catch((error) => {
      console.error("Failed to delete local project:", error);
    });
  }, []);

  return {
    projects,
    isHydrated,
    createProject,
    updateProject,
    removeProject,
  };
}
