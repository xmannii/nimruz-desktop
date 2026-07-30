"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { GlobeIcon } from "lucide-react";

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
  errorText?: string;
};

type WebSearchToolPart = {
  type: "tool-web_search";
  toolCallId: string;
  state: string;
  input?: {
    query?: string;
    max_results?: number;
  };
  output?: {
    success?: boolean;
    query?: string;
    results?: { title: string; url: string; snippet?: string }[];
    error?: string;
  };
  errorText?: string;
};

function formatFetchUrlError(error?: string | null): string {
  if (!error?.trim()) {
    return "دریافت صفحه ناموفق بود. دوباره تلاش کنید.";
  }

  const normalized = error.trim();

  if (normalized === "Invalid URL.") {
    return "آدرس URL نامعتبر است.";
  }
  if (/Only http and https URLs are allowed/.test(normalized)) {
    return "فقط آدرس‌های http و https مجاز هستند.";
  }
  if (/Private or local URLs are not allowed/.test(normalized)) {
    return "آدرس‌های محلی یا خصوصی مجاز نیستند.";
  }
  if (/^Fetch HTTP (\d+)$/.test(normalized)) {
    const status = normalized.match(/^Fetch HTTP (\d+)$/)?.[1];
    return `خطای شبکه هنگام دریافت صفحه (کد ${status}).`;
  }
  if (/timeout|timed out|aborted/i.test(normalized)) {
    return "زمان دریافت صفحه تمام شد. دوباره تلاش کنید.";
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(normalized)) {
    return "اتصال به صفحه برقرار نشد. آدرس یا اینترنت را بررسی کنید.";
  }

  return normalized;
}

function getFetchUrlError(part: FetchUrlToolPart, hasResult: boolean): string | null {
  if (hasResult) return null;

  if (part.state === "output-error") {
    return formatFetchUrlError(part.errorText);
  }

  if (part.output?.success === false) {
    return formatFetchUrlError(part.output.error);
  }

  return null;
}

export function ChatFetchUrlToolPart({ part }: { part: FetchUrlToolPart }) {
  const url = part.input?.url ?? part.output?.url ?? part.output?.finalUrl;
  const isLoading =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const content = part.output?.content?.trim();
  const title = part.output?.title;
  const hasResult = Boolean(content || title);
  const errorMessage = getFetchUrlError(part, hasResult);
  const isError = Boolean(errorMessage) && !isLoading;

  const label = isLoading ? (
    <>در حال دریافت صفحه{url ? `: ${url}` : "…"}</>
  ) : isError ? (
    <>دریافت صفحه ناموفق بود</>
  ) : (
    <>دریافت شد: {title ?? url ?? "صفحه"}</>
  );

  const panel = !isLoading ? (
    <div dir="rtl" className="space-y-3 text-sm leading-6">
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">آدرس</p>
        <p
          dir="ltr"
          className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-left font-mono text-xs leading-5 break-all"
        >
          {url?.trim() || "—"}
        </p>
      </div>

      {title ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">عنوان</p>
          <p className="text-xs text-foreground">{title}</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-destructive/80">خطا</p>
          <p className="text-xs leading-6 text-destructive/90">{errorMessage}</p>
        </div>
      ) : null}

      {content ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">محتوا</p>
          <pre
            dir="ltr"
            className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-background/40 px-2.5 py-2 text-left text-xs leading-5 text-muted-foreground"
          >
            {content}
          </pre>
        </div>
      ) : !errorMessage ? (
        <p className="text-xs text-muted-foreground">محتوایی برگردانده نشد.</p>
      ) : null}
    </div>
  ) : null;

  return (
    <ChatToolInvocation
      icon={<GlobeIcon />}
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={Boolean(panel)}
      panelTitle="جزئیات دریافت"
    >
      {panel}
    </ChatToolInvocation>
  );
}

export function ChatWebSearchToolPart({ part }: { part: WebSearchToolPart }) {
  const query = part.input?.query ?? part.output?.query;
  const results = part.output?.results ?? [];
  const isLoading =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const error =
    part.state === "output-error"
      ? part.errorText
      : part.output?.success === false
        ? part.output.error
        : undefined;
  const isError = Boolean(error) && !isLoading;

  const label = isLoading ? (
    <>در حال جستجوی وب{query ? `: ${query}` : "…"}</>
  ) : isError ? (
    <>جستجوی وب ناموفق بود</>
  ) : (
    <>یافت شد: {results.length} نتیجه</>
  );

  const panel = !isLoading ? (
    <div dir="rtl" className="space-y-3 text-sm leading-6">
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">عبارت جستجو</p>
        <p className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs text-foreground">
          {query?.trim() || "—"}
        </p>
      </div>

      {error ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-destructive/80">خطا</p>
          <p className="text-xs leading-6 text-destructive/90">{formatFetchUrlError(error)}</p>
        </div>
      ) : results.length ? (
        <ol className="space-y-2">
          {results.map((result, index) => (
            <li key={`${result.url}-${index}`} className="rounded-lg border border-border/50 bg-background/40 p-2.5">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="block text-xs font-medium text-primary hover:underline"
              >
                {result.title}
              </a>
              <p dir="ltr" className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {result.url}
              </p>
              {result.snippet ? <p className="mt-1.5 text-xs text-muted-foreground">{result.snippet}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">نتیجه‌ای پیدا نشد.</p>
      )}
    </div>
  ) : null;

  return (
    <ChatToolInvocation
      icon={<GlobeIcon />}
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={Boolean(panel)}
      panelTitle="نتایج جستجو"
    >
      {panel}
    </ChatToolInvocation>
  );
}
