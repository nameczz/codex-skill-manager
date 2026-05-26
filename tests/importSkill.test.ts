import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRepoMetadata, readSkillsMetadata } from "../src/metadata.js";
import { importLocalSkill } from "../src/importSkill.js";
import type { LocalConfig } from "../src/types.js";

describe("importLocalSkill", () => {
  it("copies a local skill into the repo and records metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-import-"));
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
    await writeSkill(path.join(codexSkillsDir, "foo"), "foo");

    const record = await importLocalSkill(config, "foo");
    const copied = path.join(syncRepo, "skills", "foo", "SKILL.md");
    const metadata = await readSkillsMetadata(syncRepo);

    expect(record.id).toBe("foo");
    expect(record.localSource).toBe("codex");
    expect(record.syncState).toBe("clean");
    expect(existsSync(copied)).toBe(true);
    expect(await readFile(copied, "utf8")).toContain("name: foo");
    expect(metadata.skills.map((skill) => skill.id)).toEqual(["foo"]);
  });

  it("copies an agents skill into the repo and records its source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-import-agents-"));
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
    await writeSkill(path.join(agentsSkillsDir, "klay-writer"), "klay-writer");

    const record = await importLocalSkill(config, "klay-writer", { source: "agents" });
    const copied = path.join(syncRepo, "skills", "klay-writer", "SKILL.md");

    expect(record.id).toBe("klay-writer");
    expect(record.localSource).toBe("agents");
    expect(existsSync(copied)).toBe(true);
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
