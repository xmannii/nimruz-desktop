import { execFile } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  WorkspaceGitOperationResult,
  WorkspaceGitStatus,
} from "@/lib/workspace";
import type { WorkspaceFilesStore } from "../agent/workspace-files";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_LIMIT = 2 * 1024 * 1024;

type GitContext = {
  repositoryRoot: string;
  workingRoot: string;
  scopePath: string;
};

function commandError(error: unknown): string {
  if (!error || typeof error !== "object") return "Git command failed.";
  const value = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  for (const candidate of [value.stderr, value.stdout, value.message]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 4_000);
    }
  }
  return "Git command failed.";
}

function isInside(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/**
 * Executes bounded, structured Git workflows for one approved workspace root.
 * No renderer-provided value is ever interpolated into a shell command.
 */
export class WorkspaceGitService {
  readonly #files: WorkspaceFilesStore;

  constructor(files: WorkspaceFilesStore) {
    this.#files = files;
  }

  async #context(workspaceId: string, chatId?: string): Promise<GitContext> {
    const workingRoot = this.#files.primaryRootPath(workspaceId, chatId);
    const result = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: workingRoot, maxBuffer: 256 * 1024 }
    );
    const repositoryRoot = path.resolve(result.stdout.trim());
    const canonicalWorkingRoot = path.resolve(workingRoot);
    if (!isInside(repositoryRoot, canonicalWorkingRoot)) {
      throw new Error("Workspace root is outside its Git repository.");
    }
    return {
      repositoryRoot,
      workingRoot: canonicalWorkingRoot,
      scopePath: path.relative(repositoryRoot, canonicalWorkingRoot) || ".",
    };
  }

  async #run(
    context: GitContext,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("git", args, {
      cwd: context.repositoryRoot,
      maxBuffer: GIT_OUTPUT_LIMIT,
      windowsHide: true,
    });
  }

  #assertScopedPath(context: GitContext, relativePath: string): string {
    if (
      typeof relativePath !== "string" ||
      !relativePath ||
      relativePath.includes("\0") ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error("Invalid Git path.");
    }
    const absolute = path.resolve(context.repositoryRoot, relativePath);
    if (!isInside(context.workingRoot, absolute)) {
      throw new Error("Git path is outside the approved workspace root.");
    }
    return absolute;
  }

  #assertWholeRepository(context: GitContext) {
    if (context.workingRoot !== context.repositoryRoot) {
      throw new Error(
        "Update and merge require the repository root to be the workspace's primary folder."
      );
    }
  }

  async status(
    workspaceId: string,
    chatId?: string
  ): Promise<WorkspaceGitStatus> {
    const context = await this.#context(workspaceId, chatId);
    const [branchResult, upstreamResult, branchList, mergeHead] =
      await Promise.all([
        this.#run(context, ["branch", "--show-current"]),
        this.#run(context, [
          "rev-parse",
          "--abbrev-ref",
          "--symbolic-full-name",
          "@{upstream}",
        ]).catch(() => ({ stdout: "", stderr: "" })),
        this.#run(context, [
          "for-each-ref",
          "--format=%(refname:short)",
          "refs/heads",
        ]),
        this.#run(context, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).catch(
          () => ({ stdout: "", stderr: "" })
        ),
      ]);
    const upstream = upstreamResult.stdout.trim() || null;
    let ahead = 0;
    let behind = 0;
    if (upstream) {
      const counts = await this.#run(context, [
        "rev-list",
        "--left-right",
        "--count",
        `HEAD...${upstream}`,
      ]);
      const [left, right] = counts.stdout.trim().split(/\s+/).map(Number);
      ahead = Number.isFinite(left) ? left : 0;
      behind = Number.isFinite(right) ? right : 0;
    }
    return {
      repositoryRoot: context.repositoryRoot,
      workingRoot: context.workingRoot,
      branch: branchResult.stdout.trim() || null,
      upstream,
      ahead,
      behind,
      merging: Boolean(mergeHead.stdout.trim()),
      branches: branchList.stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 200),
    };
  }

  async stage(
    workspaceId: string,
    paths: string[],
    chatId?: string
  ): Promise<void> {
    const context = await this.#context(workspaceId, chatId);
    const scoped = [...new Set(paths)].slice(0, 100);
    if (scoped.length === 0) throw new Error("Select at least one file.");
    scoped.forEach((item) => this.#assertScopedPath(context, item));
    await this.#run(context, ["add", "--", ...scoped]);
  }

  async unstage(
    workspaceId: string,
    paths: string[],
    chatId?: string
  ): Promise<void> {
    const context = await this.#context(workspaceId, chatId);
    const scoped = [...new Set(paths)].slice(0, 100);
    if (scoped.length === 0) throw new Error("Select at least one file.");
    scoped.forEach((item) => this.#assertScopedPath(context, item));
    await this.#run(context, ["reset", "--quiet", "HEAD", "--", ...scoped]);
  }

  async discard(
    workspaceId: string,
    relativePath: string,
    chatId?: string
  ): Promise<void> {
    const context = await this.#context(workspaceId, chatId);
    const absolute = this.#assertScopedPath(context, relativePath);
    const status = await this.#run(context, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      context.scopePath,
    ]);
    const tokens = status.stdout.split("\0").filter(Boolean);
    let code = "";
    let statusPath = relativePath;
    let original: string | null = null;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const candidateCode = token.slice(0, 2);
      const candidatePath = token.slice(3);
      const candidateOriginal =
        candidateCode.includes("R") || candidateCode.includes("C")
          ? tokens[index + 1] ?? null
          : null;
      if (
        candidatePath === relativePath ||
        candidateOriginal === relativePath
      ) {
        code = candidateCode;
        statusPath = candidatePath;
        original = candidateOriginal;
        break;
      }
      if (candidateOriginal) index += 1;
    }
    if (!code) return;
    if (code === "??") {
      const type = existsSync(absolute) ? lstatSync(absolute) : null;
      if (type?.isFile() || type?.isSymbolicLink()) {
        await unlink(absolute);
      }
      return;
    }
    const candidates = [
      ...new Set([statusPath, original].filter(Boolean)),
    ] as string[];
    candidates.forEach((item) => this.#assertScopedPath(context, item));
    await this.#run(context, ["reset", "--quiet", "HEAD", "--", ...candidates]);
    for (const candidate of candidates) {
      const tracked = await this.#run(context, [
        "cat-file",
        "-e",
        `HEAD:${candidate.replaceAll("\\", "/")}`,
      ])
        .then(() => true)
        .catch(() => false);
      if (tracked) {
        await this.#run(context, [
          "restore",
          "--source=HEAD",
          "--worktree",
          "--",
          candidate,
        ]);
        continue;
      }
      const candidatePath = this.#assertScopedPath(context, candidate);
      const type = existsSync(candidatePath) ? lstatSync(candidatePath) : null;
      if (type?.isFile() || type?.isSymbolicLink()) {
        await unlink(candidatePath);
      }
    }
  }

  async commit(
    workspaceId: string,
    message: string,
    chatId?: string
  ): Promise<WorkspaceGitOperationResult> {
    const context = await this.#context(workspaceId, chatId);
    const normalized = message.trim();
    if (!normalized || normalized.length > 2_000 || normalized.includes("\0")) {
      throw new Error("Commit message must be between 1 and 2,000 characters.");
    }
    const status = await this.#run(context, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=no",
    ]);
    const staged = status.stdout.split("\0").filter(Boolean).filter((record) => {
      const index = record[0];
      return index && index !== " " && index !== "?";
    });
    if (staged.length === 0) throw new Error("There are no staged changes.");
    for (const record of staged) {
      this.#assertScopedPath(context, record.slice(3));
    }
    const result = await this.#run(context, ["commit", "-m", normalized]);
    return {
      ok: true,
      message: result.stdout.trim() || "Commit created.",
      conflicts: [],
    };
  }

  async update(
    workspaceId: string,
    chatId?: string
  ): Promise<WorkspaceGitOperationResult> {
    const context = await this.#context(workspaceId, chatId);
    this.#assertWholeRepository(context);
    const upstream = (
      await this.#run(context, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ])
    ).stdout.trim();
    if (!upstream) throw new Error("The current branch has no upstream.");
    await this.#run(context, ["fetch", "--prune"]);
    try {
      const result = await this.#run(context, [
        "merge",
        "--ff-only",
        upstream,
      ]);
      return {
        ok: true,
        message: result.stdout.trim() || "Already up to date.",
        conflicts: [],
      };
    } catch (error) {
      throw new Error(
        `Fast-forward update was not possible. Merge explicitly after reviewing both branches.\n${commandError(error)}`
      );
    }
  }

  async merge(
    workspaceId: string,
    branch: string,
    chatId?: string
  ): Promise<WorkspaceGitOperationResult> {
    const context = await this.#context(workspaceId, chatId);
    this.#assertWholeRepository(context);
    const normalized = branch.trim();
    if (!normalized || normalized.length > 255 || normalized.includes("\0")) {
      throw new Error("Invalid branch name.");
    }
    await this.#run(context, ["check-ref-format", "--branch", normalized]);
    const dirty = await this.#run(context, [
      "status",
      "--porcelain=v1",
      "-z",
    ]);
    if (dirty.stdout) {
      throw new Error("Commit or discard current changes before merging.");
    }
    try {
      const result = await this.#run(context, [
        "merge",
        "--no-edit",
        "--no-autostash",
        normalized,
      ]);
      return {
        ok: true,
        message: result.stdout.trim() || `Merged ${normalized}.`,
        conflicts: [],
      };
    } catch (error) {
      const conflicts = (
        await this.#run(context, [
          "diff",
          "--name-only",
          "--diff-filter=U",
          "-z",
        ])
      ).stdout
        .split("\0")
        .filter(Boolean);
      return {
        ok: false,
        message: commandError(error),
        conflicts,
      };
    }
  }

  async abortMerge(workspaceId: string, chatId?: string): Promise<void> {
    const context = await this.#context(workspaceId, chatId);
    this.#assertWholeRepository(context);
    await this.#run(context, ["merge", "--abort"]);
  }
}
