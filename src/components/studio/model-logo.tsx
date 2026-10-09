import {
  MODEL_LOGOS,
  type LogoMarkup,
  type ModelLogoKey,
} from "@/components/studio/model-logos.data";
import { cn } from "@/lib/utils";

const VENDOR_LOGOS: Record<string, ModelLogoKey> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "black-forest-labs": "bfl",
  "x-ai": "xai",
  qwen: "qwen",
  alibaba: "alibaba",
  microsoft: "microsoft",
  meta: "meta",
  "meta-llama": "meta",
  recraft: "recraft",
  krea: "krea",
  tencent: "hunyuan",
  minimax: "minimax",
  kwaivgi: "kling",
  runway: "runway",
  "fish-audio": "fishaudio",
  mistralai: "mistral",
  openrouter: "openrouter",
  deepseek: "deepseek",
  bytedance: "bytedance",
  "bytedance-seed": "bytedance",
  elevenlabs: "elevenlabs",
};

/** Picks the brand mark for a model id, preferring the model family. */
export function resolveModelLogo(modelId: string, provider?: string): ModelLogoKey | null {
  const id = modelId.toLowerCase();
  const vendor = id.includes("/") ? id.split("/")[0] : "";
  if (provider === "elevenlabs" || vendor === "elevenlabs" || id.startsWith("eleven")) return "elevenlabs";
  if (/gemini|nano-banana/.test(id)) return "gemini";
  if (/imagen|veo/.test(id)) return "google";
  if (/hailuo/.test(id)) return "hailuo";
  if (/happyhorse/.test(id)) return "happyhorse";
  if (/kling/.test(id)) return "kling";
  if (provider === "bfl" || /flux/.test(id)) return "bfl";
  if (/seedance|seedream|seed-/.test(id)) return "bytedance";
  if (vendor && VENDOR_LOGOS[vendor]) return VENDOR_LOGOS[vendor];
  if (provider === "google") return "google";
  return null;
}

export function providerLogoKey(provider: string): ModelLogoKey | null {
  if (provider === "openrouter") return "openrouter";
  if (provider === "google") return "google";
  if (provider === "bfl") return "bfl";
  if (provider === "elevenlabs") return "elevenlabs";
  return null;
}

/**
 * Brand mark inside a neutral tile. Falls back to the vendor's initials so
 * unknown vendors still get a consistent, tidy mark.
 */
export function ModelLogo({
  logo,
  fallback,
  className,
  tile = true,
}: {
  logo: ModelLogoKey | null;
  fallback: string;
  className?: string;
  tile?: boolean;
}) {
  const markup: LogoMarkup | null = logo ? MODEL_LOGOS[logo] : null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center text-foreground",
        tile && "size-7 rounded-lg bg-background ring-1 ring-border/80",
        className
      )}
    >
      {markup ? (
        <svg
          viewBox={markup.viewBox}
          fill={markup.fill}
          fillRule={markup.fillRule}
          className="size-[58%]"
          // Static, build-time sanitized shape markup (see model-logos.data.ts).
          dangerouslySetInnerHTML={{ __html: markup.body }}
        />
      ) : (
        <span className="text-[9px] font-semibold uppercase text-muted-foreground">
          {fallback.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?"}
        </span>
      )}
    </span>
  );
}
