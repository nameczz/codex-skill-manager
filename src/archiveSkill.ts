import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, SkillRecord } from "./types.js";
import { copySkillDirectory } from "./copy.js";
import { readSkillsMetadata, writeSkillsMetadata } from "./metadata.js";
import { repoArchiveDir, repoSkillsDir, validateSkillId } from "./paths.js";

export async function archiveSkill(config: LocalConfig, skillId: string): Promise<SkillRecord> {
  const id = validateSkillId(skillId);
  const metadata = await readSkillsMetadata(config.syncRepo);
  const index = metadata.skills.findIndex((skill) => skill.id === id);
  if (index === -1) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  const existing = metadata.skills[index];
  if (existing.status === "archived") {
    return existing;
  }

  const sourcePath = path.join(repoSkillsDir(config.syncRepo), ...id.split("/"));
  if (!existsSync(sourcePath)) {
    throw new Error(`Repo skill not found: ${sourcePath}`);
  }

  const archivePath = path.join(repoArchiveDir(config.syncRepo), ...id.split("/"));
  await copySkillDirectory(sourcePath, archivePath);
  await rm(sourcePath, { recursive: true, force: true });

  const now = new Date().toISOString();
  const updated: SkillRecord = {
    ...existing,
    status: "archived",
    updatedAt: now,
    archivedAt: now
  };
  metadata.skills[index] = updated;
  await writeSkillsMetadata(config.syncRepo, metadata);

  return updated;
}
