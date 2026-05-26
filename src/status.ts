import type { LocalConfig, ScannedSkill, SkillRecord, StatusReport, SyncState } from "./types.js";
import { repoSkillsDir } from "./paths.js";
import { readSkillsMetadata } from "./metadata.js";
import { scanSkills } from "./scanner.js";
import { getLastUsageBySkill } from "./usage.js";

export async function buildStatusReport(config: LocalConfig): Promise<StatusReport> {
  const metadata = await readSkillsMetadata(config.syncRepo);
  const managedRecords = metadata.skills.filter((skill) => skill.status === "managed");
  const codexSkills = await scanSkills(config.codexSkillsDir, "codex");
  const agentsSkills = await scanSkills(config.agentsSkillsDir, "agents");
  const localSkills = [...codexSkills, ...agentsSkills].sort(compareScannedSkills);
  const repoSkills = await scanSkills(repoSkillsDir(config.syncRepo), "repo");
  const localById = groupLocalSkills(localSkills);
  const repoById = new Map(repoSkills.map((skill) => [skill.id, skill]));
  const managedIds = new Set(managedRecords.map((skill) => skill.id));
  const lastUsedBySkill = await getLastUsageBySkill(config.syncRepo, managedRecords.map((skill) => skill.id));

  const managed = managedRecords.map((record) => refreshRecord(record, findLocalSkill(record, localById), repoById.get(record.id), lastUsedBySkill.get(record.id) ?? null));
  const unmanagedLocal = localSkills.filter((skill) => !managedIds.has(skill.id));
  const repoOnly = repoSkills.filter((skill) => !managedIds.has(skill.id));

  return {
    syncRepo: config.syncRepo,
    codexSkillsDir: config.codexSkillsDir,
    agentsSkillsDir: config.agentsSkillsDir,
    managed,
    unmanagedLocal,
    repoOnly
  };
}

function compareScannedSkills(a: ScannedSkill, b: ScannedSkill): number {
  return a.id.localeCompare(b.id) || a.source.localeCompare(b.source);
}

function refreshRecord(
  record: SkillRecord,
  local: ScannedSkill | undefined,
  repo: ScannedSkill | undefined,
  lastUsedAt: string | null
): SkillRecord {
  const currentLocalHash = local?.hash ?? null;
  const currentRepoHash = repo?.hash ?? null;
  const installed = Boolean(local);

  return {
    ...record,
    lastUsedAt,
    name: repo?.name ?? local?.name ?? record.name,
    description: repo?.description ?? local?.description ?? record.description,
    localSource: local?.source === "codex" || local?.source === "agents" ? local.source : record.localSource ?? null,
    installed,
    syncState: deriveSyncState(record.lastSyncedHash, currentLocalHash, currentRepoHash),
    currentLocalHash,
    currentRepoHash
  };
}

function groupLocalSkills(skills: ScannedSkill[]): Map<string, ScannedSkill[]> {
  const grouped = new Map<string, ScannedSkill[]>();
  for (const skill of skills) {
    const existing = grouped.get(skill.id) ?? [];
    existing.push(skill);
    grouped.set(skill.id, existing);
  }
  return grouped;
}

function findLocalSkill(record: SkillRecord, localById: Map<string, ScannedSkill[]>): ScannedSkill | undefined {
  const candidates = localById.get(record.id) ?? [];
  if (record.localSource) {
    const preferred = candidates.find((skill) => skill.source === record.localSource);
    if (preferred) {
      return preferred;
    }
  }

  return candidates.find((skill) => skill.source === "codex") ?? candidates.find((skill) => skill.source === "agents");
}

export function deriveSyncState(
  lastSyncedHash: string | null,
  currentLocalHash: string | null,
  currentRepoHash: string | null
): SyncState {
  if (!currentLocalHash && currentRepoHash) {
    return "missing_local";
  }

  if (currentLocalHash && !currentRepoHash) {
    return "missing_repo";
  }

  if (!currentLocalHash && !currentRepoHash) {
    return "missing_repo";
  }

  if (currentLocalHash === currentRepoHash) {
    return "clean";
  }

  if (!lastSyncedHash) {
    return "conflict";
  }

  const localChanged = currentLocalHash !== lastSyncedHash;
  const repoChanged = currentRepoHash !== lastSyncedHash;

  if (localChanged && repoChanged) {
    return "conflict";
  }

  if (localChanged) {
    return "local_modified";
  }

  if (repoChanged) {
    return "repo_modified";
  }

  return "clean";
}
