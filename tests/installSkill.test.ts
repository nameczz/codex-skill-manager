import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRepoMetadata, readSkillsMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { installRepoSkill } from "../src/installSkill.js";
import { hashDirectory } from "../src/hash.js";
import type { LocalConfig, SkillRecord } from "../src/types.js";

describe("installRepoSkill", () => {
  it("copies a managed repo skill into the local skills directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-install-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    const repoSkill = path.join(syncRepo, "skills", "foo");
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
    await writeSkill(repoSkill, "foo");

    const hash = await hashDirectory(repoSkill);
    const record: SkillRecord = {
      id: "foo",
      name: "foo",
      description: "Test skill",
      status: "managed",
      localSource: "codex",
      installed: false,
      syncState: "missing_local",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const installed = await installRepoSkill(config, "foo");
    const metadata = await readSkillsMetadata(syncRepo);

    expect(installed.installed).toBe(true);
    expect(installed.syncState).toBe("clean");
    expect(existsSync(path.join(codexSkillsDir, "foo", "SKILL.md"))).toBe(true);
    expect(metadata.skills[0]?.installed).toBe(true);

    await rm(root, { recursive: true, force: true });
  });

  it("installs an agents-sourced managed skill back into the agents directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-install-agents-"));
    const syncRepo = path.join(root, "repo");
    const codexSkillsDir = path.join(root, "codex-skills");
    const agentsSkillsDir = path.join(root, "agents-skills");
    const repoSkill = path.join(syncRepo, "skills", "klay-writer");
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
    await writeSkill(repoSkill, "klay-writer");

    const hash = await hashDirectory(repoSkill);
    const record: SkillRecord = {
      id: "klay-writer",
      name: "klay-writer",
      description: "Test skill",
      status: "managed",
      localSource: "agents",
      installed: false,
      syncState: "missing_local",
      lastSyncedHash: hash,
      currentRepoHash: hash,
      currentLocalHash: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const installed = await installRepoSkill(config, "klay-writer");

    expect(installed.localSource).toBe("agents");
    expect(existsSync(path.join(agentsSkillsDir, "klay-writer", "SKILL.md"))).toBe(true);
    expect(existsSync(path.join(codexSkillsDir, "klay-writer", "SKILL.md"))).toBe(false);

    await rm(root, { recursive: true, force: true });
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
