import {
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  CheckpointFileDiff,
  CheckpointFileStatus,
  TurnCheckpoint,
  TurnCheckpointDiff,
} from "@/lib/workspace";
import type { AppDatabase } from "../storage/database";
import { gitOutput, runGit } from "./git-process";

const MAX_DIFF_FILES = 100;
const MAX_FILE_PATCH_CHARS = 120_000;
const MAX_TOTAL_PATCH_CHARS = 500_000;

type Snapshot = {
  ref: string;
  commit: string;
};

function checkpointRef(
  chatId: string,
  checkpointId: string,
  side: "before" | "after"
): string {
  return `refs/nimruz/checkpoints/${chatId}/${checkpointId}/${side}`;
}

function parseCount(value: string): number {
  if (value === "-") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Captures the workspace with a temporary Git index. The user's real index,
 * branch, and working tree are never mutated while a checkpoint is created.
 */
export class TurnCheckpointManager {
  constructor(private readonly database: AppDatabase) {}

  private async captureSnapshot(options: {
    chatId: string;
    checkpointId: string;
    workingPath: string;
    side: "before" | "after";
  }): Promise<Snapshot> {
    const repositoryRoot = await gitOutput(["rev-parse", "--show-toplevel"], {
      cwd: options.workingPath,
    });
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "nimruz-git-index-"));
    const indexPath = path.join(tempDirectory, "index");
    const env = {
      GIT_INDEX_FILE: indexPath,
      GIT_AUTHOR_NAME: "Nimruz",
      GIT_AUTHOR_EMAIL: "checkpoints@nimruz.local",
      GIT_COMMITTER_NAME: "Nimruz",
      GIT_COMMITTER_EMAIL: "checkpoints@nimruz.local",
    };

    try {
      await runGit(["read-tree", "HEAD"], { cwd: repositoryRoot, env });
      // Running from workingPath restricts snapshots to the approved project
      // subdirectory while the temporary index retains HEAD elsewhere.
      await runGit(["add", "-A", "--", "."], {
        cwd: options.workingPath,
        env,
        maxBuffer: 16 * 1024 * 1024,
      });
      const tree = await gitOutput(["write-tree"], {
        cwd: repositoryRoot,
        env,
      });
      const parent = await gitOutput(["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
      });
      const commit = await gitOutput(
        ["commit-tree", tree, "-p", parent, "-m", `Nimruz ${options.side} checkpoint`],
        { cwd: repositoryRoot, env }
      );
      const ref = checkpointRef(
        options.chatId,
        options.checkpointId,
        options.side
      );
      await runGit(["update-ref", ref, commit], { cwd: repositoryRoot });
      return { ref, commit };
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  async begin(options: {
    runId: string;
    chatId: string;
    workspaceId: string;
    workingPath: string;
  }): Promise<TurnCheckpoint> {
    const checkpointId = nanoid();
    const repositoryRoot = await gitOutput(["rev-parse", "--show-toplevel"], {
      cwd: options.workingPath,
    });
    const before = await this.captureSnapshot({
      chatId: options.chatId,
      checkpointId,
      workingPath: options.workingPath,
      side: "before",
    });
    const now = Date.now();
    const checkpoint: TurnCheckpoint = {
      id: checkpointId,
      runId: options.runId,
      chatId: options.chatId,
      workspaceId: options.workspaceId,
      repositoryRoot,
      workingPath: options.workingPath,
      beforeRef: before.ref,
      beforeCommit: before.commit,
      afterRef: null,
      afterCommit: null,
      status: "capturing",
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.database.saveTurnCheckpoint(checkpoint);
    return checkpoint;
  }

  async complete(runId: string): Promise<TurnCheckpoint | null> {
    const current = this.database.getTurnCheckpointByRunId(runId);
    if (!current || current.status !== "capturing") return current;

    try {
      const after = await this.captureSnapshot({
        chatId: current.chatId,
        checkpointId: current.id,
        workingPath: current.workingPath,
        side: "after",
      });
      const numstat = await gitOutput(
        ["diff", "--numstat", current.beforeCommit, after.commit, "--", "."],
        { cwd: current.workingPath, maxBuffer: 16 * 1024 * 1024 }
      );
      let additions = 0;
      let deletions = 0;
      let filesChanged = 0;
      for (const line of numstat.split(/\r?\n/)) {
        if (!line) continue;
        const [added, deleted] = line.split("\t");
        additions += parseCount(added ?? "0");
        deletions += parseCount(deleted ?? "0");
        filesChanged += 1;
      }
      const completed: TurnCheckpoint = {
        ...current,
        afterRef: after.ref,
        afterCommit: after.commit,
        status: "completed",
        filesChanged,
        additions,
        deletions,
        updatedAt: Date.now(),
      };
      this.database.saveTurnCheckpoint(completed);
      return completed;
    } catch (error) {
      const failed: TurnCheckpoint = {
        ...current,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Checkpoint capture failed.",
        updatedAt: Date.now(),
      };
      this.database.saveTurnCheckpoint(failed);
      return failed;
    }
  }

  async getDiff(runId: string): Promise<TurnCheckpointDiff | null> {
    const checkpoint = this.database.getTurnCheckpointByRunId(runId);
    if (!checkpoint?.afterCommit || checkpoint.status !== "completed") {
      return null;
    }

    const raw = (
      await runGit(
        [
          "diff",
          "--name-status",
          "-z",
          "--find-renames",
          checkpoint.beforeCommit,
          checkpoint.afterCommit,
          "--",
          ".",
        ],
        { cwd: checkpoint.workingPath, maxBuffer: 8 * 1024 * 1024 }
      )
    ).stdout;
    const tokens = raw.split("\0").filter(Boolean);
    const names: Array<{
      status: string;
      previousPath: string | null;
      path: string;
    }> = [];
    for (let index = 0; index < tokens.length; ) {
      const status = tokens[index++] ?? "M";
      if (status.startsWith("R") || status.startsWith("C")) {
        const previousPath = tokens[index++] ?? "";
        const nextPath = tokens[index++] ?? previousPath;
        names.push({ status, previousPath, path: nextPath });
      } else {
        names.push({
          status,
          previousPath: null,
          path: tokens[index++] ?? "",
        });
      }
    }

    let remainingPatchChars = MAX_TOTAL_PATCH_CHARS;
    let truncated = names.length > MAX_DIFF_FILES;
    const files: CheckpointFileDiff[] = [];
    for (const item of names.slice(0, MAX_DIFF_FILES)) {
      const pathspec = item.path || item.previousPath || ".";
      const numstat = await gitOutput(
        [
          "diff",
          "--numstat",
          "--find-renames",
          checkpoint.beforeCommit,
          checkpoint.afterCommit,
          "--",
          pathspec,
        ],
        { cwd: checkpoint.repositoryRoot }
      );
      const [added = "0", deleted = "0"] = numstat.split(/\s+/, 2);
      const binary = added === "-" || deleted === "-";
      let patch: string | null = null;
      if (!binary && remainingPatchChars > 0) {
        const fullPatch = (
          await runGit(
            [
              "diff",
              "--no-ext-diff",
              "--unified=3",
              "--find-renames",
              checkpoint.beforeCommit,
              checkpoint.afterCommit,
              "--",
              pathspec,
            ],
            {
              cwd: checkpoint.repositoryRoot,
              maxBuffer: MAX_FILE_PATCH_CHARS * 2,
            }
          )
        ).stdout;
        const allowed = Math.min(MAX_FILE_PATCH_CHARS, remainingPatchChars);
        patch = fullPatch.slice(0, allowed) || null;
        if (fullPatch.length > allowed) truncated = true;
        remainingPatchChars -= patch?.length ?? 0;
      }
      if (remainingPatchChars <= 0 && !binary) truncated = true;

      files.push({
        path: item.path,
        previousPath: item.previousPath,
        status: this.mapStatus(item.status, binary),
        additions: parseCount(added),
        deletions: parseCount(deleted),
        patch,
      });
    }
    return { checkpoint, files, truncated };
  }

  private mapStatus(status: string, binary: boolean): CheckpointFileStatus {
    if (binary) return "binary";
    if (status.startsWith("A")) return "added";
    if (status.startsWith("D")) return "deleted";
    if (status.startsWith("R")) return "renamed";
    if (status.startsWith("C")) return "copied";
    return "modified";
  }

  /**
   * Restore is intentionally conservative: it succeeds only while the working
   * tree still equals this turn's after-checkpoint. This prevents an old
   * restore button from silently overwriting later manual or agent changes.
   */
  async restoreBefore(runId: string): Promise<TurnCheckpoint> {
    const checkpoint = this.database.getTurnCheckpointByRunId(runId);
    if (!checkpoint?.afterCommit || checkpoint.status !== "completed") {
      throw new Error("This run has no completed checkpoint to restore.");
    }

    const probe = await this.captureSnapshot({
      chatId: checkpoint.chatId,
      checkpointId: `restore-${nanoid(6)}`,
      workingPath: checkpoint.workingPath,
      side: "after",
    });
    const [currentTree, expectedTree] = await Promise.all([
      gitOutput(["rev-parse", `${probe.commit}^{tree}`], {
        cwd: checkpoint.workingPath,
      }),
      gitOutput(["rev-parse", `${checkpoint.afterCommit}^{tree}`], {
        cwd: checkpoint.workingPath,
      }),
    ]);
    if (currentTree !== expectedTree) {
      throw new Error(
        "The project changed after this turn. Restore was blocked to protect newer work."
      );
    }

    await runGit(
      ["restore", "--source", checkpoint.beforeCommit, "--staged", "--worktree", "--", "."],
      { cwd: checkpoint.workingPath, maxBuffer: 16 * 1024 * 1024 }
    );

    // `git restore` does not remove files that were untracked before capture.
    // Remove only paths proven to have been added by this exact turn.
    const added = await gitOutput(
      [
        "diff",
        "--name-only",
        "--diff-filter=A",
        checkpoint.beforeCommit,
        checkpoint.afterCommit,
        "--",
        ".",
      ],
      { cwd: checkpoint.workingPath }
    );
    const workingRoot = path.resolve(checkpoint.workingPath);
    const repositoryRoot = path.resolve(checkpoint.repositoryRoot);
    for (const relativePath of added.split(/\r?\n/).filter(Boolean)) {
      const absolutePath = path.resolve(repositoryRoot, relativePath);
      if (!isInside(workingRoot, absolutePath) || !existsSync(absolutePath)) {
        continue;
      }
      const stats = lstatSync(absolutePath);
      if (stats.isFile() || stats.isSymbolicLink()) {
        rmSync(absolutePath, { force: true });
      }
    }
    return checkpoint;
  }
}
