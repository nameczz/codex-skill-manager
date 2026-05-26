export type SyncState =
  | "clean"
  | "local_modified"
  | "repo_modified"
  | "conflict"
  | "missing_local"
  | "missing_repo";

export type LocalSkillSource = "codex" | "agents";
export type ScanSource = LocalSkillSource | "repo" | "archive";

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  status: "managed" | "archived";
  localSource?: LocalSkillSource | null;
  installed: boolean;
  syncState: SyncState;
  lastSyncedHash: string | null;
  currentRepoHash: string | null;
  currentLocalHash: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ScannedSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  source: ScanSource;
  hash: string;
};

export type StatusReport = {
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  managed: SkillRecord[];
  unmanagedLocal: ScannedSkill[];
  repoOnly: ScannedSkill[];
};

export type UsageHookStatus = {
  hooksPath: string;
  installed: boolean;
  needsUpdate: boolean;
  installable: boolean;
  reason: string | null;
  command: string;
  installedCommand: string | null;
};

export type ApiStatus =
  | {
      configured: false;
      defaults: {
        syncRepo: string;
        codexSkillsDir: string;
        agentsSkillsDir: string;
        cacheDir: string;
      };
    }
  | {
      configured: true;
      config: {
        syncRepo: string;
        codexSkillsDir: string;
        agentsSkillsDir: string;
        cacheDir: string;
      };
      usageHook: UsageHookStatus;
      gitStatus: string;
      report: StatusReport;
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

export type SkillRow =
  | {
      kind: "managed";
      id: string;
      name: string;
      description: string;
      syncState: SyncState;
      installed: boolean;
      status: "managed" | "archived";
      source: LocalSkillSource | "repo";
      repoHash: string | null;
      localHash: string | null;
      localPath: string;
      repoPath: string;
      lastUsedAt: string | null;
      updatedAt: string;
    }
  | {
      kind: "unmanaged";
      id: string;
      name: string;
      description: string;
      syncState: "unmanaged";
      source: LocalSkillSource;
      installed: true;
      repoHash: null;
      localHash: string;
      localPath: string;
      repoPath: null;
      lastUsedAt: null;
      updatedAt: null;
    }
  | {
      kind: "repo-only";
      id: string;
      name: string;
      description: string;
      syncState: "repo_only";
      source: "repo";
      installed: false;
      repoHash: string;
      localHash: null;
      localPath: null;
      repoPath: string;
      lastUsedAt: null;
      updatedAt: null;
    };
