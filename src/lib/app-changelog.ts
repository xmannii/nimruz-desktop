import changelogMarkdown from "../../CHANGELOG.md?raw";
import { parseChangelog, type ChangelogEntry } from "@/lib/changelog";

/** Shipped app changelog from the repo-root CHANGELOG.md. */
export function getAppChangelog(): ChangelogEntry[] {
  return parseChangelog(changelogMarkdown);
}
