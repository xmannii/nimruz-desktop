import { ThemeProvider } from "@/components/theme-provider";
import { AppearanceProvider } from "@/components/appearance-provider";
import { SpeechProvider } from "@/components/speech/speech-provider";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Outlet,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const isCompanion = useRouterState({
    select: (state) => state.location.pathname === "/companion",
  });
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppearanceProvider>
        <DirectionProvider direction="rtl">
          <SpeechProvider>
            <TooltipProvider>
              <Outlet />
              <Toaster richColors position="top-center" />
              {import.meta.env.DEV && !isCompanion ? (
                <TanStackRouterDevtools position="bottom-left" />
              ) : null}
            </TooltipProvider>
          </SpeechProvider>
        </DirectionProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
