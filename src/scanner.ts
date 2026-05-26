import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ScanSource, ScannedSkill } from "./types.js";
import { readSkillFrontmatter } from "./frontmatter.js";
import { hashDirectory } from "./hash.js";
import { validateSkillId } from "./paths.js";

export type ScanOptions = {
  includeHidden?: boolean;
};

export async function scanSkills(root: string, source: ScanSource, options: ScanOptions = {}): Promise<ScannedSkill[]> {
  if (!existsSync(root)) {
    return [];
  }

  const skills: ScannedSkill[] = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name, options)) {
      continue;
    }

    const current = path.join(root, entry.name);
    if (!existsSync(path.join(current, "SKILL.md"))) {
      continue;
    }

    const id = validateSkillId(entry.name);
    const frontmatter = await readSkillFrontmatter(current);
    skills.push({
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      path: current,
      source,
      hash: await hashDirectory(current)
    });
  }

  return skills.sort((a, b) => a.id.localeCompare(b.id));
}

function shouldSkipDirectory(name: string, options: ScanOptions): boolean {
  if (name === ".git" || name === "node_modules") {
    return true;
  }

  return !options.includeHidden && name.startsWith(".");
}
