import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeSkillName,
  parseSkillMarkdown,
  sanitizeSkillDocument,
  serializeSkillMarkdown,
  type SkillDocument,
  type SkillSource,
  type SkillSummary,
  type SkillsPreferences,
} from "@/lib/skills/index";
import { isSkillEnabled } from "@/lib/skills/preferences";

export type SkillRoot = {
  source: SkillSource;
  directory: string;
  editable: boolean;
};

export function defaultSkillRoots(homeDir = os.homedir()): SkillRoot[] {
  const configHome =
    process.env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config");

  return [
    {
      source: "nimruz",
      directory: path.join(homeDir, ".nimruz", "skills"),
      editable: true,
    },
    {
      source: "universal",
      directory: path.join(configHome, "agents", "skills"),
      editable: false,
    },
    {
      source: "agents",
      directory: path.join(homeDir, ".agents", "skills"),
      editable: false,
    },
  ];
}

type DiscoveredSkill = Omit<SkillSummary, "enabled"> & {
  skillPath: string;
};

async function readSkillFromDirectory(
  directory: string,
  source: SkillSource,
  editable: boolean
): Promise<DiscoveredSkill | null> {
  const skillPath = path.join(directory, "SKILL.md");
  try {
    const content = await fs.readFile(skillPath, "utf8");
    const parsed = parseSkillMarkdown(content);
    if (!parsed) return null;

    const folderName = path.basename(directory);
    const name = normalizeSkillName(parsed.name) ?? normalizeSkillName(folderName);
    if (!name) return null;

    return {
      name,
      description: parsed.description,
      source,
      directory,
      editable,
      skillPath,
    };
  } catch {
    return null;
  }
}

async function scanRoot(root: SkillRoot): Promise<DiscoveredSkill[]> {
  let entries;
  try {
    entries = await fs.readdir(root.directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: DiscoveredSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillDir = path.join(root.directory, entry.name);
    const skill = await readSkillFromDirectory(
      skillDir,
      root.source,
      root.editable
    );
    if (skill) skills.push(skill);
  }
  return skills;
}

/** Prefer earlier roots (nimruz > universal > agents) when names collide. */
export function dedupeSkills(skills: DiscoveredSkill[]): DiscoveredSkill[] {
  const byName = new Map<string, DiscoveredSkill>();
  for (const skill of skills) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export class SkillStore {
  private readonly roots: SkillRoot[];

  constructor(roots: SkillRoot[] = defaultSkillRoots()) {
    this.roots = roots;
  }

  get nimruzRoot() {
    const root = this.roots.find((item) => item.source === "nimruz");
    if (!root) {
      throw new Error("Nimruz skills root is not configured.");
    }
    return root;
  }

  async list(preferences: SkillsPreferences): Promise<SkillSummary[]> {
    const discovered: DiscoveredSkill[] = [];
    for (const root of this.roots) {
      discovered.push(...(await scanRoot(root)));
    }

    return dedupeSkills(discovered).map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      directory: skill.directory,
      editable: skill.editable,
      enabled: isSkillEnabled(skill.name, preferences),
    }));
  }

  async getEnabledCatalog(preferences: SkillsPreferences) {
    const skills = await this.list(preferences);
    return skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
      }));
  }

  async findSkill(
    name: string,
    preferences: SkillsPreferences
  ): Promise<DiscoveredSkill | null> {
    const normalized = normalizeSkillName(name);
    if (!normalized) return null;

    const discovered: DiscoveredSkill[] = [];
    for (const root of this.roots) {
      discovered.push(...(await scanRoot(root)));
    }

    const skill = dedupeSkills(discovered).find(
      (item) => item.name === normalized
    );
    if (!skill) return null;
    if (!isSkillEnabled(skill.name, preferences)) return null;
    return skill;
  }

  async loadSkillContent(
    name: string,
    preferences: SkillsPreferences
  ): Promise<string | null> {
    const skill = await this.findSkill(name, preferences);
    if (!skill) return null;

    try {
      const content = await fs.readFile(skill.skillPath, "utf8");
      const parsed = parseSkillMarkdown(content);
      if (!parsed) return null;
      return content;
    } catch {
      return null;
    }
  }

  async getSkillBody(name: string): Promise<SkillDocument | null> {
    const normalized = normalizeSkillName(name);
    if (!normalized) return null;

    const discovered: DiscoveredSkill[] = [];
    for (const root of this.roots) {
      discovered.push(...(await scanRoot(root)));
    }
    const skill = dedupeSkills(discovered).find(
      (item) => item.name === normalized
    );
    if (!skill) return null;

    try {
      const content = await fs.readFile(skill.skillPath, "utf8");
      return parseSkillMarkdown(content);
    } catch {
      return null;
    }
  }

  async create(value: unknown): Promise<SkillSummary> {
    const document = sanitizeSkillDocument(value);
    if (!document) {
      throw new Error("مهارت نامعتبر است.");
    }

    const root = this.nimruzRoot;
    await fs.mkdir(root.directory, { recursive: true });

    const skillDir = path.join(root.directory, document.name);
    if (existsSync(path.join(skillDir, "SKILL.md"))) {
      throw new Error("مهارتی با این نام از قبل وجود دارد.");
    }

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      serializeSkillMarkdown(document),
      "utf8"
    );

    return {
      name: document.name,
      description: document.description,
      source: "nimruz",
      directory: skillDir,
      editable: true,
      enabled: true,
    };
  }

  async update(name: string, value: unknown): Promise<SkillSummary> {
    const normalized = normalizeSkillName(name);
    if (!normalized) {
      throw new Error("نام مهارت نامعتبر است.");
    }

    const document = sanitizeSkillDocument({
      ...(typeof value === "object" && value ? value : {}),
      name: normalized,
    });
    if (!document) {
      throw new Error("مهارت نامعتبر است.");
    }

    const root = this.nimruzRoot;
    const skillDir = path.join(root.directory, normalized);
    const skillPath = path.join(skillDir, "SKILL.md");

    try {
      await fs.access(skillPath);
    } catch {
      throw new Error("فقط مهارت‌های Nimruz قابل ویرایش هستند.");
    }

    await fs.writeFile(skillPath, serializeSkillMarkdown(document), "utf8");

    return {
      name: document.name,
      description: document.description,
      source: "nimruz",
      directory: skillDir,
      editable: true,
      enabled: true,
    };
  }

  async delete(name: string): Promise<void> {
    const normalized = normalizeSkillName(name);
    if (!normalized) {
      throw new Error("نام مهارت نامعتبر است.");
    }

    const root = this.nimruzRoot;
    const skillDir = path.join(root.directory, normalized);
    const skillPath = path.join(skillDir, "SKILL.md");

    try {
      await fs.access(skillPath);
    } catch {
      throw new Error("فقط مهارت‌های Nimruz قابل حذف هستند.");
    }

    await fs.rm(skillDir, { recursive: true, force: true });
  }
}
