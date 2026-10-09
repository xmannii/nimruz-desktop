"use client";

import { useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { Button } from "@/components/ui/button";
import { OPENROUTER_PROVIDER_ID } from "@/lib/models/catalog";
import { STUDIO_TAB_LABELS } from "@/lib/studio/format";
import { placeTourCard, type TourRect, type TourSide } from "@/lib/studio/tour";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { AudioLinesIcon, FileAudioIcon, FilmIcon, ImageIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Elements opt in with `data-studio-tour="<anchor>"`. */
export type StudioTourAnchor = "tools" | "composer" | "model" | "enhance" | "services" | "history";

type TourStep = {
  id: string;
  anchor?: StudioTourAnchor;
  side?: TourSide;
  title: string;
  body: (context: { openRouterReady: boolean | null }) => ReactNode;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "به استودیو خوش آمدید",
    body: () => (
      <>
        <span className="block">
          تصویر، ویدیو، صدا و رونویسی را همین‌جا بسازید. هرچه می‌سازید در تاریخچه می‌ماند.
        </span>
        <span className="mt-3 grid grid-cols-4 gap-1.5">
          {(
            [
              ["image", ImageIcon],
              ["video", FilmIcon],
              ["speech", AudioLinesIcon],
              ["transcribe", FileAudioIcon],
            ] as const
          ).map(([tab, Icon]) => (
            <span
              key={tab}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/60 py-2.5 text-[11px] text-foreground/80"
            >
              <Icon className="size-4 text-muted-foreground" />
              {STUDIO_TAB_LABELS[tab]}
            </span>
          ))}
        </span>
      </>
    ),
  },
  {
    id: "tools",
    anchor: "tools",
    side: "left",
    title: "ابزارها",
    body: () =>
      "بین تصویر، ویدیو، صدا و رونویسی از اینجا جابه‌جا شوید. کاری که در حال ساخت باشد، کنار ابزارش نشانگر می‌گیرد.",
  },
  {
    id: "composer",
    anchor: "composer",
    side: "top",
    title: "بنویسید و بسازید",
    body: () =>
      "توضیح دهید چه می‌خواهید و Enter را بزنید. می‌توانید تصویر مرجع هم بچسبانید. ساخت در پس‌زمینه ادامه دارد؛ لازم نیست منتظر بمانید.",
  },
  {
    id: "model",
    anchor: "model",
    side: "top",
    title: "مدل و تنظیمات",
    body: () =>
      "مدل‌ها بر اساس سرویس دسته‌بندی شده‌اند و جدیدترین‌ها برچسب «جدید» دارند. تنظیمات هر ابزار، مثل ابعاد یا صدا، کنار همین دکمه است.",
  },
  {
    id: "enhance",
    anchor: "enhance",
    side: "top",
    title: "بهبود درخواست",
    body: () =>
      "یک ایده کوتاه بنویسید و ✨ را بزنید تا کامل‌تر شود؛ در بخش صدا، برچسب‌های حس اضافه می‌کند. مدل دستیار را از فلش کنارش عوض کنید.",
  },
  {
    id: "services",
    anchor: "services",
    side: "bottom",
    title: "سرویس‌ها و کلیدها",
    body: ({ openRouterReady }) =>
      openRouterReady === false
        ? "برای شروع فقط کلید OpenRouter لازم است. Google AI Studio، Black Forest Labs و ElevenLabs اختیاری‌اند و مدل‌های بیشتری اضافه می‌کنند."
        : "Google AI Studio، Black Forest Labs و ElevenLabs را از اینجا وصل کنید تا مدل‌های بیشتری در دسترس باشد.",
  },
  {
    id: "history",
    anchor: "history",
    side: "bottom",
    title: "تاریخچه",
    body: () =>
      "هرچه بسازید ذخیره می‌شود؛ جستجو کنید، دوباره بسازید یا فایل را ذخیره کنید. این راهنما را هر وقت خواستید از دکمه ؟ دوباره ببینید.",
  },
];

const SPOTLIGHT_PADDING = 6;

function findAnchor(anchor: StudioTourAnchor): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-studio-tour="${anchor}"]`);
  // Hidden tabs and responsive variants stay mounted; pick the visible one.
  for (const node of nodes) if (node.getClientRects().length > 0) return node;
  return null;
}

function toPersianDigits(value: number) {
  return value.toLocaleString("fa-IR");
}

/**
 * First-run walkthrough for Studio. Dims the page, spotlights one control at
 * a time and explains it in a small card. Steps whose control is not on
 * screen (e.g. the enhance button on the transcription tab) are skipped.
 */
export function StudioTour({
  open,
  onClose,
}: {
  open: boolean;
  /** Called once when the tour ends, however it ends. */
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const openRouterReady = useOpenRouterKeyConfigured();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TourRect | null>(null);
  const [cardSize, setCardSize] = useState({ width: 320, height: 200 });
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const step = steps[index] as TourStep | undefined;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setSteps(STEPS.filter((candidate) => !candidate.anchor || findAnchor(candidate.anchor)));
  }, [open]);

  const finish = useCallback(
    (focusComposer = false) => {
      onClose();
      if (focusComposer) {
        window.requestAnimationFrame(() => {
          findAnchor("composer")?.querySelector("textarea")?.focus();
        });
      }
    },
    [onClose]
  );

  const next = useCallback(() => {
    if (isLast) finish(true);
    else setIndex((value) => Math.min(value + 1, steps.length - 1));
  }, [finish, isLast, steps.length]);

  const back = useCallback(() => setIndex((value) => Math.max(value - 1, 0)), []);

  // Follow the highlighted control while layout settles (sidebar animation,
  // window resizes, a composer growing). One rect read per frame is cheap.
  const anchor = step?.anchor;
  useEffect(() => {
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    findAnchor(anchor)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    let frame = 0;
    let last = "";
    const tick = () => {
      const node = findAnchor(anchor);
      if (node) {
        const box = node.getBoundingClientRect();
        const key = `${box.top}|${box.left}|${box.width}|${box.height}`;
        if (key !== last) {
          last = key;
          setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(frame);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!open || !node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      setCardSize((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, step?.id]);

  useEffect(() => {
    if (open && step) primaryRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    // RTL: the left arrow moves forward.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowLeft") next();
      else if (event.key === "ArrowRight") back();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, finish, next, back]);

  if (!open || !step) return null;

  const spotlight = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;
  const placement = spotlight
    ? placeTourCard(spotlight, cardSize, viewport, step.side ?? "bottom")
    : {
        top: Math.max(12, (viewport.height - cardSize.height) / 2),
        left: Math.max(12, (viewport.width - cardSize.width) / 2),
      };
  // Count only the spotlight steps, so "۱ از ۶" starts after the welcome card.
  const counted = steps.filter((candidate) => candidate.anchor);
  const position = counted.indexOf(step) + 1;
  const showKeyAction = step.id === "services" && openRouterReady === false;

  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-[70] animate-in fade-in-0 duration-200">
      {/* Swallows clicks so the page cannot change under the tour. */}
      <div className="absolute inset-0" aria-hidden />
      {spotlight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl ring-1 ring-white/30 transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none"
          style={{ ...spotlight, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)" }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/50" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          "absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl",
          spotlight && "transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        )}
        style={{ top: placement.top, left: placement.left }}
      >
        <div key={step.id} className="animate-in fade-in-0 duration-200">
          <div className="flex items-start gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 text-sm font-medium">
              {step.title}
            </h2>
            {position > 0 ? (
              <span className="pt-px text-[11px] tabular-nums text-muted-foreground">
                {toPersianDigits(position)} از {toPersianDigits(counted.length)}
              </span>
            ) : null}
            <button
              type="button"
              aria-label="بستن راهنما"
              className="-me-1.5 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => finish()}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          <p id={bodyId} className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
            {step.body({ openRouterReady })}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          <Button ref={primaryRef} type="button" size="sm" onClick={next}>
            {isFirst ? "نمایش راهنما" : isLast ? "شروع ساخت" : "بعدی"}
          </Button>
          {isFirst ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => finish()}>
              بعداً
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={back}>
              قبلی
            </Button>
          )}
          {showKeyAction ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ms-auto"
              onClick={() => {
                finish();
                void navigate({
                  to: "/settings/models/providers",
                  search: { provider: OPENROUTER_PROVIDER_ID },
                });
              }}
            >
              افزودن کلید
            </Button>
          ) : position > 0 ? (
            <span className="ms-auto flex items-center gap-1" aria-hidden>
              {counted.map((candidate) => (
                <span
                  key={candidate.id}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-200",
                    candidate === step ? "w-3.5 bg-foreground/70" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
