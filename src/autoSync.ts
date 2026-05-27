import { existsSync, type FSWatcher, watch } from "node:fs";
import { scanSkills } from "./scanner.js";
import { buildStatusReport } from "./status.js";
import type { LocalConfig, LocalSkillSource, SkillRecord } from "./types.js";
import { syncSelectedSkills, type SyncSelection } from "./sync.js";
import type { SyncResult } from "./sync.js";

type AutoSyncMode = "disabled" | "watching" | "polling";

export type AutoSyncStatus = {
  enabled: boolean;
  mode: AutoSyncMode;
  running: boolean;
  pending: boolean;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastSyncedSkillIds: string[];
  lastError: string | null;
  watchersSupported: boolean;
};

type AutoSyncController = {
  start: (config: LocalConfig) => Promise<void>;
  stop: () => Promise<void>;
  trigger: () => void;
  getStatus: () => AutoSyncStatus;
};

type AutoSyncDeps = {
  sync: (config: LocalConfig, selections: SyncSelection[]) => Promise<SyncResult>;
  statusBuilder: (config: LocalConfig) => Promise<ManagedStatusReport>;
  pollSignatureBuilder: (config: LocalConfig) => Promise<string>;
};

type AutoSyncOptions = {
  debounceMs?: number;
  pollingIntervalMs?: number;
  statusBuilder?: (config: LocalConfig) => Promise<ManagedStatusReport>;
  sync?: (config: LocalConfig, selections: SyncSelection[]) => Promise<SyncResult>;
  pollSignatureBuilder?: (config: LocalConfig) => Promise<string>;
  watchProvider?: (path: string, onChange: () => void, onError: (error: unknown) => void) => FSWatcher;
  now?: () => string;
};

type ManagedStatusReport = {
  managed: Array<Pick<SkillRecord, "id" | "syncState" | "localSource">>;
};

