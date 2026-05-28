export type SkillStatus = "managed" | "archived";

export type SyncState =
  | "clean"
  | "local_modified"
  | "repo_modified"
  | "conflict"
  | "missing_local"
  | "missing_repo";

export type ArchiveCopyStatus = "present" | "missing";

export type LocalSkillSource = "codex" | "agents";
export type ScanSource = LocalSkillSource | "repo" | "archive";

export type LocalConfig = {
  schemaVersion: 1;
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  cacheDir: string;
  createdAt: string;
  updatedAt: string;
};

export type RepoSettings = {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
};

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
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
  archivedAt: string | null;
  archivePath?: string;
  archiveCopyStatus?: ArchiveCopyStatus;
  archiveHash?: string | null;
};

export type SkillsMetadata = {
  schemaVersion: 1;
  skills: SkillRecord[];
};

export type UsageEvent = {
  skillId: string;
  invokedAt: string;
  source: "record";
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

export type DependencyInstallStatus = "skipped-no-package-json" | "skipped-existing-node-modules" | "installed" | "failed";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export type DependencyInstallResult = {
  status: DependencyInstallStatus;
  packageManager: PackageManager | null;
  command: string;
  message: string;
};

export type InstallRepoSkillResult = {
  record: SkillRecord;
  dependencyInstall: DependencyInstallResult;
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
  archived: SkillRecord[];
};
