import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { ensureSkillDependenciesInstalled } from "./skillDependencies.js";
import type { DependencyInstallResult, InstallRepoSkillResult, LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { copySkillDirectory } from "./copy.js";
import { hashDirectory } from "./hash.js";
import { readSkillsMetadata, upsertSkillRecord } from "./metadata.js";
import { repoSkillsDir, resolveSkillPath, validateSkillId } from "./paths.js";
import { readSkillFrontmatter } from "./frontmatter.js";

export type InstallOptions = {
  force?: boolean;
  source?: LocalSkillSource;
};

export async function installRepoSkill(config: LocalConfig, skillId: string, options: InstallOptions = {}): Promise<InstallRepoSkillResult> {
  const id = validateSkillId(skillId);
  const metadata = await readSkillsMetadata(config.syncRepo);
  const existing = metadata.skills.find((skill) => skill.id === id && skill.status === "managed");

  if (!existing) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  const sourcePath = resolveSkillPath(repoSkillsDir(config.syncRepo), id);
  const localSource = options.source ?? existing.localSource ?? "codex";
  const targetPath = resolveSkillPath(localRootForSource(config, localSource), id);

  if (!existsSync(path.join(sourcePath, "SKILL.md"))) {
    throw new Error(`Repo skill not found: ${sourcePath}`);
  }

  if (existsSync(targetPath)) {
    if (!options.force) {
      throw new Error(`Local skill already exists: ${targetPath}. Re-run with --force to overwrite.`);
    }
    await rm(targetPath, { recursive: true, force: true });
  }

  await copySkillDirectory(sourcePath, targetPath);

  const hash = await hashDirectory(sourcePath);
  const frontmatter = await readSkillFrontmatter(sourcePath);
  const now = new Date().toISOString();
  const record: SkillRecord = {
    ...existing,
    name: frontmatter.name,
    description: frontmatter.description,
    localSource,
    installed: true,
    syncState: "clean",
    lastSyncedHash: hash,
    currentRepoHash: hash,
    currentLocalHash: hash,
    lastUsedAt: existing.lastUsedAt ?? null,
    updatedAt: now
  };

  const dependencyInstall = await installDependencies(targetPath, record.id);
  await upsertSkillRecord(config.syncRepo, record);
  return { record, dependencyInstall };
}

function localRootForSource(config: LocalConfig, source: LocalSkillSource): string {
  return source === "agents" ? config.agentsSkillsDir : config.codexSkillsDir;
}

async function installDependencies(
  skillPath: string,
  skillId: string
): Promise<DependencyInstallResult> {
  try {
    return await ensureSkillDependenciesInstalled(skillPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to install dependencies for ${skillId}: ${message}`);
  }
}
