import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SHENAVA_MODELS,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import { ShenavaService } from "./service";

async function installFixture(
  service: ShenavaService,
  modelKey: ShenavaModelKey
) {
  const definition = SHENAVA_MODELS[modelKey];
  const directory = service.getModelDirectory(modelKey);
  await mkdir(directory, { recursive: true });

  for (const file of definition.files) {
    const filePath = path.join(directory, file.name);
    await writeFile(filePath, "");
    await truncate(filePath, file.size);
  }

  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      modelId: definition.id,
      revision: definition.revision,
      installedAt: new Date().toISOString(),
      license: definition.license,
    })
  );
}

test("tracks, selects, and removes the two pinned Shenava models independently", async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "nimruz-shenava-"));
  const workerScript = path.join(userDataPath, "unused-worker.cjs");
  const service = new ShenavaService({ userDataPath, workerScript });

  try {
    const empty = await service.getStatus();
    assert.equal(empty.activeModelKey, "rizeh");
    assert.equal(empty.models.rizeh.phase, "not-installed");
    assert.equal(empty.models.koochik.phase, "not-installed");

    await installFixture(service, "rizeh");
    await installFixture(service, "koochik");

    const installed = await service.getStatus();
    assert.equal(installed.models.rizeh.installed, true);
    assert.equal(
      installed.models.rizeh.installedBytes,
      SHENAVA_MODELS.rizeh.totalBytes
    );
    assert.equal(installed.models.koochik.installed, true);
    assert.equal(
      installed.models.koochik.installedBytes,
      SHENAVA_MODELS.koochik.totalBytes
    );

    const selected = await service.select("koochik");
    assert.equal(selected.activeModelKey, "koochik");

    const restarted = new ShenavaService({ userDataPath, workerScript });
    assert.equal((await restarted.getStatus()).activeModelKey, "koochik");

    const withoutKoochik = await restarted.remove("koochik");
    assert.equal(withoutKoochik.models.koochik.installed, false);
    assert.equal(withoutKoochik.models.rizeh.installed, true);
    assert.equal(withoutKoochik.activeModelKey, "rizeh");

    const withoutEither = await restarted.remove("rizeh");
    assert.equal(withoutEither.models.rizeh.installed, false);
    assert.equal(withoutEither.models.koochik.installed, false);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
});
