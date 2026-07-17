import { realpathSync } from "node:fs";
import path from "node:path";

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathPolicyError";
  }
}

/**
 * Resolve and assert that `target` stays within one of the approved roots.
 * Rejects traversal, null bytes, and symlink escapes.
 */
export function resolveInsideRoots(
  target: string,
  roots: string[]
): { absolutePath: string; root: string } {
  if (!target || typeof target !== "string") {
    throw new PathPolicyError("Path is required.");
  }
  if (target.includes("\0")) {
    throw new PathPolicyError("Path contains an invalid null byte.");
  }
  if (!roots.length) {
    throw new PathPolicyError("No approved workspace roots are configured.");
  }

  const absoluteTarget = path.resolve(target);
  let canonicalTarget = absoluteTarget;
  try {
    canonicalTarget = realpathSync.native(absoluteTarget);
  } catch {
    // File may not exist yet — validate parent containment instead.
    const parent = path.dirname(absoluteTarget);
    try {
      const canonicalParent = realpathSync.native(parent);
      canonicalTarget = path.join(canonicalParent, path.basename(absoluteTarget));
    } catch {
      canonicalTarget = absoluteTarget;
    }
  }

  for (const root of roots) {
    let canonicalRoot = path.resolve(root);
    try {
      canonicalRoot = realpathSync.native(canonicalRoot);
    } catch {
      // Root itself may be missing for managed dirs about to be created.
    }

    const relative = path.relative(canonicalRoot, canonicalTarget);
    if (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      return { absolutePath: canonicalTarget, root: canonicalRoot };
    }
  }

  throw new PathPolicyError("Path is outside approved workspace roots.");
}

export function assertSafeRelativePath(relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw new PathPolicyError("Invalid relative path.");
  }
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized) ||
    normalized.startsWith("/")
  ) {
    throw new PathPolicyError("Relative path escapes the workspace.");
  }
  return normalized;
}
