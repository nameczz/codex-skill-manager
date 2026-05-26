import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { copySkillDirectory } from "./copy.js";
import { hashDirectory } from "./hash.js";
import { readSkillFrontmatter } from "./frontmatter.js";
import { repoSkillsDir, resolveSkillPath, validateSkillId } from "./paths.js";
import { upsertSkillRecord } from "./metadata.js";

export type ImportOptions = {
  force?: boolean;
  source?: LocalSkillSource;
};

export async function importLocalSkill(config: LocalConfig, skillId: string, options: ImportOptions = {}): Promise<SkillRecord> {
  const id = validateSkillId(skillId);
  const localSource = options.source ?? findExistingLocalSource(config, id);
  const localPath = resolveSkillPath(localRootForSource(config, localSource), id);
  const targetPath = resolveSkillPath(repoSkillsDir(config.syncRepo), id);

  if (!existsSync(path.join(localPath, "SKILL.md"))) {
    throw new Error(`Local skill not found: ${localPath}`);
  }

  if (existsSync(targetPath)) {
    if (!options.force) {
      throw new Error(`Repo skill already exists: ${targetPath}. Re-run with --force to overwrite.`);
    }
    await rm(targetPath, { recursive: true, force: true });
  }

  await copySkillDirectory(localPath, targetPath);
  const hash = await hashDirectory(targetPath);
  const frontmatter = await readSkillFrontmatter(targetPath);
  const now = new Date().toISOString();
  const record: SkillRecord = {
    id,
    name: frontmatter.name,
    description: frontmatter.description,
    status: "managed",
    localSource,
    installed: true,
    syncState: "clean",
    lastSyncedHash: hash,
    currentRepoHash: hash,
    currentLocalHash: hash,
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };

  await upsertSkillRecord(config.syncRepo, record);
  return record;
}

function findExistingLocalSource(config: LocalConfig, id: string): LocalSkillSource {
  const sources: LocalSkillSource[] = ["codex", "agents"];
  for (const source of sources) {
    const candidate = resolveSkillPath(localRootForSource(config, source), id);
    if (existsSync(path.join(candidate, "SKILL.md"))) {
      return source;
    }
  }

  return "codex";
}

function localRootForSource(config: LocalConfig, source: LocalSkillSource): string {
  return source === "agents" ? config.agentsSkillsDir : config.codexSkillsDir;
}
