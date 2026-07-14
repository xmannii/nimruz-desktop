import { Chat } from "@/components/chat";
import { ThemeProvider } from "@/components/theme-provider";
import { DirectionProvider } from "@/components/ui/direction";
import { TooltipProvider } from "@/components/ui/tooltip";

function getInitialChatId(): string | undefined {
  const match = window.location.pathname.match(/\/chat\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <DirectionProvider direction="rtl">
        <TooltipProvider>
          <Chat initialChatId={getInitialChatId()} />
        </TooltipProvider>
      </DirectionProvider>
    </ThemeProvider>
  );
}
