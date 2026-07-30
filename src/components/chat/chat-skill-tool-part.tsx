"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { MessageResponse } from "@/components/ai-elements/message";
import { SparklesIcon } from "lucide-react";

type LoadSkillToolPart = {
  type: "tool-load_skill" | "tool-create_skill";
  toolCallId: string;
  state: string;
  input?: {
    name?: string;
    description?: string;
    instructions?: string;
  };
  output?: {
    success?: boolean;
    name?: string;
    description?: string;
    directory?: string;
    content?: string;
    error?: string;
  };
  errorText?: string;
};

export function ChatSkillToolPart({ part }: { part: LoadSkillToolPart }) {
  const isCreate = part.type === "tool-create_skill";
  const skillName = part.input?.name ?? part.output?.name;
  const isLoading =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const isError =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    part.output?.success === false;
  const skillContent = isCreate
    ? part.input?.instructions?.trim()
    : part.output?.content?.trim();
  const errorMessage = part.output?.error ?? part.errorText;

  const label = isLoading ? (
    <>
      {isCreate ? "در حال ساخت مهارت" : "در حال بارگذاری مهارت"}
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
    errorMessage
      ? `خطا در ${isCreate ? "ساخت" : "بارگذاری"} مهارت: ${errorMessage}`
      : `خطا در ${isCreate ? "ساخت" : "بارگذاری"} مهارت`
  ) : (
    <>
      {isCreate ? "مهارت ساخته شد" : "مهارت بارگذاری شد"}
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
