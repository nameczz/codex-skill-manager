import { existsSync } from "node:fs";
import type { RepoSettings, SkillRecord, SkillsMetadata } from "./types.js";
import { repoSettingsPath, repoSkillsMetadataPath, repoUsageEventsPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function emptySkillsMetadata(): SkillsMetadata {
  return { schemaVersion: 1, skills: [] };
}

export async function ensureRepoMetadata(syncRepo: string): Promise<void> {
  const now = new Date().toISOString();
  await mkdir(path.join(syncRepo, "skills"), { recursive: true });
  await mkdir(path.join(syncRepo, "archive"), { recursive: true });
  await mkdir(path.join(syncRepo, "metadata"), { recursive: true });
  await ensureGitignore(syncRepo);

  if (!existsSync(repoSettingsPath(syncRepo))) {
    const settings: RepoSettings = {
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(repoSettingsPath(syncRepo), settings);
  }

  if (!existsSync(repoSkillsMetadataPath(syncRepo))) {
    await writeJsonFile(repoSkillsMetadataPath(syncRepo), emptySkillsMetadata());
  }

  if (!existsSync(repoUsageEventsPath(syncRepo))) {
    await writeFile(repoUsageEventsPath(syncRepo), "", "utf8");
  }
}

async function ensureGitignore(syncRepo: string): Promise<void> {
  const gitignorePath = path.join(syncRepo, ".gitignore");
  const localCachePattern = ".codex-skill-manager/";

  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, `${localCachePattern}\n`, "utf8");
    return;
  }

  const current = await readFile(gitignorePath, "utf8");
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(localCachePattern)) {
    return;
  }

  const separator = current.endsWith("\n") || current.length === 0 ? "" : "\n";
  await writeFile(gitignorePath, `${current}${separator}${localCachePattern}\n`, "utf8");
}

export async function readSkillsMetadata(syncRepo: string): Promise<SkillsMetadata> {
  if (!existsSync(repoSkillsMetadataPath(syncRepo))) {
    return emptySkillsMetadata();
  }

  const metadata = await readJsonFile<SkillsMetadata>(repoSkillsMetadataPath(syncRepo));
  if (metadata.schemaVersion !== 1 || !Array.isArray(metadata.skills)) {
    throw new Error(`Invalid skills metadata at ${repoSkillsMetadataPath(syncRepo)}.`);
  }

  return metadata;
}

export async function writeSkillsMetadata(syncRepo: string, metadata: SkillsMetadata): Promise<void> {
  metadata.skills.sort((a, b) => a.id.localeCompare(b.id));
  await writeJsonFile(repoSkillsMetadataPath(syncRepo), metadata);
}

export async function upsertSkillRecord(syncRepo: string, record: SkillRecord): Promise<void> {
  const metadata = await readSkillsMetadata(syncRepo);
  const index = metadata.skills.findIndex((skill) => skill.id === record.id);
  if (index === -1) {
    metadata.skills.push(record);
  } else {
    metadata.skills[index] = record;
  }
  await writeSkillsMetadata(syncRepo, metadata);
}
