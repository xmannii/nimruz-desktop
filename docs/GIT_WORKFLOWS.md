# Git worktrees, checkpoints, and turn diffs

Nimruz can isolate a coding chat in its own Git worktree and records immutable
before/after snapshots for each executable workspace-agent run. The snapshots
power turn-scoped file statistics, unified diffs, and guarded restore.

## Requirements

- Git must be available on `PATH`.
- The workspace must have a linked Git project as its primary folder.
- Worktree mode is available to tool-capable workspace agents, including Codex
  subscription models in Agent mode. Codex Chat mode remains isolated and
  cannot access project files.
- Non-Git workspaces retain their existing file tools but do not claim to have
  Git checkpoints or turn diffs.

## Shared folder and isolated worktree modes

Before sending the first message in an agent chat, choose one of:

- **Shared folder** — tools run in the workspace's existing primary folder.
- **Isolated worktree** — on the first executable turn, Nimruz creates a branch
  named `nimruz/<chat-id>` and a Git worktree dedicated to that chat.

Worktrees live under Electron's local `userData/worktrees/<workspace-id>/`
directory. If the linked workspace folder is a subdirectory of its repository,
the same subdirectory is used inside the worktree. The original checkout is not
added to the chat's approved path set, so absolute paths cannot bypass the
isolation boundary.

Nimruz reuses a saved worktree on later turns. It refuses to silently recreate
or redirect a saved worktree when its on-disk path no longer matches Git.

For Codex turns, the canonical worktree path becomes the native Codex working
directory and runtime workspace root. Codex runs with its `workspace-write`
sandbox and `on-request` approval policy. Native command, file-change, and
permission requests are persisted in the run history and must be resolved from
Nimruz before Codex can continue. Choosing “always allow” applies only to the
current native Codex session; it is not silently converted into a durable
workspace trust rule.

## Checkpoint implementation

Checkpoint capture uses a temporary Git index:

1. Read `HEAD` into the temporary index.
2. Add the approved working folder to that index, including untracked files
   except files ignored by Git.
3. Write a tree and create an internal commit with a fixed local Nimruz identity.
4. Store the commit under
   `refs/nimruz/checkpoints/<chat-id>/<checkpoint-id>/{before,after}`.

The user's real index, branch, and working tree are not changed during capture.
For a workspace linked to a repository subdirectory, content outside that
subdirectory remains at `HEAD` in the snapshot.

Checkpoint metadata is stored in SQLite and associated with the agent `run_id`.
Diff queries are bounded to 100 files, 120,000 patch characters per file, and
500,000 patch characters total. File counts and line statistics remain stored
even when the rendered patch is truncated.

## Restore safety

Restore is deliberately conservative:

1. Nimruz snapshots the current tree.
2. It compares that tree with the selected turn's `after` checkpoint.
3. If any newer manual or agent change exists, restore is rejected.
4. Otherwise, tracked files and the index are restored from the `before`
   checkpoint, and files proven to have been added by that turn are removed.

This protects later work from an old restore button. Restore never runs merely
from opening a diff; it requires the explicit confirmation action in the UI.

## Interactive Git operations

The changed-files shelf is also a scoped Git control surface:

- stage or unstage one file or all visible workspace changes;
- discard one tracked or untracked file after explicit confirmation;
- commit staged files with a bounded commit message;
- fetch and fast-forward the current branch from its configured upstream;
- merge a selected local branch into the current branch; and
- inspect conflicts and explicitly abort an in-progress merge.

All commands use argument arrays rather than a shell. Renderer-supplied paths
must resolve inside the approved primary workspace folder. Commits are rejected
if the repository index contains staged paths outside that folder. Update and
merge are available only when the workspace primary folder is the repository
root, because those operations can change any path in the repository.

**Update** deliberately uses `fetch --prune` followed by `merge --ff-only`.
When histories diverge, Nimruz stops and asks the user to use the explicit merge
workflow. It never rebases, autostashes, force-resets, or pushes. A conflicting
merge remains visible until the user resolves it or selects **Abort merge**.

## Local data and cleanup

Branches, worktrees, checkpoint refs, and metadata are local. They are never
pushed automatically. Deleting a chat does not automatically remove its
worktree, because even a checkout that appeared clean moments earlier can gain
uncommitted work. Worktree lifecycle management is intentionally deferred until
a safe review-and-cleanup UI exists.

## Verification

The Git integration tests create real temporary repositories and verify:

- nested project worktrees are created and reused;
- edits in a chat worktree do not touch the original checkout;
- file tools replace the shared root with the worktree root;
- tracked and untracked changes appear in a turn diff;
- restore reproduces the exact pre-turn state; and
- restore is blocked after newer changes.
- Codex receives only canonical approved roots and native approval decisions
  are translated back to its app-server protocol.
- stage/unstage/commit/discard are scoped to approved paths;
- a local bare remote fast-forwards through Update; and
- merge conflicts remain recoverable through `merge --abort`.

Run:

```bash
pnpm exec tsx --test electron/git/workspace-git.test.ts electron/git/workspace-git-service.test.ts electron/agent/workspace-files.test.ts
pnpm typecheck
pnpm test
pnpm build
```
