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
export const MISSION_TOOLS = ["list_files", "read_file", "search_files", "write_file", "create_directory", "fetch_url"] as const;
export type MissionTool = (typeof MISSION_TOOLS)[number];
export type MissionRisk = "read_only" | "workspace_write" | "external_action";
export type MissionEvent = { id: string; missionId: string; type: string; message: string; data: Record<string, unknown> | null; createdAt: number };

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
  tool: MissionTool | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  risk: MissionRisk;
  requiresApproval: boolean;
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

export const SAMPLE_MISSIONS: Array<MissionInput & { label: string }> = [
  {
    label: "گزارش هزینه‌ها",
    title: "ساخت گزارش هزینه‌ها",
    goal: "فاکتورهای workspace را بررسی کن، هزینه‌ها را دسته‌بندی کن و گزارش نهایی بساز.",
    steps: [{ title: "جمع‌آوری فاکتورها" }, { title: "دسته‌بندی هزینه‌ها" }, { title: "محاسبه جمع‌ها" }, { title: "ساخت گزارش نهایی" }],
  },
  {
    label: "مرور پروژه",
    title: "مرور وضعیت پروژه",
    goal: "وضعیت پروژه را بررسی کن، ریسک‌ها و کارهای عقب‌افتاده را مشخص کن و خلاصه مدیریتی بساز.",
    steps: [{ title: "بررسی ورودی‌های پروژه" }, { title: "شناسایی ریسک‌ها" }, { title: "فهرست کارهای عقب‌افتاده" }, { title: "تهیه خلاصه مدیریتی" }],
  },
  {
    label: "مرور اسناد",
    title: "مرور و خلاصه‌سازی اسناد",
    goal: "اسناد انتخاب‌شده را مرور کن، نکات مهم و اقدام‌های بعدی را در یک گزارش جمع کن.",
    steps: [{ title: "فهرست‌کردن اسناد" }, { title: "استخراج نکات کلیدی" }, { title: "مقایسه موارد مهم" }, { title: "نوشتن گزارش خلاصه" }],
  },
];

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
      error: null, startedAt: null, completedAt: null, tool: null, input: {}, output: null,
      risk: "read_only", requiresApproval: false,
    })),
  };
}

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === "string" && (MISSION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  if (from === to) return true;
  const allowed: Partial<Record<MissionStatus, MissionStatus[]>> = {
    draft: ["planning", "cancelled"], planning: ["draft", "waiting_for_confirmation", "cancelled"],
    waiting_for_confirmation: ["planning", "running", "cancelled"], running: ["paused", "waiting_for_approval", "failed", "completed", "cancelled"],
    waiting_for_approval: ["running", "cancelled"], paused: ["running", "cancelled"], failed: ["running", "cancelled"],
  };
  return allowed[from]?.includes(to) ?? false;
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
    tool: position === 1 ? "list_files" : position === 4 ? "write_file" : null,
    input: position === 1 ? { path: ".", recursive: true } : position === 4 ? { path: "mission-report.md", content: "" } : {},
    output: null,
    risk: position === 4 ? "workspace_write" : "read_only",
    requiresApproval: position === 4,
  }));
}

export function startMission(mission: Mission): Mission {
  if (mission.status !== "waiting_for_confirmation" && mission.status !== "paused") {
    throw new Error("Only a confirmed or paused mission can start.");
  }
  const nextStep = mission.steps.find((step) => step.status === "pending");
  if (!nextStep) return { ...mission, status: "completed", updatedAt: Date.now() };
  return {
    ...mission,
    status: "running",
    updatedAt: Date.now(),
    steps: mission.steps.map((step) => step.id === nextStep.id ? { ...step, status: "running", startedAt: step.startedAt ?? Date.now() } : step),
  };
}

export function advanceMission(mission: Mission): Mission {
  if (mission.status !== "running") throw new Error("Only a running mission can advance.");
  const current = mission.steps.find((step) => step.status === "running");
  if (!current) return startMission(mission);
  const nextPending = mission.steps.find((step) => step.status === "pending");
  const now = Date.now();
  return {
    ...mission,
    status: nextPending ? "running" : "completed",
    updatedAt: now,
    steps: mission.steps.map((step) => {
      if (step.id === current.id) return { ...step, status: "completed", completedAt: now };
      if (nextPending && step.id === nextPending.id) return { ...step, status: "running", startedAt: now };
      return step;
    }),
  };
}
