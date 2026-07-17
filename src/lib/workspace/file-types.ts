/** Classifies workspace files for preview routing by extension. */

export type FileCategory =
  | "markdown"
  | "code"
  | "csv"
  | "json"
  | "image"
  | "text"
  | "binary";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);

const BINARY_EXTS = new Set([
  "pdf",
  "zip",
  "gz",
  "tar",
  "rar",
  "7z",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "wasm",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "wav",
  "ogg",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

/** Extension → syntax highlighting language hint for code previews. */
const CODE_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  dockerfile: "dockerfile",
  ini: "ini",
  lua: "lua",
  r: "r",
  dart: "dart",
  scala: "scala",
};

export function fileExtension(path: string): string {
  const name = path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function codeLanguageFor(path: string): string | null {
  const ext = fileExtension(path);
  if (CODE_LANGUAGES[ext]) return CODE_LANGUAGES[ext];
  const name = (path.split(/[/\\]/).filter(Boolean).at(-1) ?? "").toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  return null;
}

export function classifyFile(path: string): FileCategory {
  const ext = fileExtension(path);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (BINARY_EXTS.has(ext)) return "binary";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "json" || ext === "jsonl") return "json";
  if (codeLanguageFor(path)) return "code";
  return "text";
}
