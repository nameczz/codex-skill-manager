import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { removeLocalSkill } from "../src/removeLocalSkill.js";
import { ensureRepoMetadata, writeSkillsMetadata } from "../src/metadata.js";
import { hashDirectory } from "../src/hash.js";
import type { LocalConfig, SkillRecord } from "../src/types.js";

describe("removeLocalSkill", () => {
  it("keeps tracking the remaining local source when one duplicate local copy is removed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-remove-local-"));
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
    await writeSkill(path.join(syncRepo, "skills", "managed"), "managed", "repo");
    await writeSkill(path.join(codexSkillsDir, "managed"), "managed", "codex");
    await writeSkill(path.join(agentsSkillsDir, "managed"), "managed", "agents");

    const repoHash = await hashDirectory(path.join(syncRepo, "skills", "managed"));
    const codexHash = await hashDirectory(path.join(codexSkillsDir, "managed"));
    const record: SkillRecord = {
      id: "managed",
      name: "managed",
      description: "",
      status: "managed",
      localSource: "codex",
      installed: true,
      syncState: "local_modified",
      lastSyncedHash: repoHash,
      currentRepoHash: repoHash,
      currentLocalHash: codexHash,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    await writeSkillsMetadata(syncRepo, { schemaVersion: 1, skills: [record] });

    const updated = await removeLocalSkill(config, "managed", { source: "codex" });

    expect(existsSync(path.join(codexSkillsDir, "managed"))).toBe(false);
    expect(existsSync(path.join(agentsSkillsDir, "managed", "SKILL.md"))).toBe(true);
    expect(updated.installed).toBe(true);
    expect(updated.localSource).toBe("agents");
    expect(updated.currentLocalHash).toBe(await hashDirectory(path.join(agentsSkillsDir, "managed")));
  });
});

async function writeSkill(skillDir: string, name: string, body: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(skillDirPath(skillDir), `---\nname: ${name}\ndescription: ${body}\n---\n${body}\n`, "utf8");
}

function skillDirPath(skillDir: string): string {
  return path.join(skillDir, "SKILL.md");
}
