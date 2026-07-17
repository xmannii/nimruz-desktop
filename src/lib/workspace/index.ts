export * from "./types";
export {
  ACTIVE_WORKSPACE_KEY,
  readStoredActiveWorkspaceId,
  writeStoredActiveWorkspaceId,
} from "./session-prefs";
export {
  normalizeWorkspaceTrust,
  sanitizeWorkspace,
  sanitizeWorkspaceRoot,
} from "./sanitize";
export { onReveal, requestReveal, type RevealTarget } from "./reveal";
export {
  classifyFile,
  codeLanguageFor,
  fileExtension,
  type FileCategory,
} from "./file-types";
