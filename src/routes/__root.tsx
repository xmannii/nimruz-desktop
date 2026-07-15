import { ThemeProvider } from "@/components/theme-provider";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <DirectionProvider direction="rtl">
        <TooltipProvider>
          <Outlet />
          <Toaster richColors position="top-center" dir="rtl" />
          {import.meta.env.DEV ? (
            <TanStackRouterDevtools position="bottom-left" />
          ) : null}
        </TooltipProvider>
      </DirectionProvider>
    </ThemeProvider>
  );
}
