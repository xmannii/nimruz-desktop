import { realpathSync } from "node:fs";
import path from "node:path";

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathPolicyError";
  }
}

/**
 * Canonicalize the closest existing ancestor while preserving any path
 * segments that have not been created yet. This keeps macOS aliases such as
 * /var and /private/var comparable for both existing and new workspace files.
 */
function canonicalizePath(value: string): string {
  const absolute = path.resolve(value);
  const missingSegments: string[] = [];
  let candidate = absolute;

  while (true) {
    try {
      const existing = realpathSync.native(candidate);
      return path.join(existing, ...missingSegments.reverse());
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return absolute;
      missingSegments.push(path.basename(candidate));
      candidate = parent;
    }
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

  const canonicalTarget = canonicalizePath(target);

  for (const root of roots) {
    const canonicalRoot = canonicalizePath(root);

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
