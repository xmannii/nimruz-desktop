"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";

type WebSearchToolPart = {
  type: "tool-web_search";
  toolCallId: string;
  state: string;
  input?: {
    query?: string;
  };
  output?: {
    success?: boolean;
    query?: string;
    results?: Array<{ title: string; url: string; snippet: string }>;
    error?: string;
  };
};

type FetchUrlToolPart = {
  type: "tool-fetch_url";
  toolCallId: string;
  state: string;
  input?: {
    url?: string;
  };
  output?: {
    success?: boolean;
    url?: string;
    finalUrl?: string;
    title?: string;
    content?: string;
    error?: string;
  };
};

export function ChatWebSearchToolPart({ part }: { part: WebSearchToolPart }) {
  const query = part.input?.query ?? part.output?.query;
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError =
    part.state === "output-error" || part.output?.success === false;
  const results = part.output?.results ?? [];

  const label = isLoading ? (
    <>در حال جستجو{query ? `: ${query}` : "…"}</>
  ) : isError ? (
    part.output?.error
      ? `خطا در جستجو: ${part.output.error}`
      : "خطا در جستجو"
  ) : (
    <>جستجو: {query ?? "وب"} — {results.length} نتیجه</>
  );

  return (
    <ChatToolInvocation
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={results.length > 0 && !isLoading && !isError}
    >
      {results.length > 0 ? (
        <ul dir="rtl" className="space-y-2 text-sm leading-6">
          {results.map((result) => (
            <li key={result.url} className="border-b border-border/40 pb-2 last:border-0">
              <p className="font-medium">{result.title}</p>
              <p dir="ltr" className="truncate text-xs text-primary">
                {result.url}
              </p>
              {result.snippet ? (
                <p className="mt-1 text-muted-foreground">{result.snippet}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </ChatToolInvocation>
  );
}

export function ChatFetchUrlToolPart({ part }: { part: FetchUrlToolPart }) {
  const url = part.input?.url ?? part.output?.url ?? part.output?.finalUrl;
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError =
    part.state === "output-error" || part.output?.success === false;
  const content = part.output?.content?.trim();
  const title = part.output?.title;

  const label = isLoading ? (
    <>در حال دریافت{url ? `: ${url}` : "…"}</>
  ) : isError ? (
    part.output?.error
      ? `خطا در دریافت صفحه: ${part.output.error}`
      : "خطا در دریافت صفحه"
  ) : (
    <>دریافت شد: {title ?? url ?? "صفحه"}</>
  );

  return (
    <ChatToolInvocation
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={Boolean(content) && !isLoading && !isError}
    >
      {content ? (
        <pre
          dir="ltr"
          className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-left text-xs leading-5 text-muted-foreground"
        >
          {content}
        </pre>
      ) : null}
    </ChatToolInvocation>
  );
}
