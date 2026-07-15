import { AppShell } from "@/components/app-shell";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const initialChatId = useMemo(() => {
    const match = window.location.pathname.match(/\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }, []);

  return (
    <AppShell initialChatId={initialChatId}>
      <Outlet />
    </AppShell>
  );
}
