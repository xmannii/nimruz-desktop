import { ChatView } from "@/components/chat/chat-view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/workspace/$workspaceId/chat/$chatId")({
  component: WorkspaceChatPage,
});

function WorkspaceChatPage() {
  const { workspaceId, chatId } = Route.useParams();
  return <ChatView chatId={chatId} workspaceId={workspaceId} />;
}
