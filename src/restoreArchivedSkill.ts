import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { deriveSyncState } from "./status.js";
import { readSkillFrontmatter } from "./frontmatter.js";
import { hashDirectory } from "./hash.js";
import { copySkillDirectory } from "./copy.js";
import { readSkillsMetadata, upsertSkillRecord } from "./metadata.js";
import { resolveSkillPath, repoArchiveDir, repoSkillsDir, validateSkillId } from "./paths.js";

export async function restoreArchivedSkill(config: LocalConfig, skillId: string): Promise<SkillRecord> {
  const id = validateSkillId(skillId);
  const metadata = await readSkillsMetadata(config.syncRepo);
  const existing = metadata.skills.find((skill) => skill.id === id);
  if (!existing) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  if (existing.status !== "archived") {
    throw new Error(`Cannot restore ${id}: skill is not archived.`);
  }

  const archivePath = path.join(repoArchiveDir(config.syncRepo), ...id.split("/"));
  if (!existsSync(archivePath) || !existsSync(path.join(archivePath, "SKILL.md"))) {
    throw new Error(`Archived skill copy not found: ${id}.`);
  }

  const skillsPath = path.join(repoSkillsDir(config.syncRepo), ...id.split("/"));
  if (existsSync(skillsPath)) {
    await rm(skillsPath, { recursive: true, force: true });
  }

  await copySkillDirectory(archivePath, skillsPath);
  await rm(archivePath, { recursive: true, force: true });

  const repoHash = await hashDirectory(skillsPath);
  const frontmatter = await readSkillFrontmatter(skillsPath);

  const localSources = currentLocalSources(config, id);
  const currentLocalHash = await localHashFromCopies(config, localSources, id);
  const localSource = localSources.length > 0 ? (localSources.includes("codex") ? "codex" : "agents") : null;

  const updated: SkillRecord = {
    ...existing,
    status: "managed",
    name: frontmatter.name,
    description: frontmatter.description,
    localSource,
    installed: localSources.length > 0,
    localModifiedAt: existing.localModifiedAt,
    localCopiesDiffer: localSources.length > 1 && currentLocalHash === null,
    syncState: deriveSyncState(repoHash, currentLocalHash, repoHash),
    lastSyncedHash: repoHash,
    currentRepoHash: repoHash,
    currentLocalHash,
    archivedAt: null,
    updatedAt: new Date().toISOString()
  };

  await upsertSkillRecord(config.syncRepo, updated);
  return updated;
}

function currentLocalSources(config: LocalConfig, skillId: string): LocalSkillSource[] {
  const codexPath = resolveSkillPath(config.codexSkillsDir, skillId);
  const agentsPath = resolveSkillPath(config.agentsSkillsDir, skillId);

  return ["codex", "agents"].filter((source): source is LocalSkillSource =>
    source === "codex" ? isInstalledCopy(codexPath) : isInstalledCopy(agentsPath)
  );
}

function isInstalledCopy(skillPath: string): boolean {
  return existsSync(skillPath) && existsSync(path.join(skillPath, "SKILL.md"));
}

async function localHashFromCopies(config: LocalConfig, sources: LocalSkillSource[], skillId: string): Promise<string | null> {
  if (sources.length === 0) {
    return null;
  }

  const hashes = await Promise.all(
    sources.map(async (source) => {
      const localPath = source === "codex" ? resolveSkillPath(config.codexSkillsDir, skillId) : resolveSkillPath(config.agentsSkillsDir, skillId);
      return hashDirectory(localPath);
    })
  );

  const unique = [...new Set(hashes)];
  return unique.length === 1 ? unique[0] ?? null : null;
}
