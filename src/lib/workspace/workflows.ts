/**
 * Stub workflow templates for workspaces. A workflow is a reusable,
 * multi-step recipe (e.g. "research + write report") that can seed a chat
 * with instructions and a starting task list. Not wired into the runtime
 * yet — this defines the shape so the UI/agent layers can grow into it.
 */

export type WorkflowStepTemplate = {
  id: string;
  title: string;
  description?: string;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  /** Seed instructions appended to the workspace/agent system prompt. */
  instructions: string;
  steps: WorkflowStepTemplate[];
};

/**
 * Built-in templates users can pick from when starting a new workspace
 * chat. Kept intentionally small; not surfaced in the UI yet.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "research-report",
    name: "تحقیق و گزارش",
    description: "جمع‌آوری اطلاعات درباره یک موضوع و تولید یک گزارش نهایی.",
    instructions:
      "Research the requested topic using available tools, then produce a well-structured artifact summarizing findings with sources.",
    steps: [
      { id: "gather", title: "جمع‌آوری منابع" },
      { id: "synthesize", title: "تحلیل و ترکیب اطلاعات" },
      { id: "write", title: "نوشتن گزارش نهایی" },
    ],
  },
  {
    id: "codebase-task",
    name: "انجام یک تسک روی کد",
    description: "بررسی فایل‌های فضای کاری و اعمال یک تغییر مشخص.",
    instructions:
      "Explore the workspace files relevant to the task, make the requested change, and verify it before finishing.",
    steps: [
      { id: "explore", title: "بررسی فایل‌های مرتبط" },
      { id: "implement", title: "اعمال تغییر" },
      { id: "verify", title: "بررسی نهایی" },
    ],
  },
];

export function getWorkflowTemplate(id: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id) ?? null;
}
