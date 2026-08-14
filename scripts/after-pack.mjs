import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];

export default async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = ARCH_NAMES[context.arch];
  if (!arch) throw new Error(`Unsupported packaged architecture: ${context.arch}`);

  const resourcesDirectory =
    platform === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources"
        )
      : path.join(context.appOutDir, "resources");
  const binaryRoot = path.join(
    resourcesDirectory,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6"
  );

  for (const platformEntry of await readdir(binaryRoot, {
    withFileTypes: true,
  })) {
    if (!platformEntry.isDirectory()) continue;
    const platformDirectory = path.join(binaryRoot, platformEntry.name);
    if (platformEntry.name !== platform) {
      await rm(platformDirectory, { recursive: true, force: true });
      continue;
    }

    for (const archEntry of await readdir(platformDirectory, {
      withFileTypes: true,
    })) {
      if (!archEntry.isDirectory()) continue;
      if (arch !== "universal" && archEntry.name !== arch) {
        await rm(path.join(platformDirectory, archEntry.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  if (platform === "darwin") {
    const activeDirectory = path.join(binaryRoot, platform, arch);
    for (const entry of await readdir(activeDirectory, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        /^libonnxruntime\.\d+\.\d+\.\d+\.dylib$/.test(entry.name)
      ) {
        await rm(path.join(activeDirectory, entry.name));
      }
    }
  }
}
