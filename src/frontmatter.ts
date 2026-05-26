import { readFile } from "node:fs/promises";
import path from "node:path";

export type SkillFrontmatter = {
  name: string;
  description: string;
};

export async function readSkillFrontmatter(skillDir: string): Promise<SkillFrontmatter> {
  const skillFile = path.join(skillDir, "SKILL.md");
  const raw = await readFile(skillFile, "utf8");

  if (!raw.startsWith("---")) {
    return { name: path.basename(skillDir), description: "" };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { name: path.basename(skillDir), description: "" };
  }

  const block = raw.slice(3, end).trim();
  const result: Record<string, string> = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    result[key] = stripYamlString(value);
  }

  return {
    name: result.name ?? path.basename(skillDir),
    description: result.description ?? ""
  };
}

function stripYamlString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
