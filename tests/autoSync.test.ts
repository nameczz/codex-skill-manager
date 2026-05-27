import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FSWatcher } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SyncResult } from "../src/sync.js";
import type { LocalConfig, SyncState } from "../src/types.js";
import { createAutoSyncController } from "../src/autoSync.js";
import type { SyncSelection } from "../src/sync.js";

type ManagedStatus = {
  managed: Array<{
    id: string;
    syncState: SyncState;
    localSource?: "codex" | "agents" | null;
  }>;
};

describe("auto sync controller", () => {
  it("runs once on startup for already changed tracked skills", async () => {
    const config = await makeConfig();
    const syncCalls: SyncSelection[][] = [];

    const autoSync = createAutoSyncController({
      debounceMs: 12,
      watchProvider: noopWatcher,
      statusBuilder: async () => ({
        managed: [{ id: "already-local-changed", syncState: "local_modified", localSource: "codex" }]
      }),
      sync: async (_config, selections): Promise<SyncResult> => {
        syncCalls.push([...selections]);
        return makeResult(selections);
      }
    });

    await autoSync.start(config);
    await wait(40);

    expect(syncCalls).toEqual([[{ skillId: "already-local-changed", source: "codex" }]]);
    await autoSync.stop();
  });

  it("syncs only tracked local_modified skills after debounced change", async () => {
    const config = await makeConfig();
    const syncCalls: SyncSelection[][] = [];

    const autoSync = createAutoSyncController({
      debounceMs: 12,
      watchProvider: noopWatcher,
      statusBuilder: async () => ({
        managed: [
          { id: "local-modified", syncState: "local_modified", localSource: "codex" },
          { id: "repo-modified", syncState: "repo_modified", localSource: "codex" },
          { id: "missing-local", syncState: "missing_local", localSource: "codex" },
          { id: "conflict", syncState: "conflict", localSource: "agents" },
          { id: "missing-repo", syncState: "missing_repo", localSource: "agents" }
        ]
      }),
      sync: async (_config, selections): Promise<SyncResult> => {
        syncCalls.push([...selections]);
        return makeResult(selections);
      }
    });

    await autoSync.start(config);
    autoSync.trigger();
    autoSync.trigger();
    autoSync.trigger();
    await wait(40);

    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0]).toEqual([{ skillId: "local-modified", source: "codex" }]);
    await autoSync.stop();
  });

  it("coalesces queued changes into one follow-up sync while running", async () => {
    const config = await makeConfig();
    const deferred = createDeferred();
    const statusReports: ManagedStatus[] = [
      { managed: [{ id: "alpha", syncState: "local_modified", localSource: "codex" }] },
      { managed: [{ id: "beta", syncState: "local_modified", localSource: "agents" }] }
    ];

    const syncCalls: SyncSelection[][] = [];
    let reportIndex = 0;

    const autoSync = createAutoSyncController({
      debounceMs: 12,
      watchProvider: noopWatcher,
      statusBuilder: async () => statusReports[Math.min(reportIndex++, statusReports.length - 1)],
      sync: async (_config, selections): Promise<SyncResult> => {
        syncCalls.push([...selections]);
        if (syncCalls.length === 1) {
          await deferred.promise;
        }

        return makeResult(selections);
      }
    });

    await autoSync.start(config);
    autoSync.trigger();
    await wait(20);
    autoSync.trigger();
    deferred.resolve();
    await wait(70);

    expect(syncCalls).toHaveLength(2);
    expect(syncCalls[0]).toEqual([{ skillId: "alpha", source: "codex" }]);
    expect(syncCalls[1]).toEqual([{ skillId: "beta", source: "agents" }]);

    await autoSync.stop();
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeResult(selections: SyncSelection[]) {
  return {
    skillIds: selections.map((selection) => selection.skillId),
    updatedRepoSkillIds: selections.map((selection) => selection.skillId),
    committed: false,
    pushed: false,
    commitHash: null,
    commitMessage: "Auto sync test",
    gitStatus: ""
  };
}

function noopWatcher(): FSWatcher {
  return {
    close: () => {}
  } as FSWatcher;
}

async function makeConfig(): Promise<LocalConfig> {
  const root = await mkdtemp(path.join(tmpdir(), "csm-autosync-"));
  const syncRepo = path.join(root, "repo");
  const codexSkillsDir = path.join(root, "codex");
  const agentsSkillsDir = path.join(root, "agents");
  await Promise.all([mkdir(syncRepo, { recursive: true }), mkdir(codexSkillsDir, { recursive: true }), mkdir(agentsSkillsDir, { recursive: true })]);

  return {
    schemaVersion: 1,
    syncRepo,
    codexSkillsDir,
    agentsSkillsDir,
    cacheDir: path.join(root, "cache"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return {
    promise,
    resolve
  };
}
