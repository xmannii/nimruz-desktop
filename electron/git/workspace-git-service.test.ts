import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_WORKSPACE_TRUST,
  type LocalWorkspace,
  type WorkspaceRoot,
} from "@/lib/workspace";
import { WorkspaceFilesStore } from "../agent/workspace-files";
import { AppDatabase } from "../storage/database";
import { runGit } from "./git-process";
import { WorkspaceGitService } from "./workspace-git-service";

async function createFixture(options?: { nested?: boolean }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-git-ui-"));
  const repository = path.join(directory, "repository");
  const workingRoot = options?.nested
    ? path.join(repository, "app")
    : repository;
  await mkdir(workingRoot, { recursive: true });
  await writeFile(path.join(repository, "README.md"), "root\n");
  if (options?.nested) {
    await writeFile(path.join(workingRoot, "feature.txt"), "before\n");
  }
  await runGit(["init", "-b", "main"], { cwd: repository });
  await runGit(["config", "user.name", "Nimruz Tests"], { cwd: repository });
  await runGit(["config", "user.email", "tests@nimruz.local"], {
    cwd: repository,
  });
  await runGit(["add", "."], { cwd: repository });
  await runGit(["commit", "-m", "initial"], { cwd: repository });

  const database = new AppDatabase(path.join(directory, "nimruz.sqlite3"));
  const workspace: LocalWorkspace = {
    id: "workspace-git-ui",
    title: "Git UI",
    description: "",
    instructions: "",
    trust: DEFAULT_WORKSPACE_TRUST,
    createdAt: 1,
    updatedAt: 1,
  };
  const root: WorkspaceRoot = {
    id: "root-git-ui",
    workspaceId: workspace.id,
    kind: "linked",
    path: workingRoot,
    label: "Git UI",
    isPrimary: true,
    createdAt: 1,
  };
  database.saveWorkspace(workspace);
  database.saveWorkspaceRoot(root);
  const files = new WorkspaceFilesStore(
    database,
    path.join(directory, "user-data")
  );
  return {
    directory,
    repository,
    workingRoot,
    database,
    workspace,
    service: new WorkspaceGitService(files),
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("stages, unstages, commits, and discards only scoped files", async () => {
  const fixture = await createFixture({ nested: true });
  try {
    await writeFile(path.join(fixture.workingRoot, "feature.txt"), "after\n");
    await writeFile(path.join(fixture.workingRoot, "new.txt"), "new\n");

    await fixture.service.stage(fixture.workspace.id, ["app/feature.txt"]);
    assert.match(
      (await runGit(["status", "--short"], { cwd: fixture.repository })).stdout,
      /M  app\/feature\.txt/
    );
    await fixture.service.unstage(fixture.workspace.id, ["app/feature.txt"]);
    assert.match(
      (await runGit(["status", "--short"], { cwd: fixture.repository })).stdout,
      / M app\/feature\.txt/
    );

    await fixture.service.stage(fixture.workspace.id, [
      "app/feature.txt",
      "app/new.txt",
    ]);
    const committed = await fixture.service.commit(
      fixture.workspace.id,
      "test: scoped commit"
    );
    assert.equal(committed.ok, true);
    assert.equal(
      (
        await runGit(["log", "-1", "--pretty=%s"], {
          cwd: fixture.repository,
        })
      ).stdout.trim(),
      "test: scoped commit"
    );

    await writeFile(path.join(fixture.workingRoot, "feature.txt"), "discard\n");
    await writeFile(path.join(fixture.workingRoot, "temporary.txt"), "temp\n");
    await fixture.service.discard(
      fixture.workspace.id,
      "app/feature.txt"
    );
    await fixture.service.discard(
      fixture.workspace.id,
      "app/temporary.txt"
    );
    assert.match(
      await readFile(path.join(fixture.workingRoot, "feature.txt"), "utf8"),
      /^after\r?\n$/
    );
    await writeFile(path.join(fixture.workingRoot, "staged-new.txt"), "new\n");
    await fixture.service.stage(fixture.workspace.id, ["app/staged-new.txt"]);
    await fixture.service.discard(
      fixture.workspace.id,
      "app/staged-new.txt"
    );
    await assert.rejects(() =>
      readFile(path.join(fixture.workingRoot, "staged-new.txt"), "utf8")
    );
    await runGit(
      ["mv", "app/feature.txt", "app/renamed.txt"],
      { cwd: fixture.repository }
    );
    await fixture.service.discard(
      fixture.workspace.id,
      "app/renamed.txt"
    );
    assert.match(
      await readFile(path.join(fixture.workingRoot, "feature.txt"), "utf8"),
      /^after\r?\n$/
    );
    await assert.rejects(
      () => fixture.service.stage(fixture.workspace.id, ["README.md"]),
      /outside the approved workspace root/
    );
  } finally {
    await fixture.close();
  }
});

test("fast-forwards from an upstream without creating merge commits", async () => {
  const fixture = await createFixture();
  const remote = path.join(fixture.directory, "remote.git");
  const contributor = path.join(fixture.directory, "contributor");
  try {
    await runGit(["clone", "--bare", fixture.repository, remote], {
      cwd: fixture.directory,
    });
    await runGit(["remote", "add", "origin", remote], {
      cwd: fixture.repository,
    });
    await runGit(["push", "-u", "origin", "main"], {
      cwd: fixture.repository,
    });
    await runGit(["clone", remote, contributor], { cwd: fixture.directory });
    await runGit(["config", "user.name", "Contributor"], { cwd: contributor });
    await runGit(["config", "user.email", "contributor@nimruz.local"], {
      cwd: contributor,
    });
    await writeFile(path.join(contributor, "remote.txt"), "remote\n");
    await runGit(["add", "remote.txt"], { cwd: contributor });
    await runGit(["commit", "-m", "remote change"], { cwd: contributor });
    await runGit(["push"], { cwd: contributor });

    const result = await fixture.service.update(fixture.workspace.id);
    assert.equal(result.ok, true);
    assert.match(
      await readFile(path.join(fixture.repository, "remote.txt"), "utf8"),
      /^remote\r?\n$/
    );
    const status = await fixture.service.status(fixture.workspace.id);
    assert.equal(status.behind, 0);
    assert.equal(status.upstream, "origin/main");
  } finally {
    await fixture.close();
  }
});

test("merges a branch and exposes conflicts until explicitly aborted", async () => {
  const fixture = await createFixture();
  try {
    await runGit(["switch", "-c", "feature"], { cwd: fixture.repository });
    await writeFile(path.join(fixture.repository, "README.md"), "feature\n");
    await runGit(["commit", "-am", "feature"], { cwd: fixture.repository });
    await runGit(["switch", "main"], { cwd: fixture.repository });
    await writeFile(path.join(fixture.repository, "README.md"), "main\n");
    await runGit(["commit", "-am", "main"], { cwd: fixture.repository });

    const result = await fixture.service.merge(
      fixture.workspace.id,
      "feature"
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.conflicts, ["README.md"]);
    assert.equal((await fixture.service.status(fixture.workspace.id)).merging, true);

    await fixture.service.abortMerge(fixture.workspace.id);
    assert.equal((await fixture.service.status(fixture.workspace.id)).merging, false);
    assert.match(
      await readFile(path.join(fixture.repository, "README.md"), "utf8"),
      /^main\r?\n$/
    );
  } finally {
    await fixture.close();
  }
});