export function createAutoSyncController(options: AutoSyncOptions = {}): AutoSyncController {
  const debounceMs = options.debounceMs ?? 2000;
  const pollingIntervalMs = options.pollingIntervalMs ?? 4000;
  const sync = options.sync ?? syncSelectedSkills;
  const statusBuilder = options.statusBuilder ?? (buildStatusReport as AutoSyncDeps["statusBuilder"]);
  const pollSignatureBuilder = options.pollSignatureBuilder ?? defaultPollSignatureBuilder;
  const watchProvider = options.watchProvider ?? ((targetPath, onChange, onError) => {
    const watcher = watch(targetPath, { recursive: true }, () => onChange());
    watcher.on("error", onError);
    return watcher;
  });
  const now = options.now ?? (() => new Date().toISOString());

  let currentConfig: LocalConfig | null = null;
  let state: AutoSyncStatus = {
    enabled: false,
    mode: "disabled",
    running: false,
    pending: false,
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastSyncedSkillIds: [],
    lastError: null,
    watchersSupported: true
  };

  const watchers: FSWatcher[] = [];
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollingPreviousSignature = "";
  let running = false;

  async function start(config: LocalConfig): Promise<void> {
    if (
      currentConfig !== null &&
      currentConfig.syncRepo === config.syncRepo &&
      currentConfig.codexSkillsDir === config.codexSkillsDir &&
      currentConfig.agentsSkillsDir === config.agentsSkillsDir
    ) {
      state.enabled = true;
      state.mode = state.mode === "disabled" ? (state.watchersSupported ? "watching" : "polling") : state.mode;
      return;
    }

    await stop();
    currentConfig = config;
    state.enabled = true;
    state.lastError = null;
    state.pending = false;
    state.lastSyncedSkillIds = [];
    state.mode = "watching";

    const watchersStarted = await startWatchers(config);
    state.watchersSupported = watchersStarted;
    state.mode = watchersStarted ? "watching" : "polling";

    try {
      pollingPreviousSignature = await pollSignatureBuilder(config);
    } catch (error) {
      state.lastError = normalizeError(error);
      state.watchersSupported = false;
      state.mode = "polling";
      startPolling(config);
      return;
    }

    if (!watchersStarted) {
      startPolling(config);
    }

    queueSync("startup");
  }

  async function stop(): Promise<void> {
    state.enabled = false;
    state.mode = "disabled";
    currentConfig = null;

    for (const watcher of watchers) {
      watcher.close();
    }
    watchers.length = 0;

    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    state.pending = false;
    state.running = false;
    state.lastRunStartedAt = null;
  }

  async function startWatchers(config: LocalConfig): Promise<boolean> {
    const roots = [config.codexSkillsDir, config.agentsSkillsDir];
    let startedAny = false;

    try {
      for (const root of roots) {
        if (!existsSync(root)) {
          continue;
        }

        const watcher = watchProvider(
          root,
          () => {
            queueSync("local-change");
          },
          (error) => {
            void fallbackToPolling(config, error);
          }
        );

        watchers.push(watcher);
        startedAny = true;
      }
    } catch (error) {
      await cleanupWatchers();
      state.lastError = normalizeError(error);
      return false;
    }

    if (startedAny) {
      return true;
    }

    return false;
  }

  async function cleanupWatchers(): Promise<void> {
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers.length = 0;
  }

  function startPolling(config: LocalConfig): void {
    state.mode = "polling";
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
    }

    pollingTimer = setInterval(() => {
      void runPoll(config);
    }, pollingIntervalMs);
  }

  async function runPoll(config: LocalConfig): Promise<void> {
    if (!state.enabled || running) {
      return;
    }

    try {
      const signature = await pollSignatureBuilder(config);
      if (signature !== pollingPreviousSignature) {
        pollingPreviousSignature = signature;
        queueSync("poll-change");
      }
    } catch (error) {
      state.lastError = normalizeError(error);
    }
  }

  async function fallbackToPolling(config: LocalConfig, error: unknown): Promise<void> {
    await cleanupWatchers();
    pollingPreviousSignature = "";
    state.watchersSupported = false;
    state.mode = "polling";
    state.lastError = normalizeError(error);
    startPolling(config);
  }

  function queueSync(_reason: string): void {
    if (!currentConfig || !state.enabled) {
      return;
    }

    state.pending = true;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      void runAutoSync();
    }, debounceMs);
  }

  async function runAutoSync(): Promise<void> {
    if (!state.enabled || running || !currentConfig) {
      return;
    }

    running = true;
    state.running = true;
    state.pending = false;
    state.lastError = null;
    state.lastRunStartedAt = now();

    try {
      const report = await statusBuilder(currentConfig);
      const managed = report.managed
        .map((skill) => ({
          id: skill.id,
          syncState: skill.syncState,
          localSource: skill.localSource ?? null
        }))
        .filter((skill) => skill.syncState === "local_modified")
        .map((skill) => ({
          skillId: skill.id,
          source: normalizeSource(skill.localSource)
        }));

      if (managed.length === 0) {
        state.lastSyncedSkillIds = [];
        return;
      }

      const result = await sync(currentConfig, managed);
      state.lastSyncedSkillIds = result.skillIds;
    } catch (error) {
      state.lastError = normalizeError(error);
    } finally {
      state.running = false;
      state.lastRunCompletedAt = now();
      running = false;

      if (state.pending) {
        queueSync("coalesced");
      }
    }
  }

  function normalizeSource(source: LocalSkillSource | null | undefined): LocalSkillSource | undefined {
    if (source === "codex" || source === "agents") {
      return source;
    }
    return undefined;
  }

  function getStatus(): AutoSyncStatus {
    return { ...state };
  }

  return {
    start,
    stop,
    trigger: () => queueSync("manual"),
    getStatus
  };
}

async function defaultPollSignatureBuilder(config: LocalConfig): Promise<string> {
  const [codex, agents] = await Promise.all([scanSkills(config.codexSkillsDir, "codex"), scanSkills(config.agentsSkillsDir, "agents")]);

  const signature = [...codex, ...agents]
    .map((skill) => `${skill.source}:${skill.id}:${skill.hash}:${skill.modifiedAt}`)
    .sort();

  return signature.join("\u0000");
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
