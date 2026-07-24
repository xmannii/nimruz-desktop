import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ChatWorktree } from "@/lib/workspace";
import type { AppDatabase } from "../storage/database";
import { gitOutput, runGit } from "./git-process";

const SAFE_ID = /^[\w-]{1,128}$/;

function assertId(value: string, label: string) {
  if (!SAFE_ID.test(value)) throw new Error(`Invalid ${label}.`);
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Owns chat-isolated Git worktrees under Electron's userData directory.
 *
 * Worktrees are created lazily on the first executable turn. This avoids
 * creating branches for draft chats that the user never sends.
 */
export class ChatWorktreeManager {
  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string
  ) {}

  private primaryWorkspaceRoot(workspaceId: string): string {
    const roots = this.database.loadWorkspaceRoots(workspaceId);
    const primary = roots.find((root) => root.isPrimary);
    if (!primary || primary.kind !== "linked") {
      throw new Error(
        "An isolated worktree requires a linked Git project as the primary workspace folder."
      );
    }
    return primary.path;
  }

  async ensureWorktree(
    workspaceId: string,
    chatId: string
  ): Promise<ChatWorktree> {
    assertId(workspaceId, "workspace id");
    assertId(chatId, "chat id");

    const existing = this.database.getChatWorktree(chatId);
    if (existing) {
      if (existing.workspaceId !== workspaceId) {
        throw new Error("This chat worktree belongs to another workspace.");
      }
      if (!existsSync(existing.workingPath)) {
        throw new Error(
          "The chat worktree is missing on disk. Switch the chat to the shared workspace or restore the worktree."
        );
      }
      const actualRoot = realpathSync(
        await gitOutput(["rev-parse", "--show-toplevel"], {
          cwd: existing.workingPath,
        })
      );
      if (actualRoot !== realpathSync(existing.worktreePath)) {
        throw new Error("The saved chat worktree path no longer matches Git.");
      }
      return existing;
    }

    const primaryRoot = realpathSync(this.primaryWorkspaceRoot(workspaceId));
    const repositoryRoot = realpathSync(
      await gitOutput(["rev-parse", "--show-toplevel"], { cwd: primaryRoot })
    );
    if (!isInside(repositoryRoot, primaryRoot)) {
      throw new Error("The primary workspace folder is outside its Git repository.");
    }

    const relativeWorkingPath = path.relative(repositoryRoot, primaryRoot);
    const baseCommit = await gitOutput(["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
    });
    const worktreesRoot = path.join(
      this.userDataPath,
      "worktrees",
      workspaceId
    );
    mkdirSync(worktreesRoot, { recursive: true });

    let branchName = `nimruz/${chatId.slice(0, 12)}`;
    let branchExists = true;
    try {
      await runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
        cwd: repositoryRoot,
      });
    } catch {
      branchExists = false;
    }
    if (branchExists) branchName = `${branchName}-${nanoid(5)}`;

    const worktreePath = path.join(worktreesRoot, chatId);
    if (existsSync(worktreePath)) {
      throw new Error(
        "The target worktree directory already exists without a saved worktree record."
      );
    }

    await runGit(
      ["worktree", "add", "--no-track", "-b", branchName, worktreePath, baseCommit],
      { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 }
    );

    const canonicalWorktreePath = realpathSync(worktreePath);
    const workingPath = relativeWorkingPath
      ? path.join(canonicalWorktreePath, relativeWorkingPath)
      : canonicalWorktreePath;
    if (!existsSync(workingPath)) {
      throw new Error("The corresponding project folder is missing in the worktree.");
    }

    const now = Date.now();
    const worktree: ChatWorktree = {
      chatId,
      workspaceId,
      repositoryRoot,
      worktreePath: canonicalWorktreePath,
      workingPath: realpathSync(workingPath),
      branchName,
      baseCommit,
      createdAt: now,
      updatedAt: now,
    };
    this.database.saveChatWorktree(worktree);
    return worktree;
  }
}
