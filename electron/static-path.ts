import path from "node:path";

export type StaticPathResult =
  | { ok: true; path: string }
  | { ok: false; status: 400 | 403 };

export function resolveStaticPath(
  rendererDir: string,
  urlPath: string
): StaticPathResult {
  let cleanPath: string;
  try {
    cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return { ok: false, status: 400 };
  }
  if (cleanPath.includes("\0")) return { ok: false, status: 400 };

  const relative =
    cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const root = path.resolve(rendererDir);
  const resolved = path.resolve(root, relative);
  const pathFromRoot = path.relative(root, resolved);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
  ) {
    return { ok: false, status: 403 };
  }
  return { ok: true, path: resolved };
}
