export type ProviderId = "deepseek" | "anthropic" | "openai";

export type ModelInfo = {
  id: string;
  /** Short label shown on the closed picker trigger */
  name: string;
  fullName: string;
  provider: ProviderId;
  description: string;
  contextLength: number;
  maxOutput: number;
  inputPricePerM: number;
  outputPricePerM: number;
  supportsImages: boolean;
  supportsReasoningEffort: boolean;
};

export const MODELS = [
  {
    id: "deepseek/deepseek-v4-flash",
    name: "V4 Flash",
    fullName: "DeepSeek V4 Flash",
    provider: "deepseek",
    description:
      "Fast MoE model for chat, coding, and agents with strong throughput and low cost.",
    contextLength: 1_048_576,
    maxOutput: 65_536,
    inputPricePerM: 0.09,
    outputPricePerM: 0.18,
    supportsImages: false,
    supportsReasoningEffort: false,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "V4 Pro",
    fullName: "DeepSeek V4 Pro",
    provider: "deepseek",
    description:
      "Flagship DeepSeek model for advanced reasoning, coding, and long agent workflows.",
    contextLength: 1_048_576,
    maxOutput: 384_000,
    inputPricePerM: 0.435,
    outputPricePerM: 0.87,
    supportsImages: false,
    supportsReasoningEffort: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Opus 4.8",
    fullName: "Claude Opus 4.8",
    provider: "anthropic",
    description:
      "Anthropic's most capable Opus model for autonomous agents and long-horizon work.",
    contextLength: 1_000_000,
    maxOutput: 128_000,
    inputPricePerM: 5,
    outputPricePerM: 25,
    supportsImages: true,
    supportsReasoningEffort: true,
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Sonnet 5",
    fullName: "Claude Sonnet 5",
    provider: "anthropic",
    description:
      "Frontier Sonnet-class model for coding, agents, and professional knowledge work.",
    contextLength: 1_000_000,
    maxOutput: 128_000,
    inputPricePerM: 2,
    outputPricePerM: 10,
    supportsImages: true,
    supportsReasoningEffort: true,
  },
  {
    id: "openai/gpt-5.6-luna",
    name: "Luna",
    fullName: "GPT-5.6 Luna",
    provider: "openai",
    description:
      "Fast, cost-efficient GPT-5.6 tier for high-volume and latency-sensitive workloads.",
    contextLength: 1_050_000,
    maxOutput: 128_000,
    inputPricePerM: 1,
    outputPricePerM: 6,
    supportsImages: true,
    supportsReasoningEffort: true,
  },
  {
    id: "openai/gpt-5.6-terra",
    name: "Terra",
    fullName: "GPT-5.6 Terra",
    provider: "openai",
    description:
      "Balanced GPT-5.6 tier between flagship Sol and cost-efficient Luna.",
    contextLength: 1_050_000,
    maxOutput: 128_000,
    inputPricePerM: 2.5,
    outputPricePerM: 15,
    supportsImages: true,
    supportsReasoningEffort: true,
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "Sol",
    fullName: "GPT-5.6 Sol",
    provider: "openai",
    description:
      "Flagship GPT-5.6 model for complex reasoning, coding, and agentic workflows.",
    contextLength: 1_050_000,
    maxOutput: 128_000,
    inputPricePerM: 5,
    outputPricePerM: 30,
    supportsImages: true,
    supportsReasoningEffort: true,
  },
] as const satisfies readonly ModelInfo[];

/** Built-in OpenRouter model ids; runtime catalog may include custom slugs. */
export type BuiltinModelId = (typeof MODELS)[number]["id"];
export type ModelId = string;

export const DEFAULT_MODEL: ModelId = "deepseek/deepseek-v4-flash";
export const DEFAULT_PROVIDER_ID = "openrouter";

export const MODEL_GROUPS = [
  {
    provider: "deepseek" as const,
    label: "DeepSeek",
    models: MODELS.filter((model) => model.provider === "deepseek"),
  },
  {
    provider: "anthropic" as const,
    label: "Anthropic",
    models: MODELS.filter((model) => model.provider === "anthropic"),
  },
  {
    provider: "openai" as const,
    label: "OpenAI",
    models: MODELS.filter((model) => model.provider === "openai"),
  },
] as const;

export const ALLOWED_MODEL_IDS = new Set<string>(MODELS.map((model) => model.id));

export function getModelById(id: string): ModelInfo | undefined {
  return MODELS.find((model) => model.id === id);
}

export function modelSupportsImages(id: string): boolean {
  return getModelById(id)?.supportsImages ?? false;
}

export function modelSupportsReasoningEffort(id: string): boolean {
  return getModelById(id)?.supportsReasoningEffort ?? false;
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }

  if (count >= 1_000) {
    const thousands = count / 1_000;
    return Number.isInteger(thousands) ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }

  return count.toLocaleString("en-US");
}

export function formatModelPrice(model: ModelInfo): string {
  const input = formatUsd(model.inputPricePerM);
  const output = formatUsd(model.outputPricePerM);
  return `${input} / ${output}`;
}

function formatUsd(value: number): string {
  if (value >= 1) return `$${value}`;
  if (value >= 0.1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}
