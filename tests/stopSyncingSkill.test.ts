import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStatusReport } from "../src/status.js";
import { hashDirectory } from "../src/hash.js";
import { cleanupLegacyArchiveArtifacts, ensureRepoMetadata, readSkillsMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { stopSyncingSkill } from "../src/stopSyncingSkill.js";
import type { LocalConfig, SkillRecord } from "../src/types.js";

describe("stopSyncingSkill", () => {
  it("removes repo skill metadata and content without deleting the local copy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-stop-syncing-"));
    const config = testConfig(root);
    await ensureRepoMetadata(config.syncRepo);
    await writeSkill(path.join(config.codexSkillsDir, "writer"), "writer", "local body");
    await writeSkill(path.join(config.syncRepo, "skills", "writer"), "writer", "repo body");

    const hash = await hashDirectory(path.join(config.syncRepo, "skills", "writer"));
    await writeSkillsMetadata(config.syncRepo, { schemaVersion: 1, skills: [record("writer", hash)] });

    const removed = await stopSyncingSkill(config, "writer");

    expect(removed.id).toBe("writer");
    expect(existsSync(path.join(config.syncRepo, "skills", "writer"))).toBe(false);
    expect(await readFile(path.join(config.codexSkillsDir, "writer", "SKILL.md"), "utf8")).toContain("local body");
    expect((await readSkillsMetadata(config.syncRepo)).skills).toHaveLength(0);

    const report = await buildStatusReport(config);
    expect(report.managed).toHaveLength(0);
    expect(report.unmanagedLocal.map((skill) => skill.id)).toEqual(["writer"]);
  });

  it("cleans legacy archived records and archive directory explicitly", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-legacy-archive-cleanup-"));
    const config = testConfig(root);
    await ensureRepoMetadata(config.syncRepo);
    await writeSkill(path.join(config.syncRepo, "archive", "old-writer"), "old-writer", "archived body");
    const archived = {
      ...record("old-writer", null),
      status: "archived",
      archivedAt: "2026-01-01T00:00:00.000Z"
    } as unknown as SkillRecord;
    const active = record("active-writer", null);
    await writeFile(
      path.join(config.syncRepo, "metadata", "skills.json"),
      JSON.stringify({ schemaVersion: 1, skills: [archived, active] }),
      "utf8"
    );

    const result = await cleanupLegacyArchiveArtifacts(config.syncRepo);

    expect(result.removedArchiveDir).toBe(true);
    expect(result.removedSkillIds).toEqual(["old-writer"]);
    expect(existsSync(path.join(config.syncRepo, "archive"))).toBe(false);
    expect((await readSkillsMetadata(config.syncRepo)).skills.map((skill) => skill.id)).toEqual(["active-writer"]);
  });
});

function testConfig(root: string): LocalConfig {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    syncRepo: path.join(root, "repo"),
    codexSkillsDir: path.join(root, "codex-skills"),
    agentsSkillsDir: path.join(root, "agents-skills"),
    cacheDir: path.join(root, "cache"),
    createdAt: now,
    updatedAt: now
  };
}

function record(id: string, hash: string | null): SkillRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: id,
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
    updatedAt: now
  };
}

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n${body}\n`,
    "utf8"
  );
}
