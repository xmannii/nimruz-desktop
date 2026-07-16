"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { MessageResponse } from "@/components/ai-elements/message";
import { SparklesIcon } from "lucide-react";

type LoadSkillToolPart = {
  type: "tool-load_skill";
  toolCallId: string;
  state: string;
  input?: {
    name?: string;
  };
  output?: {
    success?: boolean;
    name?: string;
    content?: string;
    error?: string;
  };
};

export function ChatSkillToolPart({ part }: { part: LoadSkillToolPart }) {
  const skillName = part.input?.name ?? part.output?.name;
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError =
    part.state === "output-error" || part.output?.success === false;
  const skillContent = part.output?.content?.trim();
  const errorMessage = part.output?.error;

  const label = isLoading ? (
    <>
      در حال بارگذاری مهارت
      {skillName ? (
        <>
          {" "}
          <span dir="ltr" className="font-mono">
            {skillName}
          </span>
        </>
      ) : (
        "…"
      )}
    </>
  ) : isError ? (
    errorMessage ? `خطا در بارگذاری مهارت: ${errorMessage}` : "خطا در بارگذاری مهارت"
  ) : (
    <>
      مهارت بارگذاری شد
      {skillName ? (
        <>
          {" "}
          <span dir="ltr" className="font-mono">
            {skillName}
          </span>
        </>
      ) : null}
    </>
  );

  return (
    <ChatToolInvocation
      icon={<SparklesIcon />}
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={Boolean(skillContent) && !isLoading && !isError}
    >
      {skillContent ? (
        <MessageResponse
          dir="rtl"
          mode="static"
          className="text-right text-sm leading-7"
        >
          {skillContent}
        </MessageResponse>
      ) : null}
    </ChatToolInvocation>
  );
}
