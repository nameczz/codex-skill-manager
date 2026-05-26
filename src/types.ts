export type SkillStatus = "managed" | "archived";

export type SyncState =
  | "clean"
  | "local_modified"
  | "repo_modified"
  | "conflict"
  | "missing_local"
  | "missing_repo";

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

export type SkillsMetadata = {
  schemaVersion: 1;
  skills: SkillRecord[];
};

export type UsageEvent = {
  skillId: string;
  invokedAt: string;
  source: "record";
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
