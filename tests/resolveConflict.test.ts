import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { LocalConfig, SkillRecord } from "../src/types.js";
import { ensureGitRepository } from "../src/git.js";
import { ensureRepoMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { hashDirectory } from "../src/hash.js";
import { resolveConflict } from "../src/resolveConflict.js";

const execFileAsync = promisify(execFile);

describe("resolveConflict", () => {
  it("copies a selected local source into repo and all local copies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-resolve-local-"));
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
    await ensureGitRepository(syncRepo);
    const remote = await addRemote(root, syncRepo);
    try {
      await writeSkill(path.join(syncRepo, "skills", "writer"), "writer", "repo body");
      await writeSkill(path.join(codexSkillsDir, "writer"), "writer", "codex body");
      await writeSkill(path.join(agentsSkillsDir, "writer"), "writer", "agents body");
      const repoHash = await hashDirectory(path.join(syncRepo, "skills", "writer"));
      const codexHash = await hashDirectory(path.join(codexSkillsDir, "writer"));

      const record: SkillRecord = {
        id: "writer",
        name: "writer",
        description: "Conflict test",
        status: "managed",
        localSource: "agents",
        installed: true,
        syncState: "conflict",
        lastSyncedHash: "previous-hash",
        currentRepoHash: repoHash,
        currentLocalHash: codexHash,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

      const result = await resolveConflict(config, "writer", { strategy: "codex" });

      expect(result.record.localSource).toBe("codex");
      expect(result.record.localCopiesDiffer).toBe(false);
      expect(result.record.syncState).toBe("clean");
      expect(result.record.lastSyncedHash).toBe(codexHash);
      expect(result.record.currentLocalHash).toBe(codexHash);
      expect(result.record.currentRepoHash).toBe(codexHash);
      expect(result.result?.committed).toBe(true);
      await expect(readFile(path.join(syncRepo, "skills", "writer", "SKILL.md"), "utf8")).resolves.toContain("codex body");
      await expect(readFile(path.join(codexSkillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain("codex body");
      await expect(readFile(path.join(agentsSkillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain("codex body");
      await expect(hashDirectory(path.join(syncRepo, "skills", "writer"))).resolves.toBe(codexHash);
    } finally {
      await rm(remote, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses repo content to overwrite installed local copies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-resolve-repo-"));
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
    await ensureGitRepository(syncRepo);
    const remote = await addRemote(root, syncRepo);
    try {
      await writeSkill(path.join(syncRepo, "skills", "writer"), "writer", "repo winner");
      await writeSkill(path.join(codexSkillsDir, "writer"), "writer", "stale local copy");
      await writeSkill(path.join(agentsSkillsDir, "writer"), "writer", "stale agent copy");

      const repoHash = await hashDirectory(path.join(syncRepo, "skills", "writer"));
      const codexHash = await hashDirectory(path.join(codexSkillsDir, "writer"));
      const record: SkillRecord = {
        id: "writer",
        name: "writer",
        description: "Conflict test",
        status: "managed",
        localSource: "codex",
        installed: true,
        syncState: "conflict",
        lastSyncedHash: codexHash,
        currentRepoHash: repoHash,
        currentLocalHash: codexHash,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

      const result = await resolveConflict(config, "writer", { strategy: "repo" });
      expect(result.record.syncState).toBe("clean");
      expect(result.record.currentRepoHash).toBe(repoHash);
      expect(result.record.currentLocalHash).toBe(repoHash);
      expect(result.record.localCopiesDiffer).toBe(false);
      expect(result.result?.committed).toBe(true);

      await expect(readFile(path.join(codexSkillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain("repo winner");
      await expect(readFile(path.join(agentsSkillsDir, "writer", "SKILL.md"), "utf8")).resolves.toContain("repo winner");
      await expect(readFile(path.join(syncRepo, "skills", "writer", "SKILL.md"), "utf8")).resolves.toContain("repo winner");
    } finally {
      await rm(remote, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects local-source resolutions when that local source is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-resolve-missing-source-"));
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
    await ensureGitRepository(syncRepo);
    await writeSkill(path.join(syncRepo, "skills", "writer"), "writer", "repo body");
    await writeSkill(path.join(agentsSkillsDir, "writer"), "writer", "agents body");
    const repoHash = await hashDirectory(path.join(syncRepo, "skills", "writer"));

    const record: SkillRecord = {
      id: "writer",
      name: "writer",
      description: "Conflict test",
      status: "managed",
      localSource: "agents",
      installed: true,
      syncState: "conflict",
      lastSyncedHash: "old",
      currentRepoHash: repoHash,
      currentLocalHash: await hashDirectory(path.join(agentsSkillsDir, "writer")),
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    await expect(resolveConflict(config, "writer", { strategy: "codex" })).rejects.toThrow(
      "Cannot use codex as strategy for writer: source is missing on this machine."
    );

    if (existsSync(root)) {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`, "utf8");
}

async function addRemote(root: string, syncRepo: string): Promise<string> {
  const remote = path.join(root, "remote.git");
  await execFileAsync("git", ["init", "--bare", remote]);
  await ensureGitRepository(syncRepo);
  await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: syncRepo });
  return remote;
}
