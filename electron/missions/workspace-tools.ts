import { promises as fs } from "node:fs";
import path from "node:path";
import type { MissionTool } from "@/lib/missions/types";

export type ToolResult = {
  success: boolean;
  summary: string;
  data?: unknown;
  changedFiles?: string[];
  error?: string;
};

function safePath(workspace: string, requested: string) {
  const root = path.resolve(workspace);
  const target = path.resolve(root, requested || ".");
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("مسیر خارج از workspace مجاز است.");
  }
  return target;
}

function requireWorkspace(workspace: string | null): string {
  if (!workspace?.trim()) throw new Error("برای اجرای مأموریت، ابتدا یک workspace انتخاب کنید.");
  return path.resolve(workspace);
}

export async function executeWorkspaceTool(
  tool: MissionTool,
  input: Record<string, unknown>,
  workspacePath: string | null
): Promise<ToolResult> {
  if (tool === "fetch_url") {
    const url = typeof input.url === "string" ? input.url : "";
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only public HTTP and HTTPS URLs are allowed.");
    const response = await fetch(parsed, { signal: AbortSignal.timeout(20_000) });
    return { success: response.ok, summary: `Fetched ${response.status} from ${url}`, data: { url, status: response.status, content: (await response.text()).slice(0, 100_000) } };
  }
  const workspace = requireWorkspace(workspacePath);
  const requestedPath = typeof input.path === "string" ? input.path : ".";
  if (tool === "list_files") {
    const root = safePath(workspace, requestedPath);
    const recursive = input.recursive !== false;
    const files: string[] = [];
    async function visit(directory: string) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(directory, entry.name);
        const relative = path.relative(workspace, full);
        if (entry.isDirectory() && recursive) await visit(full);
        else if (entry.isFile()) files.push(relative);
        if (files.length >= 500) return;
      }
    }
    await visit(root);
    return { success: true, summary: `${files.length} فایل پیدا شد.`, data: { files } };
  }
  if (tool === "read_file") {
    const target = safePath(workspace, requestedPath);
    const content = await fs.readFile(target, "utf8");
    return { success: true, summary: `${requestedPath} خوانده شد.`, data: { path: requestedPath, content: content.slice(0, 100_000) } };
  }
  if (tool === "search_files") {
    const needle = typeof input.query === "string" ? input.query : "";
    if (!needle) throw new Error("عبارت جستجو مشخص نشده است.");
    const listed = await executeWorkspaceTool("list_files", { path: requestedPath, recursive: true }, workspace);
    const matches: Array<{ path: string; lines: string[] }> = [];
    for (const relative of (listed.data as { files: string[] }).files.slice(0, 200)) {
      try {
        const content = await fs.readFile(safePath(workspace, relative), "utf8");
        const lines = content.split(/\r?\n/).filter((line) => line.toLowerCase().includes(needle.toLowerCase())).slice(0, 5);
        if (lines.length) matches.push({ path: relative, lines });
      } catch { /* skip binary/unreadable files */ }
    }
    return { success: true, summary: `${matches.length} فایل مطابق پیدا شد.`, data: { matches } };
  }
  if (tool === "write_file") {
    const target = safePath(workspace, requestedPath);
    const content = typeof input.content === "string" ? input.content : "";
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    return { success: true, summary: `${requestedPath} ساخته یا به‌روزرسانی شد.`, changedFiles: [requestedPath] };
  }
  if (tool === "create_directory") {
    const target = safePath(workspace, requestedPath);
    await fs.mkdir(target, { recursive: true });
    return { success: true, summary: `پوشه ${requestedPath} ساخته شد.`, changedFiles: [requestedPath] };
  }
  if (tool === "fetch_url") {
    const url = typeof input.url === "string" ? input.url : "";
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("فقط URLهای عمومی HTTP و HTTPS مجاز هستند.");
    const response = await fetch(parsed, { signal: AbortSignal.timeout(20_000) });
    return { success: response.ok, summary: `دریافت ${response.status} از ${url}`, data: { url, status: response.status, content: (await response.text()).slice(0, 100_000) } };
  }
  throw new Error(`ابزار ناشناخته: ${tool}`);
}
