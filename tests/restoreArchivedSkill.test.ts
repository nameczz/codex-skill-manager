import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalConfig, SkillRecord } from "../src/types.js";
import { ensureRepoMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { hashDirectory } from "../src/hash.js";
import { restoreArchivedSkill } from "../src/restoreArchivedSkill.js";

describe("restoreArchivedSkill", () => {
  it("restores archived metadata and repo copy without touching local copies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-restore-archive-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    const now = new Date().toISOString();

    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir,
      agentsSkillsDir,
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };

    await ensureRepoMetadata(syncRepo);
    const archivedPath = path.join(syncRepo, "archive", "writer");
    await writeSkill(archivedPath, "writer", "archived body");

    await writeSkill(path.join(codexSkillsDir, "writer"), "writer", "local body");
    const localHashBefore = await hashDirectory(path.join(codexSkillsDir, "writer"));

    const archivedHash = await hashDirectory(archivedPath);
    const record: SkillRecord = {
      id: "writer",
      name: "writer",
      description: "Archived skill",
      status: "archived",
      localSource: "codex",
      installed: true,
      syncState: "missing_repo",
      lastSyncedHash: archivedHash,
      currentRepoHash: archivedHash,
      currentLocalHash: localHashBefore,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: now
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const restored = await restoreArchivedSkill(config, "writer");

    expect(restored.status).toBe("managed");
    expect(restored.archivedAt).toBeNull();
    expect(restored.syncState).toBe("local_modified");
    expect(restored.localSource).toBe("codex");
    expect(restored.installed).toBe(true);
    expect((await readFile(path.join(syncRepo, "skills", "writer", "SKILL.md"), "utf8"))).toContain("archived body");
    await expect(readFile(path.join(syncRepo, "archive", "writer", "SKILL.md"), "utf8")).rejects.toThrow();
    const localHashAfter = await hashDirectory(path.join(codexSkillsDir, "writer"));
    expect(localHashAfter).toBe(localHashBefore);
  });

  it("rejects restoring a non-archived skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-restore-not-archived-"));
    const syncRepo = path.join(root, "repo");
    const now = new Date().toISOString();

    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir: path.join(root, "codex-skills"),
      agentsSkillsDir: path.join(root, "agents-skills"),
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };

    await ensureRepoMetadata(syncRepo);
    await writeSkill(path.join(syncRepo, "skills", "writer"), "writer", "repo body");
    const record: SkillRecord = {
      id: "writer",
      name: "writer",
      description: "Managed skill",
      status: "managed",
      installed: false,
      syncState: "clean",
      lastSyncedHash: await hashDirectory(path.join(syncRepo, "skills", "writer")),
      currentRepoHash: await hashDirectory(path.join(syncRepo, "skills", "writer")),
      currentLocalHash: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };

    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });
    await expect(restoreArchivedSkill(config, "writer")).rejects.toThrow("Cannot restore writer: skill is not archived.");
  });
});

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`, "utf8");
}
