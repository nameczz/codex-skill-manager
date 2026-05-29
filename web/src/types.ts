export type SyncState =
  | "clean"
  | "local_modified"
  | "repo_modified"
  | "conflict"
  | "missing_local"
  | "missing_repo";

export type LocalSkillSource = "codex" | "agents";
export type ScanSource = LocalSkillSource | "repo";

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  status: "managed";
  localSource?: LocalSkillSource | null;
  localSources?: LocalSkillSource[];
  localCopiesDiffer?: boolean;
  localModifiedAt?: string | null;
  installed: boolean;
  syncState: SyncState;
  lastSyncedHash: string | null;
  currentRepoHash: string | null;
  currentLocalHash: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScannedSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  source: ScanSource;
  hash: string;
  modifiedAt: string;
  lastUsedAt?: string | null;
};

export type StatusReport = {
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  managed: SkillRecord[];
  unmanagedLocal: ScannedSkill[];
  repoOnly: ScannedSkill[];
};

export type CodexArchiveState = "active" | "trash";

export type CodexArchiveSession = {
  fileName: string;
  sessionId: string;
  title: string;
  archivedAt: string | null;
  updatedAt: string | null;
  cwd: string | null;
  source: string | null;
  fileSize: number;
};

export type CodexArchiveListResponse = {
  state: CodexArchiveState;
  items: Array<CodexArchiveSession>;
};

export type CodexArchivePreviewResponse = {
  state: CodexArchiveState;
  item: CodexArchiveSession;
  preview: string[];
  truncated: boolean;
};

export type AutoSyncStatus = {
  enabled: boolean;
  mode: "disabled" | "watching" | "polling";
  running: boolean;
  pending: boolean;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastSyncedSkillIds: string[];
  lastError: string | null;
  watchersSupported: boolean;
};

export type UsageMonitorStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastScanStartedAt: string | null;
  lastScanCompletedAt: string | null;
  lastRecordedSkillIds: string[];
  lastError: string | null;
};

export type SkillVersionSource = LocalSkillSource | "repo";
export type RepoConflictSource = LocalSkillSource | "github" | "syncRepo";

export type SkillVersion = {
  source: SkillVersionSource;
  path: string;
  exists: boolean;
  content: string | null;
};

export type SkillVersionsResponse = {
  versions: SkillVersion[];
};

export type RepoConflictVersion = {
  source: RepoConflictSource;
  label: string;
  path: string;
  exists: boolean;
  content: string | null;
};

export type RepoSkillConflict = {
  skillId: string;
  files: string[];
  versions: RepoConflictVersion[];
};

export type RepoConflictsResponse = {
  gitBranchStatus: GitBranchSyncStatus;
  conflicts: RepoSkillConflict[];
};

export type GitBranchSyncState = "up-to-date" | "ahead" | "behind" | "diverged" | "no-upstream" | "unknown";

export type GitBranchSyncStatus = {
  upstream: string | null;
  ahead: number;
  behind: number;
  state: GitBranchSyncState;
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
      gitStatus: string;
      gitBranchStatus: GitBranchSyncStatus;
      report: StatusReport;
      autoSync: AutoSyncStatus;
      usageMonitor: UsageMonitorStatus;
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

export type DependencyInstallInfo = {
  status: "installed" | "skipped-no-package-json" | "skipped-existing-node-modules" | "failed";
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | null;
  command: string;
  message: string;
};

export type ResolveConflictResult = {
  record: SkillRecord;
  result?: SyncResult;
};

export type SkillRowSource = LocalSkillSource | "both" | "repo";

export type SkillRow =
  | {
      kind: "managed";
      id: string;
      name: string;
      description: string;
      syncState: SyncState;
      installed: boolean;
      status: "managed";
      source: SkillRowSource;
      localSources: LocalSkillSource[];
      localCopiesDiffer: boolean;
      repoHash: string | null;
      localHash: string | null;
      localPath: string;
      repoPath: string;
      lastUsedAt: string | null;
      localModifiedAt: string | null;
    }
  | {
      kind: "unmanaged";
      id: string;
      name: string;
      description: string;
      syncState: "unmanaged";
      source: SkillRowSource;
      localSources: LocalSkillSource[];
      localCopiesDiffer: boolean;
      installed: true;
      repoHash: null;
      localHash: string;
      localPath: string;
      repoPath: null;
      lastUsedAt: string | null;
      localModifiedAt: string | null;
    }
  | {
      kind: "repo-only";
      id: string;
      name: string;
      description: string;
      syncState: "repo_only";
      source: "repo";
      localSources: [];
      localCopiesDiffer: false;
      installed: false;
      repoHash: string;
      localHash: null;
      localPath: null;
      repoPath: string;
      lastUsedAt: string | null;
      localModifiedAt: null;
    };
