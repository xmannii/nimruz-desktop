"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { MessageResponse } from "@/components/ai-elements/message";
import { BotIcon } from "lucide-react";

type ExpertToolPart = {
  type: string;
  state: string;
  input?: {
    name?: string;
    slug?: string;
    task?: string;
  };
  output?: unknown;
  errorText?: string;
};

function getExpertSlug(part: ExpertToolPart) {
  if (part.type === "tool-create_expert") {
    const output = part.output as { slug?: string } | undefined;
    return output?.slug ?? part.input?.slug;
  }
  return part.type.replace(/^tool-expert_/, "").replace(/_/g, "-");
}

function getExpertResponseText(output: unknown): string | null {
  if (typeof output === "string") {
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function getExpertError(part: ExpertToolPart): string | null {
  if (part.state === "output-error") {
    return (
      part.errorText ?? "ساخت یا اجرای متخصص ناموفق بود؛ دوباره تلاش کنید."
    );
  }

  const output = part.output as { success?: boolean; error?: string } | undefined;
  if (output && typeof output === "object" && output.success === false) {
    return (
      output.error ?? "ساخت یا اجرای متخصص ناموفق بود؛ دوباره تلاش کنید."
    );
  }

  return null;
}

export function ChatExpertToolPart({ part }: { part: ExpertToolPart }) {
  const isCreation = part.type === "tool-create_expert";
  const isDelegation = part.type.startsWith("tool-expert_");
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const slug = getExpertSlug(part);
  const error = getExpertError(part);
  const responseText = isDelegation ? getExpertResponseText(part.output) : null;

  const label = isLoading ? (
    isCreation ? (
      "در حال بررسی و ساخت متخصص…"
    ) : (
      <>
        متخصص{" "}
        <span dir="ltr" className="font-mono">
          /{slug}
        </span>{" "}
        در حال انجام درخواست است…
      </>
    )
  ) : error ? (
    error
  ) : isCreation ? (
    <>
      متخصص{" "}
      <span dir="ltr" className="font-mono">
        /{slug ?? "expert"}
      </span>{" "}
      ساخته و آماده استفاده شد
    </>
  ) : (
    <>
      متخصص{" "}
      <span dir="ltr" className="font-mono">
        /{slug}
      </span>{" "}
      پاسخ داد
    </>
  );

  return (
    <ChatToolInvocation
      icon={<BotIcon />}
      label={label}
      isLoading={isLoading}
      isError={Boolean(error)}
      expandable={Boolean(responseText)}
      panelTitle={part.input?.task ? "درخواست" : undefined}
    >
      {responseText ? (
        <>
          {part.input?.task ? (
            <p className="mb-2 text-xs leading-5 text-muted-foreground">
              {part.input.task}
            </p>
          ) : null}
          <MessageResponse
            dir="rtl"
            mode="static"
            className="text-right text-sm leading-7"
          >
            {responseText}
          </MessageResponse>
        </>
      ) : null}
    </ChatToolInvocation>
  );
}
