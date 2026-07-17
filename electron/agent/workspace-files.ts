import { createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  ArtifactKind,
  ArtifactRecord,
  WorkspaceFileEntry,
  WorkspaceRoot,
} from "@/lib/workspace";
import { assertSafeRelativePath, resolveInsideRoots } from "./path-policy";
import { extractDocumentText, isExtractableDocument } from "./document-extract";
import type { AppDatabase } from "../storage/database";
import type { WorkspaceEventBus } from "./events";

const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 2 * 1024 * 1024;
const MAX_LIST_ENTRIES = 500;

const MAX_UPLOAD_COUNT = 20;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const SEARCH_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".turbo",
  ".cache",
]);

export type WorkspaceSearchMatchType = "filename" | "content";

export type WorkspaceSearchMatch = {
  path: string;
  name: string;
  matchType: WorkspaceSearchMatchType;
  /** 1-based line number for content matches; omitted for filename hits. */
  line?: number;
  /** Matching line (content) or file name (filename). */
  text: string;
};

export type WorkspaceSearchOptions = {
  /** Where to look. Default: both filenames and file contents. */
  scope?: "all" | "filename" | "content";
  /** Optional filename filter, e.g. `*.ts` or `*.{ts,tsx}`. */
  glob?: string;
  /** Limit search to a directory under an approved root. */
  path?: string;
  maxMatches?: number;
  caseSensitive?: boolean;
};

