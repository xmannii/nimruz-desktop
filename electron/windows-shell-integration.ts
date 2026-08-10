import { execFile } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const OPEN_FOLDER_ARGUMENT = "--open-folder";

type RegistryEntry = {
  key: string;
  name?: string;
  value: string;
};

export function parseOpenFolderArgument(argv: readonly string[]) {
  const index = argv.indexOf(OPEN_FOLDER_ARGUMENT);
  const candidate = index >= 0 ? argv[index + 1]?.trim() : "";
  return candidate || null;
}

export function resolveOpenFolderPath(value: string) {
  try {
    const canonicalPath = realpathSync.native(value);
    return statSync(canonicalPath).isDirectory() ? canonicalPath : null;
  } catch {
    return null;
  }
}

export function windowsContextMenuRegistryEntries(
  executablePath: string
): RegistryEntry[] {
  const roots = [
    {
      key: "HKCU\\Software\\Classes\\Directory\\Background\\shell\\Nimruz",
      folderPlaceholder: "%V",
    },
    {
      key: "HKCU\\Software\\Classes\\Directory\\shell\\Nimruz",
      folderPlaceholder: "%1",
    },
  ];

  return roots.flatMap(({ key, folderPlaceholder }) => [
    { key, value: "Open with Nimruz" },
    { key, name: "Icon", value: executablePath },
    {
      key: `${key}\\command`,
      value: `"${executablePath}" ${OPEN_FOLDER_ARGUMENT} "${folderPlaceholder}"`,
    },
  ]);
}

export async function registerWindowsFolderContextMenu(
  executablePath: string
) {
  if (process.platform !== "win32") return false;

  await Promise.all(
    windowsContextMenuRegistryEntries(executablePath).map((entry) => {
      const valueName = entry.name ? ["/v", entry.name] : ["/ve"];
      return execFileAsync("reg.exe", [
        "ADD",
        entry.key,
        ...valueName,
        "/d",
        entry.value,
        "/f",
      ]);
    })
  );
  return true;
}
