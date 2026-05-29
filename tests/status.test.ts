import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalConfig, SkillRecord } from "../src/types.js";
import { ensureRepoMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { buildStatusReport, deriveSyncState } from "../src/status.js";
import { hashDirectory } from "../src/hash.js";
import { recordUsageEvent } from "../src/usage.js";

describe("status", () => {
  it("derives sync states", () => {
    expect(deriveSyncState("a", "a", "a")).toBe("clean");
    expect(deriveSyncState("a", "b", "a")).toBe("local_modified");
    expect(deriveSyncState("a", "a", "b")).toBe("repo_modified");
    expect(deriveSyncState("a", "b", "c")).toBe("conflict");
    expect(deriveSyncState("a", null, "a")).toBe("missing_local");
  });

  it("reports unmanaged local skills and managed clean skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(codexSkillsDir, "local-only"), "local-only");
    await writeSkill(path.join(agentsSkillsDir, "klay-writer"), "klay-writer");
    await writeSkill(path.join(codexSkillsDir, "managed"), "managed");
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed");

    const hash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "clean",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: hash,
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });
    await recordUsageEvent(
      {
        schemaVersion: 1,
        syncRepo,
        codexSkillsDir,
        agentsSkillsDir,
        cacheDir: path.join(root, "cache"),
        createdAt: now,
        updatedAt: now
      },
      "klay-writer",
      { invokedAt: "2026-01-08T00:00:00.000Z" }
    );

    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };
    const report = await buildStatusReport(config);

    expect(report.managed).toHaveLength(1);
    expect(report.managed[0]?.syncState).toBe("clean");
    expect(report.managed[0]?.localModifiedAt).toEqual(expect.any(String));
    expect(report.agentsSkillsDir).toBe(agentsSkillsDir);
    expect(report.unmanagedLocal.map((skill) => skill.id)).toEqual(["klay-writer", "local-only"]);
    expect(report.unmanagedLocal.find((skill) => skill.id === "klay-writer")?.source).toBe("agents");
    expect(report.unmanagedLocal.find((skill) => skill.id === "klay-writer")?.modifiedAt).toEqual(expect.any(String));
    expect(report.unmanagedLocal.find((skill) => skill.id === "klay-writer")?.lastUsedAt).toBe("2026-01-08T00:00:00.000Z");
  });

  it("injects last used time from usage events into managed report rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-usage-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(codexSkillsDir, "managed"), "managed");
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed");

    const hash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "clean",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: hash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });
    await recordUsageEvent(
      {
        schemaVersion: 1,
        syncRepo,
        codexSkillsDir,
        agentsSkillsDir,
        cacheDir: path.join(root, "cache"),
        createdAt: now,
        updatedAt: now
      },
      "managed",
      { invokedAt: "2026-01-09T00:00:00.000Z" }
    );

    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };
    const report = await buildStatusReport(config);

    expect(report.managed[0]?.lastUsedAt).toBe("2026-01-09T00:00:00.000Z");
  });

  it("falls back to the other local root when the recorded source is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-source-fallback-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(agentsSkillsDir, "managed"), "managed");
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed");

    const hash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "clean",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: hash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const report = await buildStatusReport({
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    });

    expect(report.managed[0]?.installed).toBe(true);
    expect(report.managed[0]?.localSource).toBe("agents");
  });

  it("reports every installed local source for a managed skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-sources-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(codexSkillsDir, "managed"), "managed");
    await writeSkill(path.join(agentsSkillsDir, "managed"), "managed");
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed");

    const hash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "clean",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: hash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const report = await buildStatusReport({
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    });

    expect(report.managed[0]?.localSource).toBe("codex");
    expect(report.managed[0]?.localSources).toEqual(["agents", "codex"]);
    expect(report.managed[0]?.localCopiesDiffer).toBe(false);
  });

  it("ignores legacy archived skill records in status reports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-archived-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(syncRepo, "archive", "writer"), "Writer Archive");

    const now = new Date().toISOString();
    const archived = {
      id: "writer",
      name: "Old writer",
      description: "Legacy entry",
      status: "archived",
      installed: false,
      syncState: "clean",
      lastSyncedHash: null,
      currentRepoHash: null,
      currentLocalHash: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: now
    } as unknown as SkillRecord;

    await writeFile(path.join(syncRepo, "metadata", "skills.json"), JSON.stringify({ schemaVersion: 1, skills: [archived] }), "utf8");

    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };

    const report = await buildStatusReport(config);

    expect(report.repoOnly).toHaveLength(0);
    expect(report.managed).toHaveLength(0);
  });

  it("reports conflict when installed local source copies differ", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-status-source-conflict-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    await ensureRepoMetadata(syncRepo);

    await writeSkill(path.join(codexSkillsDir, "managed"), "managed codex");
    await writeSkill(path.join(agentsSkillsDir, "managed"), "managed");
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed");

    const hash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "agents",
      installed: true,
      syncState: "clean",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: hash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const report = await buildStatusReport({
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    });

    expect(report.managed[0]?.installed).toBe(true);
    expect(report.managed[0]?.localSource).toBe("agents");
    expect(report.managed[0]?.localSources).toEqual(["agents", "codex"]);
    expect(report.managed[0]?.localCopiesDiffer).toBe(true);
    expect(report.managed[0]?.currentRepoHash).toBe(hash);
    expect(report.managed[0]?.syncState).toBe("conflict");
  });
});

async function writeSkill(skillDir: string, name: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n`,
    "utf8"
  );
}
