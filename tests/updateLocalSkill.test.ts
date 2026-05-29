import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRepoMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { hashDirectory } from "../src/hash.js";
import { updateLocalSkill } from "../src/updateLocalSkill.js";
import type { LocalConfig, SkillRecord } from "../src/types.js";

describe("updateLocalSkill", () => {
  it("blocks conflicted skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-update-local-conflict-"));
    const now = new Date().toISOString();
    const config: LocalConfig = {
      schemaVersion: 1,
      syncRepo: path.join(root, "repo"),
      codexSkillsDir: path.join(root, "codex-skills"),
      agentsSkillsDir: path.join(root, "agents-skills"),
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    };

    await ensureRepoMetadata(config.syncRepo);
    await writeSkill(path.join(config.syncRepo, "skills", "managed"), "managed", "repo changed");
    await writeSkill(path.join(config.codexSkillsDir, "managed"), "managed", "local changed");
    const repoHash = await hashDirectory(path.join(config.syncRepo, "skills", "managed"));
    const localHash = await hashDirectory(path.join(config.codexSkillsDir, "managed"));
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "conflict",
      lastSyncedHash: "previous",
      currentRepoHash: repoHash,
      currentLocalHash: localHash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeSkillsMetadata(config.syncRepo, { schemaVersion: 1, skills: [record] });

    await expect(updateLocalSkill(config, "managed")).rejects.toThrow("conflict must be resolved manually");
  });
});

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: Test skill\n---\n${body}\n`, "utf8");
}