function globToRegExp(glob: string): RegExp {
  // Expand `{ts,tsx}` → `(?:ts|tsx)`, then convert `*` wildcards.
  let pattern = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "{") {
      const end = glob.indexOf("}", i + 1);
      if (end === -1) {
        pattern += "\\{";
        continue;
      }
      const alts = glob
        .slice(i + 1, end)
        .split(",")
        .map((part) => part.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      pattern += `(?:${alts})`;
      i = end;
      continue;
    }
    if (ch === "*") {
      pattern += "[^/\\\\]*";
      continue;
    }
    if (ch === "?") {
      pattern += "[^/\\\\]";
      continue;
    }
    pattern += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`, "i");
}

function matchesGlob(fileName: string, glob: string | undefined): boolean {
  if (!glob) return true;
  return globToRegExp(glob).test(fileName);
}

function looksLikeCsv(content: string): boolean {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(",") || firstLine.includes("\t");
}

function languageMime(language: string | undefined): string {
  const lang = (language ?? "").trim().toLowerCase();
  if (!lang) return "text/plain; charset=utf-8";
  return `text/x-${lang.replace(/[^a-z0-9_+-]/g, "")}; charset=utf-8`;
}

function artifactStorageMeta(options: {
  kind: ArtifactKind;
  content: string;
  language?: string;
  mimeType?: string;
}): { extension: string; mimeType: string } {
  if (options.mimeType) {
    const extFromMime =
      options.mimeType.includes("html")
        ? ".html"
        : options.mimeType.includes("svg")
          ? ".svg"
          : options.mimeType.includes("markdown")
            ? ".md"
            : options.mimeType.includes("json")
              ? ".json"
              : options.mimeType.includes("csv")
                ? ".csv"
                : null;
    if (extFromMime) {
      return { extension: extFromMime, mimeType: options.mimeType };
    }
  }

  switch (options.kind) {
    case "html":
      return {
        extension: ".html",
        mimeType: options.mimeType ?? "text/html; charset=utf-8",
      };
    case "svg":
      return {
        extension: ".svg",
        mimeType: options.mimeType ?? "image/svg+xml",
      };
    case "mermaid":
      return {
        extension: ".mmd",
        mimeType: options.mimeType ?? "text/vnd.mermaid; charset=utf-8",
      };
    case "markdown":
    case "document":
      return {
        extension: ".md",
        mimeType: options.mimeType ?? "text/markdown; charset=utf-8",
      };
    case "code":
      return {
        extension: ".txt",
        mimeType: options.mimeType ?? languageMime(options.language),
      };
    case "data": {
      const isCsv = looksLikeCsv(options.content) && !options.content.trimStart().startsWith("{") && !options.content.trimStart().startsWith("[");
      return {
        extension: isCsv ? ".csv" : ".json",
        mimeType:
          options.mimeType ??
          (isCsv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8"),
      };
    }
    default:
      return {
        extension: ".txt",
        mimeType: options.mimeType ?? "text/plain; charset=utf-8",
      };
  }
}

function sanitizeUploadName(rawName: string): string {
  // Strip any directory components and control characters.
  const base = String(rawName ?? "")
    .split(/[/\\]/)
    .filter(Boolean)
    .at(-1) ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 200) || `upload-${nanoid(6)}`;
}

function resolveCollision(dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

export class WorkspaceFilesStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string,
    private readonly events?: WorkspaceEventBus
  ) {}

  managedRootPath(workspaceId: string): string {
    return path.join(this.userDataPath, "workspaces", workspaceId, "files");
  }

  artifactsRootPath(workspaceId: string): string {
    return path.join(this.userDataPath, "workspaces", workspaceId, "artifacts");
  }

  /** Managed area where user-uploaded files are imported. */
  uploadsRootPath(workspaceId: string): string {
    return path.join(this.managedRootPath(workspaceId), "uploads");
  }

  ensureManagedRoot(workspaceId: string): WorkspaceRoot {
    const managedPath = this.managedRootPath(workspaceId);
    mkdirSync(managedPath, { recursive: true });
    mkdirSync(this.artifactsRootPath(workspaceId), { recursive: true });

    const existing = this.database
      .loadWorkspaceRoots(workspaceId)
      .find((root) => root.kind === "managed");

    if (existing) {
      const nextLabel =
        existing.label === "Managed files" ? "فایل‌های داخلی" : existing.label;
      if (existing.path !== managedPath || existing.label !== nextLabel) {
        const updated = {
          ...existing,
          path: managedPath,
          label: nextLabel,
        };
        this.database.saveWorkspaceRoot(updated);
        return updated;
      }
      return existing;
    }

    const root: WorkspaceRoot = {
      id: nanoid(),
      workspaceId,
      kind: "managed",
      path: managedPath,
      label: "فایل‌های داخلی",
      isPrimary: false,
      createdAt: Date.now(),
    };
    this.database.saveWorkspaceRoot(root);
    return root;
  }

  /** All approved roots for the workspace (managed root always included). */
  listRoots(workspaceId: string): WorkspaceRoot[] {
    this.ensureManagedRoot(workspaceId);
    return this.database.loadWorkspaceRoots(workspaceId);
  }

  getApprovedRoots(workspaceId: string): string[] {
    return this.listRoots(workspaceId).map((root) => root.path);
  }

  /**
   * The primary working root: an explicitly-primary linked root when present,
   * otherwise the managed root. Relative paths and the default shell cwd
   * resolve against this directory.
   */
  primaryRootPath(workspaceId: string): string {
    const roots = this.listRoots(workspaceId);
    const primary = roots.find((root) => root.isPrimary);
    if (primary) return primary.path;
    const managed = roots.find((root) => root.kind === "managed");
    return managed?.path ?? this.managedRootPath(workspaceId);
  }

  resolvePath(workspaceId: string, targetPath: string): string {
    const roots = this.getApprovedRoots(workspaceId);
    // Relative paths resolve against the primary working root.
    const absolute =
      path.isAbsolute(targetPath) || /^[A-Za-z]:[\\/]/.test(targetPath)
        ? targetPath
        : path.join(
            this.primaryRootPath(workspaceId),
            assertSafeRelativePath(targetPath)
          );
    return resolveInsideRoots(absolute, roots).absolutePath;
  }

  listDirectory(
    workspaceId: string,
    relativeOrAbsolute = "."
  ): WorkspaceFileEntry[] {
    const dirPath = this.resolvePath(workspaceId, relativeOrAbsolute);
    const entries = readdirSync(dirPath, { withFileTypes: true }).slice(
      0,
      MAX_LIST_ENTRIES
    );
    return entries.map((entry) => {
      const full = path.join(dirPath, entry.name);
      let sizeBytes: number | null = null;
      let modifiedAt: number | null = null;
      try {
        const stats = statSync(full);
        sizeBytes = entry.isFile() ? stats.size : null;
        modifiedAt = stats.mtimeMs;
      } catch {
        // ignore
      }
      return {
        path: full,
        name: entry.name,
        kind: entry.isDirectory() ? "directory" : "file",
        sizeBytes,
        modifiedAt,
      };
    });
  }

  readFile(
    workspaceId: string,
    targetPath: string,
    options?: { offset?: number; limit?: number }
  ): { path: string; content: string; truncated: boolean; sizeBytes: number } {
    const filePath = this.resolvePath(workspaceId, targetPath);
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error("Path is not a file.");
    }
    if (stats.size > MAX_READ_BYTES * 4) {
      throw new Error("File is too large to read.");
    }

    const buffer = readFileSync(filePath);
    // Reject obvious binary content.
    if (buffer.includes(0)) {
      throw new Error("Binary files cannot be read as text.");
    }

    let text = buffer.toString("utf8");
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = Math.min(
      options?.limit ?? MAX_READ_BYTES,
      MAX_READ_BYTES
    );
    const sliced = text.slice(offset, offset + limit);
    return {
      path: filePath,
      content: sliced,
      truncated: offset + limit < text.length,
      sizeBytes: stats.size,
    };
  }

  /**
   * Reads a file as text, transparently extracting readable text from supported
   * document containers (e.g. PDF) that {@link readFile} would reject as binary.
   */
  async readFileText(
    workspaceId: string,
    targetPath: string,
    options?: { offset?: number; limit?: number }
  ): Promise<{ path: string; content: string; truncated: boolean; sizeBytes: number }> {
    const filePath = this.resolvePath(workspaceId, targetPath);
    if (!isExtractableDocument(filePath)) {
      return this.readFile(workspaceId, targetPath, options);
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error("Path is not a file.");
    }
    if (stats.size > MAX_READ_BYTES * 40) {
      throw new Error("File is too large to read.");
    }
    const buffer = readFileSync(filePath);
    const extracted = await extractDocumentText(filePath, buffer);
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = Math.min(options?.limit ?? MAX_READ_BYTES, MAX_READ_BYTES);
    const sliced = extracted.slice(offset, offset + limit);
    return {
      path: filePath,
      content: sliced,
      truncated: offset + limit < extracted.length,
      sizeBytes: stats.size,
    };
  }

  readBinaryFile(
    workspaceId: string,
    targetPath: string
  ): { path: string; base64: string; mimeType: string; sizeBytes: number } {
    const filePath = this.resolvePath(workspaceId, targetPath);
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error("Path is not a file.");
    }
    const MAX_BINARY_BYTES = 16 * 1024 * 1024;
    if (stats.size > MAX_BINARY_BYTES) {
      throw new Error("File is too large to preview.");
    }
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = IMAGE_MIME_BY_EXT[extension] ?? "application/octet-stream";
    const buffer = readFileSync(filePath);
    return {
      path: filePath,
      base64: buffer.toString("base64"),
      mimeType,
      sizeBytes: stats.size,
    };
  }

  writeFile(
    workspaceId: string,
    targetPath: string,
    content: string
  ): { path: string; sizeBytes: number } {
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
      throw new Error("Write payload exceeds size limit.");
    }
    const filePath = this.resolvePath(workspaceId, targetPath);
    const existedBefore = existsSync(filePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${nanoid(8)}.tmp`;
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
    this.events?.emit({
      type: existedBefore ? "file-updated" : "file-created",
      workspaceId,
      path: filePath,
    });
    return { path: filePath, sizeBytes: Buffer.byteLength(content, "utf8") };
  }

  applyPatch(
    workspaceId: string,
    targetPath: string,
    oldText: string,
    newText: string
  ): { path: string; replacements: number } {
    const current = this.readFile(workspaceId, targetPath);
    if (!current.content.includes(oldText)) {
      throw new Error("Patch context was not found in the file.");
    }
    const next = current.content.replace(oldText, newText);
    const replacements =
      current.content.split(oldText).length - 1;
    this.writeFile(workspaceId, targetPath, next);
    return { path: current.path, replacements };
  }

  deleteFile(workspaceId: string, targetPath: string): { path: string } {
    const filePath = this.resolvePath(workspaceId, targetPath);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      rmSync(filePath, { recursive: false });
    } else {
      unlinkSync(filePath);
    }
    this.events?.emit({ type: "file-deleted", workspaceId, path: filePath });
    return { path: filePath };
  }

  /**
   * Imports user-provided files into the managed uploads area. Validates count,
   * size, and filenames; resolves name collisions; writes atomically; and
   * returns durable references (relative to the managed root).
   */
  importFiles(
    workspaceId: string,
    files: Array<{ name: string; base64: string; mimeType?: string }>
  ): Array<{
    path: string;
    relativePath: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
  }> {
    if (!Array.isArray(files) || files.length === 0) return [];
    if (files.length > MAX_UPLOAD_COUNT) {
      throw new Error(`Cannot import more than ${MAX_UPLOAD_COUNT} files at once.`);
    }

    this.ensureManagedRoot(workspaceId);
    const uploadsDir = this.uploadsRootPath(workspaceId);
    mkdirSync(uploadsDir, { recursive: true });
    const managedRoot = this.managedRootPath(workspaceId);

    const results: Array<{
      path: string;
      relativePath: string;
      name: string;
      sizeBytes: number;
      mimeType: string;
    }> = [];

    for (const file of files) {
      const buffer = Buffer.from(file.base64, "base64");
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`«${file.name}» بزرگ‌تر از حد مجاز است.`);
      }

      const safeName = sanitizeUploadName(file.name);
      const targetPath = resolveCollision(uploadsDir, safeName);
      const tempPath = `${targetPath}.${nanoid(8)}.tmp`;
      writeFileSync(tempPath, buffer);
      renameSync(tempPath, targetPath);

      const relativePath = path
        .relative(managedRoot, targetPath)
        .split(path.sep)
        .join("/");
      results.push({
        path: targetPath,
        relativePath,
        name: path.basename(targetPath),
        sizeBytes: buffer.byteLength,
        mimeType:
          file.mimeType ||
          IMAGE_MIME_BY_EXT[path.extname(targetPath).toLowerCase()] ||
          "application/octet-stream",
      });
      this.events?.emit({
        type: "file-created",
        workspaceId,
        path: targetPath,
      });
    }

    return results;
  }

  createDirectory(workspaceId: string, targetPath: string): { path: string } {
    const dirPath = this.resolvePath(workspaceId, targetPath);
    mkdirSync(dirPath, { recursive: true });
    this.events?.emit({
      type: "file-created",
      workspaceId,
      path: dirPath,
    });
    return { path: dirPath };
  }

  /** Resolve a path and confirm it is inside an approved root (throws if not). */
  assertInsideRoots(workspaceId: string, targetPath: string): string {
    return this.resolvePath(workspaceId, targetPath);
  }

  moveFile(
    workspaceId: string,
    fromPath: string,
    toPath: string
  ): { from: string; to: string } {
    const from = this.resolvePath(workspaceId, fromPath);
    const to = this.resolvePath(workspaceId, toPath);
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
    this.events?.emit({ type: "file-moved", workspaceId, from, to });
    return { from, to };
  }

  searchFiles(
    workspaceId: string,
    query: string,
    options?: WorkspaceSearchOptions
  ): {
    query: string;
    filenameMatches: WorkspaceSearchMatch[];
    contentMatches: WorkspaceSearchMatch[];
    /** Filename hits first, then content — capped to maxMatches. */
    matches: WorkspaceSearchMatch[];
    truncated: boolean;
  } {
    const needleRaw = query.trim();
    if (!needleRaw) {
      return {
        query: needleRaw,
        filenameMatches: [],
        contentMatches: [],
        matches: [],
        truncated: false,
      };
    }

    const maxMatches = Math.min(options?.maxMatches ?? 50, 200);
    const scope = options?.scope ?? "all";
    const caseSensitive = options?.caseSensitive ?? false;
    const needle = caseSensitive ? needleRaw : needleRaw.toLowerCase();
    const includeNames = scope === "all" || scope === "filename";
    const includeContent = scope === "all" || scope === "content";

    // Collect each kind up to maxMatches so one kind cannot starve the other
    // before we merge (filename-first) for the combined list.
    const filenameMatches: WorkspaceSearchMatch[] = [];
    const contentMatches: WorkspaceSearchMatch[] = [];
    let truncated = false;

    const containsNeedle = (value: string) => {
      const haystack = caseSensitive ? value : value.toLowerCase();
      return haystack.includes(needle);
    };

    const walk = (dir: string) => {
      const namesFull = !includeNames || filenameMatches.length >= maxMatches;
      const contentFull = !includeContent || contentMatches.length >= maxMatches;
      if (namesFull && contentFull) return;

      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const namesDone = !includeNames || filenameMatches.length >= maxMatches;
        const contentDone =
          !includeContent || contentMatches.length >= maxMatches;
        if (namesDone && contentDone) return;

        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SEARCH_SKIP_DIRS.has(entry.name)) continue;
          if (
            includeNames &&
            filenameMatches.length < maxMatches &&
            containsNeedle(entry.name)
          ) {
            filenameMatches.push({
              path: full,
              name: entry.name,
              matchType: "filename",
              text: entry.name,
            });
          }
          walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!matchesGlob(entry.name, options?.glob)) continue;

        if (
          includeNames &&
          filenameMatches.length < maxMatches &&
          containsNeedle(entry.name)
        ) {
          filenameMatches.push({
            path: full,
            name: entry.name,
            matchType: "filename",
            text: entry.name,
          });
        }

        if (!includeContent || contentMatches.length >= maxMatches) continue;

        try {
          const stats = statSync(full);
          if (stats.size > MAX_READ_BYTES) continue;
          const content = readFileSync(full);
          if (content.includes(0)) continue;
          const text = content.toString("utf8");
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i += 1) {
            if (!containsNeedle(lines[i])) continue;
            contentMatches.push({
              path: full,
              name: entry.name,
              matchType: "content",
              line: i + 1,
              text: lines[i].slice(0, 400),
            });
            if (contentMatches.length >= maxMatches) {
              truncated = true;
              break;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    };

    const roots = this.getApprovedRoots(workspaceId);
    if (options?.path?.trim()) {
      const scoped = this.resolvePath(workspaceId, options.path.trim());
      if (existsSync(scoped)) walk(scoped);
    } else {
      for (const root of roots) {
        if (existsSync(root)) walk(root);
      }
    }

    if (filenameMatches.length >= maxMatches || contentMatches.length >= maxMatches) {
      truncated = true;
    }

    const matches = [...filenameMatches, ...contentMatches].slice(0, maxMatches);
    if (filenameMatches.length + contentMatches.length > maxMatches) {
      truncated = true;
    }

    return {
      query: needleRaw,
      filenameMatches,
      contentMatches,
      matches,
      truncated,
    };
  }

  createArtifact(options: {
    workspaceId: string;
    title: string;
    kind: ArtifactKind;
    content: string;
    language?: string;
    mimeType?: string;
    runId?: string | null;
    chatId?: string | null;
  }): ArtifactRecord {
    const artifactsDir = this.artifactsRootPath(options.workspaceId);
    mkdirSync(artifactsDir, { recursive: true });
    this.ensureManagedRoot(options.workspaceId);

    const id = nanoid();
    const { extension, mimeType } = artifactStorageMeta(options);
    const storagePath = path.join(artifactsDir, `${id}${extension}`);
    writeFileSync(storagePath, options.content, "utf8");
    const hash = createHash("sha256").update(options.content, "utf8").digest("hex");
    const now = Date.now();
    const artifact: ArtifactRecord = {
      id,
      workspaceId: options.workspaceId,
      runId: options.runId ?? null,
      chatId: options.chatId ?? null,
      title: options.title.slice(0, 500),
      kind: options.kind,
      mimeType,
      storagePath,
      sizeBytes: Buffer.byteLength(options.content, "utf8"),
      contentHash: hash,
      createdAt: now,
      updatedAt: now,
    };
    this.database.saveArtifact(artifact);
    this.events?.emit({
      type: "artifact-changed",
      workspaceId: options.workspaceId,
      artifactId: id,
    });
    return artifact;
  }

  readArtifactContent(artifactId: string): string | null {
    const artifact = this.database
      .listArtifacts(
        // We don't have getArtifact — scan via all workspaces is inefficient.
        // Callers should pass workspaceId; this helper is for known storage paths.
        ""
      )
      .find((item) => item.id === artifactId);
    void artifact;
    return null;
  }

  readArtifactByRecord(artifact: ArtifactRecord): string {
    return readFileSync(artifact.storagePath, "utf8");
  }
}
