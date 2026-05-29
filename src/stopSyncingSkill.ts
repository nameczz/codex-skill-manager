import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, SkillRecord } from "./types.js";
import { repoSkillsDir } from "./paths.js";
import { readSkillsMetadata, writeSkillsMetadata } from "./metadata.js";
import { validateSkillId } from "./paths.js";

export async function stopSyncingSkill(config: LocalConfig, skillId: string): Promise<SkillRecord> {
  const id = validateSkillId(skillId);
  const metadata = await readSkillsMetadata(config.syncRepo);
  const index = metadata.skills.findIndex((record) => record.id === id);
  if (index === -1) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  const existing = metadata.skills[index] ?? null;
  if (!existing) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  const skillsPath = repoSkillsDir(config.syncRepo);
  const repoPath = path.join(skillsPath, ...id.split("/"));
  if (existsSync(repoPath)) {
    await rm(repoPath, { recursive: true, force: true });
  }

  const [removed] = metadata.skills.splice(index, 1);
  await writeSkillsMetadata(config.syncRepo, metadata);

  return {
    ...removed,
    status: "managed",
    updatedAt: new Date().toISOString()
  };
}
