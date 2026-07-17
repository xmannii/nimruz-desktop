"use client";

import { useAppShell } from "@/components/app-shell-context";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/workspace/$workspaceId")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams();
  const { activeWorkspaceId, setActiveWorkspaceId } = useAppShell();

  useEffect(() => {
    if (workspaceId && workspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId, setActiveWorkspaceId]);

  return <Outlet />;
}
