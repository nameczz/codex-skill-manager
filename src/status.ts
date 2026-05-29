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
  const allSkillIds = uniqueSkillIds([...managedRecords, ...localSkills, ...repoSkills].map((skill) => skill.id));
  const lastUsedBySkill = await getLastUsageBySkill(config.syncRepo, allSkillIds);

  const managed = managedRecords.map((record) => {
    const localCandidates = localById.get(record.id) ?? [];
    return refreshRecord(record, findLocalSkill(record, localById), localCandidates, repoById.get(record.id), lastUsedBySkill.get(record.id) ?? null);
  });
  const unmanagedLocal = withLastUsedAt(
    localSkills.filter((skill) => !managedIds.has(skill.id)),
    lastUsedBySkill
  );
  const repoOnly = withLastUsedAt(
    repoSkills.filter((skill) => !managedIds.has(skill.id)),
    lastUsedBySkill
  );

  return {
    syncRepo: config.syncRepo,
    codexSkillsDir: config.codexSkillsDir,
    agentsSkillsDir: config.agentsSkillsDir,
    managed,
    unmanagedLocal,
    repoOnly
  };
}

function uniqueSkillIds(skillIds: string[]): string[] {
  return [...new Set(skillIds)].sort((a, b) => a.localeCompare(b));
}

function withLastUsedAt(skills: ScannedSkill[], lastUsedBySkill: Map<string, string | null>): ScannedSkill[] {
  return skills.map((skill) => ({
    ...skill,
    lastUsedAt: lastUsedBySkill.get(skill.id) ?? null
  }));
}

function compareScannedSkills(a: ScannedSkill, b: ScannedSkill): number {
  return a.id.localeCompare(b.id) || a.source.localeCompare(b.source);
}

function refreshRecord(
  record: SkillRecord,
  local: ScannedSkill | undefined,
  localCandidates: ScannedSkill[],
  repo: ScannedSkill | undefined,
  lastUsedAt: string | null
): SkillRecord {
  const currentLocalHash = currentLocalHashForCandidates(local, localCandidates);
  const currentRepoHash = repo?.hash ?? null;
  const installed = localCandidates.length > 0;
  const localSources = localCandidates
    .map((candidate) => candidate.source)
    .filter((source): source is "codex" | "agents" => source === "codex" || source === "agents")
    .sort((a, b) => a.localeCompare(b));
  const localCopiesDiffer = localCandidateHashes(localCandidates).length > 1;

  return {
    ...record,
    lastUsedAt,
    name: repo?.name ?? local?.name ?? record.name,
    description: repo?.description ?? local?.description ?? record.description,
    localSource: local?.source === "codex" || local?.source === "agents" ? local.source : record.localSource ?? null,
    localSources,
    localCopiesDiffer,
    localModifiedAt: latestLocalModifiedAt(localCandidates),
    installed,
    syncState: localCopiesDiffer ? "conflict" : deriveSyncState(record.lastSyncedHash, currentLocalHash, currentRepoHash),
    currentLocalHash,
    currentRepoHash
  };
}

function currentLocalHashForCandidates(local: ScannedSkill | undefined, localCandidates: ScannedSkill[]): string | null {
  const hashes = localCandidateHashes(localCandidates);
  if (hashes.length === 1) {
    return hashes[0] ?? null;
  }

  return local?.hash ?? null;
}

function localCandidateHashes(localCandidates: ScannedSkill[]): string[] {
  return [...new Set(localCandidates.map((candidate) => candidate.hash))].sort();
}

function latestLocalModifiedAt(localCandidates: ScannedSkill[]): string | null {
  if (localCandidates.length === 0) {
    return null;
  }

  return localCandidates
    .map((skill) => skill.modifiedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
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
