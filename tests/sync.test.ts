import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ensureGitRepository } from "../src/git.js";
import { ensureRepoMetadata } from "../src/metadata.js";
import { importLocalSkill } from "../src/importSkill.js";
import { syncSelectedSkills } from "../src/sync.js";
import type { LocalConfig } from "../src/types.js";

const execFileAsync = promisify(execFile);

describe("syncSelectedSkills", () => {
  it("imports selected local skills, commits them, and pushes to the configured remote", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-sync-"));
    const remote = path.join(root, "remote.git");
    const config = testConfig(root);

    await ensureRepoMetadata(config.syncRepo);
    await ensureGitRepository(config.syncRepo);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: config.syncRepo });
    await writeSkill(path.join(config.codexSkillsDir, "foo"), "foo", "Local body");

    const result = await syncSelectedSkills(config, [{ skillId: "foo", source: "codex" }]);

    expect(result.skillIds).toEqual(["foo"]);
    expect(result.updatedRepoSkillIds).toEqual(["foo"]);
    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.commitHash).toMatch(/^[0-9a-f]+$/);
    expect(await readFile(path.join(config.syncRepo, "skills", "foo", "SKILL.md"), "utf8")).toContain("Local body");

    const { stdout } = await execFileAsync("git", ["--git-dir", remote, "log", "--oneline", "--all"]);
    expect(stdout).toContain("Sync skill: foo");
  });

  it("blocks conflicted skills before committing or pushing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-sync-conflict-"));
    const config = testConfig(root);

    await ensureRepoMetadata(config.syncRepo);
    await ensureGitRepository(config.syncRepo);
    await writeSkill(path.join(config.codexSkillsDir, "foo"), "foo", "Original body");
    await importLocalSkill(config, "foo");

    await writeSkill(path.join(config.codexSkillsDir, "foo"), "foo", "Local change");
    await writeSkill(path.join(config.syncRepo, "skills", "foo"), "foo", "Repo change");

    await expect(syncSelectedSkills(config, [{ skillId: "foo", source: "codex" }])).rejects.toThrow("foo is conflict");
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

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n\n${body}\n`,
    "utf8"
  );
  expect(existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
}
