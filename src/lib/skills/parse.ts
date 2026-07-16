import {
  SKILL_LIMITS,
  type SkillDocument,
} from "@/lib/skills/types";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillName(value: string) {
  return (
    value.length > 0 &&
    value.length <= SKILL_LIMITS.name &&
    SKILL_NAME_PATTERN.test(value)
  );
}

export function normalizeSkillName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  return isValidSkillName(name) ? name : null;
}

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function parseFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = unquoteYamlScalar(line.slice(separator + 1));
    if (key) result[key] = value;
  }

  return result;
}

function quoteYamlDescription(value: string) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

/** Parse Agent Skills SKILL.md content into name, description, and body. */
export function parseSkillMarkdown(content: string): SkillDocument | null {
  const trimmed = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!trimmed.startsWith("---\n") && trimmed !== "---") {
    if (!trimmed.startsWith("---")) return null;
  }

  const afterOpen = trimmed.startsWith("---\n")
    ? trimmed.slice(4)
    : trimmed.slice(3);
  const closeIndex = afterOpen.indexOf("\n---");
  if (closeIndex === -1) return null;

  const frontmatter = afterOpen.slice(0, closeIndex);
  let body = afterOpen.slice(closeIndex + 4);
  body = body.replace(/^\n+/, "");

  const fields = parseFrontmatter(frontmatter);
  const name = normalizeSkillName(fields.name);
  if (!name) return null;

  const description =
    typeof fields.description === "string"
      ? fields.description.trim().slice(0, SKILL_LIMITS.description)
      : "";
  if (!description) return null;

  return {
    name,
    description,
    body: body.slice(0, SKILL_LIMITS.body),
  };
}

export function serializeSkillMarkdown(document: SkillDocument): string {
  const name = normalizeSkillName(document.name);
  if (!name) {
    throw new Error("Invalid skill name.");
  }

  const description = document.description
    .trim()
    .slice(0, SKILL_LIMITS.description);
  if (!description) {
    throw new Error("Skill description is required.");
  }

  const body = document.body.trim().slice(0, SKILL_LIMITS.body);

  return `---\nname: ${name}\ndescription: ${quoteYamlDescription(description)}\n---\n\n${body}\n`;
}

export function sanitizeSkillDocument(value: unknown): SkillDocument | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const name = normalizeSkillName(entry.name);
  if (!name) return null;

  const description =
    typeof entry.description === "string"
      ? entry.description.trim().slice(0, SKILL_LIMITS.description)
      : "";
  if (!description) return null;

  const body =
    typeof entry.body === "string"
      ? entry.body.slice(0, SKILL_LIMITS.body)
      : "";

  return { name, description, body };
}
