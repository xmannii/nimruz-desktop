import { ChatView } from "@/components/chat/chat-view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  component: HomeChatPage,
});

function HomeChatPage() {
  return <ChatView />;
}
