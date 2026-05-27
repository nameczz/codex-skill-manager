import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { readSkillFrontmatter } from "./frontmatter.js";
import { hashDirectory } from "./hash.js";
import { copySkillDirectory } from "./copy.js";
import { deriveSyncState } from "./status.js";
import { readSkillsMetadata, upsertSkillRecord } from "./metadata.js";
import { syncRepositoryChanges, syncSingleSkill } from "./sync.js";
import { resolveSkillPath, repoSkillsDir, validateSkillId } from "./paths.js";
import type { SyncResult } from "./sync.js";

export type ConflictResolutionStrategy = "codex" | "agents" | "repo";

export type ResolveConflictResult = {
  record: SkillRecord;
  result?: SyncResult;
};

export async function resolveConflict(
  config: LocalConfig,
  skillId: string,
  options: { strategy: ConflictResolutionStrategy }
): Promise<ResolveConflictResult> {
  const id = validateSkillId(skillId);
  const existing = await findManagedRecord(config.syncRepo, id);
  const strategy = options.strategy;

  const repoPath = path.join(repoSkillsDir(config.syncRepo), ...id.split("/"));
  const codexPath = resolveSkillPath(config.codexSkillsDir, id);
  const agentsPath = resolveSkillPath(config.agentsSkillsDir, id);
  const hasCodexCopy = hasCopyAt(codexPath);
  const hasAgentsCopy = hasCopyAt(agentsPath);

  if (strategy === "codex" || strategy === "agents") {
    return resolveFromLocalCopy({
      config,
      id,
      existing,
      repoPath,
      strategy,
      winnerPath: strategy === "codex" ? codexPath : agentsPath,
      loserPath: strategy === "codex" ? (hasAgentsCopy ? agentsPath : null) : hasCodexCopy ? codexPath : null
    });
  }

  if (!hasCopyAt(repoPath)) {
    throw conflictError(`Cannot use repo as strategy for ${id}: repo copy is missing.`);
  }

  const repoHash = await hashDirectory(repoPath);
  const frontmatter = await readSkillFrontmatter(repoPath);
  const localSources = collectLocalSources(hasCodexCopy, hasAgentsCopy);

  await copyRepoToInstalledLocals(config, repoPath, localSources, id);
  const currentLocalHash = await localHashFromSources(config, localSources, id);

  const updated: SkillRecord = {
    ...existing,
    name: frontmatter.name,
    description: frontmatter.description,
    localSource: localSources.length > 0 ? (localSources.includes("codex") ? "codex" : "agents") : null,
    installed: localSources.length > 0,
    localCopiesDiffer: false,
    syncState: deriveSyncState(repoHash, currentLocalHash, repoHash),
    lastSyncedHash: repoHash,
    currentRepoHash: repoHash,
    currentLocalHash,
    updatedAt: new Date().toISOString()
  };

  const changed = hasChanged(existing, updated);
  await upsertSkillRecord(config.syncRepo, updated);

  const result = changed ? await syncRepositoryChanges(config) : undefined;
  return { record: updated, result };
}

async function resolveFromLocalCopy(args: {
  config: LocalConfig;
  id: string;
  existing: SkillRecord;
  repoPath: string;
  strategy: "codex" | "agents";
  winnerPath: string;
  loserPath: string | null;
}): Promise<ResolveConflictResult> {
  if (!hasCopyAt(args.winnerPath)) {
    throw conflictError(`Cannot use ${args.strategy} as strategy for ${args.id}: source is missing on this machine.`);
  }

  await replaceDirectory(args.repoPath, args.winnerPath);
  const winnerHash = await hashDirectory(args.repoPath);

  if (args.loserPath) {
    await replaceDirectory(args.loserPath, args.winnerPath);
  }

  const frontmatter = await readSkillFrontmatter(args.winnerPath);
  const updated: SkillRecord = {
    ...args.existing,
    name: frontmatter.name,
    description: frontmatter.description,
    localSource: args.strategy,
    localCopiesDiffer: false,
    installed: true,
    syncState: "clean",
    lastSyncedHash: winnerHash,
    currentRepoHash: winnerHash,
    currentLocalHash: winnerHash,
    updatedAt: new Date().toISOString()
  };

  await upsertSkillRecord(args.config.syncRepo, updated);
  const result = await syncSingleSkill(args.config, args.id);
  return { record: updated, result };
}

async function findManagedRecord(syncRepo: string, id: string): Promise<SkillRecord> {
  const metadata = await readSkillsMetadata(syncRepo);
  const record = metadata.skills.find((skill) => skill.id === id);

  if (!record) {
    throw conflictError(`Managed skill not found in metadata: ${id}`);
  }

  if (record.status !== "managed") {
    throw conflictError(`Cannot resolve conflicts for ${id}: not a managed skill.`);
  }

  return record;
}

function hasCopyAt(skillPath: string): boolean {
  return existsSync(skillPath) && existsSync(path.join(skillPath, "SKILL.md"));
}

function collectLocalSources(hasCodex: boolean, hasAgents: boolean): LocalSkillSource[] {
  const sources: LocalSkillSource[] = [];
  if (hasCodex) {
    sources.push("codex");
  }
  if (hasAgents) {
    sources.push("agents");
  }
  return sources;
}

async function localHashFromSources(config: LocalConfig, sources: LocalSkillSource[], skillId: string): Promise<string | null> {
  if (sources.length === 0) {
    return null;
  }

  const hashes: string[] = [];
  for (const source of sources) {
    const localPath = localPathForSource(config, source, skillId);
    hashes.push(await hashDirectory(localPath));
  }

  const unique = [...new Set(hashes)];
  return unique.length === 1 ? unique[0] ?? null : null;
}

function localPathForSource(config: LocalConfig, source: LocalSkillSource, skillId: string): string {
  return source === "codex" ? resolveSkillPath(config.codexSkillsDir, skillId) : resolveSkillPath(config.agentsSkillsDir, skillId);
}

async function copyRepoToInstalledLocals(
  config: LocalConfig,
  repoPath: string,
  sources: LocalSkillSource[],
  skillId: string
): Promise<void> {
  for (const source of sources) {
    const localPath = localPathForSource(config, source, skillId);
    if (hasCopyAt(localPath)) {
      await replaceDirectory(localPath, repoPath);
    }
  }
}

async function replaceDirectory(target: string, source: string): Promise<void> {
  if (existsSync(target)) {
    await rm(target, { recursive: true, force: true });
  }

  await copySkillDirectory(source, target);
}

function hasChanged(before: SkillRecord, after: SkillRecord): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

type ResolverError = Error & { apiMessage: string; statusCode: number };

function conflictError(message: string): ResolverError {
  const error = new Error(message) as ResolverError;
  error.apiMessage = message;
  error.statusCode = 400;
  return error;
}
