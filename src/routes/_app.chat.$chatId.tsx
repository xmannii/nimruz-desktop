import { ChatView } from "@/components/chat/chat-view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/chat/$chatId")({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  return <ChatView chatId={chatId} />;
}
