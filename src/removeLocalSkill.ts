import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { deriveSyncState } from "./status.js";
import { resolveSkillPath, validateSkillId } from "./paths.js";
import { readSkillsMetadata, writeSkillsMetadata } from "./metadata.js";
import { hashDirectory } from "./hash.js";

export type RemoveLocalOptions = {
  source?: LocalSkillSource;
};

export async function removeLocalSkill(config: LocalConfig, skillId: string, options: RemoveLocalOptions = {}): Promise<SkillRecord> {
  const id = validateSkillId(skillId);
  const metadata = await readSkillsMetadata(config.syncRepo);
  const index = metadata.skills.findIndex((record) => record.id === id);
  if (index === -1) {
    throw new Error(`Managed skill not found in metadata: ${id}`);
  }

  const existing = metadata.skills[index];
  const targetSource = resolveRemoveSource(config, id, existing, options.source);
  if (targetSource.length === 0) {
    throw new Error(`No local copy found for ${id}.`);
  }

  const removedSources = new Set<LocalSkillSource>();
  for (const source of targetSource) {
    const localPath = resolveSkillPath(config[source === "codex" ? "codexSkillsDir" : "agentsSkillsDir"], id);
    if (existsSync(localPath)) {
      await rm(localPath, { recursive: true, force: true });
      removedSources.add(source);
    }
  }

  if (removedSources.size === 0) {
    throw new Error(`No local copy found for ${id}.`);
  }

  const now = new Date().toISOString();
  const stillInstalled = Boolean(
    existsSync(resolveSkillPath(config.codexSkillsDir, id)) ||
      existsSync(resolveSkillPath(config.agentsSkillsDir, id))
  );
  const remainingLocalPath = stillInstalled
    ? existsSync(resolveSkillPath(config.codexSkillsDir, id))
      ? resolveSkillPath(config.codexSkillsDir, id)
      : resolveSkillPath(config.agentsSkillsDir, id)
    : null;
  const remainingLocalHash = remainingLocalPath ? await hashDirectory(remainingLocalPath) : null;
  const remainingSource = existsSync(resolveSkillPath(config.codexSkillsDir, id))
    ? "codex"
    : existsSync(resolveSkillPath(config.agentsSkillsDir, id))
      ? "agents"
      : null;
  const localSource = stillInstalled ? remainingSource : null;

  const updated: SkillRecord = {
    ...existing,
    installed: stillInstalled,
    localSource,
    currentLocalHash: remainingLocalHash,
    syncState: deriveSyncState(existing.lastSyncedHash, remainingLocalHash, existing.currentRepoHash),
    updatedAt: now
  };
  metadata.skills[index] = updated;
  await writeSkillsMetadata(config.syncRepo, metadata);
  return updated;
}

function resolveRemoveSource(config: LocalConfig, id: string, record: SkillRecord, source?: LocalSkillSource): LocalSkillSource[] {
  if (source === "codex" || source === "agents") {
    return [source];
  }

  const codexPath = resolveSkillPath(config.codexSkillsDir, id);
  const agentsPath = resolveSkillPath(config.agentsSkillsDir, id);
  const existsInCodex = existsSync(codexPath);
  const existsInAgents = existsSync(agentsPath);

  if (existsInCodex && existsInAgents) {
    return ["codex", "agents"];
  }

  if (existsInCodex) {
    return ["codex"];
  }

  if (existsInAgents) {
    return ["agents"];
  }

  if (record.localSource === "codex" || record.localSource === "agents") {
    return [record.localSource];
  }

  return [];
}
