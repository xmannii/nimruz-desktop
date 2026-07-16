import { nanoid } from "nanoid";

export const MISSION_STATUSES = [
  "draft",
  "planning",
  "waiting_for_confirmation",
  "running",
  "waiting_for_approval",
  "paused",
  "blocked",
  "failed",
  "cancelled",
  "completed",
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MissionStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type MissionStep = {
  id: string;
  missionId: string;
  position: number;
  title: string;
  description: string;
  status: MissionStepStatus;
  dependsOn: string[];
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

export type Mission = {
  id: string;
  title: string;
  goal: string;
  status: MissionStatus;
  projectId: string | null;
  workspacePath: string | null;
  createdAt: number;
  updatedAt: number;
  steps: MissionStep[];
};

export type MissionInput = {
  title: string;
  goal: string;
  projectId?: string | null;
  workspacePath?: string | null;
  steps?: Array<{ title: string; description?: string }>;
};

export const MISSION_LIMITS = {
  title: 160,
  goal: 8_000,
  workspacePath: 1_000,
  maxSteps: 50,
  stepTitle: 240,
  stepDescription: 2_000,
} as const;

export function sanitizeMissionInput(value: unknown): MissionInput {
  const candidate = value && typeof value === "object" ? value as Partial<MissionInput> : {};
  const steps = Array.isArray(candidate.steps)
    ? candidate.steps.slice(0, MISSION_LIMITS.maxSteps).map((step) => ({
        title: typeof step?.title === "string" ? step.title.trim().slice(0, MISSION_LIMITS.stepTitle) : "",
        description: typeof step?.description === "string" ? step.description.trim().slice(0, MISSION_LIMITS.stepDescription) : "",
      })).filter((step) => step.title)
    : [];
  return {
    title: typeof candidate.title === "string" ? candidate.title.trim().slice(0, MISSION_LIMITS.title) : "",
    goal: typeof candidate.goal === "string" ? candidate.goal.trim().slice(0, MISSION_LIMITS.goal) : "",
    projectId: typeof candidate.projectId === "string" ? candidate.projectId : null,
    workspacePath: typeof candidate.workspacePath === "string" && candidate.workspacePath.trim()
      ? candidate.workspacePath.trim().slice(0, MISSION_LIMITS.workspacePath)
      : null,
    steps,
  };
}

export function createMission(value: unknown): Mission {
  const input = sanitizeMissionInput(value);
  if (!input.title || !input.goal) throw new Error("Mission title and goal are required.");
  const now = Date.now();
  const id = nanoid();
  return {
    id,
    title: input.title,
    goal: input.goal,
    status: "draft",
    projectId: input.projectId ?? null,
    workspacePath: input.workspacePath ?? null,
    createdAt: now,
    updatedAt: now,
    steps: (input.steps ?? []).map((step, index) => ({
      id: nanoid(), missionId: id, position: index, title: step.title,
      description: step.description ?? "", status: "pending", dependsOn: [],
      error: null, startedAt: null, completedAt: null,
    })),
  };
}

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === "string" && (MISSION_STATUSES as readonly string[]).includes(value);
}

export function planMission(mission: Pick<Mission, "id" | "goal" | "workspacePath">): MissionStep[] {
  const context = mission.workspacePath ? ` در workspace مشخص‌شده (${mission.workspacePath})` : "";
  const now = Date.now();
  const titles = [
    ["تعریف معیار موفقیت", "هدف و خروجی قابل تحویل مأموریت را دقیق و قابل بررسی کن."],
    ["بررسی ورودی‌ها", `فایل‌ها، داده‌ها و محدودیت‌های مرتبط${context} را شناسایی و بررسی کن.`],
    ["انجام کار اصلی", "کار اصلی را بر اساس یافته‌ها انجام بده و تغییرهای لازم را ثبت کن."],
    ["اعتبارسنجی نتیجه", "خروجی را با هدف اولیه مقایسه کن و خطاها یا موارد ناقص را برطرف کن."],
    ["آماده‌سازی گزارش", "خلاصه نتیجه، فایل‌های خروجی و اقدام‌های بعدی را آماده کن."],
  ] as const;
  return titles.map(([title, description], position) => ({
    id: `${mission.id}-planned-${position}-${now}`,
    missionId: mission.id,
    position,
    title,
    description,
    status: "pending",
    dependsOn: position === 0 ? [] : [`${mission.id}-planned-${position - 1}-${now}`],
    error: null,
    startedAt: null,
    completedAt: null,
  }));
}
