import path from "node:path";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { buildStatusReport } from "./status.js";
import { importLocalSkill } from "./importSkill.js";
import { gitAdd, gitCommit, gitHasStagedChanges, gitPush, gitRemotes, gitStatus } from "./git.js";
import { repoSettingsPath, repoSkillsMetadataPath, repoUsageEventsPath, validateSkillId } from "./paths.js";

export type SyncSelection = {
  skillId: string;
  source?: LocalSkillSource;
};

export type SyncResult = {
  skillIds: string[];
  updatedRepoSkillIds: string[];
  committed: boolean;
  pushed: boolean;
  commitHash: string | null;
  commitMessage: string;
  gitStatus: string;
};

type PreparedSkill = {
  id: string;
  source?: LocalSkillSource;
  state: SkillRecord["syncState"] | "unmanaged";
  updateRepoFromLocal: boolean;
};

export async function syncSelectedSkills(config: LocalConfig, selections: SyncSelection[]): Promise<SyncResult> {
  const prepared = await prepareSelections(config, selections);
  const remotes = await gitRemotes(config.syncRepo);
  if (remotes.length === 0) {
    throw new Error("No Git remote is configured for the sync repository. Add a remote before syncing.");
  }

  const updatedRepoSkillIds: string[] = [];

  for (const skill of prepared) {
    if (!skill.updateRepoFromLocal) {
      continue;
    }

    await importLocalSkill(config, skill.id, { force: true, source: skill.source });
    updatedRepoSkillIds.push(skill.id);
  }

  const skillIds = prepared.map((skill) => skill.id);
  await gitAdd(config.syncRepo, stagePaths(config.syncRepo, skillIds));

  const commitMessage = buildCommitMessage(skillIds, updatedRepoSkillIds);
  const committed = await gitHasStagedChanges(config.syncRepo);
  const commitHash = committed ? await gitCommit(config.syncRepo, commitMessage) : null;

  await gitPush(config.syncRepo);

  return {
    skillIds,
    updatedRepoSkillIds,
    committed,
    pushed: true,
    commitHash,
    commitMessage,
    gitStatus: await gitStatus(config.syncRepo)
  };
}

async function prepareSelections(config: LocalConfig, selections: SyncSelection[]): Promise<PreparedSkill[]> {
  if (selections.length === 0) {
    throw new Error("Select at least one skill before syncing.");
  }

  const normalized = normalizeSelections(selections);
  const report = await buildStatusReport(config);
  const managedById = new Map(report.managed.map((skill) => [skill.id, skill]));
  const unmanagedByKey = new Map(report.unmanagedLocal.map((skill) => [selectionKey(skill.id, skill.source), skill]));
  const repoOnlyIds = new Set(report.repoOnly.map((skill) => skill.id));
  const blocked: string[] = [];
  const prepared: PreparedSkill[] = [];

  for (const selection of normalized) {
    const managed = managedById.get(selection.skillId);
    if (managed) {
      const source = selection.source ?? managed.localSource ?? undefined;
      const state = managed.syncState;

      if (state === "clean") {
        prepared.push({ id: managed.id, source, state, updateRepoFromLocal: false });
      } else if (state === "local_modified" || state === "missing_repo") {
        prepared.push({ id: managed.id, source, state, updateRepoFromLocal: true });
      } else {
        blocked.push(`${managed.id} is ${state}`);
      }
      continue;
    }

    const unmanaged = selection.source ? unmanagedByKey.get(selectionKey(selection.skillId, selection.source)) : findUnmanagedById(report.unmanagedLocal, selection.skillId);
    if (unmanaged) {
      prepared.push({
        id: unmanaged.id,
        source: unmanaged.source === "codex" || unmanaged.source === "agents" ? unmanaged.source : undefined,
        state: "unmanaged",
        updateRepoFromLocal: true
      });
      continue;
    }

    if (repoOnlyIds.has(selection.skillId)) {
      blocked.push(`${selection.skillId} exists only in the sync repo`);
      continue;
    }

    blocked.push(`${selection.skillId} was not found`);
  }

  if (blocked.length > 0) {
    throw new Error(`Cannot sync selected skills: ${blocked.join("; ")}.`);
  }

  return prepared;
}

function findUnmanagedById(skills: Array<{ id: string; source: string }>, skillId: string): { id: string; source: string } | undefined {
  const matches = skills.filter((skill) => skill.id === skillId);
  if (matches.length > 1) {
    throw new Error(`Select a source for ${skillId}; it exists in multiple local skill roots.`);
  }

  return matches[0];
}

function normalizeSelections(selections: SyncSelection[]): SyncSelection[] {
  const byId = new Map<string, SyncSelection>();

  for (const selection of selections) {
    const skillId = validateSkillId(selection.skillId);
    if (selection.source && selection.source !== "codex" && selection.source !== "agents") {
      throw new Error("Skill source must be codex or agents.");
    }

    const existing = byId.get(skillId);
    if (existing && existing.source !== selection.source) {
      throw new Error(`Select only one local source for ${skillId}.`);
    }

    byId.set(skillId, { skillId, source: selection.source });
  }

  return [...byId.values()].sort((a, b) => a.skillId.localeCompare(b.skillId));
}

function stagePaths(syncRepo: string, skillIds: string[]): string[] {
  const paths = new Set<string>([
    ".gitignore",
    relativeToRepo(syncRepo, repoSettingsPath(syncRepo)),
    relativeToRepo(syncRepo, repoSkillsMetadataPath(syncRepo)),
    relativeToRepo(syncRepo, repoUsageEventsPath(syncRepo))
  ]);

  for (const skillId of skillIds) {
    paths.add(path.join("skills", ...skillId.split("/")));
  }

  return [...paths];
}

function relativeToRepo(syncRepo: string, targetPath: string): string {
  return path.relative(syncRepo, targetPath).split(path.sep).join("/");
}

function buildCommitMessage(skillIds: string[], updatedRepoSkillIds: string[]): string {
  const subject =
    skillIds.length === 1 ? `Sync skill: ${skillIds[0]}` : `Sync ${skillIds.length} skills: ${skillIds.slice(0, 3).join(", ")}${skillIds.length > 3 ? ", ..." : ""}`;
  const lines = [
    subject,
    "",
    "Synced skills:",
    ...skillIds.map((skillId) => `- ${skillId}`),
    "",
    updatedRepoSkillIds.length > 0 ? "Updated repo copies from local skills." : "No local skill content changed; pushed existing sync repo state."
  ];

  return lines.join("\n");
}

function selectionKey(skillId: string, source: string): string {
  return `${source}:${skillId}`;
}
